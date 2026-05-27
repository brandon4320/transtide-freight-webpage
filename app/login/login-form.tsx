'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

type State = { error?: string } | undefined

export default function LoginForm({
  action,
  callbackUrl,
}: {
  action: (state: State, formData: FormData) => Promise<State>
  callbackUrl?: string
}) {
  const [state, formAction] = useActionState<State, FormData>(action, undefined)

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f4f6f9 0%, #e8edf3 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        background: '#fff',
        borderRadius: 14,
        boxShadow: '0 10px 40px rgba(15,23,42,0.08)',
        padding: '2.25rem 2rem',
        border: '1px solid #e8ecf1',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <p style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 900,
            fontSize: '1.3rem',
            letterSpacing: '0.06em',
            color: '#0f172a',
            lineHeight: 1,
          }}>
            TRANSTIDE<span style={{ color: '#ea580c' }}>.</span>
          </p>
          <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 8 }}>Portal de Gestión</p>
        </div>

        <h1 style={{
          fontSize: '1.05rem',
          fontWeight: 800,
          color: '#0f172a',
          marginBottom: 6,
        }}>Iniciar sesión</h1>
        <p style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '1.5rem' }}>
          Acceso restringido al equipo Transtide.
        </p>

        <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}

          <div>
            <label htmlFor="username" style={LBL}>Usuario</label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoComplete="username"
              autoFocus
              style={INP}
              placeholder="tuusuario"
            />
          </div>

          <div>
            <label htmlFor="password" style={LBL}>Contraseña</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              style={INP}
              placeholder="••••••••••••"
            />
          </div>

          {state?.error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 7,
              padding: '0.55rem 0.75rem',
              fontSize: '0.78rem',
              color: '#dc2626',
              fontWeight: 500,
            }}>
              {state.error}
            </div>
          )}

          <SubmitBtn />
        </form>

        <p style={{
          marginTop: '1.5rem',
          fontSize: '0.7rem',
          color: '#94a3b8',
          textAlign: 'center',
        }}>
          ¿Problemas para entrar? Contactá al admin.
        </p>
      </div>
    </div>
  )
}

function SubmitBtn() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        marginTop: 4,
        padding: '0.7rem 1rem',
        borderRadius: 8,
        border: 'none',
        background: pending ? '#cbd5e1' : '#0f172a',
        color: '#fff',
        fontWeight: 700,
        fontSize: '0.85rem',
        cursor: pending ? 'wait' : 'pointer',
        transition: 'background 0.15s',
      }}
    >
      {pending ? 'Verificando…' : 'Entrar'}
    </button>
  )
}

const LBL: React.CSSProperties = {
  display: 'block',
  fontSize: '0.65rem',
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 5,
}
const INP: React.CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  border: '1px solid #e2e8f0',
  borderRadius: 7,
  fontSize: '0.88rem',
  color: '#0f172a',
  background: '#fff',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}
