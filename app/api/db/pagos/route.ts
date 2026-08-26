import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { getSessionInfo, requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Registro de pagos (ledger): cada pago al agente o al despachante es un evento
// con fecha/monto/método, no una celda editada. El "Pagado"/"Saldo" que muestran
// tracking y despachante son la PROYECCIÓN de este ledger: se recalculan desde
// acá (ver el `agg` que devuelven POST y DELETE), no se suman a mano.
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
      created_by TEXT DEFAULT '',
      created_at TEXT
    )`
  )
  return ensureCols()
}

// `tipo` se agregó después del alta original de la tabla. Sin migraciones
// versionadas: se garantiza on-the-fly (PRAGMA + ALTER) y si el ALTER falla se
// degrada el guardado (se inserta sin la columna) en vez de romper el pago.
let colsReady: Record<string, boolean> | null = null
async function ensureCols(): Promise<Record<string, boolean>> {
  if (colsReady) return colsReady
  const out: Record<string, boolean> = {}
  for (const [col, decl] of [['tipo', `TEXT DEFAULT 'pago'`]] as [string, string][]) {
    try {
      const info = await d1Query<{ name: string }>(`PRAGMA table_info(pagos_registro)`)
      if (info.some(c => c.name === col)) { out[col] = true; continue }
      await d1Exec(`ALTER TABLE pagos_registro ADD COLUMN ${col} ${decl}`)
      out[col] = true
    } catch {
      out[col] = false
      console.warn(`[pagos] no se pudo agregar pagos_registro.${col}; se guarda sin ese campo`)
    }
  }
  colsReady = out
  return out
}

const blNorm = (s: string) => String(s || '').replace(/[\s-]/g, '').toUpperCase()

// Los montos se guardan como texto en formato es-AR ("1.234,56"): para sumarlos
// hay que parsearlos igual que en pantalla.
const numUSD = (v: any) => {
  const n = parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}
const r2 = (n: number) => Math.round(n * 100) / 100

type Agg = {
  ref_id: string
  scope: string
  total: number      // pagos + ajustes = lo efectivamente imputado
  pagos: number      // solo los pagos reales
  ajuste: number     // solo los ajustes manuales
  n: number          // filas del historial (pagos + ajustes)
  ultimo_metodo: string
  ultima_fecha: string
}

// Agrega el ledger por ref_id. Las filas tienen que venir ordenadas del pago
// más nuevo al más viejo: la primera aparición de cada ref es la última vez.
function aggregate(rows: any[]): Agg[] {
  const m = new Map<string, Agg>()
  for (const r of rows) {
    const k = String(r.ref_id || '')
    let e = m.get(k)
    if (!e) {
      e = { ref_id: k, scope: String(r.scope || ''), total: 0, pagos: 0, ajuste: 0, n: 0, ultimo_metodo: '', ultima_fecha: '' }
      m.set(k, e)
    }
    const v = numUSD(r.monto)
    e.total += v
    e.n += 1
    if (String(r.tipo || 'pago') === 'ajuste') e.ajuste += v
    else e.pagos += v
    if (!e.ultimo_metodo && r.metodo) e.ultimo_metodo = String(r.metodo)
    if (!e.ultima_fecha && r.fecha) e.ultima_fecha = String(r.fecha)
  }
  return [...m.values()].map(e => ({ ...e, total: r2(e.total), pagos: r2(e.pagos), ajuste: r2(e.ajuste) }))
}

// Total imputado a un ref del ledger (lo que tiene que decir el "Pagado").
async function aggOf(scope: string, refId: string): Promise<Agg> {
  let rows: any[] = []
  try {
    rows = await d1Query<any>(
      `SELECT * FROM pagos_registro WHERE scope = ? AND ref_id = ? ORDER BY fecha DESC, id DESC`,
      [scope, refId]
    )
  } catch { rows = [] }
  return aggregate(rows)[0] || { ref_id: refId, scope, total: 0, pagos: 0, ajuste: 0, n: 0, ultimo_metodo: '', ultima_fecha: '' }
}

export async function GET(request: Request) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const bl = url.searchParams.get('bl')
  const scope = url.searchParams.get('scope')
  const refId = url.searchParams.get('ref_id')
  const agg = url.searchParams.get('agg')

  // La tabla se crea recién en el primer POST; si todavía no existe, el
  // historial simplemente está vacío (sin pagar el costo de un CREATE por GET).
  let rows
  try {
    // agg=1 → totales por ref_id (para derivar el pagado/saldo de una lista
    // entera sin traerse todo el historial fila por fila).
    if (agg) {
      const all = scope
        ? await d1Query<any>(`SELECT * FROM pagos_registro WHERE scope = ? ORDER BY fecha DESC, id DESC`, [scope])
        : await d1Query<any>(`SELECT * FROM pagos_registro ORDER BY fecha DESC, id DESC`)
      return NextResponse.json(aggregate(all))
    }
    if (bl != null) {
      rows = await d1Query<any>(
        `SELECT * FROM pagos_registro WHERE upper(replace(replace(bl, ' ', ''), '-', '')) = ? ORDER BY fecha DESC, id DESC`,
        [blNorm(bl)]
      )
    } else if (scope && refId) {
      rows = await d1Query<any>(
        `SELECT * FROM pagos_registro WHERE scope = ? AND ref_id = ? ORDER BY fecha DESC, id DESC`,
        [scope, refId]
      )
    } else if (scope) {
      rows = await d1Query<any>(
        `SELECT * FROM pagos_registro WHERE scope = ? ORDER BY fecha DESC, id DESC LIMIT 500`,
        [scope]
      )
    } else {
      rows = await d1Query<any>(`SELECT * FROM pagos_registro ORDER BY id DESC LIMIT 200`)
    }
  } catch {
    // Tabla inexistente o D1 caído: historial vacío (y agg vacío) en vez de 500.
    rows = []
  }
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  // El pago pertenece a la sección donde impacta (tracking o despachante).
  const body = await request.json()
  const scope = body.scope === 'despachante' ? 'despachante' : 'agente'
  const g = await requireWrite(scope === 'despachante' ? 'despachante' : 'tracking')
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

  const refId = String(body.ref_id || '')
  const autor = g.s.name || g.s.username || ''
  const base = [scope, refId, String(body.bl || ''), String(body.fecha || ''), monto, String(body.metodo || ''), String(body.nota || '')]
  const res = cols.tipo
    ? await d1Exec(
        `INSERT INTO pagos_registro (scope, ref_id, bl, fecha, monto, metodo, nota, tipo, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [...base, tipo, autor]
      )
    : await d1Exec(
        `INSERT INTO pagos_registro (scope, ref_id, bl, fecha, monto, metodo, nota, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [...base, autor]
      )
  const created = await d1Query<any>(`SELECT * FROM pagos_registro WHERE id = ?`, [res.lastRowId])
  // `agg` = el saldo recalculado desde el ledger completo del ref. Quien registra
  // el pago escribe ESE número en el módulo, en vez de sumarle el monto al valor
  // que tenía antes (que es como se separaban historial y saldo).
  const agg = await aggOf(scope, refId)
  return NextResponse.json({ ...(created[0] || { ok: true }), agg })
}
