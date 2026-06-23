import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { d1Query, d1Exec } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FIELDS = [
  'num', 'origen', 'destino', 'contenedores', 'modo', 'bl', 'carrier', 'etd', 'eta', 'status',
  'sea_freight_usd', 'other_fees_rmb', 'tc_rmb', 'other_fees_usd', 'discount_usd', 'total_usd', 'suppliers',
  'amount_due_usd', 'amount_rec_usd', 'balance_usd', 'payment_date', 'notes', 'agente', 'operation_id',
]

// Normaliza un B/L para comparación (igual que blNorm del cliente): mayúsculas, sin espacios ni guiones.
function blNorm(s: string) {
  return String(s || '').replace(/[\s-]/g, '').toUpperCase()
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const bl = url.searchParams.get('bl')

  // Búsqueda puntual por B/L (evita traer toda la tabla solo para matchear 1 fila).
  if (bl != null) {
    const target = blNorm(bl)
    if (!target) return NextResponse.json({ shipments: [], count: 0 })
    const rows = await d1Query<any>(
      `SELECT id, ${FIELDS.join(', ')} FROM shipments
       WHERE upper(replace(replace(bl, ' ', ''), '-', '')) = ? LIMIT 5`,
      [target]
    )
    return NextResponse.json({ shipments: rows, count: rows.length })
  }

  const rows = await d1Query(
    `SELECT id, ${FIELDS.join(', ')} FROM shipments ORDER BY CAST(num AS INTEGER) DESC, id DESC`
  )
  return NextResponse.json({ shipments: rows, count: rows.length })
}

export async function POST(request: Request) {
  const g = await requireWrite('tracking')
  if (!g.ok) return g.res

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
