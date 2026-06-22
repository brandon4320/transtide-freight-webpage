import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { getSessionInfo, canEdit } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canEdit(s)) return NextResponse.json({ error: 'Tu usuario es de solo lectura' }, { status: 403 })

  const { id } = await params
  const body = await request.json()

  const provId = 'cp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)

  const countRows = await d1Query<any>(
    `SELECT COUNT(*) AS c FROM compras_proveedores WHERE compra_id = ?`,
    [id]
  )
  const position = Number(countRows[0]?.c ?? 0)

  const elegido = body.elegido ? 1 : 0

  const row = {
    id: provId,
    compra_id: id,
    position,
    nombre: body.nombre ?? '',
    contacto: body.contacto ?? '',
    producto: body.producto ?? '',
    moneda: body.moneda ?? '',
    precio_unitario: body.precio_unitario ?? '',
    cantidad: body.cantidad ?? '',
    moq: body.moq ?? '',
    precio_total: body.precio_total ?? '',
    lead_time: body.lead_time ?? '',
    incoterm: body.incoterm ?? '',
    puerto: body.puerto ?? '',
    m3: body.m3 ?? '',
    peso_kg: body.peso_kg ?? '',
    validez: body.validez ?? '',
    notas: body.notas ?? '',
    elegido,
  }

  await d1Exec(
    `INSERT INTO compras_proveedores
     (id, compra_id, position, nombre, contacto, producto, moneda, precio_unitario, cantidad, moq, precio_total, lead_time, incoterm, puerto, m3, peso_kg, validez, notas, elegido, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      row.id,
      row.compra_id,
      row.position,
      row.nombre,
      row.contacto,
      row.producto,
      row.moneda,
      row.precio_unitario,
      row.cantidad,
      row.moq,
      row.precio_total,
      row.lead_time,
      row.incoterm,
      row.puerto,
      row.m3,
      row.peso_kg,
      row.validez,
      row.notas,
      row.elegido,
    ]
  )

  return NextResponse.json({ ...row, elegido: !!row.elegido })
}
