'use client'

// ─── Página de impresión dedicada ────────────────────────────────────────────
// El cotizador guarda el documento armado en localStorage y abre esta pestaña.
// Acá se reemplaza TODO el documento por ese HTML (limpio, sin el layout de la
// app) y se dispara la impresión. Si el auto-print no corre, el documento trae
// su propia barra con el botón "Imprimir / Guardar PDF" — siempre hay salida.

import { useEffect, useState } from 'react'

const KEY = '__ttf_print_html__'

export default function PrintPage() {
  const [vacio, setVacio] = useState(false)

  useEffect(() => {
    let html = ''
    try { html = localStorage.getItem(KEY) || '' } catch {}
    if (!html) { setVacio(true); return }
    try { localStorage.removeItem(KEY) } catch {}
    const noAuto = new URLSearchParams(window.location.search).has('noprint')
    document.open()
    document.write(html)
    document.close()
    if (!noAuto) setTimeout(() => { try { window.focus(); window.print() } catch {} }, 500)
  }, [])

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem 2rem', color: '#475569', maxWidth: 560 }}>
      <p style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>{vacio ? 'No hay documento para imprimir' : 'Preparando el documento…'}</p>
      <p style={{ fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
        {vacio
          ? 'Volvé a la pestaña anterior y tocá "Imprimir / PDF" de nuevo.'
          : 'En un instante se abre la vista de impresión.'}
      </p>
    </div>
  )
}
