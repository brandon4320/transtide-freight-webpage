import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { d1Exec } from '@/lib/d1'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await d1Exec(`DELETE FROM operations WHERE id = ?`, [id])
  return NextResponse.json({ ok: true })
}
