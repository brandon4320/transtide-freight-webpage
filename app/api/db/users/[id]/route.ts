import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { d1Query, d1Exec } from '@/lib/d1'
import { getSessionInfo, isAdmin } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_SECTIONS = ['operaciones', 'tracking', 'clientes', 'cotizador', 'comparador', 'contactos']
const VALID_ROLES = ['admin', 'editor', 'viewer']

function cleanSections(input: any): string {
  if (Array.isArray(input)) return input.filter(s => VALID_SECTIONS.includes(s)).join(',')
  if (typeof input === 'string') return input.split(',').map(s => s.trim()).filter(s => VALID_SECTIONS.includes(s)).join(',')
  return ''
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionInfo()
  if (!isAdmin(s)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await request.json()

  const existing = await d1Query<any>(`SELECT id, role FROM users WHERE id = ?`, [id])
  if (existing.length === 0) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  const name = String(body.name || '').trim()
  const role = VALID_ROLES.includes(body.role) ? body.role : 'editor'
  const sections = role === 'admin' ? VALID_SECTIONS.join(',') : cleanSections(body.sections)
  const active = body.active === false || body.active === 0 ? 0 : 1

  // Evitar que el último admin se quede sin admins o se autodesactive
  if ((existing[0].role === 'admin') && (role !== 'admin' || active === 0)) {
    const admins = await d1Query<any>(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1`)
    if ((admins[0]?.c ?? 0) <= 1) {
      return NextResponse.json({ error: 'No podés dejar el sistema sin administradores activos.' }, { status: 400 })
    }
  }

  // Cambio de contraseña opcional
  if (body.password && String(body.password).length > 0) {
    if (String(body.password).length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
    }
    const hash = await bcrypt.hash(String(body.password), 12)
    await d1Exec(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, id])
  }

  await d1Exec(
    `UPDATE users SET name = ?, role = ?, sections = ?, active = ?, updated_at = datetime('now') WHERE id = ?`,
    [name, role, sections, active, id]
  )
  return NextResponse.json({ ok: true, id, name, role, sections, active })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionInfo()
  if (!isAdmin(s)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  if (s!.id === id) {
    return NextResponse.json({ error: 'No podés eliminarte a vos mismo.' }, { status: 400 })
  }
  const target = await d1Query<any>(`SELECT role FROM users WHERE id = ?`, [id])
  if (target.length && target[0].role === 'admin') {
    const admins = await d1Query<any>(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1`)
    if ((admins[0]?.c ?? 0) <= 1) {
      return NextResponse.json({ error: 'No podés eliminar al único administrador.' }, { status: 400 })
    }
  }
  await d1Exec(`DELETE FROM users WHERE id = ?`, [id])
  return NextResponse.json({ ok: true })
}
