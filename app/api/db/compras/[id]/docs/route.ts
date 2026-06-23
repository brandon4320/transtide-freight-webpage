import { NextResponse } from 'next/server'
import { d1Exec } from '@/lib/d1'
import { r2Put, r2SignedGetUrl, r2Configured } from '@/lib/r2'
import { requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp']

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('comparador')
  if (!g.ok) return g.res
  const s = g.s

  const { id } = await params

  const form = await request.formData()
  const file = form.get('file') as File | null
  const tipo = String(form.get('tipo') || '')
  const proveedorId = form.get('proveedor_id') ? String(form.get('proveedor_id')) : null

  if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'El archivo supera los 10MB' }, { status: 400 })
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json({ error: 'Tipo de archivo no permitido' }, { status: 400 })
  }
  if (!r2Configured()) {
    return NextResponse.json({ error: 'Almacenamiento no configurado' }, { status: 500 })
  }

  const docId = 'doc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
  const safeName = file.name.replace(/[^\w.\-]/g, '_')
  const key = `compras/${id}/${docId}-${safeName}`
  const bytes = Buffer.from(await file.arrayBuffer())

  await r2Put(key, bytes, file.type || 'application/octet-stream')

  await d1Exec(
    `INSERT INTO compras_docs (id, compra_id, proveedor_id, tipo, filename, r2_key, size, mime, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [docId, id, proveedorId, tipo, file.name, key, file.size, file.type, s.name || s.username]
  )

  return NextResponse.json({
    id: docId,
    tipo,
    filename: file.name,
    size: file.size,
    mime: file.type,
    proveedor_id: proveedorId,
    url: await r2SignedGetUrl(key, file.name),
  })
}
