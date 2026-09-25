// Cartas de garantía presentadas ante una naviera (o cualquier contacto).
//
// Una carta la firma una SOCIEDAD (Successi Ing S.A. o la del cliente) y se
// presenta ante una naviera. Puede ser anual (vence) o por una operación puntual
// (se anota el B/L). El PDF va a R2, igual que los documentos del comparador.
//
// GET  /api/db/cartas                 todas las vivas
// GET  /api/db/cartas?contacto_id=x   las de esa naviera
// POST /api/db/cartas                 multipart: campos + archivo opcional
import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { r2Put, r2Configured } from '@/lib/r2'
import { getSessionInfo, requireWrite } from '@/lib/perms'
import { auditar } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp']

// El proyecto no tiene migraciones: la tabla se crea en el primer request y se
// cachea el intento para no repetir el CREATE en cada llamada.
let tablaLista: Promise<boolean> | null = null
export function ensureCartas(): Promise<boolean> {
  if (!tablaLista) {
    tablaLista = (async () => {
      try {
        await d1Exec(
          `CREATE TABLE IF NOT EXISTS cartas_garantia (
            id TEXT PRIMARY KEY,
            contacto_id TEXT NOT NULL,
            sociedad TEXT DEFAULT '',
            sociedad_cuit TEXT DEFAULT '',
            fecha TEXT DEFAULT '',
            vence TEXT DEFAULT '',
            bl TEXT DEFAULT '',
            notas TEXT DEFAULT '',
            archivo_nombre TEXT DEFAULT '',
            archivo_key TEXT DEFAULT '',
            archivo_mime TEXT DEFAULT '',
            archivo_size INTEGER DEFAULT 0,
            created_by TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            deleted_at TEXT DEFAULT NULL,
            deleted_by TEXT DEFAULT NULL
          )`
        )
        await d1Exec(`CREATE INDEX IF NOT EXISTS idx_cartas_contacto ON cartas_garantia (contacto_id)`).catch(() => {})
        return true
      } catch (e) {
        tablaLista = null // que lo reintente el próximo request
        console.warn('[cartas] no se pudo crear cartas_garantia:', (e as Error)?.message)
        return false
      }
    })()
  }
  return tablaLista
}

const limpio = (v: FormDataEntryValue | null) => String(v ?? '').trim()

export async function GET(request: Request) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await ensureCartas())) return NextResponse.json([])

  const contactoId = new URL(request.url).searchParams.get('contacto_id')
  const where = ['deleted_at IS NULL']
  const params: any[] = []
  if (contactoId) { where.push('contacto_id = ?'); params.push(contactoId) }
  const rows = await d1Query<any>(
    `SELECT id, contacto_id, sociedad, sociedad_cuit, fecha, vence, bl, notas,
            archivo_nombre, archivo_mime, archivo_size, created_by, created_at, updated_at
     FROM cartas_garantia WHERE ${where.join(' AND ')}
     ORDER BY COALESCE(NULLIF(fecha, ''), created_at) DESC`,
    params
  )
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  const g = await requireWrite('contactos')
  if (!g.ok) return g.res
  if (!(await ensureCartas())) {
    return NextResponse.json({ error: 'No se pudo preparar la tabla de cartas de garantía.' }, { status: 500 })
  }

  const form = await request.formData()
  const contactoId = limpio(form.get('contacto_id'))
  if (!contactoId) return NextResponse.json({ error: 'Falta la naviera.' }, { status: 400 })

  const archivo = form.get('archivo')
  const file = archivo && typeof archivo === 'object' && 'size' in archivo ? (archivo as File) : null
  let key = '', nombre = '', mime = '', size = 0

  if (file && file.size > 0) {
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'El archivo supera los 10 MB.' }, { status: 400 })
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json({ error: 'Solo se aceptan PDF o imágenes.' }, { status: 400 })
    }
    if (!r2Configured()) return NextResponse.json({ error: 'El almacenamiento de archivos no está configurado.' }, { status: 500 })
    const seguro = file.name.replace(/[^\w.\-]/g, '_')
    key = `cartas/${contactoId}/${Date.now()}-${seguro}`
    await r2Put(key, Buffer.from(await file.arrayBuffer()), file.type || 'application/octet-stream')
    nombre = file.name
    mime = file.type
    size = file.size
  }

  const id = 'carta-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
  const autor = g.s.name || g.s.username || ''
  await d1Exec(
    `INSERT INTO cartas_garantia
       (id, contacto_id, sociedad, sociedad_cuit, fecha, vence, bl, notas,
        archivo_nombre, archivo_key, archivo_mime, archivo_size, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [id, contactoId, limpio(form.get('sociedad')), limpio(form.get('sociedad_cuit')), limpio(form.get('fecha')),
     limpio(form.get('vence')), limpio(form.get('bl')), limpio(form.get('notas')),
     nombre, key, mime, size, autor]
  )
  await auditar({ entidad: 'cartas_garantia', id, accion: 'crear', despues: { contactoId, sociedad: limpio(form.get('sociedad')) }, usuario: autor })

  return NextResponse.json({ ok: true, id })
}
