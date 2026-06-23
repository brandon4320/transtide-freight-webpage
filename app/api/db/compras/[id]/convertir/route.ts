import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('comparador')
  if (!g.ok) return g.res

  const { id } = await params
  const rows = await d1Query<any>(`SELECT * FROM compras WHERE id = ?`, [id])
  if (rows.length === 0) return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 })
  const compra = rows[0]

  // Resolver el proveedor elegido.
  let prov: any = null
  if (compra.proveedor_elegido_id) {
    const pr = await d1Query<any>(`SELECT * FROM compras_proveedores WHERE id = ?`, [compra.proveedor_elegido_id])
    if (pr.length) prov = pr[0]
  }
  if (!prov) {
    const pr = await d1Query<any>(`SELECT * FROM compras_proveedores WHERE compra_id = ? AND elegido = 1 LIMIT 1`, [id])
    if (pr.length) prov = pr[0]
  }
  if (!prov) {
    return NextResponse.json({ error: 'Elegí un proveedor antes de convertir' }, { status: 400 })
  }

  // Si ya fue convertida y la operación existe, devolverla.
  if (compra.operation_id) {
    const ex = await d1Query<any>(`SELECT id FROM operations WHERE id = ?`, [compra.operation_id])
    if (ex.length) return NextResponse.json({ operationId: compra.operation_id, alreadyConverted: true })
  }

  const opId = 'op-' + Date.now()
  const nombre = compra.nombre || ''
  const m3 = prov.m3 || ''
  const fob = prov.precio_total || prov.precio_unitario || ''

  // 1) Crear la operación (vinculada a la compra de origen para mantener la trazabilidad).
  await d1Exec(
    `INSERT INTO operations (id, nombre, contenedor, bl, eta, m3, estado, fecha, puerto_origen, compra_id, created_at, updated_at)
     VALUES (?, ?, '40HQ', '', '', ?, 'Consolidando', ?, '', ?, datetime('now'), datetime('now'))`,
    [opId, nombre, m3, new Date().toLocaleDateString('es-AR'), id]
  )

  // 2) Crear el proveedor_op inicial.
  await d1Exec(
    `INSERT INTO proveedores_op
     (operation_id, position, nombre, tipo, cliente_id, m3, fob_usd, gastos_origen_usd, tributos_usd, tributos_tc, cobrar_tc, honorarios, desp_adic, cobrado, fecha_cobro, created_at)
     VALUES (?, 0, ?, 'Cliente', NULL, ?, ?, '', '', '', '', 0, '', 0, '', datetime('now'))`,
    [opId, prov.nombre || compra.nombre, m3, fob]
  )

  // 3) Vincular la compra a la operación + cerrar.
  await d1Exec(
    `UPDATE compras SET operation_id = ?, estado = 'cerrado', updated_at = datetime('now') WHERE id = ?`,
    [opId, id]
  )

  return NextResponse.json({ operationId: opId, nombre: compra.nombre })
}
