import { NextResponse } from 'next/server'
import { d1Exec } from '@/lib/d1'
import { getSessionInfo, canEdit } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canEdit(s)) return NextResponse.json({ error: 'Tu usuario es de solo lectura' }, { status: 403 })
  const { id } = await params
  const body = await request.json()
  const codigo = String(body.codigo || '').trim()
  if (!codigo) return NextResponse.json({ error: 'El código NCM es obligatorio' }, { status: 400 })

  await d1Exec(
    `UPDATE ncm SET codigo = ?, producto = ?, der = ?, tasa = ?, iva = ?, iva_adic = ?, ganancias = ?, iibb = ?, notas = ?, updated_at = datetime('now') WHERE id = ?`,
    [codigo, body.producto || '', body.der || '', body.tasa || '', body.iva || '', body.iva_adic || '', body.ganancias || '', body.iibb || '', body.notas || '', id]
  )
  return NextResponse.json({ ok: true, id })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canEdit(s)) return NextResponse.json({ error: 'Tu usuario es de solo lectura' }, { status: 403 })
  const { id } = await params
  await d1Exec(`DELETE FROM ncm WHERE id = ?`, [id])
  return NextResponse.json({ ok: true })
}
