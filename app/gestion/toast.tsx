'use client'

// Toaster liviano y nativo del panel de gestión (estilo inline, consistente con
// el resto de las pantallas). Uso: gToast.success('Guardado'), gToast.error(msg).
import { useEffect, useState } from 'react'

type ToastType = 'success' | 'error' | 'info'
type T = { id: number; type: ToastType; msg: string }

let toasts: T[] = []
let listeners: Array<(t: T[]) => void> = []
let idc = 0

function emit() {
  for (const l of listeners) l(toasts)
}

function push(type: ToastType, msg: string) {
  const id = ++idc
  toasts = [...toasts, { id, type, msg }]
  emit()
  const ttl = type === 'error' ? 5200 : 3600
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id)
    emit()
  }, ttl)
}

export const gToast = {
  success: (m: string) => push('success', m),
  error: (m: string) => push('error', m),
  info: (m: string) => push('info', m),
}

const STYLES: Record<ToastType, { bg: string; border: string; color: string; icon: string }> = {
  success: { bg: '#f0fdf4', border: '#bbf7d0', color: '#166534', icon: '✓' },
  error: { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c', icon: '✕' },
  info: { bg: '#eff6ff', border: '#bfdbfe', color: '#1e40af', icon: 'ℹ' },
}

export function GestionToaster() {
  const [list, setList] = useState<T[]>(toasts)
  useEffect(() => {
    listeners.push(setList)
    return () => { listeners = listeners.filter(l => l !== setList) }
  }, [])

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 'min(92vw, 380px)',
        pointerEvents: 'none',
      }}
    >
      {list.map(t => {
        const s = STYLES[t.type]
        return (
          <div
            key={t.id}
            role="status"
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 9,
              background: s.bg, border: `1px solid ${s.border}`, color: s.color,
              borderRadius: 10, padding: '0.7rem 0.9rem', fontSize: '0.82rem', fontWeight: 600,
              boxShadow: '0 10px 28px rgba(15,23,42,0.14)', lineHeight: 1.35,
              animation: 'gtoast-in 0.18s ease-out', pointerEvents: 'auto',
            }}
          >
            <span style={{ fontWeight: 800, flexShrink: 0 }}>{s.icon}</span>
            <span>{t.msg}</span>
          </div>
        )
      })}
      <style>{`@keyframes gtoast-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  )
}
