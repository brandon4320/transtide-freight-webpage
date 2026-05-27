import { redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'
import { AuthError } from 'next-auth'
import LoginForm from './login-form'

export const metadata = {
  title: 'Iniciar sesión · Portal de Gestión Transtide',
  robots: 'noindex, nofollow',
}

async function loginAction(_state: { error?: string } | undefined, formData: FormData) {
  'use server'
  try {
    await signIn('credentials', {
      username: formData.get('username'),
      password: formData.get('password'),
      redirectTo: '/gestion/operaciones',
    })
    return undefined
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === 'CredentialsSignin') {
        return { error: 'Usuario o contraseña incorrectos.' }
      }
      return { error: 'Error de autenticación. Intentá de nuevo.' }
    }
    // Next redirect() throws — re-throw it
    throw error
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const session = await auth()
  if (session?.user) {
    redirect('/gestion/operaciones')
  }
  const params = await searchParams
  return <LoginForm action={loginAction} callbackUrl={params.callbackUrl} />
}
