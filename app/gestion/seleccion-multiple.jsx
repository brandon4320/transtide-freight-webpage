'use client'

// Selección múltiple + borrado con deshacer, compartido por las listas del portal
// (Operaciones, Forwarding, Despachante).
//
// El borrado es DIFERIDO: al confirmar, las filas desaparecen de la lista pero NO se
// borran todavía — queda una barra "N eliminadas · Deshacer" con cuenta regresiva. Si
// se deshace, no se llamó a la API en ningún momento y no hay nada que restaurar; si
// pasa el tiempo (o se sale de la pantalla), recién ahí se ejecuta el borrado real.
// Esto es a propósito: restaurar después de borrar perdería el detalle asociado
// (gastos, proveedores, pagos), que el DELETE se lleva puesto.

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

const INK = '#111827'
const MUTED = '#9ca3af'
const SEGUNDOS = 12

// ─── casilla ──────────────────────────────────────────────────────────────────
export function Casilla({ checked, indeterminate, onChange, label, style }) {
  return (
    <span
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      tabIndex={0}
      onClick={e => { e.stopPropagation(); onChange(!checked) }}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onChange(!checked) } }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 15, height: 15, borderRadius: 4, flex: '0 0 auto', cursor: 'pointer',
        border: `1px solid ${checked || indeterminate ? INK : '#d1d5db'}`,
        background: checked || indeterminate ? INK : '#fff',
        transition: 'background .12s, border-color .12s',
        ...style,
      }}
    >
      {indeterminate
        ? <span style={{ width: 7, height: 1.5, background: '#fff', borderRadius: 1 }} />
        : checked
          ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          : null}
    </span>
  )
}

// ─── hook ─────────────────────────────────────────────────────────────────────
// items: array visible · getId: (item) => id · onEliminar: async (ids) => void
// nombre: ['operación', 'operaciones'] para los textos.
export function useSeleccionMultiple({ items, getId = (x) => x.id, onEliminar, nombre = ['registro', 'registros'] }) {
  const [sel, setSel] = useState(() => new Set())
  const [confirmar, setConfirmar] = useState(false)
  const [pendiente, setPendiente] = useState(null) // { ids, items, restan }
  const timerRef = useRef(null)
  const tickRef = useRef(null)
  const pendRef = useRef(null)
  const onElimRef = useRef(onEliminar)
  useEffect(() => { onElimRef.current = onEliminar }, [onEliminar])

  const visibles = useMemo(() => items.map(getId), [items, getId])

  // La selección nunca sobrevive a filas que ya no están (filtro, búsqueda, borrado).
  useEffect(() => {
    setSel(prev => {
      if (prev.size === 0) return prev
      const vis = new Set(visibles)
      const next = new Set([...prev].filter(id => vis.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [visibles])

  const limpiarTimers = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
  }

  // Ejecuta el borrado real que estaba esperando.
  const confirmarBorrado = useCallback(async () => {
    const p = pendRef.current
    limpiarTimers()
    pendRef.current = null
    setPendiente(null)
    if (!p || !p.ids.length) return
    try { await onElimRef.current(p.ids) } catch { /* la página muestra su propio error */ }
  }, [])

  const deshacer = useCallback(() => {
    limpiarTimers()
    pendRef.current = null
    setPendiente(null)
  }, [])

  // Al salir de la pantalla se cierra lo pendiente: nada queda a medio borrar.
  useEffect(() => () => {
    const p = pendRef.current
    limpiarTimers()
    if (p && p.ids.length) { try { onElimRef.current(p.ids) } catch {} }
  }, [])

  const pedirEliminar = () => { if (sel.size) setConfirmar(true) }

  // Saca las filas de la vista y arranca la ventana de deshacer.
  const eliminarSeleccion = () => {
    const ids = [...sel]
    if (!ids.length) return
    const elegidos = items.filter(i => sel.has(getId(i)))
    // Si ya había un borrado esperando, se cierra antes de arrancar el nuevo.
    if (pendRef.current) confirmarBorrado()
    setConfirmar(false)
    setSel(new Set())
    const p = { ids, items: elegidos, restan: SEGUNDOS }
    pendRef.current = p
    setPendiente(p)
    tickRef.current = setInterval(() => {
      setPendiente(prev => prev ? { ...prev, restan: Math.max(0, prev.restan - 1) } : prev)
    }, 1000)
    timerRef.current = setTimeout(confirmarBorrado, SEGUNDOS * 1000)
  }

  const ocultos = pendiente ? new Set(pendiente.ids) : null
  // Filtra lo que está en la ventana de deshacer: la lista se ve como quedaría.
  const filtrar = useCallback((arr) => (ocultos ? arr.filter(i => !ocultos.has(getId(i))) : arr), [ocultos, getId])

  const seleccionables = visibles.filter(id => !ocultos || !ocultos.has(id))
  const todos = seleccionables.length > 0 && seleccionables.every(id => sel.has(id))
  const algunos = sel.size > 0 && !todos

  return {
    sel,
    hay: sel.size > 0,
    esta: (id) => sel.has(id),
    alternar: (id) => setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }),
    alternarTodos: () => setSel(todos ? new Set() : new Set(seleccionables)),
    todos, algunos,
    limpiar: () => setSel(new Set()),
    pedirEliminar, eliminarSeleccion, confirmar, cancelarConfirmar: () => setConfirmar(false),
    pendiente, deshacer, confirmarBorrado,
    filtrar, ocultos,
    nombre,
  }
}

// ─── barra flotante: selección y deshacer ─────────────────────────────────────
const BARRA = {
  position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 22, zIndex: 900,
  display: 'flex', alignItems: 'center', gap: 14, padding: '0.6rem 0.9rem 0.6rem 1.05rem',
  background: INK, color: '#fff', borderRadius: 10, fontSize: '0.78rem',
  boxShadow: '0 8px 28px rgba(15,23,42,0.28)', maxWidth: 'calc(100vw - 2rem)',
}
const ACC = { background: 'none', border: 'none', color: '#fff', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0, whiteSpace: 'nowrap' }

export function BarraSeleccion({ s }) {
  const plural = s.sel.size === 1 ? s.nombre[0] : s.nombre[1]
  return (
    <>
      {s.hay && !s.confirmar && (
        <div style={BARRA}>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}><b>{s.sel.size}</b> {plural}</span>
          <button onClick={s.pedirEliminar} style={{ ...ACC, color: '#fca5a5' }}>Eliminar</button>
          <button onClick={s.limpiar} style={{ ...ACC, color: 'rgba(255,255,255,0.62)' }}>Cancelar</button>
        </div>
      )}

      {s.confirmar && (
        <div onClick={e => { if (e.target === e.currentTarget) s.cancelarConfirmar() }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '1.5rem 1.75rem', width: '100%', maxWidth: 380 }}>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: INK, marginBottom: 6 }}>
              ¿Eliminar {s.sel.size} {plural}?
            </p>
            <p style={{ fontSize: '0.76rem', color: MUTED, marginBottom: '1.4rem' }}>
              Vas a poder deshacerlo durante unos segundos antes de que se borre de verdad.
            </p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', alignItems: 'center' }}>
              <button onClick={s.cancelarConfirmar} style={{ ...ACC, color: '#6b7280' }}>Cancelar</button>
              <button onClick={s.eliminarSeleccion} style={{ ...ACC, color: '#dc2626' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {s.pendiente && (
        <div style={{ ...BARRA, bottom: s.hay ? 74 : 22 }}>
          <span>
            <b style={{ fontVariantNumeric: 'tabular-nums' }}>{s.pendiente.ids.length}</b>{' '}
            {s.pendiente.ids.length === 1 ? `${s.nombre[0]} eliminada` : `${s.nombre[1]} eliminadas`}
          </span>
          <button onClick={s.deshacer} style={{ ...ACC, textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Deshacer{s.pendiente.restan > 0 ? ` (${s.pendiente.restan})` : ''}
          </button>
        </div>
      )}
    </>
  )
}
