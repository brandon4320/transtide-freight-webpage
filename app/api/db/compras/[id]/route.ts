import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { r2Delete, r2SignedGetUrl } from '@/lib/r2'
import { getSessionInfo, canEdit } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const rows = await d1Query<any>(`SELECT * FROM compras WHERE id = ?`, [id])
  if (rows.length === 0) return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 })
  const compra = rows[0]

  const proveedores = await d1Query<any>(
    `SELECT * FROM compras_proveedores WHERE compra_id = ? ORDER BY position ASC`,
    [id]
  )
  for (const p of proveedores) {
    p.elegido = !!p.elegido
  }

  const docs = await d1Query<any>(`SELECT * FROM compras_docs WHERE compra_id = ?`, [id])
  for (const d of docs) {
    try {
      d.url = await r2SignedGetUrl(d.r2_key, d.filename)
    } catch {
      d.url = null
    }
  }

  return NextResponse.json({ ...compra, proveedores, docs })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canEdit(s)) return NextResponse.json({ error: 'Tu usuario es de solo lectura' }, { status: 403 })

  const { id } = await params
  const body = await request.json()

  await d1Exec(
    `UPDATE compras
     SET nombre = ?, descripcion = ?, estado = ?, notas = ?, proveedor_elegido_id = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [
      body.nombre ?? null,
      body.descripcion ?? null,
      body.estado ?? null,
      body.notas ?? null,
      body.proveedor_elegido_id ?? null,
      id,
    ]
  )
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canEdit(s)) return NextResponse.json({ error: 'Tu usuario es de solo lectura' }, { status: 403 })

  const { id } = await params

  const docs = await d1Query<any>(`SELECT r2_key FROM compras_docs WHERE compra_id = ?`, [id])
  for (const d of docs) {
    try {
      await r2Delete(d.r2_key)
    } catch {}
  }

  await d1Exec(`DELETE FROM compras WHERE id = ?`, [id])
  return NextResponse.json({ ok: true })
}
