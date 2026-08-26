import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { getSessionInfo, requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FIELDS = ['tipo', 'nombre', 'contacto', 'email', 'telefono', 'web', 'observaciones']

// Cada contacto es una EMPRESA (naviera, terminal, despachante, agente) y sus personas
// viven en una columna JSON: [{ nombre, puesto, email, telefono }]. El proyecto no tiene
// migraciones versionadas, así que la columna se garantiza on-the-fly; si el ALTER
// fallara se guarda sin personas en vez de romper el alta.
let colOK: boolean | null = null
async function ensurePersonas(): Promise<boolean> {
  if (colOK !== null) return colOK
  try {
    const info = await d1Query<{ name: string }>(`PRAGMA table_info(contactos)`)
    if (!info.some(c => c.name === 'personas')) {
      await d1Exec(`ALTER TABLE contactos ADD COLUMN personas TEXT DEFAULT NULL`)
    }
    colOK = true
  } catch {
    colOK = false
    console.warn('[contactos] no se pudo agregar la columna personas')
  }
  return colOK
}

// Normaliza la lista de personas: descarta filas vacías y recorta a lo que se guarda.
export function limpiarPersonas(v: any): string | null {
  if (!Array.isArray(v)) return null
  const out = v
    .map((p: any) => ({
      nombre: String(p?.nombre || '').trim(),
      puesto: String(p?.puesto || '').trim(),
      email: String(p?.email || '').trim(),
      telefono: String(p?.telefono || '').trim(),
    }))
    .filter(p => p.nombre || p.email || p.telefono)
  return out.length ? JSON.stringify(out) : null
}

export async function GET() {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const conPersonas = await ensurePersonas()
  const rows = await d1Query(
    `SELECT id, ${FIELDS.join(', ')}${conPersonas ? ', personas' : ''}, created_by, updated_at FROM contactos
     ORDER BY tipo ASC, nombre COLLATE NOCASE ASC`
  )
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  const g = await requireWrite('contactos')
  if (!g.ok) return g.res

  const body = await request.json()
  if (!String(body.nombre || '').trim()) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  }
  const conPersonas = await ensurePersonas()
  const id = 'cont-' + Date.now()
  const base = [id, body.tipo || 'naviera', body.nombre.trim(), body.contacto || '', body.email || '', body.telefono || '', body.web || '', body.observaciones || '']
  await d1Exec(
    `INSERT INTO contactos (id, tipo, nombre, contacto, email, telefono, web, observaciones${conPersonas ? ', personas' : ''}, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?${conPersonas ? ', ?' : ''}, ?, datetime('now'), datetime('now'))`,
    conPersonas
      ? [...base, limpiarPersonas(body.personas), g.s.name || g.s.username || '']
      : [...base, g.s.name || g.s.username || '']
  )
  return NextResponse.json({ id, ...body })
}
