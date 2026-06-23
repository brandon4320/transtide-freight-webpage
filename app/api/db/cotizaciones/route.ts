import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { d1Query, d1Exec } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await d1Query(
    `SELECT id, nombre, cliente, modo, estado, total_usd, resumen, notas, operation_id, created_by, created_at, updated_at
     FROM cotizaciones ORDER BY updated_at DESC`
  )
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  const g = await requireWrite('cotizador')
  if (!g.ok) return g.res

  const body = await request.json()
  const id = 'cot-' + Date.now()
  const createdBy = g.s.name || g.s.username || ''

  await d1Exec(
    `INSERT INTO cotizaciones (id, nombre, cliente, modo, estado, total_usd, resumen, data, notas, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      id,
      body.nombre || null,
      body.cliente || null,
      body.modo || 'maritimo',
      body.estado || 'borrador',
      body.total_usd || null,
      body.resumen || null,
      JSON.stringify(body.data || {}),
      body.notas || null,
      createdBy,
    ]
  )
  return NextResponse.json({ id, ...body, created_by: createdBy })
}
