import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { getSessionInfo, requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FIELDS = [
  'bl', 'descripcion', 'estado', 'hon_regulares', 'adu_extras', 'otros_gastos', 'total_honorarios',
  'fecha_pago', 'pago_transferencia', 'pago_cash', 'total_pagado', 'comision', 'facturado', 'factura_nro', 'saldo', 'notas',
]

export async function GET() {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await d1Query(
    `SELECT id, ${FIELDS.join(', ')}, updated_at FROM despachante_pagos ORDER BY id DESC`
  )
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  const g = await requireWrite('despachante')
  if (!g.ok) return g.res

  const body = await request.json()
  if (!String(body.descripcion || '').trim()) {
    return NextResponse.json({ error: 'La descripción es obligatoria' }, { status: 400 })
  }
  const vals = FIELDS.map(f => f === 'facturado' ? (body[f] ? 1 : 0) : (body[f] ?? ''))
  const res = await d1Exec(
    `INSERT INTO despachante_pagos (${FIELDS.join(', ')}, created_at, updated_at)
     VALUES (${FIELDS.map(() => '?').join(', ')}, datetime('now'), datetime('now'))`,
    vals
  )
  const created = await d1Query(`SELECT id, ${FIELDS.join(', ')}, updated_at FROM despachante_pagos WHERE id = ?`, [res.lastRowId])
  return NextResponse.json(created[0] || { ok: true })
}
