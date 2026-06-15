import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { d1Query, d1Exec } from '@/lib/d1'
import { getSessionInfo, canEdit } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mapea el contType del cotizador → label de contenedor de operaciones
const CONT_LABEL: Record<string, string> = { '20': '20 Pies', '40hq': '40HQ', 'fr': 'Flat Rack' }

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canEdit(session)) return NextResponse.json({ error: 'Tu usuario es de solo lectura' }, { status: 403 })

  const { id } = await params
  const rows = await d1Query<any>(`SELECT * FROM cotizaciones WHERE id = ?`, [id])
  if (rows.length === 0) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
  const q = rows[0]

  // Si ya fue convertida, devolver la operación existente
  if (q.operation_id) {
    const ex = await d1Query<any>(`SELECT id FROM operations WHERE id = ?`, [q.operation_id])
    if (ex.length) return NextResponse.json({ operationId: q.operation_id, alreadyConverted: true })
  }

  let data: any = {}
  try { data = JSON.parse(q.data || '{}') } catch {}

  const modo = q.modo || 'maritimo'
  const cliente = (data.cliente || q.cliente || q.nombre || 'Cliente').toString()
  const contenedor = modo === 'aereo' ? 'Aéreo' : (CONT_LABEL[data.contType] || '40HQ')
  const m3 = modo === 'aereo' ? (data.m3Input || '') : (data.m3Merch || '')
  const fob = (data.fobReal || data.fobCliente || '').toString()
  const tc = (data.fleteRealInput && modo !== 'aereo') ? '' : '' // TC real lo carga el usuario

  const opId = 'op-' + Date.now()
  const nombre = (q.nombre || cliente).toString()

  // 1) Crear la operación
  await d1Exec(
    `INSERT INTO operations (id, nombre, contenedor, bl, eta, m3, estado, fecha, puerto_origen, created_at, updated_at)
     VALUES (?, ?, ?, '', '', ?, 'Consolidando', ?, '', datetime('now'), datetime('now'))`,
    [opId, nombre, contenedor, m3, new Date().toLocaleDateString('es-AR')]
  )

  // 2) Buscar si el cliente existe en la tabla clientes (para vincular)
  let clienteId: string | null = null
  if (cliente) {
    const cl = await d1Query<any>(`SELECT id FROM clientes WHERE lower(nombre) = ? LIMIT 1`, [cliente.toLowerCase()])
    if (cl.length) clienteId = cl[0].id
  }

  // 3) Crear el proveedor inicial (el cliente de la cotización) con FOB y m³
  await d1Exec(
    `INSERT INTO proveedores_op (operation_id, position, nombre, tipo, cliente_id, m3, fob_usd, gastos_origen_usd, tributos_usd, tributos_tc, cobrar_tc, honorarios, desp_adic, cobrado, fecha_cobro, created_at)
     VALUES (?, 0, ?, 'Cliente', ?, ?, ?, '', '', '', '', 0, '', 0, '', datetime('now'))`,
    [opId, cliente, clienteId, m3, fob]
  )

  // 4) Vincular la cotización a la operación + marcar aprobada
  await d1Exec(
    `UPDATE cotizaciones SET operation_id = ?, estado = 'aprobada', updated_at = datetime('now') WHERE id = ?`,
    [opId, id]
  )

  return NextResponse.json({ operationId: opId, nombre, contenedor })
}
