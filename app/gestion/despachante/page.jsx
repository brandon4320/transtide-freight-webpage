'use client'

import { useState, useEffect, useMemo } from 'react'
import { gToast } from '../toast'
import FichaImportacion from '../ficha-importacion'
import { metodoLabel } from '../pagos-metodos'

const CARD = { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf1', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }
const INP = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '16px', color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const LBL = { display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#64748b', letterSpacing: 0, marginBottom: 5 }
const SEC = { fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.85rem', paddingBottom: '0.45rem', borderBottom: '1px solid #f1f5f9' }
const PRIMARY = '#0f172a'

const ESTADOS_IMP = ['En curso', 'Terminada', 'Demorada']

// Los conceptos que se le pagan al despachante, con su marca factura/negro.
// El desglose vive en la columna `conceptos` (JSON: { clave: { m: monto, f: 1|0 } });
// total_honorarios sigue guardando la suma para que ficha/operaciones no cambien.
const CONCEPTOS = [
  ['honorarios', 'Honorarios'],
  ['gastos_admin', 'Gastos administrativos'],
  ['riesgo', 'Riesgo'],
  ['invest', 'Invest'],
  ['dif_aduana', 'Dif. aduana'],
]
const CONC_LBL = Object.fromEntries(CONCEPTOS)
// Al crear: honorarios y gastos admin arrancan como facturados; el resto en negro.
const EMPTY_CONC = () => ({ honorarios: { m: '', f: 1 }, gastos_admin: { m: '', f: 1 }, riesgo: { m: '', f: 0 }, invest: { m: '', f: 0 }, dif_aduana: { m: '', f: 0 } })

const EMPTY = { bl: '', descripcion: '', estado: 'En curso', comision: '', facturado: 0, factura_nro: '', notas: '' }

const blNorm = (b) => (b || '').replace(/[\s-]/g, '').toUpperCase()
const numUSD = (v) => { const n = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n }
const fmtUSD = (n) => 'USD ' + Math.round(n).toLocaleString('es-AR')
// Formatea un número calculado a string es-AR (compatible con numUSD al re-parsear).
const fmtCalc = (n) => { if (!isFinite(n)) return ''; const r = Math.round(n * 100) / 100; return r === 0 ? '' : r.toLocaleString('es-AR', { maximumFractionDigits: 2 }) }

// Desglose de una fila. Filas viejas sin JSON caen al mapeo de los campos legacy.
function parseConc(r) {
  try { const j = JSON.parse(r.conceptos || ''); if (j && typeof j === 'object' && !Array.isArray(j)) return j } catch {}
  const c = {}
  if (numUSD(r.hon_regulares)) c.honorarios = { m: r.hon_regulares, f: 1 }
  if (numUSD(r.otros_gastos)) c.gastos_admin = { m: r.otros_gastos, f: 1 }
  if (numUSD(r.adu_extras)) c.dif_aduana = { m: r.adu_extras, f: 1 }
  return c
}
function concSplit(c) {
  let fact = 0, negro = 0
  CONCEPTOS.forEach(([k]) => { const e = c[k]; if (!e) return; const m = numUSD(e.m); if (e.f) fact += m; else negro += m })
  return { fact, negro, total: fact + negro }
}

// Semántica del saldo: total de costos − pagado.
//  > 0 → le debés al despachante · < 0 → saldo a tu favor · 0 → saldado
function saldoStyle(saldo, totalHon) {
  if (saldo > 0)  return { key: 'debe',    bg: '#fef2f2', dot: '#dc2626', c: '#dc2626', label: 'Debés' }
  if (saldo < 0)  return { key: 'favor',   bg: '#fffbeb', dot: '#d97706', c: '#b45309', label: 'A tu favor' }
  if (totalHon > 0) return { key: 'saldado', bg: '#f0fdf4', dot: '#16a34a', c: '#16a34a', label: 'Saldado' }
  return { key: 'curso', bg: '#f8fafc', dot: '#94a3b8', c: '#64748b', label: 'En curso' }
}

function FNToggle({ f, onChange, small }) {
  const B = (on, lbl, col) => (
    <button onClick={() => onChange(lbl === 'Factura' ? 1 : 0)}
      style={{ flex: 1, padding: small ? '0.22rem 0.3rem' : '0.3rem 0.4rem', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: small ? '0.64rem' : '0.7rem', fontWeight: on ? 700 : 500, background: on ? '#fff' : 'transparent', color: on ? col : '#94a3b8', boxShadow: on ? '0 1px 2px rgba(15,23,42,0.12)' : 'none', whiteSpace: 'nowrap' }}>
      {lbl}
    </button>
  )
  return (
    <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 7, padding: 2 }}>
      {B(!!f, 'Factura', '#059669')}
      {B(!f, 'Negro', '#0f172a')}
    </div>
  )
}

export default function DespachantePage({ devRows = null, devShips = null, devPagos = null, devOps = null } = {}) {
  const [rows, setRows] = useState([])
  const [ships, setShips] = useState([])
  const [pagos, setPagos] = useState({})           // { [ref_id]: [pagos del ledger] }
  const [ops, setOps] = useState([])               // operaciones de la sección Operaciones (para vincular por B/L)
  const [linkOp, setLinkOp] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('todos')
  const [modal, setModal] = useState(null)   // null | 'new' | rowObj
  const [form, setForm] = useState(EMPTY)
  const [conc, setConc] = useState(EMPTY_CONC())
  const [confirmDel, setConfirmDel] = useState(null)
  const [confirmPago, setConfirmPago] = useState(null) // { row, pg } → borrar un pago
  const [saving, setSaving] = useState(false)
  const [ficha, setFicha] = useState(null)         // B/L abierto en la ficha integral
  const [pagoModal, setPagoModal] = useState(null) // registro de pago (cuenta corriente)
  const [pagoBusy, setPagoBusy] = useState(false)

  const load = async () => {
    // Inyección para preview de diseño (dev): evita auth/D1.
    if (devRows) { setRows(devRows); setShips(devShips || []); setPagos(devPagos || {}); setOps(devOps || []); setLoading(false); return }
    setLoading(true)
    setLoadError(false)
    try {
      const [d, t, p, o] = await Promise.all([
        fetch('/api/db/despachante'),
        fetch('/api/tracking'),
        fetch('/api/db/pagos?scope=despachante'),
        fetch('/api/db/operations'),
      ])
      if (!d.ok) throw new Error('despachante')
      setRows(await d.json())
      if (t.ok) { const td = await t.json(); setShips(td.shipments || []) }
      if (p.ok) {
        const list = await p.json()
        const m = {}
        ;(Array.isArray(list) ? list : []).forEach(pg => { (m[pg.ref_id] = m[pg.ref_id] || []).push(pg) })
        setPagos(m)
      }
      if (o.ok) { const oj = await o.json(); setOps(Array.isArray(oj) ? oj : []) }
    } catch {
      setLoadError(true)
      gToast.error('No se pudieron cargar los pagos al despachante.')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const shipByBL = useMemo(() => {
    const m = {}; ships.forEach(s => { if (s.bl) m[blNorm(s.bl)] = s }); return m
  }, [ships])

  const filtered = useMemo(() => {
    let l = rows
    if (query.trim()) {
      const q = query.toLowerCase()
      l = l.filter(r => [r.bl, r.descripcion, r.factura_nro, r.notas].some(v => (v || '').toLowerCase().includes(q)))
    }
    if (filter === 'debe')     l = l.filter(r => numUSD(r.saldo) > 0)
    if (filter === 'favor')    l = l.filter(r => numUSD(r.saldo) < 0)
    if (filter === 'saldado')  l = l.filter(r => numUSD(r.saldo) === 0 && numUSD(r.total_honorarios) > 0)
    if (filter === 'sinfact')  l = l.filter(r => !r.facturado && concSplit(parseConc(r)).fact > 0)
    return l
  }, [rows, query, filter])

  const stats = useMemo(() => {
    const debe = rows.reduce((a, r) => a + Math.max(0, numUSD(r.saldo)), 0)
    const favor = rows.reduce((a, r) => a + Math.max(0, -numUSD(r.saldo)), 0)
    // Cuenta corriente con el despachante: costos − pagos.
    const totalHon = rows.reduce((a, r) => a + numUSD(r.total_honorarios), 0)
    const totalCom = rows.reduce((a, r) => a + numUSD(r.comision), 0)
    const totalPag = rows.reduce((a, r) => a + numUSD(r.total_pagado), 0)
    const neto = debe - favor  // > 0 le debés · < 0 a tu favor
    const saldadas = rows.filter(r => numUSD(r.saldo) === 0 && numUSD(r.total_honorarios) > 0).length
    let fact = 0, negro = 0, sinFact = 0
    rows.forEach(r => {
      const s = concSplit(parseConc(r))
      fact += s.fact; negro += s.negro
      if (!r.facturado && s.fact > 0) sinFact++
    })
    return { total: rows.length, debe, favor, sinFact, totalHon, totalCom, totalPag, neto, saldadas, fact, negro }
  }, [rows])

  // Alerta del flujo: despacho con saldo cuando la mercadería ya arribó
  // (recordatorio semanal hasta saldar), mirando el ETA del embarque vinculado.
  const alertas = useMemo(() => {
    const out = []
    const today = new Date(); today.setHours(0, 0, 0, 0)
    rows.forEach(r => {
      if (numUSD(r.saldo) <= 0) return
      const ship = shipByBL[blNorm(r.bl)]
      if (!ship) return
      const eta = ship.eta ? new Date(ship.eta + 'T00:00:00') : null
      const days = eta && !isNaN(eta.getTime()) ? Math.round((today.getTime() - eta.getTime()) / 86400000) : null
      const arrived = /deliver|paid/i.test(ship.status || '') || (days != null && days > 0)
      if (arrived && (days == null || days >= 7)) {
        out.push({ row: r, sem: days != null ? Math.floor(days / 7) : null, monto: numUSD(r.saldo) })
      }
    })
    return out
  }, [rows, shipByBL])

  const openNew = () => { setForm({ ...EMPTY }); setConc(EMPTY_CONC()); setLinkOp(''); setModal('new') }
  const openEdit = (r) => {
    setForm({ ...EMPTY, ...r })
    const base = EMPTY_CONC()
    const saved = parseConc(r)
    CONCEPTOS.forEach(([k]) => { if (saved[k]) base[k] = { m: String(saved[k].m ?? ''), f: saved[k].f ? 1 : 0 } })
    setConc(base)
    setLinkOp('')
    setModal(r)
  }

  async function errMsg(res, fallback) {
    try { const j = await res.json(); return j.error || fallback } catch { return fallback }
  }

  const save = async () => {
    if (!form.descripcion.trim()) { gToast.error('La descripción es obligatoria.'); return }
    setSaving(true)
    try {
      // El desglose manda: total y saldo salen siempre calculados, nunca tipeados.
      const clean = {}
      CONCEPTOS.forEach(([k]) => { if (numUSD(conc[k].m) > 0) clean[k] = { m: conc[k].m, f: conc[k].f ? 1 : 0 } })
      const total = concSplit(clean).total
      const pagado = modal === 'new' ? 0 : numUSD(modal.total_pagado)
      const payload = {
        ...(modal === 'new' ? {} : modal),
        ...form,
        conceptos: JSON.stringify(clean),
        total_honorarios: fmtCalc(total),
        total_pagado: modal === 'new' ? '' : modal.total_pagado,
        saldo: fmtCalc(total - pagado),
        // El desglose ya vive en `conceptos`; los campos viejos quedan vacíos.
        hon_regulares: '', adu_extras: '', otros_gastos: '',
      }
      if (modal === 'new') {
        const r = await fetch('/api/db/despachante', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!r.ok) throw new Error(await errMsg(r, 'Error al crear'))
        gToast.success('Operación creada.')
      } else {
        const r = await fetch(`/api/db/despachante/${modal.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!r.ok) throw new Error(await errMsg(r, 'Error al guardar'))
        gToast.success('Cambios guardados.')
      }
      setModal(null)
      load()
    } catch (e) {
      gToast.error(e.message || 'Error de conexión.')
    } finally { setSaving(false) }
  }

  const del = async (id) => {
    try {
      const r = await fetch(`/api/db/despachante/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error()
      setRows(rows.filter(x => x.id !== id))
      gToast.success('Registro eliminado.')
    } catch {
      gToast.error('Error de conexión. Intentá de nuevo.')
    } finally { setConfirmDel(null) }
  }

  const updConc = (k, patch) => setConc(p => ({ ...p, [k]: { ...p[k], ...patch } }))
  const upd = (f, v) => setForm(p => ({ ...p, [f]: v }))

  const hoy = () => new Date().toISOString().slice(0, 10)

  // Registrar un pago al despachante como EVENTO (ledger) y actualizar el saldo
  // de esa importación. No se edita una celda "pagado": queda historial.
  const savePagoDesp = async () => {
    const f = pagoModal
    if (!f || pagoBusy) return
    if (numUSD(f.monto) <= 0) { gToast.error('Cargá el monto.'); return }
    setPagoBusy(true)
    try {
      const r = f.row
      await fetch('/api/db/pagos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'despachante', ref_id: String(r.id), bl: r.bl || '', fecha: f.fecha, monto: f.monto, metodo: f.metodo, nota: f.nota }),
      }).catch(() => {})
      const cash = numUSD(r.pago_cash) + (f.metodo === 'cash' ? numUSD(f.monto) : 0)
      const transf = numUSD(r.pago_transferencia) + (f.metodo === 'cash' ? 0 : numUSD(f.monto))
      const pagado = cash + transf
      const saldo = numUSD(r.total_honorarios) - pagado
      const res = await fetch(`/api/db/despachante/${r.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...r, pago_cash: fmtCalc(cash), pago_transferencia: fmtCalc(transf), total_pagado: fmtCalc(pagado), saldo: fmtCalc(saldo), fecha_pago: f.fecha }),
      })
      if (!res.ok) throw new Error(await errMsg(res, 'No se pudo registrar el pago'))
      gToast.success('Pago registrado.')
      setPagoModal(null)
      load()
    } catch (e) {
      gToast.error(e.message || 'Error al registrar el pago.')
    } finally { setPagoBusy(false) }
  }

  // Borrar un pago mal cargado: sale del ledger y el saldo se recalcula.
  const delPago = async () => {
    const { row: r, pg } = confirmPago
    try {
      const res = await fetch(`/api/db/pagos/${pg.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await errMsg(res, 'No se pudo borrar el pago'))
      const cash = Math.max(0, numUSD(r.pago_cash) - (pg.metodo === 'cash' ? numUSD(pg.monto) : 0))
      const transf = Math.max(0, numUSD(r.pago_transferencia) - (pg.metodo === 'cash' ? 0 : numUSD(pg.monto)))
      const pagado = cash + transf
      const saldo = numUSD(r.total_honorarios) - pagado
      const res2 = await fetch(`/api/db/despachante/${r.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...r, pago_cash: fmtCalc(cash), pago_transferencia: fmtCalc(transf), total_pagado: fmtCalc(pagado), saldo: fmtCalc(saldo) }),
      })
      if (!res2.ok) throw new Error(await errMsg(res2, 'No se pudo actualizar el saldo'))
      gToast.success('Pago eliminado.')
      load()
    } catch (e) {
      gToast.error(e.message || 'Error al borrar el pago.')
    } finally { setConfirmPago(null) }
  }

  const formTotals = concSplit(Object.fromEntries(CONCEPTOS.map(([k]) => [k, conc[k]]).filter(([, e]) => numUSD(e.m) > 0)))

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.2rem' }}>Despachante de aduana</h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Cada operación con sus costos, su factura o negro, y sus pagos · {rows.length} operaciones</p>
        </div>
        <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 1.1rem', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nueva operación
        </button>
      </div>

      {/* Alertas del flujo */}
      {alertas.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '0.65rem 0.95rem', marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.6rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Alertas · {alertas.length}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {alertas.slice(0, 6).map((a, i) => (
              <button key={i} onClick={() => a.row.bl && setFicha({ bl: a.row.bl, desp: a.row, ship: shipByBL[blNorm(a.row.bl)] })} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '0.1rem 0', cursor: 'pointer', textAlign: 'left', fontSize: '0.78rem', color: '#78350f' }}>
                <span>💸 <b>{a.row.descripcion}</b> — mercadería arribó{a.sem != null ? ` hace ${a.sem} semana${a.sem === 1 ? '' : 's'}` : ''}, saldo <b>{fmtUSD(a.monto)}</b> al despachante</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cuenta corriente con el despachante — la posición NETA, no una grilla de celdas */}
      <div className="desp-cuenta" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12, marginBottom: '1rem' }}>
        <div style={{ ...CARD, padding: '1rem 1.15rem' }}>
          <p style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Cuenta con el despachante</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <p style={{ fontSize: '1.9rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: stats.neto > 0 ? '#dc2626' : stats.neto < 0 ? '#b45309' : '#16a34a' }}>{fmtUSD(Math.abs(stats.neto))}</p>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: stats.neto > 0 ? '#dc2626' : stats.neto < 0 ? '#b45309' : '#16a34a' }}>
              {stats.neto > 0 ? 'le debés (neto)' : stats.neto < 0 ? 'a tu favor (neto)' : 'todo saldado ✓'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap', fontSize: '0.74rem' }}>
            <span><span style={{ color: '#94a3b8' }}>Costos</span> <b style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(stats.totalHon)}</b></span>
            <span><span style={{ color: '#94a3b8' }}>− pagado</span> <b style={{ color: '#334155', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(stats.totalPag)}</b></span>
            {(stats.fact > 0 || stats.negro > 0) && (
              <span><span style={{ color: '#94a3b8' }}>Te factura</span> <b style={{ color: '#059669', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(stats.fact)}</b> <span style={{ color: '#94a3b8' }}>· en negro</span> <b style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(stats.negro)}</b></span>
            )}
          </div>
          {stats.debe > 0 && stats.favor > 0 && (
            <p style={{ fontSize: '0.66rem', color: '#94a3b8', marginTop: 8 }}>Debés {fmtUSD(stats.debe)} en unas · {fmtUSD(stats.favor)} a favor en otras → se compensan.</p>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ ...CARD, padding: '0.75rem 0.95rem' }}>
            <p style={{ fontSize: '0.56rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Operaciones</p>
            <p style={{ fontSize: '1.35rem', fontWeight: 800, color: '#334155', lineHeight: 1 }}>{stats.total}</p>
            <p style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: 3 }}>{stats.saldadas} saldadas</p>
          </div>
          <div style={{ ...CARD, padding: '0.75rem 0.95rem' }}>
            <p style={{ fontSize: '0.56rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Sin facturar</p>
            <p style={{ fontSize: '1.35rem', fontWeight: 800, color: stats.sinFact > 0 ? '#2563eb' : '#334155', lineHeight: 1 }}>{stats.sinFact}</p>
            <p style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: 3 }}>pedir factura</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar BL, descripción, factura…" style={{ ...INP, paddingLeft: '2.2rem' }} />
        </div>
        <div style={{ display: 'flex', gap: 3, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 9, padding: 3 }}>
          {[['todos', 'Todos'], ['debe', 'Debés'], ['favor', 'A favor'], ['saldado', 'Saldados'], ['sinfact', 'Sin facturar']].map(([id, lbl]) => (
            <button key={id} onClick={() => setFilter(id)} style={{ padding: '0.4rem 0.85rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600, background: filter === id ? PRIMARY : 'transparent', color: filter === id ? '#fff' : '#64748b' }}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* Cards por operación */}
      {loading ? (
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #e8ecf1', borderTopColor: PRIMARY, borderRadius: '50%', margin: '0 auto 1rem', animation: 'spin 0.8s linear infinite' }} />
          Cargando…
        </div>
      ) : loadError ? (
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.3rem', color: '#b91c1c' }}>No se pudieron cargar los datos</p>
          <button onClick={load} style={{ marginTop: '0.6rem', padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Reintentar</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          {rows.length === 0 ? (
            <>
              <p style={{ fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Todavía no hay operaciones.</p>
              <p style={{ fontSize: '0.8rem' }}>Creá una con «Nueva operación» (solo descripción y B/L) y después cargale los costos.</p>
            </>
          ) : 'Sin registros que coincidan.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {(() => {
            const GRUPOS = [
              { key: 'debe',    label: 'Le debés al despachante', dot: '#dc2626', test: r => numUSD(r.saldo) > 0 },
              { key: 'favor',   label: 'A tu favor (compensar)',  dot: '#d97706', test: r => numUSD(r.saldo) < 0 },
              { key: 'saldado', label: 'Saldadas',                dot: '#16a34a', test: r => numUSD(r.saldo) === 0 && numUSD(r.total_honorarios) > 0 },
              { key: 'curso',   label: 'En curso / sin costos',   dot: '#94a3b8', test: r => numUSD(r.saldo) === 0 && numUSD(r.total_honorarios) === 0 },
            ]
            return GRUPOS.map(g => {
              const items = filtered.filter(g.test)
              if (!items.length) return null
              const sub = items.reduce((a, r) => a + numUSD(r.saldo), 0)
              return (
                <div key={g.key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 0.55rem 0.1rem' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.dot, flex: '0 0 auto' }} />
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{g.label}</span>
                    <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#fff', background: '#94a3b8', borderRadius: 50, padding: '0.05rem 0.45rem' }}>{items.length}</span>
                    {g.key !== 'curso' && Math.abs(sub) > 0 && <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: g.dot }}>{fmtUSD(Math.abs(sub))}{g.key === 'favor' ? ' a favor' : ''}</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {items.map(r => {
                      const saldo = numUSD(r.saldo)
                      const st = saldoStyle(saldo, numUSD(r.total_honorarios))
                      const ship = shipByBL[blNorm(r.bl)]
                      const hon = numUSD(r.total_honorarios), pag = numUSD(r.total_pagado)
                      const objetivo = hon
                      const pct = objetivo > 0 ? Math.max(0, Math.min(1, pag / objetivo)) : (pag > 0 ? 1 : 0)
                      const rc = parseConc(r)
                      const rs = concSplit(rc)
                      const hist = pagos[String(r.id)] || []
                      return (
                        <div key={r.id} style={{ ...CARD, borderLeft: `3px solid ${st.dot}`, padding: '0.75rem 0.9rem' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <div onClick={() => r.bl ? setFicha({ bl: r.bl, desp: r, ship }) : openEdit(r)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>{r.descripcion || '— sin descripción —'}</span>
                                <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '0.12rem 0.45rem', borderRadius: 5, border: '1px solid', color: r.estado === 'Terminada' ? '#065f46' : '#1d4ed8', borderColor: r.estado === 'Terminada' ? '#a7f3d0' : '#bfdbfe', background: '#fff' }}>{r.estado || '—'}</span>
                                {r.facturado
                                  ? <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 5, padding: '0.12rem 0.45rem' }}>Facturado{r.factura_nro ? ` · ${r.factura_nro}` : ''}</span>
                                  : rs.fact > 0 ? <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, padding: '0.12rem 0.45rem' }}>Sin facturar</span> : null}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: '0.66rem', color: '#94a3b8' }}>
                                {r.bl && <span style={{ fontFamily: 'ui-monospace,monospace', color: '#64748b' }}>{r.bl}</span>}
                                {ship && <span onClick={e => { e.stopPropagation(); window.location.href = '/gestion/tracking' }} style={{ fontSize: '0.58rem', fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, padding: '0.03rem 0.35rem', cursor: 'pointer' }}>🚢 #{ship.num}</span>}
                              </div>
                              {/* Desglose por concepto, con su marca factura/negro */}
                              {rs.total > 0 && (
                                <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                                  {CONCEPTOS.map(([k, lbl]) => {
                                    const e = rc[k]
                                    if (!e || numUSD(e.m) <= 0) return null
                                    const negro = !e.f
                                    return (
                                      <span key={k} title={negro ? 'En negro' : 'Te lo factura'} style={{ fontSize: '0.62rem', fontWeight: 600, padding: '0.14rem 0.5rem', borderRadius: 5, border: '1px solid', background: negro ? '#0f172a' : '#fff', color: negro ? '#e2e8f0' : '#334155', borderColor: negro ? '#0f172a' : '#e2e8f0' }}>
                                        {lbl} <b style={{ fontVariantNumeric: 'tabular-nums', color: negro ? '#fff' : '#0f172a' }}>{fmtUSD(numUSD(e.m)).replace('USD ', '')}</b>
                                      </span>
                                    )
                                  })}
                                  {rs.fact > 0 && rs.negro > 0 && (
                                    <span style={{ fontSize: '0.62rem', color: '#94a3b8' }}>factura <b style={{ color: '#059669' }}>{fmtUSD(rs.fact)}</b> · negro <b style={{ color: '#0f172a' }}>{fmtUSD(rs.negro)}</b></span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                              <p style={{ fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{saldo > 0 ? 'Debés' : saldo < 0 ? 'A favor' : 'Saldo'}</p>
                              <p style={{ fontSize: '1.05rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: st.c, lineHeight: 1.1 }}>{saldo !== 0 ? fmtUSD(Math.abs(saldo)) : (hon > 0 ? '✓' : '—')}</p>
                            </div>
                          </div>

                          {hon > 0 && (
                            <div style={{ marginTop: 9 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#64748b', marginBottom: 4 }}>
                                <span>Total <b style={{ color: '#0f172a' }}>{fmtUSD(hon)}</b></span>
                                <span>Pagado <b style={{ color: '#334155' }}>{fmtUSD(pag)}</b> de {fmtUSD(objetivo)}</span>
                              </div>
                              <div style={{ height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.round(pct * 100)}%`, background: saldo > 0 ? '#f59e0b' : '#16a34a', borderRadius: 4, transition: 'width .2s' }} />
                              </div>
                            </div>
                          )}

                          {/* Pagos parciales, siempre a la vista */}
                          {hist.length > 0 && (
                            <div style={{ marginTop: 9, paddingTop: 7, borderTop: '1px solid #f1f5f9' }}>
                              {hist.map(pg => (
                                <div key={pg.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.22rem 0', fontSize: '0.74rem' }}>
                                  <span style={{ color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{pg.fecha || '—'}</span>
                                  <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#475569', background: '#f1f5f9', borderRadius: 4, padding: '0.05rem 0.4rem' }}>{metodoLabel(pg.metodo)}</span>
                                  {pg.nota && <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pg.nota}</span>}
                                  <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(numUSD(pg.monto))}</span>
                                  <button onClick={() => setConfirmPago({ row: r, pg })} title="Borrar pago" aria-label="Borrar pago" style={{ width: 20, height: 20, borderRadius: 5, border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1, padding: 0 }}>×</button>
                                </div>
                              ))}
                            </div>
                          )}

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                            {saldo > 0 && (
                              <button onClick={() => setPagoModal({ row: r, fecha: hoy(), monto: fmtCalc(saldo), metodo: 'transferencia', nota: '' })} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.34rem 0.75rem', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, background: PRIMARY, color: '#fff' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                Registrar pago
                              </button>
                            )}
                            {hon === 0 && (
                              <button onClick={() => openEdit(r)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.34rem 0.75rem', borderRadius: 7, border: '1px dashed #cbd5e1', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, background: '#fff', color: '#475569' }}>
                                Cargar costos
                              </button>
                            )}
                            <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4 }}>
                              <button onClick={() => openEdit(r)} title="Editar" aria-label="Editar" style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button onClick={() => setConfirmDel(r.id)} title="Eliminar" aria-label="Eliminar" style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #fee2e2', background: '#fff', color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                              </button>
                            </div>
                          </div>
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

      {/* Edit / new modal — minimal: vincular, describir, 5 conceptos, listo */}
      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setModal(null)}>
          <div style={{ ...CARD, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: '1.35rem 1.5rem', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>{modal === 'new' ? 'Nueva operación' : (form.descripcion || 'Editar')}</h3>
              <button onClick={() => setModal(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            {ops.length > 0 && (
              <select value={linkOp} onChange={e => {
                const v = e.target.value; setLinkOp(v)
                const o = ops.find(x => String(x.id) === v)
                if (o) setForm(f => ({ ...f, bl: o.bl || f.bl, descripcion: f.descripcion.trim() ? f.descripcion : (o.nombre || '') }))
              }} style={{ ...INP, cursor: 'pointer', marginBottom: 10, color: linkOp ? '#0f172a' : '#94a3b8', background: '#f8fafc' }}>
                <option value="">Vincular a una operación de Operaciones…</option>
                {ops.map(o => <option key={o.id} value={String(o.id)}>{o.nombre || '(sin nombre)'}{o.bl ? ` · ${o.bl}` : ''}</option>)}
              </select>
            )}

            <div style={{ marginBottom: 8 }}>
              <input value={form.descripcion} onChange={e => upd('descripcion', e.target.value)} style={INP} placeholder="Descripción de la carga *" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8, marginBottom: '1.15rem' }}>
              <input value={form.bl} onChange={e => upd('bl', e.target.value)} style={{ ...INP, fontFamily: 'ui-monospace,monospace' }} placeholder="N° B/L / Referencia" />
              <select value={form.estado} onChange={e => upd('estado', e.target.value)} style={{ ...INP, cursor: 'pointer' }}>
                {ESTADOS_IMP.map(s => <option key={s} value={s}>{s}</option>)}
                {form.estado && !ESTADOS_IMP.includes(form.estado) && <option value={form.estado}>{form.estado}</option>}
              </select>
            </div>

            <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Costos <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· solo los que apliquen</span></p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {CONCEPTOS.map(([k, lbl]) => (
                <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 100px 132px', gap: 8, alignItems: 'center' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: numUSD(conc[k].m) > 0 ? '#0f172a' : '#64748b' }}>{lbl}</label>
                  <input value={conc[k].m} onChange={e => updConc(k, { m: e.target.value })} inputMode="decimal" placeholder="0"
                    style={{ ...INP, padding: '0.4rem 0.55rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: numUSD(conc[k].m) > 0 ? 700 : 400 }} />
                  <FNToggle f={conc[k].f} onChange={f => updConc(k, { f })} small />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '0.5rem 0.1rem', borderTop: '1px solid #f1f5f9', marginBottom: '1.05rem' }}>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                {formTotals.fact > 0 && <>Te factura <b style={{ color: '#059669' }}>{fmtUSD(formTotals.fact)}</b></>}
                {formTotals.fact > 0 && formTotals.negro > 0 && ' · '}
                {formTotals.negro > 0 && <>En negro <b style={{ color: '#0f172a' }}>{fmtUSD(formTotals.negro)}</b></>}
              </span>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>Total <b style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(formTotals.total)}</b></span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748b' }}>Factura recibida</span>
                <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 7, padding: 2, gap: 2 }}>
                  {[[1, 'Sí'], [0, 'No']].map(([v, l]) => {
                    const on = !!form.facturado === !!v
                    return <button key={l} onClick={() => upd('facturado', v)} style={{ padding: '0.26rem 0.7rem', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: on ? 700 : 500, background: on ? '#fff' : 'transparent', color: on ? (v ? '#059669' : '#dc2626') : '#94a3b8', boxShadow: on ? '0 1px 2px rgba(15,23,42,0.10)' : 'none' }}>{l}</button>
                  })}
                </div>
              </div>
              <input value={form.factura_nro} onChange={e => upd('factura_nro', e.target.value)} style={{ ...INP, padding: '0.4rem 0.55rem' }} placeholder="N° factura / comprobante" />
            </div>

            <input value={form.notas} onChange={e => upd('notas', e.target.value)} style={{ ...INP, marginBottom: '1.15rem' }} placeholder="Observaciones (opcional)" />

            {modal !== 'new' && numUSD(modal.total_pagado) > 0 && (
              <p style={{ fontSize: '0.7rem', color: '#94a3b8', margin: '-0.5rem 0 0.9rem' }}>
                Ya pagado <b style={{ color: '#334155' }}>{fmtUSD(numUSD(modal.total_pagado))}</b> → saldo tras guardar: <b style={{ color: '#0f172a' }}>{fmtUSD(formTotals.total - numUSD(modal.total_pagado))}</b>
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setModal(null)} style={{ padding: '0.55rem 1.1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={save} disabled={saving} style={{ padding: '0.55rem 1.3rem', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Guardando…' : (modal === 'new' ? 'Crear operación' : 'Guardar')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={() => setConfirmDel(null)}>
          <div style={{ ...CARD, maxWidth: 340, padding: '1.75rem', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>¿Eliminar registro?</p>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1.25rem' }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => setConfirmDel(null)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => del(confirmDel)} style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Borrar pago confirm */}
      {confirmPago && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={() => setConfirmPago(null)}>
          <div style={{ ...CARD, maxWidth: 360, padding: '1.75rem', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>¿Borrar este pago?</p>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1.25rem' }}>
              {confirmPago.pg.fecha || 's/fecha'} · {metodoLabel(confirmPago.pg.metodo)} · <b>{fmtUSD(numUSD(confirmPago.pg.monto))}</b><br />
              Sale del historial y el saldo se recalcula.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => setConfirmPago(null)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={delPago} style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Borrar pago</button>
            </div>
          </div>
        </div>
      )}

      {/* Registrar pago (cuenta corriente): evento en el ledger + actualiza el saldo */}
      {pagoModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setPagoModal(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ ...CARD, width: '100%', maxWidth: 380, padding: '1.25rem' }}>
            <p style={{ fontWeight: 800, color: '#0f172a', marginBottom: 3, fontSize: '0.95rem' }}>Registrar pago al despachante</p>
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 12 }}>{pagoModal.row.descripcion} · saldo {fmtUSD(numUSD(pagoModal.row.saldo))} · puede ser parcial</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><label style={LBL}>Fecha</label><input type="date" value={pagoModal.fecha} onChange={e => setPagoModal(f => ({ ...f, fecha: e.target.value }))} style={INP} /></div>
              <div><label style={LBL}>Monto (USD)</label><input inputMode="decimal" value={pagoModal.monto} onChange={e => setPagoModal(f => ({ ...f, monto: e.target.value }))} style={INP} placeholder="0" /></div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={LBL}>Método</label>
              <div style={{ display: 'flex', gap: 3, background: '#f1f5f9', borderRadius: 8, padding: 3 }}>
                {[['transferencia', 'Transferencia'], ['cash', 'Efectivo']].map(([v, l]) => {
                  const on = pagoModal.metodo === v
                  return <button key={v} onClick={() => setPagoModal(f => ({ ...f, metodo: v }))} style={{ flex: 1, padding: '0.35rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.76rem', fontWeight: on ? 700 : 500, background: on ? '#fff' : 'transparent', color: on ? '#0f172a' : '#64748b', boxShadow: on ? '0 1px 2px rgba(15,23,42,0.1)' : 'none' }}>{l}</button>
                })}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}><label style={LBL}>Nota (opcional)</label><input value={pagoModal.nota} onChange={e => setPagoModal(f => ({ ...f, nota: e.target.value }))} style={INP} placeholder="Ej: adelanto 50%" /></div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setPagoModal(null)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={savePagoDesp} disabled={pagoBusy} style={{ padding: '0.5rem 1.1rem', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: pagoBusy ? 'wait' : 'pointer' }}>{pagoBusy ? 'Guardando…' : 'Registrar'}</button>
            </div>
          </div>
        </div>
      )}

      {ficha && <FichaImportacion bl={ficha.bl} seed={{ desp: ficha.desp, ship: ficha.ship }} onClose={() => setFicha(null)} onChanged={load} />}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
