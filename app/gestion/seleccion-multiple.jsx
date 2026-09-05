'use client'

// Selección múltiple + borrado con deshacer, compartido por las listas del portal
// (Operaciones, Forwarding, Despachante).
//
// El borrado es DIFERIDO: al confirmar, las filas desaparecen de la lista pero NO se
// tocan todavía — queda una barra "N movidas a la Papelera · Deshacer" con cuenta
// regresiva. Si se deshace, no se llamó a la API en ningún momento; si pasa el tiempo
// (o se sale de la pantalla), recién ahí se llama a onEliminar, que hoy es un
// soft-delete: la fila va a la Papelera (/gestion/papelera) y se puede restaurar
// durante 30 días con todo lo que cuelga de ella (gastos, proveedores, pagos).
//
// Archivar (opcional, si el hook recibe onArchivar): no es destructivo, la fila deja
// de verse en la lista pero sigue en la ficha y en los totales. Pide confirmación y
// llama a onArchivar(ids, items) al toque, sin ventana de deshacer.

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

const INK = '#111827'
const MUTED = '#9ca3af'
const SEGUNDOS = 12
export const DIAS_PAPELERA = 30

// Concordancia de los textos: 'operación' → femenino, 'embarque' / 'registro' →
// masculino. Se puede forzar con genero: 'f' | 'm'.
const esFemenino = (nombre, genero) => (genero ? genero === 'f' : /(a|ción|sión|dad)$/i.test(nombre[0] || ''))

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
// onArchivar (opcional): async (ids, items) => void — si viene, la barra suma "Archivar".
// nombre: ['operación', 'operaciones'] para los textos · genero: 'f' | 'm' (se infiere).
export function useSeleccionMultiple({ items, getId = (x) => x.id, onEliminar, onArchivar, nombre = ['registro', 'registros'], genero }) {
  const [sel, setSel] = useState(() => new Set())
  const [confirmar, setConfirmar] = useState(false)
  const [pendiente, setPendiente] = useState(null) // { ids, items, restan }
  const [confirmarArchivo, setConfirmarArchivo] = useState(false)
  const [archivando, setArchivando] = useState(false)
  const timerRef = useRef(null)
  const tickRef = useRef(null)
  const pendRef = useRef(null)
  const onElimRef = useRef(onEliminar)
  useEffect(() => { onElimRef.current = onEliminar }, [onEliminar])
  const onArchRef = useRef(onArchivar)
  useEffect(() => { onArchRef.current = onArchivar }, [onArchivar])
  const tieneArchivar = typeof onArchivar === 'function'
  const fem = esFemenino(nombre, genero)

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

  const pedirArchivar = () => { if (sel.size && tieneArchivar) setConfirmarArchivo(true) }

  // Archivar no es destructivo (la fila sigue en la ficha y en los totales), así que
  // no lleva ventana de deshacer: se confirma y se llama a la página. Si falla, la
  // selección queda como estaba para reintentar; la página muestra su propio error.
  const archivarSeleccion = async () => {
    const ids = [...sel]
    if (!ids.length || !onArchRef.current) return
    const elegidos = items.filter(i => sel.has(getId(i)))
    setConfirmarArchivo(false)
    setArchivando(true)
    try {
      await onArchRef.current(ids, elegidos)
      setSel(new Set())
    } catch { /* la página muestra su propio error */ }
    finally { setArchivando(false) }
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
    tieneArchivar, pedirArchivar, archivarSeleccion, confirmarArchivo, cancelarArchivar: () => setConfirmarArchivo(false), archivando,
    filtrar, ocultos,
    nombre, fem,
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
  const n = s.sel.size
  const plural = n === 1 ? s.nombre[0] : s.nombre[1]
  const fem = s.fem !== false
  // "restaurarla / restaurarlo / restaurarlas / restaurarlos"
  const pron = (fem ? 'la' : 'lo') + (n === 1 ? '' : 's')
  return (
    <>
      {s.hay && !s.confirmar && !s.confirmarArchivo && (
        <div style={BARRA}>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}><b>{n}</b> {plural}</span>
          {s.tieneArchivar && (
            <button onClick={s.pedirArchivar} disabled={s.archivando} style={{ ...ACC, opacity: s.archivando ? 0.6 : 1, cursor: s.archivando ? 'default' : 'pointer' }}>
              {s.archivando ? 'Archivando…' : 'Archivar'}
            </button>
          )}
          <button onClick={s.pedirEliminar} disabled={s.archivando} style={{ ...ACC, color: '#fca5a5', opacity: s.archivando ? 0.6 : 1 }}>Eliminar</button>
          <button onClick={s.limpiar} style={{ ...ACC, color: 'rgba(255,255,255,0.62)' }}>Cancelar</button>
        </div>
      )}

      {s.confirmarArchivo && (
        <div onClick={e => { if (e.target === e.currentTarget) s.cancelarArchivar() }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '1.5rem 1.75rem', width: '100%', maxWidth: 380 }}>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: INK, marginBottom: 6 }}>
              ¿Archivar {n} {plural}?
            </p>
            <p style={{ fontSize: '0.76rem', color: MUTED, marginBottom: '1.4rem' }}>
              {n === 1 ? 'Deja de aparecer en la lista, pero no se borra: sigue' : 'Dejan de aparecer en la lista, pero no se borran: siguen'} en la ficha y en los totales históricos.
            </p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', alignItems: 'center' }}>
              <button onClick={s.cancelarArchivar} style={{ ...ACC, color: '#6b7280' }}>Cancelar</button>
              <button onClick={s.archivarSeleccion} style={{ ...ACC, color: INK }}>Archivar</button>
            </div>
          </div>
        </div>
      )}

      {s.confirmar && (
        <div onClick={e => { if (e.target === e.currentTarget) s.cancelarConfirmar() }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '1.5rem 1.75rem', width: '100%', maxWidth: 380 }}>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: INK, marginBottom: 6 }}>
              ¿Eliminar {n} {plural}?
            </p>
            <p style={{ fontSize: '0.76rem', color: MUTED, marginBottom: '1.4rem' }}>
              {n === 1 ? 'Se mueve' : 'Se mueven'} a la Papelera. Podés restaurar{pron} durante {DIAS_PAPELERA} días.
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
            {s.pendiente.ids.length === 1
              ? `${s.nombre[0]} ${fem ? 'movida' : 'movido'} a la Papelera`
              : `${s.nombre[1]} ${fem ? 'movidas' : 'movidos'} a la Papelera`}
          </span>
          <span aria-hidden="true" style={{ color: 'rgba(255,255,255,0.4)' }}>·</span>
          <button onClick={s.deshacer} style={{ ...ACC, textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Deshacer{s.pendiente.restan > 0 ? ` (${s.pendiente.restan})` : ''}
          </button>
        </div>
      )}
    </>
  )
}
