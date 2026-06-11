import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { d1Query, d1Exec } from '@/lib/d1'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type OpRow = {
  id: string
  nombre: string | null
  contenedor: string | null
  bl: string | null
  eta: string | null
  m3: string | null
  estado: string | null
  fecha: string | null
  m3_total?: number | null
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await d1Query<OpRow>(
    `SELECT o.id, o.nombre, o.contenedor, o.bl, o.eta, o.m3, o.estado, o.fecha,
            COALESCE((SELECT SUM(CAST(p.m3 AS REAL)) FROM proveedores_op p WHERE p.operation_id = o.id), 0) AS m3_total
     FROM operations o
     ORDER BY o.created_at DESC`
  )
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session?.user as any)?.role === 'viewer') return NextResponse.json({ error: 'Tu usuario es de solo lectura' }, { status: 403 })

  const body = await request.json()
  const id = body.id || `op-${Date.now()}`

  await d1Exec(
    `INSERT INTO operations (id, nombre, contenedor, bl, eta, m3, estado, fecha, puerto_origen, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [id, body.nombre || null, body.contenedor || null, body.bl || null, body.eta || null, body.m3 || null, body.estado || null, body.fecha || null, body.puertoOrigen || null]
  )
  return NextResponse.json({ ...body, id })
}
