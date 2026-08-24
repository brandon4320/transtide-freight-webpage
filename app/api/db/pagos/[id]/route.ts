import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Borrar un pago mal cargado del ledger. El permiso es el de la sección donde
// impacta el pago (igual criterio que el POST de /api/db/pagos).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rows = await d1Query<any>(`SELECT scope FROM pagos_registro WHERE id = ?`, [id])
  if (rows.length === 0) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const g = await requireWrite(rows[0].scope === 'despachante' ? 'despachante' : 'tracking')
  if (!g.ok) return g.res
  await d1Exec(`DELETE FROM pagos_registro WHERE id = ?`, [id])
  return NextResponse.json({ ok: true })
}
