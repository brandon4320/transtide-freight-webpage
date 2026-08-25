import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { d1Query, d1Batch, d1Exec } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Campos agregados después del alta original de las tablas. El proyecto no tiene
// migraciones versionadas: se garantizan on-the-fly (mismo patrón ya probado con
// despachante_pagos.conceptos). Los extras de cobranza van en UNA columna JSON para
// no multiplicar ALTERs, y `ready` deja constancia de si la columna quedó disponible:
// si un ALTER fallara, se guarda sin ese campo en vez de romper todo el guardado.
const EXTRA_COLS: [string, string][] = [
  ['proveedores_op', 'cobrar_extra'],
  ['gastos', 'pagado_por'],
]
let ready: Record<string, boolean> | null = null
async function ensureCols(): Promise<Record<string, boolean>> {
  if (ready) return ready
  const out: Record<string, boolean> = {}
  for (const [table, col] of EXTRA_COLS) {
    try {
      const info = await d1Query<{ name: string }>(`PRAGMA table_info(${table})`)
      if (info.some(c => c.name === col)) { out[col] = true; continue }
      await d1Exec(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT DEFAULT NULL`)
      out[col] = true
    } catch {
      out[col] = false
      console.warn(`[detail] no se pudo agregar ${table}.${col}; se guarda sin ese campo`)
    }
  }
  ready = out
  return out
}

// Extras de cobranza que viven en el JSON de cobrar_extra.
const COBRAR_EXTRA = ['giroMonto', 'giroPct', 'giroFijo', 'giroTotal', 'ganancia', 'honMin'] as const

const BUILTIN_CATS = ['naviera', 'terminal', 'aduana', 'transporte', 'despachante', 'admin', 'fleteIntl']

type GastoRow = {
  id: number
  operation_id: string
  categoria: string
  position: number
  descripcion: string | null
  factura: string | null
  usd: string | null
  tc: string | null
  pesos: string | null
  pagado_por: string | null
}

type ProvRow = {
  id: number
  operation_id: string
  position: number
  nombre: string | null
  tipo: string
  cliente_id: string | null
  m3: string | null
  fob_usd: string | null
  gastos_origen_usd: string | null
  tributos_usd: string | null
  tributos_tc: string | null
  cobrar_tc: string | null
  honorarios: number | null
  desp_adic: string | null
  cobrado: number | null
  fecha_cobro: string | null
  cobrar_extra: string | null
}

type CustomCatRow = {
  id: string
  operation_id: string
  label: string
  color: string | null
  kind: string
}

type OpInfoRow = { puerto_origen: string | null; total_cotizado_usd: string | null; cotizacion_id: string | null; compra_id: string | null }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await ensureCols()

  const [opInfo, gastos, provs, customCats] = await Promise.all([
    d1Query<OpInfoRow>(`SELECT puerto_origen, total_cotizado_usd, cotizacion_id, compra_id FROM operations WHERE id = ?`, [id]),
    d1Query<GastoRow>(`SELECT * FROM gastos WHERE operation_id = ? ORDER BY categoria, position ASC`, [id]),
    d1Query<ProvRow>(`SELECT * FROM proveedores_op WHERE operation_id = ? ORDER BY position ASC`, [id]),
    d1Query<CustomCatRow>(`SELECT * FROM custom_categories WHERE operation_id = ?`, [id]),
  ])

  // Initialize all categories as empty arrays
  const detail: Record<string, any> = {
    naviera: [], terminal: [], aduana: [], transporte: [], despachante: [], admin: [], fleteIntl: [],
    proveedores: [],
    cobrar: [],
    customGastos: customCats.map(c => ({ id: c.id, label: c.label, color: c.color, kind: c.kind })),
    puertoOrigen: opInfo[0]?.puerto_origen || '',
    totalCotizadoUsd: opInfo[0]?.total_cotizado_usd || '',
    cotizacionId: opInfo[0]?.cotizacion_id || '',
    compraId: opInfo[0]?.compra_id || '',
  }

  // Pre-seed custom cat arrays
  for (const cc of customCats) {
    detail[cc.id] = []
  }

  // Group gastos by categoria
  for (const g of gastos) {
    const cat = g.categoria
    if (!detail[cat]) detail[cat] = []
    detail[cat].push({
      id: g.id,
      desc: g.descripcion || '',
      factura: g.factura || '',
      usd: g.usd || '',
      tc: g.tc || '',
      pesos: g.pesos || '',
      pagadoPor: g.pagado_por || '',
    })
  }

  // Proveedores + cobrar parallel arrays
  for (const p of provs) {
    detail.proveedores.push({
      id: p.id,
      nombre: p.nombre || '',
      tipo: p.tipo || 'Cliente',
      clienteId: p.cliente_id || '',
      m3: p.m3 || '',
      fobUSD: p.fob_usd || '',
      gastosOrigenUSD: p.gastos_origen_usd || '',
      tributosUSD: p.tributos_usd || '',
      tributosTC: p.tributos_tc || '',
    })
    detail.cobrar.push({
      tc: p.cobrar_tc || '',
      honorarios: !!p.honorarios,
      despAdic: p.desp_adic || '',
      cobrado: !!p.cobrado,
      fechaCobro: p.fecha_cobro || '',
      ...parseExtra(p.cobrar_extra),
    })
  }

  return NextResponse.json(detail)
}

// Extras de cobranza guardados como JSON. Fila vieja o JSON roto → sin extras.
function parseExtra(raw: string | null): Record<string, any> {
  const out: Record<string, any> = { exigirPago: false }
  for (const k of COBRAR_EXTRA) out[k] = ''
  try {
    const j = JSON.parse(raw || '')
    if (j && typeof j === 'object') {
      for (const k of COBRAR_EXTRA) if (j[k] != null) out[k] = String(j[k])
      out.exigirPago = !!j.exigirPago
    }
  } catch {}
  return out
}

// Normaliza un valor numérico de entrada: acepta coma decimal, devuelve null si vacío.
function num(v: any): string | null {
  if (v === '' || v == null) return null
  return String(v).replace(',', '.')
}

const sqlList = (arr: string[]) => arr.map(() => '?').join(', ')

// Serializa los extras de cobranza. Si no hay ninguno cargado, guarda null.
function buildExtra(cb: any): string | null {
  const e: Record<string, any> = {}
  for (const k of COBRAR_EXTRA) { const v = num(cb[k]); if (v != null) e[k] = v }
  if (cb.exigirPago) e.exigirPago = true
  return Object.keys(e).length ? JSON.stringify(e) : null
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('operaciones')
  if (!g.ok) return g.res

  const { id } = await params
  const cols = await ensureCols()
  const body = await request.json()

  // Estrategia no-destructiva: primero UPSERT de todo lo nuevo (por clave estable),
  // y RECIÉN AL FINAL borrados acotados a lo que sobró. Si algo falla a mitad, la
  // operación queda con datos de más (viejos+nuevos), nunca vacía. (D1 HTTP no es
  // transaccional, así que el orden importa.)
  const upserts: { sql: string; params?: any[] }[] = []
  const cleanup: { sql: string; params?: any[] }[] = []

  // --- Custom categories ---
  const RESERVED = new Set([...BUILTIN_CATS, 'proveedores', 'cobrar', 'customGastos', 'puertoOrigen', 'totalCotizadoUsd', 'cotizacionId', 'compraId'])
  const customGastos: any[] = (body.customGastos || []).filter((c: any) => c && c.id && !RESERVED.has(c.id))
  const customIds = customGastos.map(c => c.id)
  for (const c of customGastos) {
    upserts.push({
      sql: `INSERT OR REPLACE INTO custom_categories (id, operation_id, label, color, kind, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      params: [c.id, id, c.label || '', c.color || null, c.kind || 'blanco'],
    })
  }
  // Borrar custom cats que ya no existen
  if (customIds.length > 0) {
    cleanup.push({
      sql: `DELETE FROM custom_categories WHERE operation_id = ? AND id NOT IN (${sqlList(customIds)})`,
      params: [id, ...customIds],
    })
  } else {
    cleanup.push({ sql: `DELETE FROM custom_categories WHERE operation_id = ?`, params: [id] })
  }

  // --- Gastos por categoría (builtin + custom) ---
  const allCats = [...BUILTIN_CATS, ...customIds]
  for (const cat of allCats) {
    const rows: any[] = body[cat] || []
    rows.forEach((row, idx) => {
      upserts.push({
        sql: cols.pagado_por
          ? `INSERT OR REPLACE INTO gastos (operation_id, categoria, position, descripcion, factura, usd, tc, pesos, pagado_por, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          : `INSERT OR REPLACE INTO gastos (operation_id, categoria, position, descripcion, factura, usd, tc, pesos, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        params: cols.pagado_por
          ? [id, cat, idx, row.desc || null, row.factura || null, num(row.usd), num(row.tc), num(row.pesos), row.pagadoPor || null]
          : [id, cat, idx, row.desc || null, row.factura || null, num(row.usd), num(row.tc), num(row.pesos)],
      })
    })
    // Borrar las posiciones que sobran de esta categoría
    cleanup.push({ sql: `DELETE FROM gastos WHERE operation_id = ? AND categoria = ? AND position >= ?`, params: [id, cat, rows.length] })
  }
  // Borrar gastos de categorías que ya no existen (custom eliminadas)
  cleanup.push({
    sql: `DELETE FROM gastos WHERE operation_id = ? AND categoria NOT IN (${sqlList(allCats)})`,
    params: [id, ...allCats],
  })

  // --- Proveedores (mergeado con cobrar) ---
  const proveedores: any[] = body.proveedores || []
  const cobrar: any[] = body.cobrar || []
  proveedores.forEach((p, idx) => {
    const cb = cobrar[idx] || {}
    upserts.push({
      sql: `INSERT OR REPLACE INTO proveedores_op
            (operation_id, position, nombre, tipo, cliente_id, m3, fob_usd, gastos_origen_usd, tributos_usd, tributos_tc,
             cobrar_tc, honorarios, desp_adic, cobrado, fecha_cobro${cols.cobrar_extra ? ', cobrar_extra' : ''}, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${cols.cobrar_extra ? ', ?' : ''}, datetime('now'))`,
      params: [
        id, idx,
        p.nombre || null,
        p.tipo || 'Cliente',
        p.clienteId || null,
        num(p.m3), num(p.fobUSD), num(p.gastosOrigenUSD), num(p.tributosUSD), num(p.tributosTC),
        num(cb.tc),
        cb.honorarios ? 1 : 0,
        num(cb.despAdic),
        cb.cobrado ? 1 : 0,
        cb.fechaCobro || null,
        ...(cols.cobrar_extra ? [buildExtra(cb)] : []),
      ],
    })
  })
  cleanup.push({ sql: `DELETE FROM proveedores_op WHERE operation_id = ? AND position >= ?`, params: [id, proveedores.length] })

  // Update operation's puerto_origen + updated_at
  upserts.push({
    sql: `UPDATE operations SET puerto_origen = ?, updated_at = datetime('now') WHERE id = ?`,
    params: [body.puertoOrigen || null, id],
  })

  // Upserts PRIMERO, borrados acotados AL FINAL.
  await d1Batch([...upserts, ...cleanup])

  return NextResponse.json({ ok: true })
}
