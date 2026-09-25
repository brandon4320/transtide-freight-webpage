// Una carta de garantía: editar los datos, bajarla o borrarla.
//
// GET    /api/db/cartas/<id>?archivo=1   redirige al PDF con una firma corta
// PUT    /api/db/cartas/<id>             edita los campos (sin tocar el archivo)
// DELETE /api/db/cartas/<id>             la manda a la papelera (deleted_at)
import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { r2SignedGetUrl } from '@/lib/r2'
import { getSessionInfo, requireWrite } from '@/lib/perms'
import { auditar } from '@/lib/auditoria'
import { ensureCartas } from '../route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CAMPOS = ['sociedad', 'sociedad_cuit', 'fecha', 'vence', 'bl', 'notas'] as const

async function traer(id: string) {
  if (!(await ensureCartas())) return null
  const rows = await d1Query<any>(`SELECT * FROM cartas_garantia WHERE id = ? AND deleted_at IS NULL`, [id])
  return rows[0] || null
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const carta = await traer(id)
  if (!carta) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  if (new URL(request.url).searchParams.get('archivo') === '1') {
    if (!carta.archivo_key) return NextResponse.json({ error: 'Esta carta no tiene archivo adjunto.' }, { status: 404 })
    // Firma de dos minutos: el navegador va derecho a R2.
    return NextResponse.redirect(await r2SignedGetUrl(carta.archivo_key, carta.archivo_nombre, 120))
  }
  return NextResponse.json(carta)
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('contactos')
  if (!g.ok) return g.res
  const { id } = await params
  const antes = await traer(id)
  if (!antes) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const sets: string[] = []
  const valores: any[] = []
  for (const campo of CAMPOS) {
    if (body[campo] === undefined) continue
    sets.push(`${campo} = ?`)
    valores.push(String(body[campo] ?? '').trim())
  }
  if (!sets.length) return NextResponse.json({ ok: true, sinCambios: true })

  sets.push(`updated_at = datetime('now')`)
  valores.push(id)
  await d1Exec(`UPDATE cartas_garantia SET ${sets.join(', ')} WHERE id = ?`, valores)

  const usuario = g.s.name || g.s.username || ''
  for (const campo of CAMPOS) {
    if (body[campo] === undefined) continue
    const nuevo = String(body[campo] ?? '').trim()
    const viejo = String(antes[campo] ?? '')
    if (nuevo !== viejo) await auditar({ entidad: 'cartas_garantia', id, accion: 'editar', campo, antes: viejo, despues: nuevo, usuario })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('contactos')
  if (!g.ok) return g.res
  const { id } = await params
  const carta = await traer(id)
  if (!carta) return NextResponse.json({ ok: true }) // ya no estaba: idempotente

  const usuario = g.s.name || g.s.username || ''
  // El archivo en R2 se conserva: si se restaura la carta, el PDF sigue ahí.
  await d1Exec(`UPDATE cartas_garantia SET deleted_at = datetime('now'), deleted_by = ? WHERE id = ?`, [usuario, id])
  await auditar({ entidad: 'cartas_garantia', id, accion: 'borrar', antes: carta, usuario })
  return NextResponse.json({ ok: true })
}
