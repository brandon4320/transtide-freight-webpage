'use client'

// Acciones de fila y confirmaciones del panel de gestión, en el lenguaje
// "Transtide Flat": hoja blanca, sin sombras pesadas, color solo semántico y un
// único botón primario por pantalla. Se comparten entre listas para que Eliminar
// deje de vivir al lado de Editar y para que nada destructivo ni ninguna creación
// automática pase sin un paso explícito del usuario.

import { useCallback, useEffect, useId, useRef, useState } from 'react'

const TXT = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }
const INP = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '16px', color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const OVERLAY = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }
const PANEL = { background: '#fff', borderRadius: 12, padding: '1.5rem 1.75rem', width: '100%', boxSizing: 'border-box', maxHeight: '92vh', overflowY: 'auto' }
const TITULO = { fontSize: '1.02rem', fontWeight: 600, color: '#111827', margin: 0, lineHeight: 1.3 }
const SUBTITULO = { fontSize: '0.78rem', color: '#6b7280', margin: '4px 0 0', lineHeight: 1.5 }

// Escape cierra el modal abierto. Se guarda el callback en un ref para no
// re-suscribir el listener en cada render del padre.
function useEscape(activo, fn) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (!activo) return
    const h = (e) => { if (e.key === 'Escape') { e.stopPropagation(); ref.current && ref.current() } }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [activo])
}

// ─── MenuFila ────────────────────────────────────────────────────────────────
/**
 * Botón ⋯ que abre un menú flotante con las acciones de la fila.
 * items: [{ label, onClick, peligro?, disabled? }]. Los items en `peligro`
 * (Eliminar) se pintan en rojo y quedan separados por una línea del resto: un
 * clic de más no puede caer en borrar sin querer.
 */
export function MenuFila({ items = [], ariaLabel = 'Más acciones' }) {
  const lista = (items || []).filter(Boolean)
  const [abierto, setAbierto] = useState(false)
  const [foco, setFoco] = useState(-1)
  const raiz = useRef(null)
  const trigger = useRef(null)
  const menuId = useId()

  const cerrar = useCallback((volverFoco) => {
    setAbierto(false)
    setFoco(-1)
    if (volverFoco) trigger.current && trigger.current.focus()
  }, [])

  const habilitados = lista.map((it, i) => (it.disabled ? -1 : i)).filter(i => i >= 0)

  useEffect(() => {
    if (!abierto) return
    // Se abre con el primer item usable enfocado para que el teclado funcione de una.
    setFoco(habilitados.length ? habilitados[0] : -1)
    const onDoc = (e) => { if (raiz.current && !raiz.current.contains(e.target)) cerrar(false) }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(true); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (!habilitados.length) return
        setFoco(f => {
          const pos = habilitados.indexOf(f)
          const n = habilitados.length
          const next = e.key === 'ArrowDown' ? (pos + 1) % n : (pos - 1 + n) % n
          return habilitados[next]
        })
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, cerrar])

  useEffect(() => {
    if (!abierto || foco < 0 || !raiz.current) return
    const el = raiz.current.querySelectorAll('[role="menuitem"]')[foco]
    if (el) el.focus()
  }, [abierto, foco])

  return (
    // stopPropagation: las filas suelen abrir la ficha al hacer clic; el menú no
    // tiene que disparar eso.
    <div ref={raiz} style={{ position: 'relative', display: 'inline-block' }} onClick={e => e.stopPropagation()}>
      <button
        ref={trigger}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? menuId : undefined}
        onClick={() => setAbierto(a => !a)}
        style={{ ...TXT, color: abierto ? '#111827' : '#9ca3af', fontSize: '1.05rem', lineHeight: 1, padding: '2px 6px', borderRadius: 4, letterSpacing: 1 }}
      >
        ⋯
      </button>
      {abierto && (
        <div
          id={menuId}
          role="menu"
          style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', minWidth: 172, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 6px 20px rgba(15,23,42,.08)', padding: '4px 0', zIndex: 200 }}
        >
          {lista.length === 0 && (
            <div style={{ padding: '0.5rem 0.85rem', fontSize: '0.74rem', color: '#9ca3af' }}>Sin acciones</div>
          )}
          {lista.map((it, i) => {
            const separado = it.peligro && i > 0 && !lista[i - 1].peligro
            const color = it.disabled ? '#9ca3af' : it.peligro ? '#dc2626' : '#111827'
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={!!it.disabled}
                aria-disabled={it.disabled ? true : undefined}
                onMouseEnter={() => { if (!it.disabled) setFoco(i) }}
                onClick={() => { if (it.disabled) return; cerrar(false); it.onClick && it.onClick() }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', border: 'none', fontFamily: 'inherit',
                  background: foco === i ? '#f8fafc' : 'none', outline: 'none',
                  padding: '0.5rem 0.85rem', fontSize: '0.78rem', fontWeight: 500, color, whiteSpace: 'nowrap',
                  cursor: it.disabled ? 'default' : 'pointer',
                  borderTop: separado ? '1px solid #f1f5f9' : 'none', marginTop: separado ? 4 : 0, paddingTop: separado ? 'calc(0.5rem + 4px)' : '0.5rem',
                }}
              >
                {it.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── ConfirmacionTipada ──────────────────────────────────────────────────────
/**
 * Confirmación que exige escribir una palabra exacta (ENTREGAR, el nº de
 * embarque). Para lo que no tiene deshacer o mueve plata: entregar con el
 * candado de cobro abierto, borrar algo que ya tiene pagos. Compara trim() y
 * distingue mayúsculas: la fricción es el punto.
 */
export function ConfirmacionTipada({ abierto, titulo, detalle, palabra, onConfirm, onCancel, busy, confirmar = 'Confirmar' }) {
  const [texto, setTexto] = useState('')
  const inputRef = useRef(null)
  const idTitulo = useId()
  const idDetalle = useId()

  useEffect(() => {
    if (!abierto) return
    setTexto('')
    // El foco va al input después de que el modal se pinta.
    const t = setTimeout(() => { inputRef.current && inputRef.current.focus() }, 0)
    return () => clearTimeout(t)
  }, [abierto])

  const cancelar = () => { if (!busy && onCancel) onCancel() }
  useEscape(!!abierto && !busy, cancelar)

  if (!abierto) return null

  const objetivo = String(palabra ?? '')
  const habilitado = !busy && objetivo !== '' && texto.trim() === objetivo
  const confirmarAhora = () => { if (habilitado && onConfirm) onConfirm() }

  return (
    <div style={OVERLAY} onClick={cancelar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={detalle ? idDetalle : undefined}
        style={{ ...PANEL, maxWidth: 420 }}
        onClick={e => e.stopPropagation()}
      >
        <h2 id={idTitulo} style={TITULO}>{titulo}</h2>
        {detalle ? <p id={idDetalle} style={SUBTITULO}>{detalle}</p> : null}

        <label style={{ display: 'block', marginTop: '1.1rem' }}>
          <span style={{ display: 'block', fontSize: '0.74rem', color: '#6b7280', marginBottom: 6 }}>
            Escribí <b style={{ color: '#111827', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{objetivo}</b> para confirmar
          </span>
          <input
            ref={inputRef}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmarAhora() } }}
            disabled={!!busy}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={objetivo}
            style={{ ...INP, fontVariantNumeric: 'tabular-nums' }}
          />
        </label>

        <div style={{ display: 'flex', gap: 22, justifyContent: 'flex-end', alignItems: 'center', marginTop: '1.25rem' }}>
          <button type="button" onClick={cancelar} disabled={!!busy} style={{ ...TXT, fontSize: '0.78rem', fontWeight: 500, color: '#6b7280', cursor: busy ? 'default' : 'pointer' }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmarAhora}
            disabled={!habilitado}
            style={{ ...TXT, fontSize: '0.78rem', fontWeight: 600, color: habilitado ? '#dc2626' : '#9ca3af', cursor: habilitado ? 'pointer' : 'default' }}
          >
            {busy ? 'Un momento…' : confirmar}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── DraftPanel ──────────────────────────────────────────────────────────────
/**
 * Panel para crear algo con datos precargados (un despacho desde la operación,
 * una operación desde una cotización) y confirmarlo a conciencia. Nada se
 * guarda hasta apretar Confirmar. `aviso` es para lo que conviene saber antes
 * de confirmar ("Ya existe un despacho para esta operación").
 * A diferencia de una confirmación, clic afuera NO cierra: hay datos tipeados.
 */
export function DraftPanel({ abierto, titulo, subtitulo, children, onConfirm, onCancel, confirmar = 'Confirmar', busy, aviso }) {
  const idTitulo = useId()
  const idSub = useId()
  const panelRef = useRef(null)

  const cancelar = () => { if (!busy && onCancel) onCancel() }
  useEscape(!!abierto && !busy, cancelar)

  useEffect(() => {
    if (!abierto || !panelRef.current) return
    // Foco al primer campo editable; si no hay, al panel (para que Escape ande).
    const t = setTimeout(() => {
      const p = panelRef.current
      if (!p) return
      const campo = p.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])')
      if (campo) campo.focus()
      else p.focus()
    }, 0)
    return () => clearTimeout(t)
  }, [abierto])

  if (!abierto) return null

  return (
    <div style={OVERLAY}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={subtitulo ? idSub : undefined}
        aria-busy={busy ? true : undefined}
        style={{ ...PANEL, maxWidth: 560, outline: 'none' }}
      >
        <h2 id={idTitulo} style={TITULO}>{titulo}</h2>
        {subtitulo ? <p id={idSub} style={SUBTITULO}>{subtitulo}</p> : null}
        {aviso ? (
          <p role="status" style={{ fontSize: '0.78rem', color: '#d97706', margin: '10px 0 0', lineHeight: 1.5 }}>{aviso}</p>
        ) : null}

        <div style={{ marginTop: '1.1rem' }}>{children}</div>

        <div style={{ display: 'flex', gap: 22, justifyContent: 'flex-end', alignItems: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
          <button type="button" onClick={cancelar} disabled={!!busy} style={{ ...TXT, fontSize: '0.78rem', fontWeight: 500, color: '#6b7280', cursor: busy ? 'default' : 'pointer' }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => { if (!busy && onConfirm) onConfirm() }}
            disabled={!!busy}
            style={{ background: '#111827', color: '#fff', border: 'none', borderRadius: 6, padding: '0.55rem 1.05rem', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'Guardando…' : confirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
