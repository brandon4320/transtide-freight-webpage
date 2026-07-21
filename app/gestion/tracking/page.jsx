'use client'

import { Fragment, useState, useEffect, useMemo } from 'react'
import { gToast } from '../toast'
import FichaImportacion from '../ficha-importacion'
import { EmbarqueModal, AGENTES } from '../embarque-form'

const CARD = { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf1', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }
const INP = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '16px', color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const LBL = { display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#64748b', letterSpacing: 0, marginBottom: 5 }
const SEC = { fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.85rem', paddingBottom: '0.45rem', borderBottom: '1px solid #f1f5f9' }

// STATUSES y AGENTES viven en embarque-form (formulario compartido con Operaciones)
const agenteStyle = (a) => a === 'Yachao'
  ? { c: '#0284c7', bg: '#eff6ff', border: '#bfdbfe' }
  : a === 'Shaina'
    ? { c: '#0d9488', bg: '#f0fdfa', border: '#99f6e4' }
    : { c: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' } // Bruce

function statusStyle(raw) {
  const s = (raw || '').toLowerCase()
  if (/cancel/.test(s))                    return { c: '#dc2626', bg: '#fef2f2', border: '#fecaca', dot: '#dc2626' }
  if (/paid|pagad/.test(s))                return { c: '#065f46', bg: '#ecfdf5', border: '#a7f3d0', dot: '#059669' }
  if (/pending|pendiente/.test(s))         return { c: '#d97706', bg: '#fffbeb', border: '#fde68a', dot: '#d97706' }
  if (/deliver|entreg/.test(s))            return { c: '#059669', bg: '#f0fdf4', border: '#bbf7d0', dot: '#059669' }
  if (/transit|tránsito|transito/.test(s)) return { c: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', dot: '#2563eb' }
  if (/customs|aduana|arrived/.test(s))    return { c: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', dot: '#0891b2' }
  return { c: '#64748b', bg: '#f1f5f9', border: '#e2e8f0', dot: '#94a3b8' }
}

const blNorm = (b) => (b || '').replace(/[\s-]/g, '').toUpperCase()
const numUSD = (v) => { const n = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n }
const fmtUSD = (n) => 'USD ' + Math.round(n).toLocaleString('es-AR')
// Formatea un número calculado a string es-AR (sin separador de miles ambiguo para el parseo posterior).
const fmtCalc = (n) => { if (!isFinite(n)) return ''; const r = Math.round(n * 100) / 100; return r.toLocaleString('es-AR', { maximumFractionDigits: 2 }) }

// Tipo de cambio RMB→USD por defecto (editable por embarque). El agente cobra parte en RMB.
const TC_RMB_DEFAULT = 7
// Convierte los Other Fees en RMB a USD usando el TC del embarque (o el default).
const rmbToUsd = (rmb, tc) => { const r = numUSD(rmb); if (!r) return 0; const t = numUSD(tc) || TC_RMB_DEFAULT; return t > 0 ? r / t : 0 }

// ETA relativa: cuánto falta o cuánto hace que pasó (para escanear urgencias).
function etaInfo(eta) {
  if (!eta) return null
  const d = new Date(eta + 'T00:00:00')
  if (isNaN(d.getTime())) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (days < 0) return { rel: `hace ${-days}d`, tone: '#94a3b8' }
  if (days === 0) return { rel: 'hoy', tone: '#dc2626' }
  if (days <= 7) return { rel: `en ${days}d`, tone: '#d97706' }
  return { rel: `en ${days}d`, tone: '#94a3b8' }
}
const PRIMARY = '#0f172a'  // acento único (slate-900); el color de datos lo dan los estados


export default function TrackingPage({ devShips = null } = {}) {
  const [ships, setShips] = useState([])
  const [ops, setOps] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('todos')
  const [agenteFilter, setAgenteFilter] = useState('todos')
  const [modal, setModal] = useState(null)   // null | 'new' | shipObj
  const [confirmDel, setConfirmDel] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [sort, setSort] = useState({ key: 'num', dir: 'desc' })  // orden de la tabla
  const [ficha, setFicha] = useState(null)   // B/L abierto en la ficha integral

  const load = async () => {
    // Inyección de datos para preview de diseño (dev): evita auth/D1.
    if (devShips) { setShips(devShips); setOps([]); setLoading(false); return }
    setLoading(true)
    setLoadError(false)
    try {
      const [t, o] = await Promise.all([fetch('/api/tracking'), fetch('/api/db/operations')])
      if (!t.ok) throw new Error('tracking')
      const td = await t.json()
      setShips(td.shipments || [])
      if (o.ok) setOps(await o.json())
    } catch {
      setLoadError(true)
      gToast.error('No se pudieron cargar los embarques. Revisá tu conexión.')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])


  const opByBL = useMemo(() => {
    const m = {}; ops.forEach(o => { if (o.bl) m[blNorm(o.bl)] = o }); return m
  }, [ops])

  const filtered = useMemo(() => {
    let l = ships
    if (agenteFilter !== 'todos') l = l.filter(s => (s.agente || 'Bruce') === agenteFilter)
    if (query.trim()) {
      const q = query.toLowerCase()
      l = l.filter(s => [s.num, s.bl, s.origen, s.destino, s.carrier, s.contenedores, s.status, s.suppliers, s.agente].some(v => (v || '').toLowerCase().includes(q)))
    }
    if (filter === 'transito')  l = l.filter(s => /transit/i.test(s.status))
    if (filter === 'pendiente') l = l.filter(s => /pending|pendiente/i.test(s.status))
    if (filter === 'pagado')    l = l.filter(s => /paid/i.test(s.status))
    return l
  }, [ships, query, filter, agenteFilter])

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const key = sort.key
    const val = (s) => {
      if (key === 'eta' || key === 'etd') return s[key] || ''
      if (key === 'num') return parseInt(s.num, 10) || 0
      if (key === 'total') return numUSD(s.total_usd)
      if (key === 'saldo') return numUSD(s.balance_usd)
      return (s[key] || '').toString().toLowerCase()
    }
    return [...filtered].sort((a, b) => { const x = val(a), y = val(b); return x < y ? -1 * dir : x > y ? 1 * dir : 0 })
  }, [filtered, sort])

  const toggleSort = (key) => setSort(p => p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'num' || key === 'eta' ? 'desc' : 'asc' })

  const TH_BASE = { fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.6rem 0.7rem', borderBottom: '1px solid #e8ecf1', whiteSpace: 'nowrap', background: '#f8fafc', position: 'sticky', top: 0, zIndex: 3 }
  const sortTh = (label, k, align = 'left') => {
    const active = sort.key === k
    return (
      <th onClick={k ? () => toggleSort(k) : undefined} aria-sort={!k ? undefined : active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        style={{ ...TH_BASE, color: active ? '#475569' : '#94a3b8', textAlign: align, cursor: k ? 'pointer' : 'default', userSelect: 'none' }}>
        {label}{k && <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, color: '#64748b' }}>{active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>}
      </th>
    )
  }

  // Alertas del flujo: pago al agente pendiente tras el arribo (recordatorio
  // semanal hasta saldar) y tránsito interno a coordinar 1 semana antes del ETA.
  const alertas = useMemo(() => {
    const out = []
    const today = new Date(); today.setHours(0, 0, 0, 0)
    ships.forEach(s => {
      if (/cancel/i.test(s.status || '')) return
      const eta = s.eta ? new Date(s.eta + 'T00:00:00') : null
      const days = eta && !isNaN(eta.getTime()) ? Math.round((today.getTime() - eta.getTime()) / 86400000) : null // >0 = ya pasó
      const bal = numUSD(s.balance_usd)
      const arrived = /deliver|paid/i.test(s.status || '') || (days != null && days > 0)
      if (arrived && bal > 0 && (days == null || days >= 7)) {
        out.push({ tipo: 'pago', num: s.num, bl: s.bl, sem: days != null ? Math.floor(days / 7) : null, monto: bal, agente: s.agente || 'Bruce' })
      }
      if (!arrived && days != null && days >= -7 && days <= 0) {
        out.push({ tipo: 'transporte', num: s.num, bl: s.bl, dias: -days, destino: s.destino })
      }
    })
    return out.sort((a, b) => (a.tipo === 'transporte' ? 0 : 1) - (b.tipo === 'transporte' ? 0 : 1))
  }, [ships])

  const stats = useMemo(() => {
    const base = agenteFilter === 'todos' ? ships : ships.filter(s => (s.agente || 'Bruce') === agenteFilter)
    const transito = base.filter(s => /transit/i.test(s.status)).length
    const pendientePago = base.filter(s => /pending|pendiente/i.test(s.status)).length
    const saldoPagar = base.reduce((a, s) => a + numUSD(s.balance_usd), 0)
    return { total: base.length, transito, pendientePago, saldoPagar }
  }, [ships, agenteFilter])

  const openNew  = () => setModal('new')
  const openEdit = (s) => setModal(s)

  const del = async (id) => {
    try {
      const r = await fetch(`/api/tracking/${id}`, { method: 'DELETE' })
      if (!r.ok) { gToast.error(await errMsg(r, 'No se pudo eliminar el embarque.')); return }
      setShips(ships.filter(s => s.id !== id))
      gToast.success('Embarque eliminado.')
    } catch {
      gToast.error('Error de conexión. Intentá de nuevo.')
    } finally { setConfirmDel(null) }
  }


  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.2rem' }}>Tracking de contenedores</h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Resumen por agente — la carga de datos vive en cada operación · {ships.length} embarques</p>
        </div>
        <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 1.1rem', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo embarque
        </button>
      </div>

      {/* Alertas del flujo */}
      {alertas.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '0.65rem 0.95rem', marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.6rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
            Alertas · {alertas.length}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {alertas.slice(0, 6).map((a, i) => (
              <button key={i} onClick={() => a.bl && setFicha(a.bl)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '0.1rem 0', cursor: a.bl ? 'pointer' : 'default', textAlign: 'left', fontSize: '0.78rem', color: '#78350f' }}>
                {a.tipo === 'pago' ? (
                  <span>💸 <b>#{a.num}</b> arribó{a.sem != null ? ` hace ${a.sem} semana${a.sem === 1 ? '' : 's'}` : ''} — saldo <b>{fmtUSD(a.monto)}</b> a {a.agente}</span>
                ) : (
                  <span>🚚 <b>#{a.num}</b> llega {a.dias === 0 ? 'hoy' : `en ${a.dias} día${a.dias === 1 ? '' : 's'}`}{a.destino ? ` a ${a.destino}` : ''} — coordiná el transporte interno</span>
                )}
              </button>
            ))}
            {alertas.length > 6 && <p style={{ fontSize: '0.68rem', color: '#b45309' }}>+{alertas.length - 6} más</p>}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: '1rem' }} className="track-kpis">
        {[
          { lbl: 'Total embarques', val: stats.total, color: '#334155', dot: '#94a3b8' },
          { lbl: 'En tránsito', val: stats.transito, color: '#2563eb', dot: '#2563eb' },
          { lbl: 'Pendiente de pago', val: stats.pendientePago, color: '#d97706', dot: '#d97706' },
          { lbl: 'Saldo a pagar al agente', val: fmtUSD(stats.saldoPagar), color: '#dc2626', dot: '#dc2626' },
        ].map(k => (
          <div key={k.lbl} style={{ ...CARD, padding: '0.7rem 0.95rem' }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.56rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: k.dot, flex: '0 0 auto' }} />{k.lbl}
            </p>
            <p style={{ fontSize: '1.3rem', fontWeight: 800, color: k.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Selector de agente */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '0.85rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 2 }}>Agente</span>
        <div style={{ display: 'flex', gap: 3, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 3 }}>
          {['todos', ...AGENTES].map(a => {
            const sel = agenteFilter === a
            const st = a === 'todos' ? { c: '#fff', bg: PRIMARY } : agenteStyle(a)
            return (
              <button key={a} onClick={() => setAgenteFilter(a)} style={{
                padding: '0.32rem 0.75rem', borderRadius: 6, cursor: 'pointer', fontSize: '0.74rem', fontWeight: 600, border: 'none',
                background: sel ? (a === 'todos' ? PRIMARY : st.bg) : 'transparent',
                color: sel ? (a === 'todos' ? '#fff' : st.c) : '#64748b',
              }}>
                {a === 'todos' ? 'Todos' : a}{a === 'Yachao' ? ' · aéreo' : a === 'todos' ? '' : ' · marítimo'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar BL, carrier, origen, proveedor…" style={{ ...INP, paddingLeft: '2.2rem' }} />
        </div>
        <div style={{ display: 'flex', gap: 3, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 9, padding: 3 }}>
          {[['todos','Todos'],['transito','En tránsito'],['pendiente','Pend. pago'],['pagado','Pagados']].map(([id, lbl]) => (
            <button key={id} onClick={() => setFilter(id)} style={{ padding: '0.4rem 0.85rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600, background: filter === id ? '#0f172a' : 'transparent', color: filter === id ? '#fff' : '#64748b' }}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #e8ecf1', borderTopColor: PRIMARY, borderRadius: '50%', margin: '0 auto 1rem', animation: 'spin 0.8s linear infinite' }} />
          Cargando embarques…
        </div>
      ) : loadError ? (
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.3rem', color: '#b91c1c' }}>No se pudieron cargar los embarques</p>
          <p style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>Puede ser un problema de conexión.</p>
          <button onClick={load} style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Reintentar</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Sin embarques que coincidan.</div>
      ) : (
        <div style={{ ...CARD }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.8rem' }}>
            <thead>
              <tr>
                {sortTh('#', 'num')}
                {sortTh('Embarque', 'origen')}
                {sortTh('Cont.', null)}
                {sortTh('ETA', 'eta')}
                {sortTh('Estado', 'status')}
                {sortTh('Total', 'total', 'right')}
                {sortTh('Saldo', 'saldo', 'right')}
                <th style={{ ...TH_BASE, width: 1 }} aria-label="Acciones"></th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const groups = []
                sorted.forEach(s => { const k = s.agente || 'Bruce'; let g = groups.find(x => x.key === k); if (!g) { g = { key: k, items: [] }; groups.push(g) } g.items.push(s) })
                const multi = agenteFilter === 'todos' && groups.length > 1
                return groups.map(g => (
                  <Fragment key={'ag-' + g.key}>
                    {multi && (() => { const a = agenteStyle(g.key); const tot = g.items.reduce((x, r) => x + numUSD(r.total_usd), 0); const sal = g.items.reduce((x, r) => x + numUSD(r.balance_usd), 0); return (
                      <tr style={{ background: '#eef2f7' }}>
                        <td colSpan={8} style={{ padding: '0.45rem 0.7rem', borderBottom: '1px solid #e2e8f0' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.64rem', fontWeight: 800, color: a.c, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.c }} />{g.key}
                            </span>
                            <span style={{ fontSize: '0.66rem', color: '#94a3b8', fontWeight: 600 }}>{g.items.length} embarque{g.items.length === 1 ? '' : 's'}</span>
                            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#64748b', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>Total {fmtUSD(tot)}</span>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: sal > 0 ? '#dc2626' : '#16a34a' }}>{sal > 0 ? 'Le debés ' + fmtUSD(sal) : 'Saldado ✓'}</span>
                          </span>
                        </td>
                      </tr>
                    ) })()}
                    {g.items.map(s => {
                const st = statusStyle(s.status)
                const op = opByBL[blNorm(s.bl)]
                const bal = numUSD(s.balance_usd)
                const ag = s.agente || 'Bruce'; const a = agenteStyle(ag)
                const eta = etaInfo(s.eta)
                const TD = { padding: '0.5rem 0.7rem', borderBottom: '1px solid #eef2f7', verticalAlign: 'middle' }
                return (
                  <tr key={s.id} className="track-row" style={{ cursor: 'pointer', background: st.bg, transition: 'filter .12s' }} onClick={() => s.bl ? setFicha({ bl: s.bl, ship: s }) : openEdit(s)}>
                    <td style={{ ...TD, color: '#475569', fontWeight: 700, fontVariantNumeric: 'tabular-nums', boxShadow: `inset 4px 0 0 ${st.dot}`, whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <span title={`Agente: ${ag}`} style={{ width: 7, height: 7, borderRadius: '50%', background: a.c, flex: '0 0 auto' }} />
                        {s.num || '—'}
                      </span>
                    </td>
                    <td style={{ ...TD, minWidth: 240 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#1e293b' }}>
                        <span>{s.origen || '—'}</span>
                        <span style={{ color: '#cbd5e1' }}>→</span>
                        <span style={{ color: '#475569' }}>{s.destino || '—'}</span>
                        {s.carrier && <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#64748b', background: '#eef2f7', borderRadius: 4, padding: '0.05rem 0.35rem' }}>{s.carrier}</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: '0.66rem', color: '#94a3b8', maxWidth: 340 }}>
                        {s.bl && <span style={{ fontFamily: 'ui-monospace,monospace', flex: '0 0 auto', color: '#64748b' }}>{s.bl}</span>}
                        {s.suppliers && <span title={s.suppliers} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {s.suppliers}</span>}
                      </div>
                    </td>
                    <td style={{ ...TD, color: '#475569', whiteSpace: 'nowrap', fontSize: '0.74rem' }}>{s.contenedores || '—'}</td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                      {s.eta ? (
                        <div>
                          <div style={{ color: '#334155', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{s.eta}</div>
                          {eta && <div style={{ fontSize: '0.62rem', color: eta.tone, fontWeight: 600 }}>{eta.rel}</div>}
                        </div>
                      ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ ...TD }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fff', color: st.c, border: `1px solid ${st.border}`, fontSize: '0.64rem', fontWeight: 600, padding: '0.18rem 0.5rem', borderRadius: 6, whiteSpace: 'nowrap' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />{s.status || '—'}
                      </span>
                    </td>
                    <td style={{ ...TD, textAlign: 'right', color: '#0f172a', fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {s.total_usd ? <>USD {s.total_usd}</> : <span style={{ color: '#cbd5e1' }}>—</span>}
                      {numUSD(s.other_fees_rmb) > 0 && (
                        <span title={`Incluye ¥${s.other_fees_rmb} RMB (≈ USD ${fmtCalc(rmbToUsd(s.other_fees_rmb, s.tc_rmb))})`} style={{ marginLeft: 5, fontSize: '0.58rem', fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '0.05rem 0.3rem' }}>¥</span>
                      )}
                    </td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: bal > 0 ? '#dc2626' : '#16a34a' }}>
                      {bal > 0 ? <>USD {s.balance_usd}</> : '✓'}
                    </td>
                    <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                      <div className="track-actions" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {op && (
                          <button onClick={() => { window.location.href = `/gestion/operaciones?op=${encodeURIComponent(op.id)}` }} title={`Operación: ${op.nombre || ''}`} aria-label="Abrir operación" style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#059669', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
                          </button>
                        )}
                        <button onClick={() => openEdit(s)} title="Editar" aria-label={`Editar embarque ${s.num || ''}`} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={() => setConfirmDel(s.id)} title="Eliminar" aria-label={`Eliminar embarque ${s.num || ''}`} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #fee2e2', background: '#fff', color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
                    })}
                  </Fragment>
                ))
              })()}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit / new modal — formulario compartido con Operaciones */}
      {modal !== null && (
        <EmbarqueModal
          initial={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={() => setConfirmDel(null)}>
          <div style={{ ...CARD, maxWidth: 340, padding: '1.75rem', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>¿Eliminar embarque?</p>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1.25rem' }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => setConfirmDel(null)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => del(confirmDel)} style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {ficha && <FichaImportacion bl={ficha.bl} seed={{ ship: ficha.ship }} onClose={() => setFicha(null)} onChanged={load} />}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
