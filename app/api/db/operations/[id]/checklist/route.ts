import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { d1Query, d1Batch } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const rows = await d1Query<{ task_id: string }>(
    `SELECT task_id FROM checklist WHERE operation_id = ?`,
    [id]
  )
  return NextResponse.json(rows.map(r => r.task_id))
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('operaciones')
  if (!g.ok) return g.res

  const { id } = await params
  const body = (await request.json()) as string[]

  const statements: { sql: string; params?: any[] }[] = [
    { sql: `DELETE FROM checklist WHERE operation_id = ?`, params: [id] },
  ]
  for (const taskId of body) {
    statements.push({
      sql: `INSERT INTO checklist (operation_id, task_id) VALUES (?, ?)`,
      params: [id, taskId],
    })
  }
  await d1Batch(statements)
  return NextResponse.json({ ok: true })
}
