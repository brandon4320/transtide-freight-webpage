'use client'

import { useState, useEffect, useMemo } from 'react'
import { gToast } from '../toast'
import FichaImportacion from '../ficha-importacion'

const CARD = { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf1', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }
const INP = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '16px', color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const LBL = { display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#64748b', letterSpacing: 0, marginBottom: 5 }
const SEC = { fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.85rem', paddingBottom: '0.45rem', borderBottom: '1px solid #f1f5f9' }
const PRIMARY = '#0f172a'

const ESTADOS_IMP = ['En curso', 'Terminada', 'Demorada']

const blNorm = (b) => (b || '').replace(/[\s-]/g, '').toUpperCase()
const numUSD = (v) => { const n = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n }
const fmtUSD = (n) => 'USD ' + Math.round(n).toLocaleString('es-AR')
// Formatea un número calculado a string es-AR (compatible con numUSD al re-parsear).
const fmtCalc = (n) => { if (!isFinite(n)) return ''; const r = Math.round(n * 100) / 100; return r === 0 ? '' : r.toLocaleString('es-AR', { maximumFractionDigits: 2 }) }

// Semántica del saldo: honorarios − pagado − comisión.
//  > 0 → le debés al despachante · < 0 → saldo a tu favor · 0 → saldado
function saldoStyle(saldo, totalHon) {
  if (saldo > 0)  return { key: 'debe',    bg: '#fef2f2', dot: '#dc2626', c: '#dc2626', label: 'Debés' }
  if (saldo < 0)  return { key: 'favor',   bg: '#fffbeb', dot: '#d97706', c: '#b45309', label: 'A tu favor' }
  if (totalHon > 0) return { key: 'saldado', bg: '#f0fdf4', dot: '#16a34a', c: '#16a34a', label: 'Saldado' }
  return { key: 'vacio', bg: '#fff', dot: '#cbd5e1', c: '#94a3b8', label: '—' }
}

// Chip auto/manual para campos calculados (mismo patrón que tracking).
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

const EMPTY = { bl: '', descripcion: '', estado: 'En curso', hon_regulares: '', adu_extras: '', otros_gastos: '', total_honorarios: '', fecha_pago: '', pago_transferencia: '', pago_cash: '', total_pagado: '', comision: '', facturado: 0, factura_nro: '', saldo: '', notas: '' }

export default function DespachantePage({ devRows = null, devShips = null } = {}) {
  const [rows, setRows] = useState([])
  const [ships, setShips] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('todos')
  const [modal, setModal] = useState(null)   // null | 'new' | rowObj
  const [form, setForm] = useState(EMPTY)
  const [confirmDel, setConfirmDel] = useState(null)
  const [saving, setSaving] = useState(false)
  const [honAuto, setHonAuto] = useState(true)     // total honorarios = reg + extras + otros
  const [pagAuto, setPagAuto] = useState(true)     // total pagado = transferencia + cash
  const [salAuto, setSalAuto] = useState(true)     // saldo = honorarios − pagado − comisión
  const [ficha, setFicha] = useState(null)         // B/L abierto en la ficha integral

  const load = async () => {
    // Inyección para preview de diseño (dev): evita auth/D1.
    if (devRows) { setRows(devRows); setShips(devShips || []); setLoading(false); return }
    setLoading(true)
    setLoadError(false)
    try {
      const [d, t] = await Promise.all([fetch('/api/db/despachante'), fetch('/api/tracking')])
      if (!d.ok) throw new Error('despachante')
      setRows(await d.json())
      if (t.ok) { const td = await t.json(); setShips(td.shipments || []) }
    } catch {
      setLoadError(true)
      gToast.error('No se pudieron cargar los pagos al despachante.')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  // Embarque por B/L (para vincular con el tracking).
  const shipByBL = useMemo(() => {
    const m = {}; ships.forEach(s => { if (s.bl) m[blNorm(s.bl)] = s }); return m
  }, [ships])

  // ── autocálculos (mismo esquema que tracking; el usuario puede pasar a manual) ──
  useEffect(() => {
    if (modal === null || !honAuto) return
    const v = fmtCalc(numUSD(form.hon_regulares) + numUSD(form.adu_extras) + numUSD(form.otros_gastos))
    setForm(p => p.total_honorarios === v ? p : ({ ...p, total_honorarios: v }))
  }, [form.hon_regulares, form.adu_extras, form.otros_gastos, honAuto, modal])

  useEffect(() => {
    if (modal === null || !pagAuto) return
    const v = fmtCalc(numUSD(form.pago_transferencia) + numUSD(form.pago_cash))
    setForm(p => p.total_pagado === v ? p : ({ ...p, total_pagado: v }))
  }, [form.pago_transferencia, form.pago_cash, pagAuto, modal])

  useEffect(() => {
    if (modal === null || !salAuto) return
    const v = fmtCalc(numUSD(form.total_honorarios) - numUSD(form.total_pagado) - numUSD(form.comision))
    setForm(p => p.saldo === v ? p : ({ ...p, saldo: v }))
  }, [form.total_honorarios, form.total_pagado, form.comision, salAuto, modal])

  const filtered = useMemo(() => {
    let l = rows
    if (query.trim()) {
      const q = query.toLowerCase()
      l = l.filter(r => [r.bl, r.descripcion, r.factura_nro, r.notas].some(v => (v || '').toLowerCase().includes(q)))
    }
    if (filter === 'debe')     l = l.filter(r => numUSD(r.saldo) > 0)
    if (filter === 'favor')    l = l.filter(r => numUSD(r.saldo) < 0)
    if (filter === 'saldado')  l = l.filter(r => numUSD(r.saldo) === 0 && numUSD(r.total_honorarios) > 0)
    if (filter === 'sinfact')  l = l.filter(r => !r.facturado && numUSD(r.total_honorarios) > 0)
    return l
  }, [rows, query, filter])

  const stats = useMemo(() => {
    const debe = rows.reduce((a, r) => a + Math.max(0, numUSD(r.saldo)), 0)
    const favor = rows.reduce((a, r) => a + Math.max(0, -numUSD(r.saldo)), 0)
    const sinFact = rows.filter(r => !r.facturado && numUSD(r.total_honorarios) > 0).length
    return { total: rows.length, debe, favor, sinFact }
  }, [rows])

  const openNew = () => { setForm({ ...EMPTY }); setHonAuto(true); setPagAuto(true); setSalAuto(true); setModal('new') }
  const openEdit = (r) => {
    setForm({ ...EMPTY, ...r })
    // Igual que tracking: si el valor guardado coincide con el cálculo (o está vacío), queda en auto.
    const calcH = fmtCalc(numUSD(r.hon_regulares) + numUSD(r.adu_extras) + numUSD(r.otros_gastos))
    const calcP = fmtCalc(numUSD(r.pago_transferencia) + numUSD(r.pago_cash))
    const calcS = fmtCalc(numUSD(r.total_honorarios) - numUSD(r.total_pagado) - numUSD(r.comision))
    setHonAuto(!r.total_honorarios || String(r.total_honorarios) === calcH)
    setPagAuto(!r.total_pagado || String(r.total_pagado) === calcP)
    setSalAuto(!r.saldo || String(r.saldo) === calcS)
    setModal(r)
  }

  async function errMsg(res, fallback) {
    try { const j = await res.json(); return j.error || fallback } catch { return fallback }
  }

  const save = async () => {
    if (!form.descripcion.trim()) { gToast.error('La descripción es obligatoria.'); return }
    setSaving(true)
    try {
      if (modal === 'new') {
        const r = await fetch('/api/db/despachante', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        if (!r.ok) throw new Error(await errMsg(r, 'Error al crear'))
        gToast.success('Pago registrado.')
      } else {
        const r = await fetch(`/api/db/despachante/${modal.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
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

  const upd = (f, v) => setForm(p => ({ ...p, [f]: v }))

  const TH = { fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.6rem 0.7rem', borderBottom: '1px solid #e8ecf1', whiteSpace: 'nowrap', background: '#f8fafc', position: 'sticky', top: 0, zIndex: 3, textAlign: 'left' }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.2rem' }}>Despachante de aduana</h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Control de honorarios, pagos y comisiones · {rows.length} importaciones</p>
        </div>
        <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 1.1rem', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nueva importación
        </button>
      </div>

      {/* KPIs */}
      <div className="track-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: '1rem' }}>
        {[
          { lbl: 'Importaciones', val: stats.total, color: '#334155', dot: '#94a3b8' },
          { lbl: 'Le debés al despachante', val: fmtUSD(stats.debe), color: stats.debe > 0 ? '#dc2626' : '#334155', dot: '#dc2626' },
          { lbl: 'Saldo a tu favor', val: fmtUSD(stats.favor), color: stats.favor > 0 ? '#b45309' : '#334155', dot: '#d97706' },
          { lbl: 'Sin facturar', val: stats.sinFact, color: stats.sinFact > 0 ? '#2563eb' : '#334155', dot: '#2563eb' },
        ].map(k => (
          <div key={k.lbl} style={{ ...CARD, padding: '0.7rem 0.95rem' }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.56rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: k.dot, flex: '0 0 auto' }} />{k.lbl}
            </p>
            <p style={{ fontSize: '1.3rem', fontWeight: 800, color: k.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{k.val}</p>
          </div>
        ))}
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

      {/* Table */}
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
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Sin registros que coincidan.</div>
      ) : (
        <div style={{ ...CARD }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.8rem' }}>
            <thead>
              <tr>
                <th style={TH}>Importación</th>
                <th style={TH}>Estado</th>
                <th style={{ ...TH, textAlign: 'right' }}>Honorarios</th>
                <th style={{ ...TH, textAlign: 'right' }}>Pagado</th>
                <th style={{ ...TH, textAlign: 'right' }}>Comisión</th>
                <th style={TH}>Fact.</th>
                <th style={{ ...TH, textAlign: 'right' }}>Saldo</th>
                <th style={{ ...TH, width: 1 }} aria-label="Acciones"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const saldo = numUSD(r.saldo)
                const st = saldoStyle(saldo, numUSD(r.total_honorarios))
                const ship = shipByBL[blNorm(r.bl)]
                const TD = { padding: '0.5rem 0.7rem', borderBottom: '1px solid #eef2f7', verticalAlign: 'middle' }
                const desglose = ['Regulares ' + (r.hon_regulares || '—'), r.adu_extras && 'Adu extras ' + r.adu_extras, r.otros_gastos && 'Otros ' + r.otros_gastos].filter(Boolean).join(' · ')
                return (
                  <tr key={r.id} className="track-row" style={{ cursor: 'pointer', background: st.bg, transition: 'filter .12s' }} onClick={() => r.bl ? setFicha({ bl: r.bl, desp: r, ship: shipByBL[blNorm(r.bl)] || null }) : openEdit(r)}>
                    <td style={{ ...TD, minWidth: 220, boxShadow: `inset 4px 0 0 ${st.dot}` }}>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{r.descripcion || '—'}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: '0.66rem', color: '#94a3b8' }}>
                        {r.bl && <span style={{ fontFamily: 'ui-monospace,monospace', color: '#64748b' }}>{r.bl}</span>}
                        {ship && (
                          <button onClick={e => { e.stopPropagation(); window.location.href = '/gestion/tracking' }} title={`Embarque #${ship.num} · ${ship.origen} → ${ship.destino}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.6rem', fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, padding: '0.03rem 0.35rem', cursor: 'pointer' }}>
                            🚢 #{ship.num}
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '0.64rem', fontWeight: 600, padding: '0.18rem 0.5rem', borderRadius: 6, border: '1px solid', color: r.estado === 'Terminada' ? '#065f46' : '#1d4ed8', borderColor: r.estado === 'Terminada' ? '#a7f3d0' : '#bfdbfe', background: '#fff' }}>{r.estado || '—'}</span>
                    </td>
                    <td title={desglose} style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {r.total_honorarios ? 'USD ' + r.total_honorarios : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      <div style={{ color: '#334155', fontWeight: 600 }}>{r.total_pagado ? 'USD ' + r.total_pagado : <span style={{ color: '#cbd5e1' }}>—</span>}</div>
                      {r.fecha_pago && <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>{r.fecha_pago}</div>}
                    </td>
                    <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: numUSD(r.comision) > 0 ? '#7c3aed' : '#cbd5e1', fontWeight: 600 }}>
                      {numUSD(r.comision) > 0 ? 'USD ' + r.comision : '—'}
                    </td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                      {r.facturado
                        ? <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 5, padding: '0.14rem 0.45rem' }}>Sí{r.factura_nro ? ` · ${r.factura_nro}` : ''}</span>
                        : <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, padding: '0.14rem 0.45rem' }}>No</span>}
                    </td>
                    <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: st.c }}>
                      {saldo !== 0 ? (saldo < 0 ? `USD ${fmtCalc(Math.abs(saldo))} a favor` : 'USD ' + r.saldo) : (numUSD(r.total_honorarios) > 0 ? '✓' : '—')}
                    </td>
                    <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                      <div className="track-actions" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => openEdit(r)} title="Editar" aria-label="Editar" style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={() => setConfirmDel(r.id)} title="Eliminar" aria-label="Eliminar" style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #fee2e2', background: '#fff', color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
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
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{modal === 'new' ? 'Nueva importación' : (form.descripcion || 'Editar')}</h3>
              <button onClick={() => setModal(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <p style={SEC}>Importación</p>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: '1.25rem' }}>
              <div><label style={LBL}>Descripción de la carga *</label><input value={form.descripcion} onChange={e => upd('descripcion', e.target.value)} style={INP} placeholder="Ej: Módulos + mix varios" /></div>
              <div><label style={LBL}>N° B/L / Referencia</label><input value={form.bl} onChange={e => upd('bl', e.target.value)} style={{ ...INP, fontFamily: 'ui-monospace,monospace' }} /></div>
              <div><label style={LBL}>Estado</label>
                <select value={form.estado} onChange={e => upd('estado', e.target.value)} style={{ ...INP, cursor: 'pointer' }}>
                  {ESTADOS_IMP.map(s => <option key={s} value={s}>{s}</option>)}
                  {form.estado && !ESTADOS_IMP.includes(form.estado) && <option value={form.estado}>{form.estado}</option>}
                </select>
              </div>
            </div>

            <p style={SEC}>Costos y pago</p>
            <div className="track-cost-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>

              {/* Panel 1 — honorarios → total */}
              <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 10, padding: '0.9rem 1rem' }}>
                <p style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: '0.75rem' }}>Honorarios del despachante</p>
                <div><label style={LBL}>Honorarios regulares (USD)</label><input value={form.hon_regulares} onChange={e => upd('hon_regulares', e.target.value)} inputMode="decimal" style={{ ...INP, marginBottom: '0.6rem' }} placeholder="0" /></div>
                <div><label style={LBL}>Aduana extras (USD)</label><input value={form.adu_extras} onChange={e => upd('adu_extras', e.target.value)} inputMode="decimal" style={{ ...INP, marginBottom: '0.6rem' }} placeholder="0" /></div>
                <div><label style={LBL}>Otros gastos (USD)</label><input value={form.otros_gastos} onChange={e => upd('otros_gastos', e.target.value)} inputMode="decimal" style={INP} placeholder="0" /></div>
                <div style={{ borderTop: '1px solid #f1f5f9', margin: '0.85rem 0 0.65rem' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', display: 'inline-flex', alignItems: 'center' }}>Total <CalcChip auto={honAuto} onToggle={() => setHonAuto(a => !a)} /></label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>USD</span>
                    <input value={form.total_honorarios} onChange={e => { setHonAuto(false); upd('total_honorarios', e.target.value) }} readOnly={honAuto} inputMode="decimal"
                      style={{ ...INP, width: 130, textAlign: 'right', fontWeight: 800, fontSize: '0.95rem', fontVariantNumeric: 'tabular-nums', background: honAuto ? '#f8fafc' : '#fff', color: honAuto ? '#334155' : '#0f172a' }} />
                  </div>
                </div>
              </div>

              {/* Panel 2 — pago → total pagado */}
              <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 10, padding: '0.9rem 1rem' }}>
                <p style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: '0.75rem' }}>Pago al despachante</p>
                <div><label style={LBL}>Por transferencia (USD)</label><input value={form.pago_transferencia} onChange={e => upd('pago_transferencia', e.target.value)} inputMode="decimal" style={{ ...INP, marginBottom: '0.6rem' }} placeholder="0" /></div>
                <div><label style={LBL}>En efectivo (USD)</label><input value={form.pago_cash} onChange={e => upd('pago_cash', e.target.value)} inputMode="decimal" style={INP} placeholder="0" /></div>
                <div style={{ borderTop: '1px solid #f1f5f9', margin: '0.85rem 0 0.65rem' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', display: 'inline-flex', alignItems: 'center' }}>Pagado <CalcChip auto={pagAuto} onToggle={() => setPagAuto(a => !a)} /></label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>USD</span>
                    <input value={form.total_pagado} onChange={e => { setPagAuto(false); upd('total_pagado', e.target.value) }} readOnly={pagAuto} inputMode="decimal"
                      style={{ ...INP, width: 130, textAlign: 'right', fontWeight: 800, fontSize: '0.95rem', fontVariantNumeric: 'tabular-nums', background: pagAuto ? '#f8fafc' : '#fff', color: pagAuto ? '#334155' : '#0f172a' }} />
                  </div>
                </div>
                <div style={{ marginTop: '0.7rem' }}><label style={LBL}>Fecha de pago</label><input type="date" value={form.fecha_pago} onChange={e => upd('fecha_pago', e.target.value)} style={INP} /></div>
              </div>
            </div>

            {/* Panel 3 — comisión, facturación y saldo */}
            <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 10, padding: '0.9rem 1rem', marginBottom: '1.25rem' }}>
              <p style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: '0.75rem' }}>Comisión y facturación</p>
              <div className="track-cost-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div><label style={LBL}>Tu comisión (USD)</label><input value={form.comision} onChange={e => upd('comision', e.target.value)} inputMode="decimal" style={INP} placeholder="0" /></div>
                <div>
                  <label style={LBL}>¿Facturado?</label>
                  <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 8, padding: 3, gap: 2 }}>
                    {[[1, 'Sí'], [0, 'No']].map(([v, l]) => {
                      const on = !!form.facturado === !!v
                      return <button key={l} onClick={() => upd('facturado', v)} style={{ flex: 1, padding: '0.34rem 0.4rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.76rem', fontWeight: on ? 700 : 500, background: on ? '#fff' : 'transparent', color: on ? (v ? '#059669' : '#dc2626') : '#64748b', boxShadow: on ? '0 1px 2px rgba(15,23,42,0.10)' : 'none' }}>{l}</button>
                    })}
                  </div>
                </div>
                <div><label style={LBL}>N° factura / comprobante</label><input value={form.factura_nro} onChange={e => upd('factura_nro', e.target.value)} style={INP} /></div>
              </div>
              <div style={{ borderTop: '1px solid #f1f5f9', margin: '0.85rem 0 0.65rem' }} />
              {(() => {
                const s = numUSD(form.saldo)
                const st = saldoStyle(s, numUSD(form.total_honorarios))
                return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', display: 'inline-flex', alignItems: 'center' }}>Saldo <CalcChip auto={salAuto} onToggle={() => setSalAuto(a => !a)} /></label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: st.c }}>{s > 0 ? 'le debés' : s < 0 ? 'a tu favor' : numUSD(form.total_honorarios) > 0 ? 'saldado ✓' : ''}</span>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>USD</span>
                      <input value={form.saldo} onChange={e => { setSalAuto(false); upd('saldo', e.target.value) }} readOnly={salAuto} inputMode="decimal"
                        title={salAuto ? 'Calculado: honorarios − pagado − comisión' : 'Ingreso manual'}
                        style={{ ...INP, width: 130, textAlign: 'right', fontWeight: 800, fontSize: '0.95rem', fontVariantNumeric: 'tabular-nums', background: salAuto ? '#f8fafc' : '#fff', color: st.c }} />
                    </div>
                  </div>
                )
              })()}
            </div>

            <div style={{ marginBottom: '1.5rem' }}><label style={LBL}>Observaciones</label><textarea value={form.notas} onChange={e => upd('notas', e.target.value)} style={{ ...INP, minHeight: 56, resize: 'vertical' }} /></div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setModal(null)} style={{ padding: '0.55rem 1.1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={save} disabled={saving} style={{ padding: '0.55rem 1.3rem', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Guardando…' : (modal === 'new' ? 'Registrar' : 'Guardar cambios')}</button>
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

      {ficha && <FichaImportacion bl={ficha.bl} seed={{ desp: ficha.desp, ship: ficha.ship }} onClose={() => setFicha(null)} onChanged={load} />}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
