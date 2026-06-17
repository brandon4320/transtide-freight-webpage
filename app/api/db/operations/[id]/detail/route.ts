import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { d1Query, d1Batch } from '@/lib/d1'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
}

type CustomCatRow = {
  id: string
  operation_id: string
  label: string
  color: string | null
  kind: string
}

type OpInfoRow = { puerto_origen: string | null }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const [opInfo, gastos, provs, customCats] = await Promise.all([
    d1Query<OpInfoRow>(`SELECT puerto_origen FROM operations WHERE id = ?`, [id]),
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
    })
  }

  return NextResponse.json(detail)
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session?.user as any)?.role === 'viewer') return NextResponse.json({ error: 'Tu usuario es de solo lectura' }, { status: 403 })

  const { id } = await params
  const body = await request.json()

  const statements: { sql: string; params?: any[] }[] = []

  // Wipe existing data for this op
  statements.push({ sql: `DELETE FROM gastos WHERE operation_id = ?`, params: [id] })
  statements.push({ sql: `DELETE FROM proveedores_op WHERE operation_id = ?`, params: [id] })
  statements.push({ sql: `DELETE FROM custom_categories WHERE operation_id = ?`, params: [id] })

  // Insert custom categories first
  const customGastos: any[] = body.customGastos || []
  for (const c of customGastos) {
    statements.push({
      sql: `INSERT INTO custom_categories (id, operation_id, label, color, kind, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      params: [c.id, id, c.label || '', c.color || null, c.kind || 'blanco'],
    })
  }

  // Insert gastos for all categories (built-in + custom)
  const allCats = [...BUILTIN_CATS, ...customGastos.map(c => c.id)]
  for (const cat of allCats) {
    const rows: any[] = body[cat] || []
    rows.forEach((row, idx) => {
      statements.push({
        sql: `INSERT OR REPLACE INTO gastos (operation_id, categoria, position, descripcion, factura, usd, tc, pesos, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        params: [
          id, cat, idx,
          row.desc || null,
          row.factura || null,
          row.usd === '' || row.usd == null ? null : String(row.usd),
          row.tc === '' || row.tc == null ? null : String(row.tc),
          row.pesos === '' || row.pesos == null ? null : String(row.pesos),
        ],
      })
    })
  }

  // Insert proveedores merged with cobrar
  const proveedores: any[] = body.proveedores || []
  const cobrar: any[] = body.cobrar || []
  proveedores.forEach((p, idx) => {
    const cb = cobrar[idx] || {}
    statements.push({
      sql: `INSERT OR REPLACE INTO proveedores_op
            (operation_id, position, nombre, tipo, cliente_id, m3, fob_usd, gastos_origen_usd, tributos_usd, tributos_tc,
             cobrar_tc, honorarios, desp_adic, cobrado, fecha_cobro, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      params: [
        id, idx,
        p.nombre || null,
        p.tipo || 'Cliente',
        p.clienteId || null,
        p.m3 === '' || p.m3 == null ? null : String(p.m3),
        p.fobUSD === '' || p.fobUSD == null ? null : String(p.fobUSD),
        p.gastosOrigenUSD === '' || p.gastosOrigenUSD == null ? null : String(p.gastosOrigenUSD),
        p.tributosUSD === '' || p.tributosUSD == null ? null : String(p.tributosUSD),
        p.tributosTC === '' || p.tributosTC == null ? null : String(p.tributosTC),
        cb.tc === '' || cb.tc == null ? null : String(cb.tc),
        cb.honorarios ? 1 : 0,
        cb.despAdic === '' || cb.despAdic == null ? null : String(cb.despAdic),
        cb.cobrado ? 1 : 0,
        cb.fechaCobro || null,
      ],
    })
  })

  // Update operation's puerto_origen + updated_at
  statements.push({
    sql: `UPDATE operations SET puerto_origen = ?, updated_at = datetime('now') WHERE id = ?`,
    params: [body.puertoOrigen || null, id],
  })

  await d1Batch(statements)

  return NextResponse.json({ ok: true })
}
