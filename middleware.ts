import NextAuth from 'next-auth'
import { authConfig } from './auth.config'

// Edge-compatible middleware (no bcrypt here — providers live in auth.ts)
export default NextAuth(authConfig).auth

export const config = {
  // Run middleware on everything EXCEPT static assets / api routes
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|images|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico)).*)'],
}
