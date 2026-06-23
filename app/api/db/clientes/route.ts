import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { d1Query, d1Exec } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'

const CLIENTE_SECTIONS = ['clientes', 'operaciones', 'cotizador']

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await d1Query(
    `SELECT id, nombre, cuit, email, telefono, notas FROM clientes ORDER BY created_at DESC`
  )
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  const g = await requireWrite(CLIENTE_SECTIONS)
  if (!g.ok) return g.res

  const body = await request.json()
  const id = body.id || `c${Date.now()}`

  await d1Exec(
    `INSERT INTO clientes (id, nombre, cuit, email, telefono, notas, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [id, body.nombre || null, body.cuit || null, body.email || null, body.telefono || null, body.notas || null]
  )
  return NextResponse.json({ ...body, id })
}
