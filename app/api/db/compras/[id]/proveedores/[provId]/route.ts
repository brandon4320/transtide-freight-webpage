import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { r2Delete } from '@/lib/r2'
import { requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; provId: string }> }) {
  const g = await requireWrite('comparador')
  if (!g.ok) return g.res

  const { id, provId } = await params
  const body = await request.json()

  const elegido = body.elegido === true ? 1 : 0

  if (body.elegido === true) {
    // Solo uno elegido: limpiar el resto de proveedores de esta compra.
    await d1Exec(`UPDATE compras_proveedores SET elegido = 0 WHERE compra_id = ?`, [id])
    await d1Exec(
      `UPDATE compras SET proveedor_elegido_id = ?, updated_at = datetime('now') WHERE id = ?`,
      [provId, id]
    )
  }

  await d1Exec(
    `UPDATE compras_proveedores
     SET nombre = ?, contacto = ?, producto = ?, moneda = ?, precio_unitario = ?, cantidad = ?, moq = ?,
         precio_total = ?, lead_time = ?, incoterm = ?, puerto = ?, m3 = ?, peso_kg = ?, validez = ?,
         notas = ?, elegido = ?
     WHERE id = ?`,
    [
      body.nombre ?? '',
      body.contacto ?? '',
      body.producto ?? '',
      body.moneda ?? '',
      body.precio_unitario ?? '',
      body.cantidad ?? '',
      body.moq ?? '',
      body.precio_total ?? '',
      body.lead_time ?? '',
      body.incoterm ?? '',
      body.puerto ?? '',
      body.m3 ?? '',
      body.peso_kg ?? '',
      body.validez ?? '',
      body.notas ?? '',
      elegido,
      provId,
    ]
  )

  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; provId: string }> }) {
  const g = await requireWrite('comparador')
  if (!g.ok) return g.res

  const { provId } = await params

  const docs = await d1Query<any>(`SELECT r2_key FROM compras_docs WHERE proveedor_id = ?`, [provId])
  for (const d of docs) {
    try {
      await r2Delete(d.r2_key)
    } catch {}
  }
  await d1Exec(`DELETE FROM compras_docs WHERE proveedor_id = ?`, [provId])
  await d1Exec(`DELETE FROM compras_proveedores WHERE id = ?`, [provId])

  return NextResponse.json({ ok: true })
}
