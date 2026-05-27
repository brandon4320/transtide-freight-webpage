import type { NextAuthConfig } from 'next-auth'

/**
 * Edge-compatible auth config (used by middleware).
 * No providers/adapters here — those go in auth.ts.
 */
export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnGestion = nextUrl.pathname.startsWith('/gestion')
      const isOnLogin = nextUrl.pathname === '/login'

      if (isOnLogin && isLoggedIn) {
        return Response.redirect(new URL('/gestion/operaciones', nextUrl))
      }
      if (isOnGestion) {
        return isLoggedIn // require login for /gestion/*
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.name = user.name
        token.username = (user as any).username
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.name = token.name as string
        ;(session.user as any).username = token.username
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
