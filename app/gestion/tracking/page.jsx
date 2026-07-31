'use client'

import { Fragment, useState, useEffect, useMemo } from 'react'
import { gToast } from '../toast'
import FichaImportacion from '../ficha-importacion'
import { EmbarqueModal, AGENTES } from '../embarque-form'
import { importFlowState, MiniFlow } from '../flujo-importacion'
import { METODOS_PAGO, METODO_DEFAULT_AGENTE, metodoLabel } from '../pagos-metodos'

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



export default function TrackingPage({ devShips = null, devOps = null, devDesps = null } = {}) {
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
  const [desps, setDesps] = useState([])     // despachos (estado de aduana por fila)
  const [hechas, setHechas] = useState(() => new Set())  // akeys de alertas ya resueltas
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [pagoModal, setPagoModal] = useState(null) // registrar pago al forwarder
  const [pagoBusy, setPagoBusy] = useState(false)
  const [expandId, setExpandId] = useState(null)   // embarque con historial abierto
  const [histPagos, setHistPagos] = useState({})
  // Último método usado con cada agente → precarga el modal (Bruce siempre USA).
  const [ultMetodo, setUltMetodo] = useState({})

  const load = async () => {
    // Inyección de datos para preview de diseño (dev): evita auth/D1.
    if (devShips) { setShips(devShips); setOps(devOps || []); setDesps(devDesps || []); setLoading(false); return }
    setLoading(true)
    setLoadError(false)
    try {
      const [t, o, d] = await Promise.all([fetch('/api/tracking'), fetch('/api/db/operations'), fetch('/api/db/despachante')])
      if (!t.ok) throw new Error('tracking')
      const td = await t.json()
      const shipments = td.shipments || []
      setShips(shipments)
      if (o.ok) setOps(await o.json())
      if (d.ok) { const dd = await d.json(); setDesps(Array.isArray(dd) ? dd : []) }
      fetch('/api/db/alertas').then(x => x.ok ? x.json() : []).then(arr => { if (Array.isArray(arr)) setHechas(new Set(arr)) }).catch(() => {})
      // Método habitual por agente: el ledger viene ordenado del más nuevo al
      // más viejo, así que la primera aparición de cada agente es la última vez.
      fetch('/api/db/pagos').then(x => x.ok ? x.json() : []).then(arr => {
        if (!Array.isArray(arr)) return
        const byId = {}; shipments.forEach(s => { byId[String(s.id)] = s.agente || 'Bruce' })
        const m = {}
        arr.forEach(p => {
          if (p.scope !== 'agente' || !p.metodo) return
          const ag = byId[String(p.ref_id)]
          if (ag && !m[ag]) m[ag] = p.metodo
        })
        setUltMetodo(m)
      }).catch(() => {})
    } catch {
      setLoadError(true)
      gToast.error('No se pudieron cargar los embarques. Revisá tu conexión.')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])


  // Agentes para el filtro: los conocidos + cualquier forwarder usado en embarques.
  const agentesFiltro = useMemo(() => {
    const set = new Set(AGENTES)
    ships.forEach(x => { if (x.agente) set.add(x.agente) })
    return [...set]
  }, [ships])

  const despByBL = useMemo(() => {
    const m = {}; desps.forEach(d => { if (d.bl) m[blNorm(d.bl)] = d }); return m
  }, [desps])

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

  // Alertas del flujo (todas derivadas; los días son ajustables acá):
  //  naviera D-5 · transporte D-7 · sin liberar +5d · despacho sin cargar +7d ·
  //  pago agente semanal post-arribo.
  const alertas = useMemo(() => {
    const out = []
    const today = new Date(); today.setHours(0, 0, 0, 0)
    ships.forEach(s => {
      if (/cancel/i.test(s.status || '')) return
      const eta = s.eta ? new Date(s.eta + 'T00:00:00') : null
      const days = eta && !isNaN(eta.getTime()) ? Math.round((today.getTime() - eta.getTime()) / 86400000) : null // >0 = ya pasó
      const bal = numUSD(s.balance_usd)
      const entregada = /deliver|paid/i.test(s.status || '')
      const arrived = entregada || (days != null && days > 0)
      const op = opByBL[blNorm(s.bl)]
      const liberada = entregada || (op && ['Listo p/ retiro', 'En tránsito local', 'Entregado', 'Liquidado'].includes(op.estado))
      const desp = despByBL[blNorm(s.bl)]

      // Agentes de China (Bruce/Shaina marítimo, Yachao aéreo): pedir la
      // liberación del BL desde origen ~1 semana antes del arribo.
      if (!arrived && AGENTES.includes(s.agente) && days != null && days >= -7 && days <= 0 && !liberada) {
        out.push({ w: -1, tipo: 'bl_china', num: s.num, bl: s.bl, dias: -days, agente: s.agente })
      }
      if (!arrived && days != null && days >= -5 && days <= 0 && !liberada) {
        out.push({ w: 0, tipo: 'naviera', num: s.num, bl: s.bl, dias: -days })
      }
      if (!arrived && days != null && days >= -7 && days <= 0) {
        out.push({ w: 1, tipo: 'transporte', num: s.num, bl: s.bl, dias: -days, destino: s.destino })
      }
      if (arrived && days != null && days >= 5 && !liberada) {
        out.push({ w: 2, tipo: 'liberar', num: s.num, bl: s.bl, dias: days })
      }
      if (arrived && days != null && days >= 7 && !desp) {
        out.push({ w: 3, tipo: 'despacho', num: s.num, bl: s.bl, sem: Math.floor(days / 7) })
      }
      if (arrived && bal > 0 && (days == null || days >= 7)) {
        out.push({ w: 4, tipo: 'pago', num: s.num, bl: s.bl, sem: days != null ? Math.floor(days / 7) : null, monto: bal, agente: s.agente || 'Bruce' })
      }
    })
    out.forEach(a => { a.key = blNorm(a.bl) + '|' + a.tipo })
    return out.sort((a, b) => a.w - b.w)
  }, [ships, opByBL, despByBL])

  const alertasVis = useMemo(() => alertas.filter(a => !hechas.has(a.key)), [alertas, hechas])

  // Marcar/desmarcar una alerta como hecha (optimista + persistido en D1).
  const toggleHecha = async (a, done = true) => {
    setHechas(prev => { const n = new Set(prev); done ? n.add(a.key) : n.delete(a.key); return n })
    try { await fetch('/api/db/alertas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ akey: a.key, undo: !done }) }) } catch {}
  }

  // Texto de cada alerta (una sola fuente para el panel).
  const alertText = (a) => {
    if (a.tipo === 'bl_china') return <>📄 <b>#{a.num}</b> llega {a.dias === 0 ? 'hoy' : `en ${a.dias} día${a.dias === 1 ? '' : 's'}`} — pedile a {a.agente} la liberación del B/L desde China</>
    if (a.tipo === 'naviera') return <>⚓ <b>#{a.num}</b> llega {a.dias === 0 ? 'hoy' : `en ${a.dias} día${a.dias === 1 ? '' : 's'}`} — pagá naviera/terminal para liberar el contenedor a tiempo</>
    if (a.tipo === 'transporte') return <>🚚 <b>#{a.num}</b> llega {a.dias === 0 ? 'hoy' : `en ${a.dias} día${a.dias === 1 ? '' : 's'}`}{a.destino ? ` a ${a.destino}` : ''} — coordiná el transporte interno</>
    if (a.tipo === 'liberar') return <>🕐 <b>#{a.num}</b> arribó hace {a.dias} días y sigue sin liberar — riesgo de demoras/almacenaje</>
    if (a.tipo === 'despacho') return <>📦 <b>#{a.num}</b> arribó hace {a.sem} semana{a.sem === 1 ? '' : 's'} — cargá el despacho del despachante</>
    return <>💸 <b>#{a.num}</b> arribó{a.sem != null ? ` hace ${a.sem} semana${a.sem === 1 ? '' : 's'}` : ''} — saldo <b>{fmtUSD(a.monto)}</b> a {a.agente}</>
  }

  const stats = useMemo(() => {
    const base = agenteFilter === 'todos' ? ships : ships.filter(s => (s.agente || 'Bruce') === agenteFilter)
    const transito = base.filter(s => /transit/i.test(s.status)).length
    const pendientePago = base.filter(s => /pending|pendiente/i.test(s.status)).length
    const saldoPagar = base.reduce((a, s) => a + numUSD(s.balance_usd), 0)
    return { total: base.length, transito, pendientePago, saldoPagar }
  }, [ships, agenteFilter])

  const hoyStr = () => new Date().toISOString().slice(0, 10)

  // Registrar pago al forwarder como EVENTO (ledger) + actualizar el saldo del embarque.
  const savePagoAgente = async () => {
    const f = pagoModal
    if (!f || pagoBusy) return
    if (numUSD(f.monto) <= 0) { gToast.error('Cargá el monto.'); return }
    setPagoBusy(true)
    try {
      const sh = f.ship
      await fetch('/api/db/pagos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'agente', ref_id: String(sh.id), bl: sh.bl || '', fecha: f.fecha, monto: f.monto, metodo: f.metodo, nota: f.nota }),
      }).catch(() => {})
      const rec = numUSD(sh.amount_rec_usd) + numUSD(f.monto)
      const bal = numUSD(sh.amount_due_usd) - rec
      const res = await fetch(`/api/tracking/${sh.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sh, amount_rec_usd: fmtCalc(rec), balance_usd: fmtCalc(bal), payment_date: f.fecha }),
      })
      if (!res.ok) throw new Error('No se pudo registrar el pago')
      gToast.success('Pago registrado.')
      setUltMetodo(m => ({ ...m, [sh.agente || 'Bruce']: f.metodo }))
      setPagoModal(null)
      setHistPagos(h => { const n = { ...h }; delete n[sh.id]; return n })
      load()
    } catch (e) {
      gToast.error(e.message || 'Error al registrar el pago.')
    } finally { setPagoBusy(false) }
  }

  const toggleHist = async (sh) => {
    if (expandId === sh.id) { setExpandId(null); return }
    setExpandId(sh.id)
    if (!histPagos[sh.id]) {
      try {
        const res = await fetch(`/api/db/pagos?scope=agente&ref_id=${encodeURIComponent(sh.id)}`)
        const j = res.ok ? await res.json() : []
        setHistPagos(h => ({ ...h, [sh.id]: Array.isArray(j) ? j : [] }))
      } catch { setHistPagos(h => ({ ...h, [sh.id]: [] })) }
    }
  }

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
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.2rem' }}>Forwarding</h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Cuenta corriente con tus agentes de carga — la carga vive en cada operación · {ships.length} embarques</p>
        </div>
        <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 1.1rem', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo embarque
        </button>
      </div>

      {/* Alertas del flujo — panel accionable (tachá lo hecho, tocá para actuar) */}
      {alertasVis.length > 0 && (() => {
        const mostrar = alertsOpen ? alertasVis : alertasVis.slice(0, 5)
        return (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, marginBottom: '1rem', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.95rem', borderBottom: '1px solid #fde68a' }}>
              <p style={{ fontSize: '0.62rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Alertas · {alertasVis.length} pendiente{alertasVis.length === 1 ? '' : 's'}
              </p>
              {alertasVis.length > 5 && (
                <button onClick={() => setAlertsOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', fontSize: '0.7rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {alertsOpen ? 'Ver menos' : `Ver todas (${alertasVis.length})`}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: alertsOpen ? 'rotate(180deg)' : 'none' }}><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              )}
            </div>
            <div style={{ maxHeight: alertsOpen ? 340 : 'none', overflowY: alertsOpen ? 'auto' : 'visible' }}>
              {mostrar.map((a) => (
                <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem 0.95rem', borderBottom: '1px solid #fef3c7' }}>
                  <button onClick={() => toggleHecha(a, true)} title="Marcar como hecho" aria-label="Marcar como hecho"
                    style={{ flex: '0 0 auto', width: 22, height: 22, borderRadius: 6, border: '1.5px solid #d97706', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                  <button onClick={() => a.bl && setFicha(a.bl)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: a.bl ? 'pointer' : 'default', fontSize: '0.8rem', color: '#78350f', lineHeight: 1.35, padding: 0 }}>
                    {alertText(a)}
                  </button>
                  {a.bl && (
                    <button onClick={() => setFicha(a.bl)} title={a.tipo === 'pago' ? 'Registrar pago' : a.tipo === 'despacho' ? 'Cargar despacho' : 'Abrir ficha'}
                      style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.28rem 0.6rem', borderRadius: 6, border: '1px solid #fcd34d', background: '#fff', color: '#b45309', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {a.tipo === 'pago' ? 'Registrar pago' : a.tipo === 'despacho' ? 'Cargar despacho' : 'Abrir'}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Cuenta corriente con los forwarders — posición neta, no celdas */}
      {(() => {
        const base = agenteFilter === 'todos' ? ships : ships.filter(x => (x.agente || 'Bruce') === agenteFilter)
        const debe = base.reduce((a, x) => a + Math.max(0, numUSD(x.balance_usd)), 0)
        const favor = base.reduce((a, x) => a + Math.max(0, -numUSD(x.balance_usd)), 0)
        const neto = debe - favor
        const due = base.reduce((a, x) => a + numUSD(x.amount_due_usd), 0)
        const pag = base.reduce((a, x) => a + numUSD(x.amount_rec_usd), 0)
        const transito = base.filter(x => /transit/i.test(x.status || '')).length
        return (
          <div className="desp-cuenta" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12, marginBottom: '1rem' }}>
            <div style={{ ...CARD, padding: '1rem 1.15rem' }}>
              <p style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Cuenta con {agenteFilter === 'todos' ? 'tus forwarders' : agenteFilter}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <p style={{ fontSize: '1.9rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: neto > 0 ? '#dc2626' : neto < 0 ? '#b45309' : '#16a34a' }}>{fmtUSD(Math.abs(neto))}</p>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: neto > 0 ? '#dc2626' : neto < 0 ? '#b45309' : '#16a34a' }}>
                  {neto > 0 ? 'les debés (neto)' : neto < 0 ? 'a tu favor (neto)' : 'todo saldado ✓'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap', fontSize: '0.74rem' }}>
                <span><span style={{ color: '#94a3b8' }}>A pagar</span> <b style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(due)}</b></span>
                <span><span style={{ color: '#94a3b8' }}>− pagado</span> <b style={{ color: '#334155', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(pag)}</b></span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ ...CARD, padding: '0.75rem 0.95rem' }}>
                <p style={{ fontSize: '0.56rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Embarques</p>
                <p style={{ fontSize: '1.35rem', fontWeight: 800, color: '#334155', lineHeight: 1 }}>{base.length}</p>
              </div>
              <div style={{ ...CARD, padding: '0.75rem 0.95rem' }}>
                <p style={{ fontSize: '0.56rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>En tránsito</p>
                <p style={{ fontSize: '1.35rem', fontWeight: 800, color: '#2563eb', lineHeight: 1 }}>{transito}</p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Selector de agente */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '0.85rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 2 }}>Agente</span>
        <div style={{ display: 'flex', gap: 3, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 3 }}>
          {['todos', ...agentesFiltro].map(a => {
            const sel = agenteFilter === a
            const st = a === 'todos' ? { c: '#fff', bg: PRIMARY } : agenteStyle(a)
            return (
              <button key={a} onClick={() => setAgenteFilter(a)} style={{
                padding: '0.32rem 0.75rem', borderRadius: 6, cursor: 'pointer', fontSize: '0.74rem', fontWeight: 600, border: 'none',
                background: sel ? (a === 'todos' ? PRIMARY : st.bg) : 'transparent',
                color: sel ? (a === 'todos' ? '#fff' : st.c) : '#64748b',
              }}>
                {a === 'todos' ? 'Todos' : a}{a === 'Yachao' ? ' · aéreo' : (a === 'Bruce' || a === 'Shaina') ? ' · marítimo' : ''}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {(() => {
            const groups = []
            filtered.forEach(x => { const k = x.agente || 'Bruce'; let g = groups.find(y => y.key === k); if (!g) { g = { key: k, items: [] }; groups.push(g) } g.items.push(x) })
            groups.forEach(g => g.items.sort((a, b) => (numUSD(b.balance_usd) > 0 ? 1 : 0) - (numUSD(a.balance_usd) > 0 ? 1 : 0) || (parseInt(b.num, 10) || 0) - (parseInt(a.num, 10) || 0)))
            return groups.map(g => {
              const a = agenteStyle(g.key)
              const debe = g.items.reduce((x, r) => x + Math.max(0, numUSD(r.balance_usd)), 0)
              const favor = g.items.reduce((x, r) => x + Math.max(0, -numUSD(r.balance_usd)), 0)
              const neto = debe - favor
              return (
                <div key={g.key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 0.55rem 0.1rem' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.c, flex: '0 0 auto' }} />
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: a.c, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{g.key}</span>
                    <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#fff', background: '#94a3b8', borderRadius: 50, padding: '0.05rem 0.45rem' }}>{g.items.length}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: neto > 0 ? '#dc2626' : '#16a34a' }}>
                      {neto > 0 ? `Le debés ${fmtUSD(neto)}` : neto < 0 ? `${fmtUSD(-neto)} a tu favor` : 'Saldado ✓'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {g.items.map(sh => {
                      const st = statusStyle(sh.status)
                      const bal = numUSD(sh.balance_usd)
                      const due = numUSD(sh.amount_due_usd), rec = numUSD(sh.amount_rec_usd)
                      const pct = due > 0 ? Math.max(0, Math.min(1, rec / due)) : (rec > 0 ? 1 : 0)
                      const op = opByBL[blNorm(sh.bl)]
                      const d = despByBL[blNorm(sh.bl)]
                      const dSaldo = d ? numUSD(d.saldo) : 0
                      const eta = etaInfo(sh.eta)
                      const exp = expandId === sh.id
                      const hist = histPagos[sh.id]
                      return (
                        <div key={sh.id} style={{ ...CARD, borderLeft: `3px solid ${st.dot}`, padding: '0.75rem 0.9rem' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <div onClick={() => sh.bl ? setFicha({ bl: sh.bl, ship: sh }) : openEdit(sh)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>#{sh.num || '—'} · {sh.origen || '—'} <span style={{ color: '#cbd5e1' }}>→</span> {sh.destino || '—'}</span>
                                {sh.carrier && <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#64748b', background: '#eef2f7', borderRadius: 4, padding: '0.05rem 0.35rem' }}>{sh.carrier}</span>}
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', fontWeight: 700, color: st.c, border: `1px solid ${st.border}`, background: '#fff', borderRadius: 4, padding: '0.05rem 0.4rem', whiteSpace: 'nowrap' }}>
                                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: st.dot }} />{sh.status || '—'}
                                </span>
                                {sh.eta && <span style={{ fontSize: '0.62rem', color: eta ? eta.tone : '#94a3b8', fontWeight: 600 }}>ETA {sh.eta}{eta ? ` · ${eta.rel}` : ''}</span>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                                {sh.bl && <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: '0.66rem', color: '#64748b' }}>{sh.bl}</span>}
                                <MiniFlow state={importFlowState({ op, ship: sh, desp: d })} />
                                {op && (
                                  <span onClick={e => { e.stopPropagation(); window.location.href = '/gestion/operaciones?op=' + encodeURIComponent(op.id) }} style={{ fontSize: '0.6rem', fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, padding: '0.05rem 0.4rem', cursor: 'pointer', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📦 {op.nombre || 'Operación'}</span>
                                )}
                                {d && (dSaldo > 0
                                  ? <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '0.05rem 0.4rem', whiteSpace: 'nowrap' }}>Aduana USD {d.saldo}</span>
                                  : <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 4, padding: '0.05rem 0.4rem', whiteSpace: 'nowrap' }}>Aduana ✓</span>)}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                              <p style={{ fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{bal > 0 ? 'Debés' : bal < 0 ? 'A favor' : 'Saldo'}</p>
                              <p style={{ fontSize: '1.05rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: bal > 0 ? '#dc2626' : bal < 0 ? '#b45309' : '#16a34a', lineHeight: 1.1 }}>{bal !== 0 ? fmtUSD(Math.abs(bal)) : (due > 0 ? '✓' : '—')}</p>
                            </div>
                          </div>

                          {due > 0 && (
                            <div style={{ marginTop: 9 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#64748b', marginBottom: 4 }}>
                                <span>Total <b style={{ color: '#0f172a' }}>{sh.total_usd ? 'USD ' + sh.total_usd : '—'}</b></span>
                                <span>Pagado <b style={{ color: '#334155' }}>{fmtUSD(rec)}</b> de {fmtUSD(due)}</span>
                              </div>
                              <div style={{ height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.round(pct * 100)}%`, background: bal > 0 ? '#f59e0b' : '#16a34a', borderRadius: 4, transition: 'width .2s' }} />
                              </div>
                            </div>
                          )}

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                            {bal > 0 && (
                              <button onClick={() => setPagoModal({ ship: sh, fecha: hoyStr(), monto: fmtCalc(bal), metodo: ultMetodo[sh.agente || 'Bruce'] || METODO_DEFAULT_AGENTE, nota: '' })} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.34rem 0.75rem', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, background: PRIMARY, color: '#fff' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                Registrar pago
                              </button>
                            )}
                            <button onClick={() => toggleHist(sh)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.34rem 0.7rem', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                              Historial{Array.isArray(hist) ? ` (${hist.length})` : ''}
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: exp ? 'rotate(180deg)' : 'none' }}><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                            <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4 }}>
                              <button onClick={() => openEdit(sh)} title="Editar" aria-label={`Editar embarque ${sh.num || ''}`} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button onClick={() => setConfirmDel(sh.id)} title="Eliminar" aria-label={`Eliminar embarque ${sh.num || ''}`} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #fee2e2', background: '#fff', color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                              </button>
                            </div>
                          </div>

                          {exp && (
                            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                              {!Array.isArray(hist) ? (
                                <p style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Cargando…</p>
                              ) : hist.length === 0 ? (
                                <p style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>Sin pagos registrados para este embarque.</p>
                              ) : hist.map(pg => (
                                <div key={pg.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.28rem 0', fontSize: '0.74rem' }}>
                                  <span style={{ color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{pg.fecha || '—'}</span>
                                  <span style={{ fontSize: '0.58rem', fontWeight: 700, color: pg.metodo === 'usa' ? '#1d4ed8' : '#475569', background: pg.metodo === 'usa' ? '#eff6ff' : '#f1f5f9', borderRadius: 4, padding: '0.05rem 0.4rem' }}>{pg.metodo === 'usa' ? '🇺🇸 ' : ''}{metodoLabel(pg.metodo)}</span>
                                  {pg.nota && <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pg.nota}</span>}
                                  <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(numUSD(pg.monto))}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          })()}
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

      {/* Registrar pago al forwarder: evento en el ledger + actualiza el saldo */}
      {pagoModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setPagoModal(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ ...CARD, width: '100%', maxWidth: 380, padding: '1.25rem' }}>
            <p style={{ fontWeight: 800, color: '#0f172a', marginBottom: 3, fontSize: '0.95rem' }}>Registrar pago a {pagoModal.ship.agente || 'Bruce'}</p>
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 12 }}>#{pagoModal.ship.num} · {pagoModal.ship.origen} → {pagoModal.ship.destino} · saldo {fmtUSD(numUSD(pagoModal.ship.balance_usd))}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><label style={LBL}>Fecha</label><input type="date" value={pagoModal.fecha} onChange={e => setPagoModal(f => ({ ...f, fecha: e.target.value }))} style={INP} /></div>
              <div><label style={LBL}>Monto (USD)</label><input inputMode="decimal" value={pagoModal.monto} onChange={e => setPagoModal(f => ({ ...f, monto: e.target.value }))} style={INP} placeholder="0" /></div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={LBL}>Pagado desde</label>
              <div style={{ display: 'flex', gap: 3, background: '#f1f5f9', borderRadius: 8, padding: 3 }}>
                {METODOS_PAGO.map(([v, l]) => {
                  const on = pagoModal.metodo === v
                  return <button key={v} onClick={() => setPagoModal(f => ({ ...f, metodo: v }))} style={{ flex: 1, padding: '0.35rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.74rem', fontWeight: on ? 700 : 500, background: on ? '#fff' : 'transparent', color: on ? (v === 'usa' ? '#1d4ed8' : '#0f172a') : '#64748b', boxShadow: on ? '0 1px 2px rgba(15,23,42,0.1)' : 'none', whiteSpace: 'nowrap' }}>{v === 'usa' ? '🇺🇸 ' : ''}{l}</button>
                })}
              </div>
              {(() => {
                const ag = pagoModal.ship.agente || 'Bruce'
                const prev = ultMetodo[ag]
                return (
                  <p style={{ fontSize: '0.64rem', color: '#94a3b8', marginTop: 5 }}>
                    {prev
                      ? <>así le pagaste la última vez a <b style={{ color: '#64748b' }}>{ag}</b> — cambialo si esta vez fue distinto</>
                      : <>los pagos a agentes salen de la cuenta de USA por defecto</>}
                  </p>
                )
              })()}
            </div>
            <div style={{ marginBottom: 14 }}><label style={LBL}>Nota (opcional)</label><input value={pagoModal.nota} onChange={e => setPagoModal(f => ({ ...f, nota: e.target.value }))} style={INP} placeholder="Ej: adelanto 50%" /></div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setPagoModal(null)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={savePagoAgente} disabled={pagoBusy} style={{ padding: '0.5rem 1.1rem', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: pagoBusy ? 'wait' : 'pointer' }}>{pagoBusy ? 'Guardando…' : 'Registrar'}</button>
            </div>
          </div>
        </div>
      )}

      {ficha && (() => {
        // ficha puede venir como string (bl) o como objeto {bl, ship}. Normalizo
        // para no pasar un bl undefined (que colisiona con registros sin B/L).
        const fbl = typeof ficha === 'string' ? ficha : (ficha.bl || '')
        const fship = (ficha && typeof ficha === 'object') ? ficha.ship : null
        return <FichaImportacion bl={fbl} seed={fship ? { ship: fship } : {}} onClose={() => setFicha(null)} onChanged={load} />
      })()}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
