import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { getSessionInfo, requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FIELDS = ['tipo', 'nombre', 'contacto', 'email', 'telefono', 'web', 'observaciones']

export async function GET() {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await d1Query(
    `SELECT id, ${FIELDS.join(', ')}, created_by, updated_at FROM contactos
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
  const id = 'cont-' + Date.now()
  await d1Exec(
    `INSERT INTO contactos (id, tipo, nombre, contacto, email, telefono, web, observaciones, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [id, body.tipo || 'naviera', body.nombre.trim(), body.contacto || '', body.email || '', body.telefono || '', body.web || '', body.observaciones || '', g.s.name || g.s.username || '']
  )
  return NextResponse.json({ id, ...body })
}
