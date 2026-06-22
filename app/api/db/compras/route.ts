import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { getSessionInfo, canEdit } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await d1Query<any>(
    `SELECT *, (SELECT COUNT(*) FROM compras_proveedores p WHERE p.compra_id = c.id) AS n_proveedores
     FROM compras c
     ORDER BY updated_at DESC`
  )
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canEdit(s)) return NextResponse.json({ error: 'Tu usuario es de solo lectura' }, { status: 403 })

  const body = await request.json()
  const id = 'comp-' + Date.now()
  const nombre = body.nombre || ''
  const descripcion = body.descripcion || ''
  const estado = 'cotizando'
  const createdBy = s.name || s.username

  await d1Exec(
    `INSERT INTO compras (id, nombre, descripcion, estado, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [id, nombre, descripcion, estado, createdBy]
  )

  return NextResponse.json({ id, nombre, descripcion, estado, created_by: createdBy, n_proveedores: 0 })
}
