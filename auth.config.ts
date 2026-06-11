import type { NextAuthConfig } from 'next-auth'

/**
 * Edge-compatible auth config (used by middleware).
 * No providers/adapters here — those go in auth.ts.
 */

// Mapa de ruta → sección requerida
const SECTION_BY_PATH: Record<string, string> = {
  '/gestion/operaciones': 'operaciones',
  '/gestion/tracking': 'tracking',
  '/gestion/clientes': 'clientes',
  '/gestion/cotizador': 'cotizador',
}

function sectionForPath(pathname: string): string | null {
  for (const prefix in SECTION_BY_PATH) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return SECTION_BY_PATH[prefix]
  }
  return null
}

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const path = nextUrl.pathname
      const isOnGestion = path.startsWith('/gestion')
      const isOnLogin = path === '/login'

      if (isOnLogin && isLoggedIn) {
        return Response.redirect(new URL('/gestion', nextUrl))
      }
      if (!isOnGestion) return true
      if (!isLoggedIn) return false // → redirige a /login

      const role = (auth!.user as any)?.role || 'editor'
      const sections: string = (auth!.user as any)?.sections || ''
      const allowed = sections.split(',').map(s => s.trim()).filter(Boolean)

      // Panel de usuarios: solo admin
      if (path.startsWith('/gestion/usuarios')) {
        if (role === 'admin') return true
        return Response.redirect(new URL('/gestion', nextUrl))
      }

      // /gestion raíz → redirige a la primera sección permitida
      if (path === '/gestion' || path === '/gestion/') {
        const first = role === 'admin' ? 'operaciones' : (allowed[0] || null)
        if (first) return Response.redirect(new URL(`/gestion/${first}`, nextUrl))
        return Response.redirect(new URL('/gestion/sin-acceso', nextUrl))
      }

      // Gating por sección
      const needed = sectionForPath(path)
      if (needed) {
        if (role === 'admin' || allowed.includes(needed)) return true
        return Response.redirect(new URL('/gestion/sin-acceso', nextUrl))
      }

      return true
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id
        token.name = user.name
        token.username = (user as any).username
        token.role = (user as any).role || 'editor'
        token.sections = (user as any).sections || ''
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.name = token.name as string
        ;(session.user as any).username = token.username
        ;(session.user as any).role = token.role
        ;(session.user as any).sections = token.sections
      }
      return session
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,  // refresh every 24h
  },
  providers: [], // populated in auth.ts
} satisfies NextAuthConfig
