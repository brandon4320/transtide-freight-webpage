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
