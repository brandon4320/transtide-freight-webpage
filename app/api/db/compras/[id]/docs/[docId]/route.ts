import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { r2Delete, r2SignedGetUrl } from '@/lib/r2'
import { getSessionInfo, canEdit } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { docId } = await params
  const rows = await d1Query<any>(`SELECT * FROM compras_docs WHERE id = ?`, [docId])
  if (rows.length === 0) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  const doc = rows[0]

  const url = await r2SignedGetUrl(doc.r2_key, doc.filename)
  return NextResponse.redirect(url)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canEdit(s)) return NextResponse.json({ error: 'Tu usuario es de solo lectura' }, { status: 403 })

  const { docId } = await params
  const rows = await d1Query<any>(`SELECT * FROM compras_docs WHERE id = ?`, [docId])
  if (rows.length === 0) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  const doc = rows[0]

  try {
    await r2Delete(doc.r2_key)
  } catch {}

  await d1Exec(`DELETE FROM compras_docs WHERE id = ?`, [docId])
  return NextResponse.json({ ok: true })
}
