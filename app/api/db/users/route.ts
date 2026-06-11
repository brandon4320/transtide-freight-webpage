import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { d1Query, d1Exec } from '@/lib/d1'
import { getSessionInfo, isAdmin } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_SECTIONS = ['operaciones', 'tracking', 'clientes', 'cotizador']
const VALID_ROLES = ['admin', 'editor', 'viewer']

function cleanSections(input: any): string {
  if (Array.isArray(input)) return input.filter(s => VALID_SECTIONS.includes(s)).join(',')
  if (typeof input === 'string') return input.split(',').map(s => s.trim()).filter(s => VALID_SECTIONS.includes(s)).join(',')
  return ''
}

export async function GET() {
  const s = await getSessionInfo()
  if (!isAdmin(s)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const rows = await d1Query(
    `SELECT id, name, username, role, sections, active, created_at FROM users ORDER BY CAST(id AS INTEGER) ASC`
  )
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  const s = await getSessionInfo()
  if (!isAdmin(s)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const name = String(body.name || '').trim()
  const username = String(body.username || '').trim().toLowerCase()
  const password = String(body.password || '')
  const role = VALID_ROLES.includes(body.role) ? body.role : 'editor'
  const sections = role === 'admin' ? VALID_SECTIONS.join(',') : cleanSections(body.sections)

  if (!name || !username || !password) {
    return NextResponse.json({ error: 'Faltan datos (nombre, usuario o contraseña)' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
  }

  const exists = await d1Query(`SELECT id FROM users WHERE lower(username) = ?`, [username])
  if (exists.length > 0) {
    return NextResponse.json({ error: `El usuario "${username}" ya existe` }, { status: 409 })
  }

  const id = 'u-' + Date.now()
  const hash = await bcrypt.hash(password, 12)
  await d1Exec(
    `INSERT INTO users (id, name, username, password_hash, role, sections, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
    [id, name, username, hash, role, sections]
  )
  return NextResponse.json({ id, name, username, role, sections, active: 1 })
}
