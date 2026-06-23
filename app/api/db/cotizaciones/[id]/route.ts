import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { d1Query, d1Exec } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET single quote incl. full data blob (para reactivar)
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const rows = await d1Query<any>(`SELECT * FROM cotizaciones WHERE id = ?`, [id])
  if (rows.length === 0) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  const r = rows[0]
  let data: any = {}
  try { data = JSON.parse(r.data || '{}') } catch {}
  return NextResponse.json({ ...r, data })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('cotizador')
  if (!g.ok) return g.res
  const { id } = await params
  const body = await request.json()

  // Si solo viene "estado", actualizamos solo eso (cambio rápido de estado)
  if (body.onlyEstado) {
    await d1Exec(`UPDATE cotizaciones SET estado = ?, updated_at = datetime('now') WHERE id = ?`, [body.estado, id])
    return NextResponse.json({ ok: true, id, estado: body.estado })
  }

  await d1Exec(
    `UPDATE cotizaciones SET nombre = ?, cliente = ?, modo = ?, estado = ?, total_usd = ?, resumen = ?, data = ?, notas = ?, updated_at = datetime('now') WHERE id = ?`,
    [
      body.nombre || null,
      body.cliente || null,
      body.modo || 'maritimo',
      body.estado || 'borrador',
      body.total_usd || null,
      body.resumen || null,
      JSON.stringify(body.data || {}),
      body.notas || null,
      id,
    ]
  )
  return NextResponse.json({ ok: true, id })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('cotizador')
  if (!g.ok) return g.res
  const { id } = await params
  await d1Exec(`DELETE FROM cotizaciones WHERE id = ?`, [id])
  return NextResponse.json({ ok: true })
}
