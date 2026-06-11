import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { d1Query, d1Exec } from '@/lib/d1'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FIELDS = [
  'num', 'origen', 'destino', 'contenedores', 'modo', 'bl', 'carrier', 'etd', 'eta', 'status',
  'sea_freight_usd', 'other_fees_usd', 'discount_usd', 'total_usd', 'suppliers',
  'amount_due_usd', 'amount_rec_usd', 'balance_usd', 'payment_date', 'notes',
]

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await d1Query(
    `SELECT id, ${FIELDS.join(', ')} FROM shipments ORDER BY CAST(num AS INTEGER) DESC, id DESC`
  )
  return NextResponse.json({ shipments: rows, count: rows.length })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const cols = FIELDS.join(', ')
  const placeholders = FIELDS.map(() => '?').join(', ')
  const params = FIELDS.map(f => body[f] ?? null)

  const res = await d1Exec(
    `INSERT INTO shipments (${cols}, created_at, updated_at) VALUES (${placeholders}, datetime('now'), datetime('now'))`,
    params
  )
  const created = await d1Query(`SELECT id, ${FIELDS.join(', ')} FROM shipments WHERE id = ?`, [res.lastRowId])
  return NextResponse.json(created[0] || { id: res.lastRowId, ...body })
}
