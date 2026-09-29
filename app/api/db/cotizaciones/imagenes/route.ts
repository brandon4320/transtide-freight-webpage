// Imágenes del producto que se suman a una cotización.
//
// Se guardan en R2 (como los documentos del comparador y las cartas de garantía)
// y la cotización solo guarda la clave. El navegador las achica antes de subir.
//
// POST /api/db/cotizaciones/imagenes            multipart { archivo } → { key }
// GET  /api/db/cotizaciones/imagenes?key=...    redirige a la imagen con firma corta
import { NextResponse } from 'next/server'
import { r2Put, r2SignedGetUrl, r2Configured } from '@/lib/r2'
import { getSessionInfo, requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PREFIJO = 'cotizaciones/imagenes/'
const MAX_SIZE = 8 * 1024 * 1024 // 8 MB (el navegador ya las achica antes)
const TIPOS = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(request: Request) {
  const g = await requireWrite('cotizador')
  if (!g.ok) return g.res
  if (!r2Configured()) return NextResponse.json({ error: 'El almacenamiento de archivos no está configurado.' }, { status: 500 })

  const form = await request.formData()
  const archivo = form.get('archivo')
  const file = archivo && typeof archivo === 'object' && 'size' in archivo ? (archivo as File) : null
  if (!file || file.size === 0) return NextResponse.json({ error: 'Falta la imagen.' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'La imagen supera los 8 MB.' }, { status: 400 })
  if (!TIPOS.includes(file.type)) return NextResponse.json({ error: 'Solo se aceptan imágenes JPG, PNG o WEBP.' }, { status: 400 })

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const key = `${PREFIJO}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  await r2Put(key, Buffer.from(await file.arrayBuffer()), file.type)
  return NextResponse.json({ ok: true, key })
}

export async function GET(request: Request) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const key = new URL(request.url).searchParams.get('key') || ''
  // Solo claves de imágenes de cotización: evita leer cualquier otro archivo del bucket.
  if (!key.startsWith(PREFIJO) || key.includes('..')) return NextResponse.json({ error: 'Imagen inválida.' }, { status: 400 })
  return NextResponse.redirect(await r2SignedGetUrl(key, undefined, 300))
}
