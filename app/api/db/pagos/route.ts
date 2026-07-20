import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { getSessionInfo, requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Registro de pagos (ledger): cada pago al agente o al despachante es un evento
// con fecha/monto/método, no una celda editada. Los totales de tracking y
// despachante siguen siendo la vista agregada; esto guarda el historial.
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
      created_by TEXT DEFAULT '',
      created_at TEXT
    )`
  )
}

const blNorm = (s: string) => String(s || '').replace(/[\s-]/g, '').toUpperCase()

export async function GET(request: Request) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureTable()

  const url = new URL(request.url)
  const bl = url.searchParams.get('bl')
  const scope = url.searchParams.get('scope')
  const refId = url.searchParams.get('ref_id')

  let rows
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
  } else {
    rows = await d1Query<any>(`SELECT * FROM pagos_registro ORDER BY id DESC LIMIT 200`)
  }
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  // El pago pertenece a la sección donde impacta (tracking o despachante).
  const body = await request.json()
  const scope = body.scope === 'despachante' ? 'despachante' : 'agente'
  const g = await requireWrite(scope === 'despachante' ? 'despachante' : 'tracking')
  if (!g.ok) return g.res
  await ensureTable()

  if (!String(body.monto || '').trim()) {
    return NextResponse.json({ error: 'El monto es obligatorio' }, { status: 400 })
  }
  const res = await d1Exec(
    `INSERT INTO pagos_registro (scope, ref_id, bl, fecha, monto, metodo, nota, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [scope, String(body.ref_id || ''), String(body.bl || ''), String(body.fecha || ''), String(body.monto), String(body.metodo || ''), String(body.nota || ''), g.s.name || g.s.username || '']
  )
  const created = await d1Query<any>(`SELECT * FROM pagos_registro WHERE id = ?`, [res.lastRowId])
  return NextResponse.json(created[0] || { ok: true })
}
