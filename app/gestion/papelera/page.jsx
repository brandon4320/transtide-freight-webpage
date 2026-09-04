'use client'

// ─── Papelera ─────────────────────────────────────────────────────────────────
// Vista única de lo que se borró desde Operaciones, Forwarding y Despachante.
// Nada de esto se eliminó físicamente: las filas tienen deleted_at/deleted_by y
// las listas las ocultan. Restaurar vuelve a dejar la fila viva con todo lo que
// cuelga de ella (gastos, proveedores, pagos), porque nunca se fue.
// Pasados 30 días la purga programada borra de verdad.
//
// Datos: GET /api/db/papelera → { operaciones: [...], embarques: [...], despachos: [...] }
//        cada ítem: { id, titulo, deleted_at, deleted_by, resumen }
// Acción: POST /api/db/papelera { tabla, id } → restaura una fila.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { gToast } from '../toast'

// ——— Transtide Flat: hoja blanca, líneas finas, color solo semántico ———
const TINTA = '#111827', GRIS = '#9ca3af', GRIS_TXT = '#6b7280', AMBAR = '#d97706', ROJO = '#dc2626'
const TXTBTN = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.74rem', fontWeight: 500, color: GRIS_TXT, fontFamily: 'inherit', whiteSpace: 'nowrap' }

const DIAS_PAPELERA = 30

// Cada grupo con la tabla real que la API espera en el POST (mismo nombre que
// usa lib/soft-delete). Si la API manda `tabla` en el ítem, ese manda.
const GRUPOS = [
  { key: 'operaciones', label: 'Operaciones', tabla: 'operations', uno: 'Operación', fem: true },
  { key: 'embarques', label: 'Embarques', tabla: 'shipments', uno: 'Embarque', fem: false },
  { key: 'despachos', label: 'Despachos', tabla: 'despachante_pagos', uno: 'Despacho', fem: false },
]

const fechaLarga = (iso) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// "hoy · ayer · hace N días" y cuántos días le quedan antes de la purga.
function tiempos(iso) {
  const d = new Date(iso || '')
  if (!iso || isNaN(d.getTime())) return { rel: '', restan: null }
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const dd = new Date(d); dd.setHours(0, 0, 0, 0)
  const dias = Math.max(0, Math.round((hoy.getTime() - dd.getTime()) / 86400000))
  const rel = dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`
  return { rel, restan: DIAS_PAPELERA - dias }
}

async function errMsg(res, fallback) {
  try { const j = await res.json(); return j.error || fallback } catch { return fallback }
}

// devData: inyección para preview de diseño (evita auth/D1), como el resto del portal.
export default function PapeleraPage({ devData = null } = {}) {
  const [data, setData] = useState({ operaciones: [], embarques: [], despachos: [] })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(null) // `${grupo}:${id}` de la fila que se está restaurando

  const load = useCallback(async () => {
    if (devData) { setData({ operaciones: [], embarques: [], despachos: [], ...devData }); setLoading(false); return }
    setLoading(true)
    setLoadError('')
    try {
      const r = await fetch('/api/db/papelera')
      if (!r.ok) throw new Error(await errMsg(r, 'No se pudo cargar la papelera.'))
      const j = await r.json()
      const seguro = (v) => (Array.isArray(v) ? v : [])
      setData({ operaciones: seguro(j?.operaciones), embarques: seguro(j?.embarques), despachos: seguro(j?.despachos) })
    } catch (e) {
      setLoadError(e.message || 'No se pudo cargar la papelera.')
    } finally { setLoading(false) }
  }, [devData])
  useEffect(() => { load() }, [load])

  const total = useMemo(() => GRUPOS.reduce((a, g) => a + (data[g.key] || []).length, 0), [data])

  const restaurar = async (g, item) => {
    const clave = `${g.key}:${item.id}`
    if (busy) return
    setBusy(clave)
    try {
      const r = await fetch('/api/db/papelera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabla: item.tabla || g.tabla, id: item.id, grupo: g.key }),
      })
      if (!r.ok) throw new Error(await errMsg(r, 'No se pudo restaurar.'))
      setData(prev => ({ ...prev, [g.key]: (prev[g.key] || []).filter(x => x.id !== item.id) }))
      gToast.success(`${g.uno} ${g.fem ? 'restaurada' : 'restaurado'}.`)
    } catch (e) {
      gToast.error(e.message || 'No se pudo restaurar.')
    } finally { setBusy(null) }
  }

  const Fila = ({ g, item }) => {
    const { rel, restan } = tiempos(item.deleted_at)
    const clave = `${g.key}:${item.id}`
    const ocupado = busy === clave
    const titulo = item.titulo || `${g.uno} #${item.id}`
    const meta = [item.resumen, item.deleted_by ? `borrado por ${item.deleted_by}` : null, rel].filter(Boolean).join(' · ')
    // Lo que está por vencer se marca en ámbar; lo demás no lleva color.
    const restanTxt = restan == null ? '' : restan <= 0 ? 'se elimina hoy' : restan === 1 ? 'queda 1 día' : `quedan ${restan} días`
    const restanColor = restan != null && restan <= 5 ? AMBAR : GRIS
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0.6rem 0', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.82rem', fontWeight: 600, color: TINTA, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</p>
          {meta && (
            <p title={fechaLarga(item.deleted_at)} style={{ fontSize: '0.7rem', color: GRIS, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</p>
          )}
        </div>
        {restanTxt && (
          <span className="ppl-restan" style={{ fontSize: '0.68rem', color: restanColor, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{restanTxt}</span>
        )}
        <button
          onClick={() => restaurar(g, item)}
          disabled={!!busy}
          style={{ ...TXTBTN, fontWeight: 600, color: ocupado ? GRIS : TINTA, cursor: busy ? 'default' : 'pointer', opacity: busy && !ocupado ? 0.5 : 1 }}
        >
          {ocupado ? 'Restaurando…' : 'Restaurar'}
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 350, letterSpacing: '-0.02em', color: TINTA, marginBottom: '0.2rem' }}>Papelera</h2>
          <p style={{ fontSize: '0.74rem', color: GRIS }}>
            Operaciones, embarques y despachos borrados
            {!loading && !loadError ? ` · ${total} ${total === 1 ? 'elemento' : 'elementos'}` : ''}
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '3.5rem 0', textAlign: 'center', color: GRIS, fontSize: '0.8rem' }}>
          <div style={{ width: 28, height: 28, border: '2px solid #f1f5f9', borderTopColor: TINTA, borderRadius: '50%', margin: '0 auto 0.8rem', animation: 'ppl-spin 0.8s linear infinite' }} />
          Cargando…
        </div>
      ) : loadError ? (
        <div style={{ padding: '3.5rem 0', textAlign: 'center' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: ROJO, fontSize: '0.85rem' }}>{loadError}</p>
          <button onClick={load} style={{ ...TXTBTN, fontSize: '0.78rem', fontWeight: 600, color: TINTA, borderBottom: `1px solid ${TINTA}`, paddingBottom: 2 }}>Reintentar</button>
        </div>
      ) : total === 0 ? (
        <div style={{ padding: '3.5rem 0', textAlign: 'center', color: GRIS, fontSize: '0.8rem' }}>
          <p style={{ fontWeight: 600, color: GRIS_TXT, marginBottom: 4, fontSize: '0.85rem' }}>La papelera está vacía.</p>
          <p>Lo que borrés desde Operaciones, Forwarding o Despachante aparece acá durante {DIAS_PAPELERA} días y se puede restaurar con un clic.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {GRUPOS.map(g => {
            const items = data[g.key] || []
            if (!items.length) return null
            return (
              <section key={g.key}>
                <p style={{ fontSize: '0.62rem', fontWeight: 700, color: GRIS, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  {g.label} · {items.length}
                </p>
                <div style={{ borderTop: '1px solid #f1f5f9' }}>
                  {items.map(item => <Fila key={`${g.key}-${item.id}`} g={g} item={item} />)}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {!loading && !loadError && (
        <p style={{ fontSize: '0.7rem', color: GRIS, marginTop: '2rem' }}>
          Lo que lleva más de {DIAS_PAPELERA} días se elimina definitivamente.
        </p>
      )}

      <style>{`
        @keyframes ppl-spin { to { transform: rotate(360deg) } }
        @media (max-width: 560px) { .ppl-restan { display: none } }
      `}</style>
    </div>
  )
}
