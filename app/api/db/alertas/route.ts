import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { getSessionInfo, requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Alertas "hechas": las alertas se DERIVAN de los datos, pero las que son
// tareas puras (pedir BL, pagar naviera, coordinar transporte…) no tienen un
// dato que apagar. Este store guarda por qué alerta (akey = bl|tipo) ya te
// encargaste, para tacharla. Tabla auto-migrante (primer POST la crea).
// Tachar NO es definitivo: el POST con `undo` la devuelve a la lista.
async function ensure() {
  await d1Exec(
    `CREATE TABLE IF NOT EXISTS alertas_hechas (
      akey TEXT PRIMARY KEY, done INTEGER DEFAULT 1, done_by TEXT, done_at TEXT
    )`
  )
}

export async function GET(request: Request) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const full = new URL(request.url).searchParams.get('full')
  let rows: any[] = []
  try {
    rows = full
      ? await d1Query<any>(`SELECT akey, done_by, done_at FROM alertas_hechas WHERE done = 1`)
      : await d1Query<any>(`SELECT akey FROM alertas_hechas WHERE done = 1`)
  } catch { rows = [] }
  // full=1 → objetos con quién y cuándo la tachó (para el desplegable "Hechas").
  // Sin el flag se mantiene el contrato viejo: array de akeys.
  if (full) return NextResponse.json(rows.map(r => ({ akey: r.akey, done_by: r.done_by || '', done_at: r.done_at || '' })))
  return NextResponse.json(rows.map(r => r.akey))
}

export async function POST(request: Request) {
  const g = await requireWrite('tracking')
  if (!g.ok) return g.res
  await ensure()
  const body = await request.json()
  const akey = String(body.akey || '')
  if (!akey) return NextResponse.json({ error: 'akey requerido' }, { status: 400 })
  const autor = g.s.name || g.s.username || ''
  if (body.undo) {
    // Deshacer: vuelve a la lista de pendientes.
    await d1Exec(`DELETE FROM alertas_hechas WHERE akey = ?`, [akey])
    return NextResponse.json({ ok: true, akey, done: false })
  }
  await d1Exec(
    `INSERT INTO alertas_hechas (akey, done, done_by, done_at) VALUES (?, 1, ?, datetime('now'))
     ON CONFLICT(akey) DO UPDATE SET done = 1, done_by = excluded.done_by, done_at = datetime('now')`,
    [akey, autor]
  )
  return NextResponse.json({ ok: true, akey, done: true, done_by: autor })
}
