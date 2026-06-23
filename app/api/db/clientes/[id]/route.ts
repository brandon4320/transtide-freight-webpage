import { NextResponse } from 'next/server'
import { d1Exec } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'

// Clientes se editan desde varias secciones (clientes, alta inline en operaciones/cotizador).
const CLIENTE_SECTIONS = ['clientes', 'operaciones', 'cotizador']

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite(CLIENTE_SECTIONS)
  if (!g.ok) return g.res

  const { id } = await params
  const body = await request.json()

  await d1Exec(
    `UPDATE clientes
     SET nombre = ?, cuit = ?, email = ?, telefono = ?, notas = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [body.nombre || null, body.cuit || null, body.email || null, body.telefono || null, body.notas || null, id]
  )
  return NextResponse.json({ ...body, id })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite(CLIENTE_SECTIONS)
  if (!g.ok) return g.res

  const { id } = await params
  await d1Exec(`DELETE FROM clientes WHERE id = ?`, [id])
  return NextResponse.json({ ok: true })
}
