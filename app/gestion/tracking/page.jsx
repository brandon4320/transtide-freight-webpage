'use client'

import { useState, useEffect, useMemo } from 'react'

const CARD = { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf1', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }

// Colores por estado (matchea los del tracker del agente)
function statusStyle(raw) {
  const s = (raw || '').toLowerCase()
  if (/cancel/.test(s))                return { c: '#dc2626', bg: '#fef2f2', border: '#fecaca', dot: '#dc2626' }
  if (/paid|pagad/.test(s))            return { c: '#065f46', bg: '#ecfdf5', border: '#a7f3d0', dot: '#059669' }
  if (/deliver|entreg/.test(s))        return { c: '#059669', bg: '#f0fdf4', border: '#bbf7d0', dot: '#059669' }
  if (/transit|tránsito|transito/.test(s)) return { c: '#ea580c', bg: '#fff4ee', border: '#fed7aa', dot: '#ea580c' }
  if (/pending|pendiente|hold/.test(s))    return { c: '#d97706', bg: '#fffbeb', border: '#fde68a', dot: '#d97706' }
  if (/customs|aduana|arrived|arrib/.test(s)) return { c: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', dot: '#0891b2' }
  return { c: '#64748b', bg: '#f1f5f9', border: '#e2e8f0', dot: '#94a3b8' }
}

const blNorm = (b) => (b || '').replace(/[\s-]/g, '').toUpperCase()

export default function TrackingPage() {
  const [shipments, setShipments] = useState([])
  const [ops, setOps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('todos') // todos | transito | entregado | match

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const [tRes, oRes] = await Promise.all([
        fetch('/api/tracking'),
        fetch('/api/db/operations'),
      ])
      if (!tRes.ok) throw new Error((await tRes.json()).error || 'Error al leer la planilla')
      const tData = await tRes.json()
      setShipments(tData.shipments || [])
      if (oRes.ok) setOps(await oRes.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  // mapa BL → operación, para mostrar el match
  const opByBL = useMemo(() => {
    const m = {}
    ops.forEach(o => { if (o.bl) m[blNorm(o.bl)] = o })
    return m
  }, [ops])

  const filtered = useMemo(() => {
    let list = shipments
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(s =>
        [s.bl, s.origen, s.destino, s.carrier, s.contenedores, s.status, s.proveedor]
          .some(v => (v || '').toLowerCase().includes(q))
      )
    }
    if (filter === 'transito')  list = list.filter(s => /transit|tránsito|transito/i.test(s.status))
    if (filter === 'entregado') list = list.filter(s => /deliver|entreg|paid/i.test(s.status))
    if (filter === 'match')     list = list.filter(s => opByBL[s.blNorm || blNorm(s.bl)])
    return list
  }, [shipments, query, filter, opByBL])

  const matchCount = shipments.filter(s => opByBL[s.blNorm || blNorm(s.bl)]).length

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.2rem' }}>Tracking de contenedores</h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
            En vivo desde la planilla del agente de carga · {shipments.length} embarques
            {matchCount > 0 && <span style={{ color: '#059669', fontWeight: 600 }}> · {matchCount} vinculados a operaciones</span>}
          </p>
        </div>
        <button onClick={load} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: '0.8rem', cursor: loading ? 'wait' : 'pointer' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: loading ? 'spin 0.9s linear infinite' : 'none' }}>
            <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar BL, carrier, origen, proveedor…"
            style={{ width: '100%', padding: '0.55rem 0.75rem 0.55rem 2.2rem', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '16px', color: '#0f172a', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 3, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 9, padding: 3 }}>
          {[['todos','Todos'],['transito','En tránsito'],['entregado','Entregados'],['match','Vinculados']].map(([id, lbl]) => (
            <button key={id} onClick={() => setFilter(id)} style={{ padding: '0.4rem 0.85rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600, background: filter === id ? '#0f172a' : 'transparent', color: filter === id ? '#fff' : '#64748b' }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #e8ecf1', borderTopColor: '#ea580c', borderRadius: '50%', margin: '0 auto 1rem', animation: 'spin 0.8s linear infinite' }} />
          Leyendo planilla del agente…
        </div>
      ) : error ? (
        <div style={{ ...CARD, padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: '#dc2626', fontWeight: 600, marginBottom: 8 }}>No se pudo cargar el tracking</p>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: 16 }}>{error}</p>
          <button onClick={load} style={{ padding: '0.5rem 1.1rem', borderRadius: 8, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Reintentar</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Sin embarques que coincidan con el filtro.</div>
      ) : (
        <div style={{ ...CARD, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['#','Ruta','Contenedores','Modo','B/L','Carrier','Zarpe','ETA','Estado','Operación'].map(h => (
                    <th key={h} style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.65rem 0.7rem', textAlign: 'left', borderBottom: '1px solid #e8ecf1', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const st = statusStyle(s.status)
                  const op = opByBL[s.blNorm || blNorm(s.bl)]
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: op ? '#fafffe' : 'transparent' }}>
                      <td style={{ padding: '0.6rem 0.7rem', color: '#94a3b8', fontWeight: 600 }}>{s.id}</td>
                      <td style={{ padding: '0.6rem 0.7rem', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{s.origen || '—'}</span>
                        <span style={{ color: '#cbd5e1', margin: '0 5px' }}>→</span>
                        <span style={{ color: '#475569' }}>{s.destino || '—'}</span>
                      </td>
                      <td style={{ padding: '0.6rem 0.7rem', color: '#475569', whiteSpace: 'nowrap' }}>{s.contenedores || '—'}</td>
                      <td style={{ padding: '0.6rem 0.7rem', color: '#64748b' }}>{s.modo || '—'}</td>
                      <td style={{ padding: '0.6rem 0.7rem', fontFamily: 'ui-monospace,monospace', fontSize: '0.74rem', color: '#475569', whiteSpace: 'nowrap' }}>{s.bl || '—'}</td>
                      <td style={{ padding: '0.6rem 0.7rem', color: '#475569' }}>{s.carrier || '—'}</td>
                      <td style={{ padding: '0.6rem 0.7rem', color: '#64748b', whiteSpace: 'nowrap' }}>{s.etd || '—'}</td>
                      <td style={{ padding: '0.6rem 0.7rem', color: s.eta ? '#059669' : '#cbd5e1', fontWeight: 600, whiteSpace: 'nowrap' }}>{s.eta || '—'}</td>
                      <td style={{ padding: '0.6rem 0.7rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: st.bg, color: st.c, border: `1px solid ${st.border}`, fontSize: '0.68rem', fontWeight: 600, padding: '0.15rem 0.55rem', borderRadius: 5, whiteSpace: 'nowrap' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
                          {s.status || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '0.6rem 0.7rem', whiteSpace: 'nowrap' }}>
                        {op ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#059669', fontSize: '0.72rem', fontWeight: 600 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            {op.nombre?.length > 22 ? op.nombre.slice(0, 22) + '…' : op.nombre}
                          </span>
                        ) : (
                          <span style={{ color: '#cbd5e1', fontSize: '0.72rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
