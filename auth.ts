import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { authConfig } from './auth.config'

type StoredUser = {
  id: string
  name: string
  username: string
  passwordHash: string
  role?: string
  sections?: string
  active?: number
}

// Lee usuarios desde Cloudflare D1 (fuente de verdad).
// Devuelve null si la DB NO respondió (error/credenciales): el caller debe fallar
// cerrado, NO caer al fallback de env (que no respeta active=0 ni rotaciones).
// Devuelve [] solo si la query fue exitosa pero no hay usuarios (bootstrap inicial).
async function loadUsersFromDB(): Promise<StoredUser[] | null> {
  const acc = process.env.CF_ACCOUNT_ID
  const db = process.env.CF_D1_DATABASE_ID
  const token = process.env.CF_D1_API_TOKEN
  if (!acc || !db || !token) return null
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${acc}/d1/database/${db}/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: 'SELECT id, name, username, password_hash, role, sections, active FROM users' }),
        cache: 'no-store',
      }
    )
    if (!res.ok) return null
    const json = await res.json()
    if (!json?.success) return null
    const rows = json?.result?.[0]?.results || []
    return rows.map((r: any) => ({
      id: String(r.id),
      name: r.name,
      username: r.username,
      passwordHash: r.password_hash,
      role: r.role || 'editor',
      sections: r.sections || '',
      active: r.active,
    }))
  } catch (e) {
    console.error('[auth] DB load failed:', e)
    return null
  }
}

// Fallback: usuarios desde env var (si la DB no responde / está vacía).
function loadUsersFromEnv(): StoredUser[] {
  try {
    const raw = process.env.AUTH_USERS
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Usuario', type: 'text' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        const username = String(credentials?.username || '').trim().toLowerCase()
        const password = String(credentials?.password || '')
        if (!username || !password) return null

        const dbUsers = await loadUsersFromDB()
        // DB caída (null) → fallar cerrado: NO usar el fallback de env. Solo se usa el
        // fallback cuando la DB respondió OK pero está vacía (bootstrap inicial).
        const users: StoredUser[] = dbUsers === null ? [] : (dbUsers.length === 0 ? loadUsersFromEnv() : dbUsers)

        const user = users.find(u => u.username.toLowerCase() === username)

        // mitigación timing-attack
        const dummyHash = '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid'
        const hash = user?.passwordHash || dummyHash
        const ok = await bcrypt.compare(password, hash)

        if (!user || !ok) return null
        if (user.active === 0) return null // usuario desactivado

        return {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role || 'editor',
          sections: user.sections || '',
        } as any
      },
    }),
  ],
})
