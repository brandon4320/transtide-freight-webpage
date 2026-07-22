import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { getSessionInfo, requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Alertas "hechas": las alertas se DERIVAN de los datos, pero las que son
// tareas puras (pedir BL, pagar naviera, coordinar transporte…) no tienen un
// dato que apagar. Este store guarda por qué alerta (akey = bl|tipo) ya te
// encargaste, para tacharla. Tabla auto-migrante (primer POST la crea).
async function ensure() {
  await d1Exec(
    `CREATE TABLE IF NOT EXISTS alertas_hechas (
      akey TEXT PRIMARY KEY, done INTEGER DEFAULT 1, done_by TEXT, done_at TEXT
    )`
  )
}

export async function GET() {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let rows: any[] = []
  try { rows = await d1Query<any>(`SELECT akey FROM alertas_hechas WHERE done = 1`) } catch { rows = [] }
  return NextResponse.json(rows.map(r => r.akey))
}

export async function POST(request: Request) {
  const g = await requireWrite('tracking')
  if (!g.ok) return g.res
  await ensure()
  const body = await request.json()
  const akey = String(body.akey || '')
  if (!akey) return NextResponse.json({ error: 'akey requerido' }, { status: 400 })
  if (body.undo) {
    await d1Exec(`DELETE FROM alertas_hechas WHERE akey = ?`, [akey])
  } else {
    await d1Exec(
      `INSERT INTO alertas_hechas (akey, done, done_by, done_at) VALUES (?, 1, ?, datetime('now'))
       ON CONFLICT(akey) DO UPDATE SET done = 1, done_at = datetime('now')`,
      [akey, g.s.name || g.s.username || '']
    )
  }
  return NextResponse.json({ ok: true })
}
