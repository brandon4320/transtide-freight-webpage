import { NextResponse } from 'next/server'
import { d1Exec } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FIELDS = [
  'num', 'origen', 'destino', 'contenedores', 'modo', 'bl', 'carrier', 'etd', 'eta', 'status',
  'sea_freight_usd', 'other_fees_rmb', 'tc_rmb', 'other_fees_usd', 'discount_usd', 'total_usd', 'suppliers',
  'amount_due_usd', 'amount_rec_usd', 'balance_usd', 'payment_date', 'notes', 'agente', 'operation_id',
]

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('tracking')
  if (!g.ok) return g.res
  const { id } = await params
  const body = await request.json()

  const setClause = FIELDS.map(f => `${f} = ?`).join(', ')
  const values = FIELDS.map(f => body[f] ?? null)
  await d1Exec(
    `UPDATE shipments SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
    [...values, id]
  )
  return NextResponse.json({ ok: true, id, ...body })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('tracking')
  if (!g.ok) return g.res
  const { id } = await params
  await d1Exec(`DELETE FROM shipments WHERE id = ?`, [id])
  return NextResponse.json({ ok: true })
}
