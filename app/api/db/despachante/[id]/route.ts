import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FIELDS = [
  'bl', 'descripcion', 'estado', 'hon_regulares', 'adu_extras', 'otros_gastos', 'total_honorarios',
  'fecha_pago', 'pago_transferencia', 'pago_cash', 'total_pagado', 'comision', 'facturado', 'factura_nro', 'saldo', 'notas',
]

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('despachante')
  if (!g.ok) return g.res
  const { id } = await params
  const body = await request.json()

  const existing = await d1Query<any>(`SELECT id FROM despachante_pagos WHERE id = ?`, [id])
  if (existing.length === 0) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const vals = FIELDS.map(f => f === 'facturado' ? (body[f] ? 1 : 0) : (body[f] ?? ''))
  await d1Exec(
    `UPDATE despachante_pagos SET ${FIELDS.map(f => `${f} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
    [...vals, id]
  )
  return NextResponse.json({ ok: true, id })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('despachante')
  if (!g.ok) return g.res
  const { id } = await params
  await d1Exec(`DELETE FROM despachante_pagos WHERE id = ?`, [id])
  return NextResponse.json({ ok: true })
}
