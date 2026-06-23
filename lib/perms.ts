import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export type SessionInfo = {
  id: string
  name: string
  username: string
  role: string
  sections: string[]
}

export async function getSessionInfo(): Promise<SessionInfo | null> {
  const session = await auth()
  if (!session?.user) return null
  const u = session.user as any
  if (u.disabled === true) return null // usuario desactivado/eliminado: sin acceso
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role || 'editor',
    sections: String(u.sections || '').split(',').map((s: string) => s.trim()).filter(Boolean),
  }
}

export function isAdmin(s: SessionInfo | null) {
  return s?.role === 'admin'
}

/** Editor o admin pueden escribir. Viewer no. */
export function canEdit(s: SessionInfo | null) {
  return s?.role === 'admin' || s?.role === 'editor'
}

export function hasSection(s: SessionInfo | null, section: string) {
  return s?.role === 'admin' || (s?.sections || []).includes(section)
}

type Guard = { ok: true; s: SessionInfo } | { ok: false; res: NextResponse }

/**
 * Guard de escritura para route handlers: exige sesión + rol que pueda editar +
 * pertenecer a (al menos) una de las secciones dadas. Admin pasa siempre.
 * Uso: `const g = await requireWrite('operaciones'); if (!g.ok) return g.res`
 */
export async function requireWrite(sections: string | string[]): Promise<Guard> {
  const list = Array.isArray(sections) ? sections : [sections]
  const s = await getSessionInfo()
  if (!s) return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!canEdit(s)) return { ok: false, res: NextResponse.json({ error: 'Tu usuario es de solo lectura' }, { status: 403 }) }
  if (s.role !== 'admin' && !list.some(sec => s.sections.includes(sec)))
    return { ok: false, res: NextResponse.json({ error: 'No tenés acceso a esta sección' }, { status: 403 }) }
  return { ok: true, s }
}

/** Guard de solo-admin (gestión de usuarios). */
export async function requireAdmin(): Promise<Guard> {
  const s = await getSessionInfo()
  if (!s) return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (s.role !== 'admin') return { ok: false, res: NextResponse.json({ error: 'Requiere rol administrador' }, { status: 403 }) }
  return { ok: true, s }
}
