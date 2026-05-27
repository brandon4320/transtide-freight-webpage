import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { authConfig } from './auth.config'

type StoredUser = {
  id: string
  name: string
  username: string
  passwordHash: string
}

function loadUsers(): StoredUser[] {
  try {
    const raw = process.env.AUTH_USERS
    if (!raw) {
      console.error('[auth] AUTH_USERS env var is not set')
      return []
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      console.error('[auth] AUTH_USERS is not a JSON array')
      return []
    }
    return parsed
  } catch (e) {
    console.error('[auth] Failed to parse AUTH_USERS:', e)
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

        const users = loadUsers()
        const user = users.find(u => u.username.toLowerCase() === username)

        // Always run bcrypt.compare even if user not found, to mitigate timing attacks
        const dummyHash = '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid'
        const hash = user?.passwordHash || dummyHash
        const ok = await bcrypt.compare(password, hash)

        if (!user || !ok) return null

        return {
          id: user.id,
          name: user.name,
          username: user.username,
        } as any
      },
    }),
  ],
})
