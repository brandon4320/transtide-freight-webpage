'use client'

import { useState, useEffect, useMemo } from 'react'
import { gToast } from '../toast'

const CARD = { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf1', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }
const INP = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '16px', color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const LBL = { display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#64748b', letterSpacing: 0, marginBottom: 5 }
const SEC = { fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.85rem', paddingBottom: '0.45rem', borderBottom: '1px solid #f1f5f9' }

const STATUSES = ['In Transit', 'Delivered - Payment Pending', 'Delivered - Paid', 'Cancelled', 'Booked', 'Customs']
const AGENTES = ['Bruce', 'Yachao']
const agenteStyle = (a) => a === 'Yachao'
  ? { c: '#0284c7', bg: '#eff6ff', border: '#bfdbfe' }
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
const EMPTY = { num: '', agente: 'Bruce', origen: '', destino: '', contenedores: '', modo: '', bl: '', carrier: '', etd: '', eta: '', status: 'In Transit', sea_freight_usd: '', other_fees_rmb: '', tc_rmb: '', other_fees_usd: '', discount_usd: '', total_usd: '', suppliers: '', amount_due_usd: '', amount_rec_usd: '', balance_usd: '', payment_date: '', notes: '' }
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

// Chip auto/manual para campos calculados.
function CalcChip({ auto, onToggle }) {
  return (
    <button type="button" onClick={onToggle}
      title={auto ? 'Calculado automáticamente — tocá para editar manual' : 'Manual — tocá para volver a automático'}
      style={{
        marginLeft: 6, fontSize: '0.54rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
        padding: '0.05rem 0.4rem', borderRadius: 5, cursor: 'pointer', verticalAlign: 'middle',
        border: `1px solid ${auto ? '#bfdbfe' : '#fed7aa'}`, background: auto ? '#eff6ff' : '#fff7ed', color: auto ? '#1e40af' : '#c2410c',
      }}>
      {auto ? 'auto' : 'manual'}
    </button>
  )
}

export default function TrackingPage({ devShips = null } = {}) {
  const [ships, setShips] = useState([])
  const [ops, setOps] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('todos')
  const [agenteFilter, setAgenteFilter] = useState('todos')
  const [modal, setModal] = useState(null)   // null | 'new' | shipObj
  const [form, setForm] = useState(EMPTY)
  const [confirmDel, setConfirmDel] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [totalAuto, setTotalAuto] = useState(true)  // Total = flete + otros - descuento
  const [balAuto, setBalAuto] = useState(true)       // Saldo = a pagar - pagado
  const [sort, setSort] = useState({ key: 'num', dir: 'desc' })  // orden de la tabla

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

  // Autocálculo de Total y Saldo (a menos que el usuario los ponga en manual).
  // Total = flete + otros (USD) + otros (RMB→USD) − descuento.
  useEffect(() => {
    if (modal === null || !totalAuto) return
    const v = fmtCalc(numUSD(form.sea_freight_usd) + numUSD(form.other_fees_usd) + rmbToUsd(form.other_fees_rmb, form.tc_rmb) - numUSD(form.discount_usd))
    setForm(p => p.total_usd === v ? p : ({ ...p, total_usd: v }))
  }, [form.sea_freight_usd, form.other_fees_usd, form.other_fees_rmb, form.tc_rmb, form.discount_usd, totalAuto, modal])

  useEffect(() => {
    if (modal === null || !balAuto) return
    const v = fmtCalc(numUSD(form.amount_due_usd) - numUSD(form.amount_rec_usd))
    setForm(p => p.balance_usd === v ? p : ({ ...p, balance_usd: v }))
  }, [form.amount_due_usd, form.amount_rec_usd, balAuto, modal])

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

  const stats = useMemo(() => {
    const base = agenteFilter === 'todos' ? ships : ships.filter(s => (s.agente || 'Bruce') === agenteFilter)
    const transito = base.filter(s => /transit/i.test(s.status)).length
    const pendientePago = base.filter(s => /pending|pendiente/i.test(s.status)).length
    const saldoPagar = base.reduce((a, s) => a + numUSD(s.balance_usd), 0)
    return { total: base.length, transito, pendientePago, saldoPagar }
  }, [ships, agenteFilter])

  const openNew  = () => { setForm({ ...EMPTY }); setTotalAuto(true); setBalAuto(true); setModal('new') }
  const openEdit = (s) => {
    setForm({ ...EMPTY, ...s })
    // Si el valor guardado coincide con el cálculo (o está vacío), queda en modo auto; si no, respetamos el manual.
    const calcT = fmtCalc(numUSD(s.sea_freight_usd) + numUSD(s.other_fees_usd) + rmbToUsd(s.other_fees_rmb, s.tc_rmb) - numUSD(s.discount_usd))
    const calcB = fmtCalc(numUSD(s.amount_due_usd) - numUSD(s.amount_rec_usd))
    setTotalAuto(!s.total_usd || String(s.total_usd) === calcT)
    setBalAuto(!s.balance_usd || String(s.balance_usd) === calcB)
    setModal(s)
  }

  async function errMsg(r, fallback) {
    try { const j = await r.json(); return j?.error || fallback } catch { return fallback }
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      if (modal === 'new') {
        const r = await fetch('/api/tracking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        if (!r.ok) { gToast.error(await errMsg(r, 'No se pudo crear el embarque.')); return }
        const created = await r.json(); setShips([created, ...ships])
        gToast.success('Embarque creado.')
      } else {
        const r = await fetch(`/api/tracking/${modal.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        if (!r.ok) { gToast.error(await errMsg(r, 'No se pudieron guardar los cambios.')); return }
        setShips(ships.map(s => s.id === modal.id ? { ...s, ...form } : s))
        gToast.success('Embarque actualizado.')
      }
      setModal(null)
    } catch {
      gToast.error('Error de conexión. Intentá de nuevo.')
    } finally { setSaving(false) }
  }
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

  const upd = (f, v) => setForm(p => ({ ...p, [f]: v }))

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.2rem' }}>Tracking de contenedores</h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Costos que pagás a tu agente de carga · {ships.length} embarques</p>
        </div>
        <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 1.1rem', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo embarque
        </button>
      </div>

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
                {a === 'todos' ? 'Todos' : a}{a === 'Bruce' ? ' · marítimo' : a === 'Yachao' ? ' · aéreo' : ''}
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
              {sorted.map(s => {
                const st = statusStyle(s.status)
                const op = opByBL[blNorm(s.bl)]
                const bal = numUSD(s.balance_usd)
                const ag = s.agente || 'Bruce'; const a = agenteStyle(ag)
                const eta = etaInfo(s.eta)
                const TD = { padding: '0.5rem 0.7rem', borderBottom: '1px solid #eef2f7', verticalAlign: 'middle' }
                return (
                  <tr key={s.id} className="track-row" style={{ cursor: 'pointer', background: st.bg, transition: 'filter .12s' }} onClick={() => openEdit(s)}>
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
            </tbody>
          </table>
        </div>
      )}

      {/* Edit / new modal */}
      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setModal(null)}>
          <div style={{ ...CARD, width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{modal === 'new' ? 'Nuevo embarque' : `Embarque #${form.num || ''}`}</h3>
                {modal !== 'new' && form.status && (() => { const st = statusStyle(form.status); return (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fff', color: st.c, border: `1px solid ${st.border}`, fontSize: '0.64rem', fontWeight: 600, padding: '0.18rem 0.5rem', borderRadius: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />{form.status}
                  </span>
                )})()}
              </div>
              <button onClick={() => setModal(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <p style={SEC}>Logística</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: '1.25rem' }}>
              <div><label style={LBL}>N°</label><input value={form.num} onChange={e => upd('num', e.target.value)} style={INP} /></div>
              <div><label style={LBL}>Agente de carga</label>
                <select value={form.agente || 'Bruce'} onChange={e => upd('agente', e.target.value)} style={{ ...INP, cursor: 'pointer' }}>
                  {AGENTES.map(a => <option key={a} value={a}>{a}{a === 'Bruce' ? ' (marítimo)' : a === 'Yachao' ? ' (aéreo)' : ''}</option>)}
                  {form.agente && !AGENTES.includes(form.agente) && <option value={form.agente}>{form.agente}</option>}
                </select>
              </div>
              <div><label style={LBL}>Origen</label><input value={form.origen} onChange={e => upd('origen', e.target.value)} style={INP} /></div>
              <div><label style={LBL}>Destino</label><input value={form.destino} onChange={e => upd('destino', e.target.value)} style={INP} /></div>
              <div><label style={LBL}>Contenedores</label><input value={form.contenedores} onChange={e => upd('contenedores', e.target.value)} style={INP} placeholder="1×40HQ" /></div>
              <div><label style={LBL}>Modo</label><input value={form.modo} onChange={e => upd('modo', e.target.value)} style={INP} placeholder="FOB / EXW" /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={LBL}>B/L Number</label><input value={form.bl} onChange={e => upd('bl', e.target.value)} style={{ ...INP, fontFamily: 'ui-monospace,monospace' }} /></div>
              <div><label style={LBL}>Carrier</label><input value={form.carrier} onChange={e => upd('carrier', e.target.value)} style={INP} placeholder="MSK / COSCO" /></div>
              <div><label style={LBL}>Zarpe (ETD)</label><input type="date" value={form.etd} onChange={e => upd('etd', e.target.value)} style={INP} /></div>
              <div><label style={LBL}>ETA</label><input type="date" value={form.eta} onChange={e => upd('eta', e.target.value)} style={INP} /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={LBL}>Estado</label>
                <select value={form.status} onChange={e => upd('status', e.target.value)} style={{ ...INP, cursor: 'pointer' }}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  {form.status && !STATUSES.includes(form.status) && <option value={form.status}>{form.status}</option>}
                </select>
              </div>
            </div>

            <p style={SEC}>Costos del agente</p>
            <div className="track-cost-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.25rem' }}>

              {/* Panel 1 — build-up del costo → Total */}
              <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 10, padding: '0.9rem 1rem' }}>
                <p style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: '0.75rem' }}>Lo que pagás al agente</p>
                <div><label style={LBL}>Flete marítimo (USD)</label><input value={form.sea_freight_usd} onChange={e => upd('sea_freight_usd', e.target.value)} inputMode="decimal" style={{ ...INP, marginBottom: '0.6rem' }} placeholder="0" /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8 }}>
                  <div><label style={LBL}>Otros fees (RMB)</label><input value={form.other_fees_rmb} onChange={e => upd('other_fees_rmb', e.target.value)} inputMode="decimal" style={INP} placeholder="¥ 0" /></div>
                  <div><label style={LBL}>TC RMB→USD</label><input value={form.tc_rmb} onChange={e => upd('tc_rmb', e.target.value)} inputMode="decimal" style={INP} placeholder={String(TC_RMB_DEFAULT)} /></div>
                </div>
                {numUSD(form.other_fees_rmb) > 0
                  ? <p style={{ fontSize: '0.64rem', color: '#0284c7', fontWeight: 600, margin: '3px 0 0.6rem' }}>≈ USD {fmtCalc(rmbToUsd(form.other_fees_rmb, form.tc_rmb))} convertidos</p>
                  : <div style={{ height: '0.6rem' }} />}
                <div><label style={LBL}>Otros fees (USD)</label><input value={form.other_fees_usd} onChange={e => upd('other_fees_usd', e.target.value)} inputMode="decimal" style={{ ...INP, marginBottom: '0.6rem' }} placeholder="0" /></div>
                <div><label style={LBL}>Descuento (USD)</label><input value={form.discount_usd} onChange={e => upd('discount_usd', e.target.value)} inputMode="decimal" style={INP} placeholder="0" /></div>
                <div style={{ borderTop: '1px solid #f1f5f9', margin: '0.85rem 0 0.65rem' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', display: 'inline-flex', alignItems: 'center' }}>Total <CalcChip auto={totalAuto} onToggle={() => setTotalAuto(a => !a)} /></label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>USD</span>
                    <input value={form.total_usd} onChange={e => { setTotalAuto(false); upd('total_usd', e.target.value) }} readOnly={totalAuto} inputMode="decimal"
                      title={totalAuto ? 'Calculado: flete + otros USD + otros RMB convertidos − descuento' : 'Ingreso manual'}
                      style={{ ...INP, width: 130, textAlign: 'right', fontWeight: 800, fontSize: '0.95rem', fontVariantNumeric: 'tabular-nums', background: totalAuto ? '#f8fafc' : '#fff', color: totalAuto ? '#334155' : '#0f172a' }} />
                  </div>
                </div>
              </div>

              {/* Panel 2 — pago al agente → Saldo */}
              <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 10, padding: '0.9rem 1rem' }}>
                <p style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: '0.75rem' }}>Pago al agente</p>
                <div><label style={LBL}>A pagar (USD)</label><input value={form.amount_due_usd} onChange={e => upd('amount_due_usd', e.target.value)} inputMode="decimal" style={{ ...INP, marginBottom: '0.6rem' }} placeholder="0" /></div>
                <div><label style={LBL}>Pagado (USD)</label><input value={form.amount_rec_usd} onChange={e => upd('amount_rec_usd', e.target.value)} inputMode="decimal" style={INP} placeholder="0" /></div>
                <div style={{ borderTop: '1px solid #f1f5f9', margin: '0.85rem 0 0.65rem' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', display: 'inline-flex', alignItems: 'center' }}>Saldo <CalcChip auto={balAuto} onToggle={() => setBalAuto(a => !a)} /></label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>USD</span>
                    <input value={form.balance_usd} onChange={e => { setBalAuto(false); upd('balance_usd', e.target.value) }} readOnly={balAuto} inputMode="decimal"
                      title={balAuto ? 'Calculado: a pagar − pagado' : 'Ingreso manual'}
                      style={{ ...INP, width: 130, textAlign: 'right', fontWeight: 800, fontSize: '0.95rem', fontVariantNumeric: 'tabular-nums', background: balAuto ? '#f8fafc' : '#fff', color: numUSD(form.balance_usd) > 0 ? '#dc2626' : (balAuto ? '#334155' : '#0f172a') }} />
                  </div>
                </div>
                {numUSD(form.balance_usd) <= 0 && numUSD(form.amount_due_usd) > 0
                  ? <p style={{ fontSize: '0.66rem', color: '#16a34a', fontWeight: 700, margin: '0.5rem 0 0' }}>✓ Saldado</p>
                  : null}
                <div style={{ marginTop: '0.7rem' }}><label style={LBL}>Fecha de pago</label><input type="date" value={form.payment_date} onChange={e => upd('payment_date', e.target.value)} style={INP} /></div>
              </div>
            </div>

            <p style={SEC}>Proveedores y notas</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1.5rem' }}>
              <div><label style={LBL}>Proveedores</label><textarea value={form.suppliers} onChange={e => upd('suppliers', e.target.value)} style={{ ...INP, minHeight: 56, resize: 'vertical' }} /></div>
              <div><label style={LBL}>Notas</label><textarea value={form.notes} onChange={e => upd('notes', e.target.value)} style={{ ...INP, minHeight: 56, resize: 'vertical' }} /></div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setModal(null)} style={{ padding: '0.55rem 1.1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={save} disabled={saving} style={{ padding: '0.55rem 1.3rem', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Guardando…' : (modal === 'new' ? 'Crear embarque' : 'Guardar cambios')}</button>
            </div>
          </div>
        </div>
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
