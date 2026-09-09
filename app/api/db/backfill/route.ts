import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'
import { ensureSoftDelete, filtroVivos } from '@/lib/soft-delete'
import { auditar } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Backfill de operation_id. Despachos, asientos del ledger y alertas hechas se
// cruzaban con la operación por el TEXTO del B/L normalizado; el rediseño los
// cuelga por operation_id (con el B/L como fallback mientras dure la
// migración). Esta ruta rellena operation_id en las filas que todavía no lo
// tienen, matcheando el B/L contra operations.bl y contra shipments.bl →
// operation_id. Cuando además hay una referencia directa (el pago cuelga de un
// embarque/despacho/proveedor que ya tiene operación) se usa esa primero: es un
// vínculo, no una comparación de texto.
//
// Idempotente: solo toca filas con operation_id NULL o ''. Lo que no matchea
// (sin operación, o B/L que corresponde a más de una) se devuelve en sin_match
// para resolverlo a mano; nunca se adivina.
//
// POST /api/db/backfill          aplica y devuelve el reporte
// POST /api/db/backfill?dry=1    solo informa qué haría (no escribe nada)

type SinMatch = { id: string | number; bl: string; motivo: string; candidatas?: string[]; scope?: string; ref_id?: string }
type Reporte = { ok: boolean; n: number; revisadas: number; sin_match: SinMatch[]; error?: string; por_ref?: number; por_bl?: number }

const TOPE_SIN_MATCH = 200

const blNorm = (s: unknown) => String(s || '').replace(/[\s-]/g, '').toUpperCase()

// Garantiza una columna (PRAGMA + ALTER dentro de try). Mismo patrón que
// ensureCols en operations/[id]/detail: si el ALTER falla, se informa y esa
// tabla se saltea en vez de romper todo el backfill.
async function asegurarColumnas(table: string, cols: [string, string][]): Promise<boolean> {
  try {
    const leer = async () => new Set((await d1Query<{ name: string }>(`PRAGMA table_info(${table})`)).map(c => c.name))
    let have = await leer()
    if (!have.size) return false // la tabla no existe todavía: nada que rellenar
    let alterado = false
    for (const [col, decl] of cols) {
      if (have.has(col)) continue
      alterado = true
      try { await d1Exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`) } catch {}
    }
    if (alterado) have = await leer()
    return cols.every(([c]) => have.has(c))
  } catch {
    return false
  }
}

// Índice B/L normalizado → operaciones vivas candidatas. Se arma una vez por
// corrida con operations.bl y con shipments.bl → operation_id (solo embarques
// vivos que apunten a una operación viva).
type Indice = {
  opsVivas: Set<string>
  porBL: Map<string, Set<string>>
  shipOp: Map<string, string>     // shipments.id → operation_id
}
async function armarIndice(): Promise<Indice> {
  const [vivosOps, vivosShips] = await Promise.all([ensureSoftDelete('operations'), ensureSoftDelete('shipments')])
  const ops = await d1Query<{ id: string; bl: string | null }>(`SELECT id, bl FROM operations WHERE ${filtroVivos(vivosOps)}`)
  const opsVivas = new Set(ops.map(o => String(o.id)))
  const porBL = new Map<string, Set<string>>()
  const add = (k: string, id: string) => {
    if (!k || !id) return
    if (!porBL.has(k)) porBL.set(k, new Set())
    porBL.get(k)!.add(id)
  }
  for (const o of ops) add(blNorm(o.bl), String(o.id))
  const ships = await d1Query<{ id: string | number; bl: string | null; operation_id: string | null }>(
    `SELECT id, bl, operation_id FROM shipments WHERE ${filtroVivos(vivosShips)}`
  )
  const shipOp = new Map<string, string>()
  for (const s of ships) {
    const opId = String(s.operation_id || '').trim()
    if (!opId || !opsVivas.has(opId)) continue // apunta a una operación borrada o a ninguna: no cuenta
    shipOp.set(String(s.id), opId)
    add(blNorm(s.bl), opId)
  }
  return { opsVivas, porBL, shipOp }
}

type Resuelto = { id: string | null; motivo?: string; candidatas?: string[] }
function resolverPorBL(idx: Indice, bl: unknown): Resuelto {
  const k = blNorm(bl)
  if (!k) return { id: null, motivo: 'sin B/L' }
  const c = idx.porBL.get(k)
  if (!c || !c.size) return { id: null, motivo: 'ningún embarque ni operación con ese B/L' }
  if (c.size > 1) return { id: null, motivo: 'el B/L corresponde a más de una operación', candidatas: [...c] }
  return { id: [...c][0] }
}

const vacio = (): Reporte => ({ ok: true, n: 0, revisadas: 0, sin_match: [] })
const anotar = (rep: Reporte, s: SinMatch) => { if (rep.sin_match.length < TOPE_SIN_MATCH) rep.sin_match.push(s) }

// ─── despachante_pagos ───────────────────────────────────────────────────────
async function backfillDespachos(idx: Indice, dry: boolean, autor: string): Promise<{ rep: Reporte; despOp: Map<string, string> }> {
  const rep = vacio()
  const despOp = new Map<string, string>() // despachante_pagos.id → operation_id (para los pagos del despachante)
  if (!(await asegurarColumnas('despachante_pagos', [['operation_id', 'TEXT DEFAULT NULL']]))) {
    return { rep: { ...rep, ok: false, error: 'despachante_pagos no tiene (ni pudo agregar) operation_id' }, despOp }
  }
  const vivos = await ensureSoftDelete('despachante_pagos')
  // Los que ya están vinculados alimentan el mapa para los pagos del despachante.
  const ya = await d1Query<{ id: number; operation_id: string }>(
    `SELECT id, operation_id FROM despachante_pagos WHERE COALESCE(operation_id, '') <> '' AND ${filtroVivos(vivos)}`
  )
  for (const d of ya) if (idx.opsVivas.has(String(d.operation_id))) despOp.set(String(d.id), String(d.operation_id))

  const rows = await d1Query<{ id: number; bl: string | null }>(
    `SELECT id, bl FROM despachante_pagos WHERE COALESCE(operation_id, '') = '' AND ${filtroVivos(vivos)} ORDER BY id`
  )
  rep.revisadas = rows.length
  for (const r of rows) {
    const res = resolverPorBL(idx, r.bl)
    if (!res.id) { anotar(rep, { id: r.id, bl: String(r.bl || ''), motivo: res.motivo || '', candidatas: res.candidatas }); continue }
    if (!dry) {
      const u = await d1Exec(
        `UPDATE despachante_pagos SET operation_id = ? WHERE id = ? AND COALESCE(operation_id, '') = ''`, [res.id, r.id]
      )
      if (u.changes > 0) await auditar({ entidad: 'despachante_pagos', id: r.id, accion: 'editar', campo: 'operation_id', antes: null, despues: res.id, usuario: autor })
    }
    despOp.set(String(r.id), res.id)
    rep.n += 1
  }
  return { rep, despOp }
}

// ─── pagos_registro ──────────────────────────────────────────────────────────
async function backfillPagos(idx: Indice, despOp: Map<string, string>, dry: boolean, autor: string): Promise<Reporte> {
  const rep: Reporte = { ...vacio(), por_ref: 0, por_bl: 0 }
  if (!(await asegurarColumnas('pagos_registro', [['operation_id', 'TEXT DEFAULT NULL']]))) {
    return { ...rep, ok: false, error: 'pagos_registro no existe o no pudo agregar operation_id' }
  }
  const vivos = await ensureSoftDelete('pagos_registro')
  // Proveedores de la operación (ref de los cobros al cliente).
  const provOp = new Map<string, string>()
  try {
    const provs = await d1Query<{ id: string | number; operation_id: string }>(`SELECT id, operation_id FROM proveedores_op`)
    for (const p of provs) if (idx.opsVivas.has(String(p.operation_id))) provOp.set(String(p.id), String(p.operation_id))
  } catch {}

  const rows = await d1Query<{ id: number; scope: string; ref_id: string; bl: string | null }>(
    `SELECT id, scope, ref_id, bl FROM pagos_registro WHERE COALESCE(operation_id, '') = '' AND ${filtroVivos(vivos)} ORDER BY id`
  )
  rep.revisadas = rows.length
  for (const r of rows) {
    const scope = String(r.scope || '')
    const ref = String(r.ref_id || '').trim()
    // 1) por la referencia real del asiento
    let opId: string | null = null
    if (ref) {
      if (scope === 'agente') opId = idx.shipOp.get(ref) || null
      else if (scope === 'despachante') opId = despOp.get(ref) || null
      else if (scope === 'cliente') opId = provOp.get(ref) || null
      else if (scope === 'successi') opId = idx.opsVivas.has(ref) ? ref : null
    }
    let por: 'ref' | 'bl' = 'ref'
    // 2) por B/L normalizado
    if (!opId) {
      const res = resolverPorBL(idx, r.bl)
      if (!res.id) {
        anotar(rep, { id: r.id, bl: String(r.bl || ''), scope, ref_id: ref, motivo: ref ? `la referencia (${scope} #${ref}) no tiene operación y ${res.motivo}` : res.motivo || '', candidatas: res.candidatas })
        continue
      }
      opId = res.id
      por = 'bl'
    }
    if (!dry) {
      const u = await d1Exec(`UPDATE pagos_registro SET operation_id = ? WHERE id = ? AND COALESCE(operation_id, '') = ''`, [opId, r.id])
      if (u.changes > 0) await auditar({ entidad: 'pagos_registro', id: r.id, accion: 'editar', campo: 'operation_id', antes: null, despues: opId, usuario: autor })
    }
    rep.n += 1
    if (por === 'ref') rep.por_ref! += 1
    else rep.por_bl! += 1
  }
  return rep
}

// ─── alertas_hechas ──────────────────────────────────────────────────────────
// La clave vieja es `cabeza|tipo[|extra]` con cabeza = B/L normalizado,
// `op:<id>`, `ship:<id>` o `x`. Se rellenan operation_id, tipo, bl y akey_bl
// (la clave vieja, para que las pantallas que matchean por B/L la sigan
// encontrando). La PK akey NO se reescribe: la ruta de alertas devuelve todas
// las variantes de cada fila, así que no hace falta romper la clave.
async function backfillAlertas(idx: Indice, dry: boolean, autor: string): Promise<Reporte> {
  const rep = vacio()
  const cols: [string, string][] = [
    ['operation_id', 'TEXT DEFAULT NULL'], ['tipo', `TEXT DEFAULT ''`], ['bl', `TEXT DEFAULT ''`], ['akey_bl', `TEXT DEFAULT ''`],
  ]
  if (!(await asegurarColumnas('alertas_hechas', cols))) {
    return { ...rep, ok: false, error: 'alertas_hechas no existe o no pudo agregar operation_id/tipo/bl/akey_bl' }
  }
  const rows = await d1Query<{ akey: string }>(`SELECT akey FROM alertas_hechas WHERE COALESCE(operation_id, '') = ''`)
  rep.revisadas = rows.length
  for (const r of rows) {
    const akey = String(r.akey || '')
    const i = akey.indexOf('|')
    const cabeza = i < 0 ? akey : akey.slice(0, i)
    const tipo = i < 0 ? '' : akey.slice(i + 1).split('|')[0]
    let opId: string | null = null
    let bl = ''
    let motivo = ''
    let candidatas: string[] | undefined
    if (cabeza.startsWith('op:')) {
      const id = cabeza.slice(3)
      if (idx.opsVivas.has(id)) opId = id
      else motivo = `la operación ${id} no existe o está en la papelera`
    } else if (cabeza.startsWith('ship:')) {
      opId = idx.shipOp.get(cabeza.slice(5)) || null
      if (!opId) motivo = `el embarque ${cabeza.slice(5)} no tiene operación`
    } else if (!cabeza || cabeza === 'x') {
      motivo = 'alerta sin B/L ni operación'
    } else {
      bl = cabeza
      const res = resolverPorBL(idx, cabeza)
      opId = res.id
      motivo = res.motivo || ''
      candidatas = res.candidatas
    }
    if (!opId) { anotar(rep, { id: akey, bl, motivo, candidatas }); continue }
    if (!dry) {
      await d1Exec(
        `UPDATE alertas_hechas SET operation_id = ?, tipo = CASE WHEN COALESCE(tipo, '') = '' THEN ? ELSE tipo END,
           bl = CASE WHEN COALESCE(bl, '') = '' THEN ? ELSE bl END,
           akey_bl = CASE WHEN COALESCE(akey_bl, '') = '' THEN ? ELSE akey_bl END
         WHERE akey = ? AND COALESCE(operation_id, '') = ''`,
        [opId, tipo, bl, akey, akey]
      )
    }
    rep.n += 1
  }
  if (!dry && rep.n) await auditar({ entidad: 'alertas_hechas', id: 'backfill', accion: 'editar', campo: 'operation_id', antes: null, despues: `${rep.n} alertas vinculadas`, usuario: autor })
  return rep
}

export async function POST(request: Request) {
  const g = await requireWrite('operaciones')
  if (!g.ok) return g.res
  const dry = new URL(request.url).searchParams.get('dry') === '1'
  const autor = g.s.name || g.s.username || ''

  let idx: Indice
  try { idx = await armarIndice() } catch (e) {
    return NextResponse.json({ error: 'No se pudo leer operaciones/embarques para armar el índice de B/L.', detalle: (e as Error)?.message }, { status: 500 })
  }

  // Cada tabla se procesa aparte: un error en una no frena a las otras.
  const seguro = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn() } catch (e) {
      console.warn('[backfill]', (e as Error)?.message)
      return fallback
    }
  }
  const fallo = (msg: string): Reporte => ({ ...vacio(), ok: false, error: msg })

  // Los despachos van primero: los pagos del despachante se vinculan a través de ellos.
  const { rep: despachos, despOp } = await seguro(() => backfillDespachos(idx, dry, autor), { rep: fallo('falló el backfill de despachos'), despOp: new Map<string, string>() })
  const pagos = await seguro(() => backfillPagos(idx, despOp, dry, autor), fallo('falló el backfill de pagos'))
  const alertas = await seguro(() => backfillAlertas(idx, dry, autor), fallo('falló el backfill de alertas'))

  return NextResponse.json({
    dry,
    indice: { operaciones: idx.opsVivas.size, bls: idx.porBL.size, embarques_con_operacion: idx.shipOp.size },
    despachos, pagos, alertas,
  })
}
