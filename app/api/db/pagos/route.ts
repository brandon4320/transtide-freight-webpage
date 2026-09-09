import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { getSessionInfo, requireWrite } from '@/lib/perms'
import { ensureSoftDelete, filtroVivos } from '@/lib/soft-delete'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Registro de pagos (ledger): cada pago al agente, al despachante, cada cobro al
// cliente y cada reintegro a Successi es un evento con fecha/monto/método, no
// una celda editada. El "Pagado"/"Saldo"/"Cobrado" que muestran los módulos son
// la PROYECCIÓN de este ledger: se recalculan desde acá (ver el `agg` que
// devuelven POST y DELETE), no se suman a mano.
//
// Un mismo ledger sostiene los cuatro libros; cambia el scope y la referencia:
//   agente       ref_id = shipments.id          permiso 'tracking'
//   despachante  ref_id = despachante_pagos.id  permiso 'despachante'
//   cliente      ref_id = proveedores_op.id     permiso 'operaciones'
//   successi     ref_id = operations.id         permiso 'operaciones'
// La tabla se crea sola en el primer uso (no hay migraciones versionadas).
async function ensureTable() {
  await d1Exec(
    `CREATE TABLE IF NOT EXISTS pagos_registro (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      ref_id TEXT DEFAULT '',
      bl TEXT DEFAULT '',
      fecha TEXT DEFAULT '',
      monto TEXT DEFAULT '',
      metodo TEXT DEFAULT '',
      nota TEXT DEFAULT '',
      tipo TEXT DEFAULT 'pago',
      operation_id TEXT DEFAULT NULL,
      moneda TEXT DEFAULT 'USD',
      tc TEXT DEFAULT '',
      created_by TEXT DEFAULT '',
      created_at TEXT
    )`
  )
  return ensureCols()
}

// Columnas agregadas después del alta original de la tabla. Sin migraciones
// versionadas: se garantizan on-the-fly (PRAGMA + ALTER, mismo patrón que
// ensureCols en operations/[id]/detail) y si un ALTER falla se degrada el
// guardado (se inserta sin esa columna) en vez de romper el pago.
//   tipo          'pago' | 'ajuste'
//   operation_id  vínculo canónico con la operación (el B/L queda como
//                 referencia mientras dure la migración)
//   moneda        'USD' (default) | 'ARS' | 'RMB' | 'EUR' — moneda original del asiento
//   tc            tipo de cambio del día (texto es-AR) cuando la moneda no es USD;
//                 el saldo en USD se calcula con ESE tc, no con el de la operación
const EXTRA_COLS: [string, string][] = [
  ['tipo', `TEXT DEFAULT 'pago'`],
  ['operation_id', 'TEXT DEFAULT NULL'],
  ['moneda', `TEXT DEFAULT 'USD'`],
  ['tc', `TEXT DEFAULT ''`],
]
let colsListas: Promise<Record<string, boolean>> | null = null
function ensureCols(): Promise<Record<string, boolean>> {
  if (colsListas) return colsListas
  const p = (async () => {
    const out: Record<string, boolean> = {}
    try {
      const leer = async () => new Set((await d1Query<{ name: string }>(`PRAGMA table_info(pagos_registro)`)).map(c => c.name))
      let have = await leer()
      let alterado = false
      for (const [col, decl] of EXTRA_COLS) {
        if (have.has(col) || !have.size) continue // tabla inexistente: nada que alterar
        alterado = true
        // Puede fallar porque otra ruta lo corrió en el mismo momento: se verifica abajo.
        try { await d1Exec(`ALTER TABLE pagos_registro ADD COLUMN ${col} ${decl}`) } catch {}
      }
      if (alterado) have = await leer()
      for (const [col] of EXTRA_COLS) out[col] = have.has(col)
      const faltan = EXTRA_COLS.filter(([c]) => !out[c]).map(([c]) => c)
      if (faltan.length) console.warn(`[pagos] pagos_registro sin las columnas ${faltan.join(', ')}; se guarda sin esos campos`)
    } catch (e) {
      for (const [col] of EXTRA_COLS) out[col] = false
      console.warn('[pagos] no se pudieron verificar las columnas:', (e as Error)?.message)
    }
    return out
  })()
  colsListas = p
  // Solo se cachea el éxito completo: si faltó alguna, se reintenta en el próximo request.
  p.then(out => { if (EXTRA_COLS.some(([c]) => !out[c])) colsListas = null })
  return p
}

// Si la tabla todavía no existe (primer GET antes del primer POST) PRAGMA
// devuelve vacío y las columnas quedan en false: el GET no las pide.
async function colsSinCrear(): Promise<Record<string, boolean>> {
  try { return await ensureCols() } catch { return {} }
}

const SCOPES = ['agente', 'despachante', 'cliente', 'successi'] as const
type Scope = typeof SCOPES[number]
// El pago pertenece a la sección donde impacta. Lo desconocido cae a 'agente'
// (contrato viejo: todo lo que no era despachante era agente).
const scopeDe = (v: unknown): Scope => (SCOPES as readonly string[]).includes(String(v || '')) ? (String(v) as Scope) : 'agente'
const SECCION: Record<Scope, string> = { agente: 'tracking', despachante: 'despachante', cliente: 'operaciones', successi: 'operaciones' }

const MONEDAS = ['USD', 'ARS', 'RMB', 'EUR']
const monedaDe = (v: unknown) => {
  const m = String(v || 'USD').trim().toUpperCase()
  return MONEDAS.includes(m) ? m : 'USD'
}

// Mismo blNorm que el cliente: mayúsculas, sin espacios ni guiones. BL_SQL es la
// versión SQL para comparar contra columnas.
const blNorm = (s: unknown) => String(s || '').replace(/[\s-]/g, '').toUpperCase()
const BL_SQL = (col: string) => `upper(replace(replace(COALESCE(${col}, ''), ' ', ''), '-', ''))`

// Los montos se guardan como texto en formato es-AR ("1.234,56"): para sumarlos
// hay que parsearlos igual que en pantalla.
const numUSD = (v: any) => {
  const n = parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}
const r2 = (n: number) => Math.round(n * 100) / 100

// Valor del asiento expresado en USD: los que vienen en otra moneda se
// convierten con SU tc (el del día del cobro). Sin tc no se puede convertir:
// se toma el monto tal cual para no esconder plata, y queda a la vista en
// `por_moneda` que hay un asiento en pesos sin tipo de cambio.
const enUSD = (r: any) => {
  const v = numUSD(r.monto)
  const moneda = String(r.moneda || 'USD').toUpperCase()
  if (moneda === 'USD') return v
  const tc = numUSD(r.tc)
  return tc > 0 ? v / tc : v
}

type Agg = {
  ref_id: string
  scope: string
  total: number      // pagos + ajustes = lo efectivamente imputado (en USD)
  pagos: number      // solo los pagos reales
  ajuste: number     // solo los ajustes manuales
  n: number          // filas del historial (pagos + ajustes)
  ultimo_metodo: string
  ultima_fecha: string
  por_moneda: Record<string, number>  // suma en moneda original, por moneda
}

const aggVacio = (scope: string, refId: string): Agg =>
  ({ ref_id: refId, scope, total: 0, pagos: 0, ajuste: 0, n: 0, ultimo_metodo: '', ultima_fecha: '', por_moneda: {} })

// Agrega el ledger por ref_id. Las filas tienen que venir ordenadas del pago
// más nuevo al más viejo: la primera aparición de cada ref es la última vez.
function aggregate(rows: any[]): Agg[] {
  const m = new Map<string, Agg>()
  for (const r of rows) {
    const k = String(r.ref_id || '')
    let e = m.get(k)
    if (!e) {
      e = aggVacio(String(r.scope || ''), k)
      m.set(k, e)
    }
    const v = enUSD(r)
    e.total += v
    e.n += 1
    if (String(r.tipo || 'pago') === 'ajuste') e.ajuste += v
    else e.pagos += v
    const moneda = String(r.moneda || 'USD').toUpperCase()
    e.por_moneda[moneda] = (e.por_moneda[moneda] || 0) + numUSD(r.monto)
    if (!e.ultimo_metodo && r.metodo) e.ultimo_metodo = String(r.metodo)
    if (!e.ultima_fecha && r.fecha) e.ultima_fecha = String(r.fecha)
  }
  return [...m.values()].map(e => ({
    ...e,
    total: r2(e.total), pagos: r2(e.pagos), ajuste: r2(e.ajuste),
    por_moneda: Object.fromEntries(Object.entries(e.por_moneda).map(([k, v]) => [k, r2(v)])),
  }))
}

// Total imputado a un ref del ledger (lo que tiene que decir el "Pagado").
async function aggOf(scope: string, refId: string): Promise<Agg> {
  let rows: any[] = []
  try {
    const vivos = await ensureSoftDelete('pagos_registro')
    rows = await d1Query<any>(
      `SELECT * FROM pagos_registro WHERE scope = ? AND ref_id = ? AND ${filtroVivos(vivos)} ORDER BY fecha DESC, id DESC`,
      [scope, refId]
    )
  } catch { rows = [] }
  return aggregate(rows)[0] || aggVacio(scope, refId)
}

// Deriva la operación del asiento cuando la pantalla no la mandó: primero por la
// referencia real (el embarque/despacho/proveedor ya cuelgan de una operación),
// después por B/L si matchea UNA sola operación viva. Nunca tira: sin match
// queda NULL y el backfill lo agarra después.
async function operacionDe(scope: Scope, refId: string, bl: unknown): Promise<string | null> {
  try {
    if (refId) {
      let rows: { operation_id: string }[] = []
      if (scope === 'agente') rows = await d1Query(`SELECT operation_id FROM shipments WHERE id = ?`, [refId])
      else if (scope === 'despachante') rows = await d1Query(`SELECT operation_id FROM despachante_pagos WHERE id = ?`, [refId])
      else if (scope === 'cliente') rows = await d1Query(`SELECT operation_id FROM proveedores_op WHERE id = ?`, [refId])
      else if (scope === 'successi') rows = (await d1Query<{ id: string }>(`SELECT id FROM operations WHERE id = ?`, [refId])).map(r => ({ operation_id: r.id }))
      const id = String(rows[0]?.operation_id || '').trim()
      if (id) return id
    }
  } catch {}
  const k = blNorm(bl)
  if (!k) return null
  try {
    const [vivosOps, vivosShips] = await Promise.all([ensureSoftDelete('operations'), ensureSoftDelete('shipments')])
    const ops = await d1Query<{ id: string }>(`SELECT id FROM operations WHERE ${BL_SQL('bl')} = ? AND ${filtroVivos(vivosOps)}`, [k])
    const ships = await d1Query<{ operation_id: string }>(
      `SELECT DISTINCT operation_id FROM shipments WHERE COALESCE(operation_id, '') <> '' AND ${BL_SQL('bl')} = ? AND ${filtroVivos(vivosShips)}`, [k]
    )
    const ids = new Set<string>([...ops.map(o => String(o.id)), ...ships.map(s => String(s.operation_id))])
    return ids.size === 1 ? [...ids][0] : null
  } catch { return null }
}

export async function GET(request: Request) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const bl = url.searchParams.get('bl')
  const opId = url.searchParams.get('operation_id')
  const scope = url.searchParams.get('scope')
  const refId = url.searchParams.get('ref_id')
  const agg = url.searchParams.get('agg')

  // La tabla se crea recién en el primer POST; si todavía no existe, el
  // historial simplemente está vacío (sin pagar el costo de un CREATE por GET).
  let rows
  try {
    const [cols, vivos] = await Promise.all([colsSinCrear(), ensureSoftDelete('pagos_registro')])
    const vivo = filtroVivos(vivos)
    const ORDEN = `ORDER BY fecha DESC, id DESC`

    // agg=1 → totales por ref_id (para derivar el pagado/saldo de una lista
    // entera sin traerse todo el historial fila por fila).
    if (agg) {
      const all = scope
        ? await d1Query<any>(`SELECT * FROM pagos_registro WHERE scope = ? AND ${vivo} ${ORDEN}`, [scope])
        : await d1Query<any>(`SELECT * FROM pagos_registro WHERE ${vivo} ${ORDEN}`)
      return NextResponse.json(aggregate(all))
    }
    // Por operación (el vínculo real). Si además viene ?bl=, se suman los
    // asientos viejos que todavía no tienen operation_id y matchean por B/L
    // (doble lectura de migración). ?scope= acota al libro que interesa.
    if (opId != null && cols.operation_id) {
      const where = [vivo]
      const params: any[] = []
      if (bl) { where.push(`(operation_id = ? OR (COALESCE(operation_id, '') = '' AND ${BL_SQL('bl')} = ?))`); params.push(opId, blNorm(bl)) }
      else { where.push(`operation_id = ?`); params.push(opId) }
      if (scope) { where.push(`scope = ?`); params.push(scope) }
      rows = await d1Query<any>(`SELECT * FROM pagos_registro WHERE ${where.join(' AND ')} ${ORDEN}`, params)
    } else if (bl != null) {
      // Fallback por B/L (pantallas que todavía no conocen operation_id).
      rows = await d1Query<any>(
        `SELECT * FROM pagos_registro WHERE ${BL_SQL('bl')} = ? AND ${vivo}${scope ? ' AND scope = ?' : ''} ${ORDEN}`,
        scope ? [blNorm(bl), scope] : [blNorm(bl)]
      )
    } else if (scope && refId) {
      rows = await d1Query<any>(
        `SELECT * FROM pagos_registro WHERE scope = ? AND ref_id = ? AND ${vivo} ${ORDEN}`,
        [scope, refId]
      )
    } else if (scope) {
      rows = await d1Query<any>(
        `SELECT * FROM pagos_registro WHERE scope = ? AND ${vivo} ${ORDEN} LIMIT 500`,
        [scope]
      )
    } else if (opId != null) {
      rows = [] // sin columna operation_id nada puede estar vinculado por id
    } else {
      rows = await d1Query<any>(`SELECT * FROM pagos_registro WHERE ${vivo} ORDER BY id DESC LIMIT 200`)
    }
  } catch {
    // Tabla inexistente o D1 caído: historial vacío (y agg vacío) en vez de 500.
    rows = []
  }
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  // El pago pertenece a la sección donde impacta (tracking, despachante u operaciones).
  const body = await request.json()
  const scope = scopeDe(body.scope)
  const g = await requireWrite(SECCION[scope])
  if (!g.ok) return g.res
  const cols = await ensureTable()

  // 'ajuste' = corrección explícita del saldo (plata cargada a mano que ningún
  // pago respalda). Queda en el historial, visible y borrable, en vez de vivir
  // en un campo tipeado que nadie puede auditar.
  const tipo = body.tipo === 'ajuste' ? 'ajuste' : 'pago'
  const monto = String(body.monto ?? '').trim()
  if (!monto) {
    return NextResponse.json({ error: 'El monto es obligatorio' }, { status: 400 })
  }
  const val = numUSD(monto)
  if (tipo === 'pago' && val <= 0) {
    return NextResponse.json({ error: 'El monto del pago tiene que ser mayor a cero' }, { status: 400 })
  }
  if (tipo === 'ajuste' && val === 0) {
    return NextResponse.json({ error: 'El ajuste no puede ser cero' }, { status: 400 })
  }

  // Moneda original + tc del día. Un asiento en pesos sin tipo de cambio no se
  // puede sumar al saldo en USD: se pide antes de guardar.
  const moneda = monedaDe(body.moneda)
  const tc = String(body.tc ?? '').trim()
  if (moneda !== 'USD' && cols.moneda && numUSD(tc) <= 0) {
    return NextResponse.json({ error: `Cargá el tipo de cambio del día para un asiento en ${moneda}` }, { status: 400 })
  }

  const refId = String(body.ref_id || '')
  const bl = String(body.bl || '')
  // Identidad canónica: si la pantalla no mandó operation_id se deriva de la
  // referencia (o del B/L si es inequívoco). Sin match queda NULL: el backfill
  // lo completa después y el GET por B/L lo sigue encontrando mientras tanto.
  let opId: string | null = String(body.operation_id || '').trim() || null
  if (!opId && cols.operation_id) opId = await operacionDe(scope, refId, bl)

  const autor = g.s.name || g.s.username || ''
  const colsIns = ['scope', 'ref_id', 'bl', 'fecha', 'monto', 'metodo', 'nota']
  const vals: any[] = [scope, refId, bl, String(body.fecha || ''), monto, String(body.metodo || ''), String(body.nota || '')]
  if (cols.tipo) { colsIns.push('tipo'); vals.push(tipo) }
  if (cols.operation_id) { colsIns.push('operation_id'); vals.push(opId) }
  if (cols.moneda) { colsIns.push('moneda'); vals.push(moneda) }
  if (cols.tc) { colsIns.push('tc'); vals.push(moneda === 'USD' ? '' : tc) }
  colsIns.push('created_by'); vals.push(autor)

  const res = await d1Exec(
    `INSERT INTO pagos_registro (${colsIns.join(', ')}, created_at)
     VALUES (${colsIns.map(() => '?').join(', ')}, datetime('now'))`,
    vals
  )
  const created = await d1Query<any>(`SELECT * FROM pagos_registro WHERE id = ?`, [res.lastRowId])
  // `agg` = el saldo recalculado desde el ledger completo del ref. Quien registra
  // el pago escribe ESE número en el módulo, en vez de sumarle el monto al valor
  // que tenía antes (que es como se separaban historial y saldo).
  const agg = await aggOf(scope, refId)
  return NextResponse.json({ ...(created[0] || { ok: true, scope, ref_id: refId, operation_id: opId, moneda }), agg })
}
