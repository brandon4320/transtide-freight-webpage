import { NextResponse } from 'next/server'
import { d1Exec, d1Batch } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('operaciones')
  if (!g.ok) return g.res

  const { id } = await params
  const body = await request.json()

  await d1Exec(
    `UPDATE operations
     SET nombre = ?, contenedor = ?, bl = ?, eta = ?, m3 = ?, estado = ?, fecha = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [body.nombre || null, body.contenedor || null, body.bl || null, body.eta || null, body.m3 || null, body.estado || null, body.fecha || null, id]
  )
  return NextResponse.json({ ...body, id })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('operaciones')
  if (!g.ok) return g.res

  const { id } = await params
  // Borrado en cascada: limpiar las tablas hijas (D1 HTTP no aplica ON DELETE CASCADE).
  await d1Batch([
    { sql: `DELETE FROM gastos WHERE operation_id = ?`, params: [id] },
    { sql: `DELETE FROM proveedores_op WHERE operation_id = ?`, params: [id] },
    { sql: `DELETE FROM custom_categories WHERE operation_id = ?`, params: [id] },
    { sql: `DELETE FROM checklist WHERE operation_id = ?`, params: [id] },
    { sql: `DELETE FROM operations WHERE id = ?`, params: [id] },
  ])
  return NextResponse.json({ ok: true })
}
