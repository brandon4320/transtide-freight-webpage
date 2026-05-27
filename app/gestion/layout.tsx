import { auth, signOut } from '@/auth'
import { redirect } from 'next/navigation'
import GestionLayoutClient from './layout-client'

export default async function GestionLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  async function logout() {
    'use server'
    await signOut({ redirectTo: '/login' })
  }

  return (
    <GestionLayoutClient
      userName={session.user.name || 'Usuario'}
      logoutAction={logout}
    >
      {children}
    </GestionLayoutClient>
  )
}
