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
  '/gestion/comparador': 'comparador',
  '/gestion/contactos': 'contactos',
}

function sectionForPath(pathname: string): string | null {
  for (const prefix in SECTION_BY_PATH) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return SECTION_BY_PATH[prefix]
  }
  return null
}

// Revalidación de permisos contra D1 (fuente de verdad). Distingue 3 casos:
//  - null         → no se pudo verificar (DB caída / sin credenciales): fail-open, mantener token
//  - {found:false}→ el usuario ya no existe: invalidar sesión
//  - {found:true} → devuelve role/sections/active actuales
type PermsResult = { found: boolean; role: string; sections: string; active: number }
async function fetchUserPerms(username: string): Promise<PermsResult | null> {
  const acc = process.env.CF_ACCOUNT_ID
  const db = process.env.CF_D1_DATABASE_ID
  const token = process.env.CF_D1_API_TOKEN
  if (!acc || !db || !token || !username) return null
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${acc}/d1/database/${db}/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: 'SELECT role, sections, active FROM users WHERE lower(username) = ? LIMIT 1', params: [username.toLowerCase()] }),
        cache: 'no-store',
      }
    )
    if (!res.ok) return null
    const json = await res.json()
    // D1 puede responder HTTP 200 con success:false ante errores transitorios de query.
    // Tratarlo como "no verificable" (fail-open) y NO como usuario inexistente.
    if (!json?.success) return null
    const results = json?.result?.[0]?.results
    if (!Array.isArray(results)) return null // respuesta inesperada → fail-open, no marcar disabled
    const row = results[0]
    if (!row) return { found: false, role: '', sections: '', active: 0 } // results:[] real → usuario eliminado
    return { found: true, role: row.role || 'editor', sections: row.sections || '', active: row.active == null ? 1 : Number(row.active) }
  } catch {
    return null
  }
}

// Cada cuánto re-validar el token contra la DB (revocación de rol/sección/baja).
const REVALIDATE_MS = 5 * 60 * 1000

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      // Usuario desactivado/eliminado tras la última revalidación → tratar como deslogueado.
      const disabled = (auth?.user as any)?.disabled === true
      const isLoggedIn = !!auth?.user && !disabled
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

      // Panel de usuarios y utilidades de datos (seed/migrar): solo admin
      if (path.startsWith('/gestion/usuarios') || path.startsWith('/gestion/seed') || path.startsWith('/gestion/migrar')) {
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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.name = user.name
        token.username = (user as any).username
        token.role = (user as any).role || 'editor'
        token.sections = (user as any).sections || ''
        token.disabled = false
        token.checkedAt = Date.now()
      } else if (token && token.username) {
        // Revalidar contra la DB: tokens legacy (sin role) o cuando venció la ventana.
        const checkedAt = (token.checkedAt as number) || 0
        const stale = token.role === undefined || (Date.now() - checkedAt) > REVALIDATE_MS
        if (stale) {
          const perms = await fetchUserPerms(token.username as string)
          if (perms === null) {
            // DB no disponible → fail-open: mantener permisos actuales, reintentar luego.
          } else if (!perms.found || perms.active === 0) {
            // Usuario eliminado o desactivado → invalidar la sesión.
            token.disabled = true
          } else {
            token.role = perms.role
            token.sections = perms.sections
            token.disabled = false
            token.checkedAt = Date.now()
          }
        }
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
        ;(session.user as any).disabled = token.disabled === true
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
