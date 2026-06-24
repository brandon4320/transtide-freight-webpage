import { NextResponse } from 'next/server'
import { d1Exec } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('contactos')
  if (!g.ok) return g.res
  const { id } = await params
  const body = await request.json()
  if (!String(body.nombre || '').trim()) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  }
  await d1Exec(
    `UPDATE contactos SET tipo = ?, nombre = ?, contacto = ?, email = ?, telefono = ?, web = ?, observaciones = ?, updated_at = datetime('now') WHERE id = ?`,
    [body.tipo || 'naviera', body.nombre.trim(), body.contacto || '', body.email || '', body.telefono || '', body.web || '', body.observaciones || '', id]
  )
  return NextResponse.json({ ok: true, id, ...body })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('contactos')
  if (!g.ok) return g.res
  const { id } = await params
  await d1Exec(`DELETE FROM contactos WHERE id = ?`, [id])
  return NextResponse.json({ ok: true })
}
