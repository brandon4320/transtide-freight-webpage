import { auth, signOut } from '@/auth'
import { redirect } from 'next/navigation'
import GestionLayoutClient from './layout-client'

export default async function GestionLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const u = session.user as any
  const role: string = u.role || 'editor'
  const sections: string[] = String(u.sections || '').split(',').map((s: string) => s.trim()).filter(Boolean)

  async function logout() {
    'use server'
    await signOut({ redirectTo: '/login' })
  }

  return (
    <GestionLayoutClient
      userName={session.user.name || 'Usuario'}
      role={role}
      sections={sections}
      logoutAction={logout}
    >
      {children}
    </GestionLayoutClient>
  )
}
