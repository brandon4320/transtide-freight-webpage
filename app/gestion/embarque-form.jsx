'use client'

// ─── Formulario de embarque (compartido) ─────────────────────────────────────
// Una sola fuente para cargar/editar embarques del agente de carga. Se usa
// desde la OPERACIÓN (la carga de datos vive en el expediente) y desde el
// resumen por agente (Tracking). Escribe siempre en /api/tracking.

import { useState, useEffect, useMemo } from 'react'
import { gToast } from './toast'

export const AGENTES = ['Bruce', 'Shaina', 'Yachao'] // Bruce y Shaina marítimo · Yachao aéreo
export const STATUSES = ['In Transit', 'Delivered - Payment Pending', 'Delivered - Paid', 'Cancelled', 'Booked', 'Customs']

const CARD = { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf1', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }
const INP = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '16px', color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const LBL = { display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#64748b', letterSpacing: 0, marginBottom: 5 }
const SEC = { fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.85rem', paddingBottom: '0.45rem', borderBottom: '1px solid #f1f5f9' }
const PANEL = { background: '#fff', border: '1px solid #e8ecf1', borderRadius: 10, padding: '0.9rem 1rem' }
const PANEL_T = { fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: '0.75rem' }
const DIV = { borderTop: '1px solid #f1f5f9', margin: '0.85rem 0 0.75rem' }
const miniBtn = (on) => ({ fontSize: '0.62rem', fontWeight: 700, padding: '0.25rem 0.5rem', borderRadius: 6, cursor: 'pointer', border: `1px solid ${on ? '#cbd5e1' : '#e2e8f0'}`, background: on ? '#f1f5f9' : '#fff', color: on ? '#0f172a' : '#6b7280' })
const linkBtn = { background: 'none', border: 'none', padding: 0, fontSize: '0.62rem', fontWeight: 700, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }

const numUSD = (v) => { const n = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n }
const fmtCalc = (n) => { if (!isFinite(n)) return ''; const r = Math.round(n * 100) / 100; return r.toLocaleString('es-AR', { maximumFractionDigits: 2 }) }
const TC_RMB_DEFAULT = 7
const rmbToUsd = (rmb, tc) => { const r = numUSD(rmb); if (!r) return 0; const t = numUSD(tc) || TC_RMB_DEFAULT; return t > 0 ? r / t : 0 }

// ─── Fechas (bloque de retiro) ───────────────────────────────────────────────
// Todo se guarda ISO ('YYYY-MM-DD') porque es lo que come <input type="date">.
const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))
const parseISO = (s) => { if (!isISO(s)) return null; const d = new Date(s + 'T00:00:00'); return isNaN(d.getTime()) ? null : d }
const addDays = (iso, n) => { const d = parseISO(iso); if (!d || !isFinite(n)) return ''; d.setDate(d.getDate() + n); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
// días desde hoy: > 0 = falta, 0 = hoy, < 0 = ya pasó
const daysFromToday = (iso) => { const d = parseISO(iso); if (!d) return null; const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((d.getTime() - t.getTime()) / 86400000) }
const fmtFecha = (iso) => { const d = parseISO(iso); if (!d) return ''; return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) }
const intDias = (v) => { const n = parseInt(String(v || '').replace(/[^\d]/g, ''), 10); return isNaN(n) ? 0 : n }
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`

// Canal de aduana. Solo color semántico en texto/borde, sin fondos fuertes.
const CANALES = [
  { v: 'verde',   lbl: 'Verde',   c: '#059669', bd: '#a7f3d0', bg: '#f0fdf4' },
  { v: 'naranja', lbl: 'Naranja', c: '#d97706', bd: '#fde68a', bg: '#fffbeb' },
  { v: 'rojo',    lbl: 'Rojo',    c: '#dc2626', bd: '#fecaca', bg: '#fef2f2' },
]

function statusChipStyle(raw) {
  const s = (raw || '').toLowerCase()
  if (/cancel/.test(s))  return { c: '#dc2626', border: '#fecaca', dot: '#dc2626' }
  if (/paid/.test(s))    return { c: '#065f46', border: '#a7f3d0', dot: '#059669' }
  if (/pending/.test(s)) return { c: '#d97706', border: '#fde68a', dot: '#d97706' }
  if (/transit/.test(s)) return { c: '#1d4ed8', border: '#bfdbfe', dot: '#2563eb' }
  return { c: '#64748b', border: '#e2e8f0', dot: '#94a3b8' }
}

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

// Bloque "Retiro y devolución": free time, canal y turnos de terminal. Son los
// campos que alimentan las alertas de almacenaje / canal rojo / detention.
// Se persisten en shipments como TEXT (ver RETIRO_FIELDS en /api/tracking).
export const RETIRO_EMPTY = {
  arribo_real: '', free_time_dias: '', free_time_hasta: '', canal: '',
  retiro_real_fecha: '', turno_retiro_fecha: '', turno_retiro_hora: '', retiro_ok: '',
  devol_vacio_fecha: '', devol_vacio_hora: '', devol_vacio_ok: '',
}

export const EMBARQUE_EMPTY = { num: '', agente: 'Bruce', origen: '', destino: '', contenedores: '', modo: '', bl: '', carrier: '', etd: '', eta: '', status: 'In Transit', sea_freight_usd: '', other_fees_rmb: '', tc_rmb: '', other_fees_usd: '', discount_usd: '', total_usd: '', suppliers: '', amount_due_usd: '', amount_rec_usd: '', balance_usd: '', payment_date: '', notes: '', operation_id: '', ...RETIRO_EMPTY }

// initial: null = nuevo · shipObj = editar. defaults: precarga para nuevos
// (ej. desde la operación: bl, contenedores, eta, operation_id).
export function EmbarqueModal({ initial = null, defaults = {}, onClose, onSaved }) {
  const isNew = !initial
  // D1 devuelve NULL en las columnas de texto vacías: se normalizan a '' para que
  // los inputs sigan siendo controlados (sobre todo las columnas nuevas de retiro).
  const clean = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, v == null ? '' : v]))
  const [form, setForm] = useState(() => ({ ...EMBARQUE_EMPTY, ...(isNew ? clean(defaults) : {}), ...clean(initial) }))
  const [saving, setSaving] = useState(false)
  // Navieras y forwarders desde el módulo Contactos (una sola libreta para todo).
  const [contactos, setContactos] = useState([])
  useEffect(() => {
    let cancelled = false
    fetch('/api/db/contactos').then(r => r.ok ? r.json() : null).then(j => { if (!cancelled && Array.isArray(j)) setContactos(j) }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  const navieras = contactos.filter(c => c.tipo === 'naviera')
  const agentesContactos = contactos.filter(c => c.tipo === 'agente').map(c => c.nombre)
  const agentesSugeridos = [...new Set([...AGENTES, ...agentesContactos])]
  const navieraMatch = navieras.find(c => (c.nombre || '').toLowerCase() === (form.carrier || '').trim().toLowerCase())
  const [totalAuto, setTotalAuto] = useState(() => {
    if (isNew) return true
    const calcT = fmtCalc(numUSD(initial.sea_freight_usd) + numUSD(initial.other_fees_usd) + rmbToUsd(initial.other_fees_rmb, initial.tc_rmb) - numUSD(initial.discount_usd))
    return !initial.total_usd || String(initial.total_usd) === calcT
  })
  // "A pagar" sigue al Total salvo que le pagues distinto a lo facturado. Antes
  // era un campo suelto: si lo dejabas vacío el embarque figuraba saldado, no
  // sumaba al "a pagar" de Forwarding y nunca disparaba la alerta de pago.
  const [dueAuto, setDueAuto] = useState(() => {
    if (isNew) return true
    const due = numUSD(initial.amount_due_usd)
    if (!due) return true // vacío o en cero ⇒ vuelve a seguir al total
    return due === numUSD(initial.total_usd)
  })
  // Aviso puntual: embarque viejo que tenía total pero "A pagar" en cero.
  const dueEraCero = !isNew && !numUSD(initial.amount_due_usd) && numUSD(initial.total_usd) > 0
  const [balAuto, setBalAuto] = useState(() => {
    if (isNew) return true
    const calcB = fmtCalc(numUSD(initial.amount_due_usd) - numUSD(initial.amount_rec_usd))
    return !initial.balance_usd || String(initial.balance_usd) === calcB
  })
  // Fecha límite del free time = arribo real + días (editable a mano).
  const [freeAuto, setFreeAuto] = useState(() => {
    if (isNew) return true
    const calcF = intDias(initial.free_time_dias) > 0 ? addDays(initial.arribo_real, intDias(initial.free_time_dias)) : ''
    return !initial.free_time_hasta || String(initial.free_time_hasta) === calcF
  })

  const upd = (f, v) => setForm(p => ({ ...p, [f]: v }))
  const toggle = (f) => setForm(p => ({ ...p, [f]: p[f] ? '' : '1' }))
  // Fecha de hoy en la zona del navegador (toISOString daría UTC: a la noche adelanta un día).
  const hoyISO = () => { const d = new Date(); const p2 = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` }
  // Tildar "retirado" estampa la fecha real (el turno, o hoy): es la que arranca
  // el reloj del vacío. Se puede corregir a mano; destildar la limpia.
  const toggleRetiro = () => setForm(p => p.retiro_ok
    ? ({ ...p, retiro_ok: '', retiro_real_fecha: '' })
    : ({ ...p, retiro_ok: '1', retiro_real_fecha: p.retiro_real_fecha || p.turno_retiro_fecha || hoyISO() }))

  useEffect(() => {
    if (!totalAuto) return
    const v = fmtCalc(numUSD(form.sea_freight_usd) + numUSD(form.other_fees_usd) + rmbToUsd(form.other_fees_rmb, form.tc_rmb) - numUSD(form.discount_usd))
    setForm(p => p.total_usd === v ? p : ({ ...p, total_usd: v }))
  }, [form.sea_freight_usd, form.other_fees_usd, form.other_fees_rmb, form.tc_rmb, form.discount_usd, totalAuto])

  useEffect(() => {
    if (!dueAuto) return
    setForm(p => p.amount_due_usd === p.total_usd ? p : ({ ...p, amount_due_usd: p.total_usd }))
  }, [form.total_usd, dueAuto])

  useEffect(() => {
    if (!balAuto) return
    const v = fmtCalc(numUSD(form.amount_due_usd) - numUSD(form.amount_rec_usd))
    setForm(p => p.balance_usd === v ? p : ({ ...p, balance_usd: v }))
  }, [form.amount_due_usd, form.amount_rec_usd, balAuto])

  useEffect(() => {
    if (!freeAuto) return
    const d = intDias(form.free_time_dias)
    const v = d > 0 ? addDays(form.arribo_real, d) : ''
    setForm(p => p.free_time_hasta === v ? p : ({ ...p, free_time_hasta: v }))
  }, [form.arribo_real, form.free_time_dias, freeAuto])

  // Avisos vivos del bloque de retiro: los mismos hechos que después dispara el
  // centro de alertas, pero visibles mientras cargás. Solo color semántico.
  const avisos = useMemo(() => {
    const out = []
    const push = (tone, txt) => out.push({ tone, txt })
    const retirado = !!form.retiro_ok
    const devuelto = !!form.devol_vacio_ok

    if (form.canal === 'rojo') push('red', 'Canal rojo — verificación física: avisale al cliente y contá días extra en terminal.')
    if (form.canal === 'naranja') push('amber', 'Canal naranja — revisión documental: tené la carpeta lista.')

    const ft = daysFromToday(form.free_time_hasta)
    if (ft != null && !retirado) {
      if (ft < 0) push('red', `Free time vencido hace ${plural(-ft, 'día', 'días')} — está corriendo almacenaje.`)
      else if (ft === 0) push('red', 'El free time vence hoy — retirá o vas a pagar almacenaje.')
      else if (ft <= 3) push('amber', `El free time vence en ${plural(ft, 'día', 'días')} (${fmtFecha(form.free_time_hasta)}).`)
      else push('mute', `Free time hasta el ${fmtFecha(form.free_time_hasta)} — faltan ${plural(ft, 'día', 'días')}.`)
    }

    const tr = daysFromToday(form.turno_retiro_fecha)
    if (!retirado && tr != null) {
      const hora = form.turno_retiro_hora ? ` ${form.turno_retiro_hora}` : ''
      if (tr < 0) push('amber', `El turno de retiro era el ${fmtFecha(form.turno_retiro_fecha)} y el contenedor sigue sin retirar.`)
      else if (tr === 0) push('amber', `Turno de retiro hoy${hora} — no lo pierdas.`)
      else push('mute', `Turno de retiro el ${fmtFecha(form.turno_retiro_fecha)}${hora}.`)
    }

    if (retirado && !devuelto) {
      const base = form.retiro_real_fecha || form.turno_retiro_fecha || form.arribo_real
      const d = daysFromToday(base)
      const desde = d != null ? -d : null
      if (desde != null && desde >= 0) push(desde >= 7 ? 'red' : desde >= 4 ? 'amber' : 'mute', `Contenedor retirado hace ${plural(desde, 'día', 'días')} — vacío sin devolver.`)
      else push('mute', 'Contenedor retirado — vacío sin devolver.')
    }

    const dv = daysFromToday(form.devol_vacio_fecha)
    if (!devuelto && dv != null) {
      const hora = form.devol_vacio_hora ? ` ${form.devol_vacio_hora}` : ''
      if (dv < 0) push('red', `El turno de devolución del vacío era el ${fmtFecha(form.devol_vacio_fecha)} — riesgo de detention.`)
      else if (dv <= 2) push('amber', `Devolución del vacío ${dv === 0 ? 'hoy' : `en ${plural(dv, 'día', 'días')}`}${hora}.`)
      else push('mute', `Devolución del vacío el ${fmtFecha(form.devol_vacio_fecha)}${hora}.`)
    }
    if (devuelto) push('ok', 'Vacío devuelto — sin riesgo de detention.')

    return out
  }, [form.canal, form.free_time_hasta, form.retiro_ok, form.devol_vacio_ok, form.retiro_real_fecha, form.turno_retiro_fecha, form.turno_retiro_hora, form.devol_vacio_fecha, form.devol_vacio_hora, form.arribo_real])

  const TONE = { red: '#dc2626', amber: '#d97706', ok: '#059669', mute: '#6b7280' }

  // El bloque de retiro solo importa cerca del arribo: si el embarque recién se
  // carga y falta más de una semana, arranca plegado para no estorbar. Con
  // cualquier dato cargado (o con el arribo encima) se abre solo.
  const [retiroOpen, setRetiroOpen] = useState(() => {
    const conDatos = Object.keys(RETIRO_EMPTY).some(k => String((initial || {})[k] || '').trim())
    if (conDatos) return true
    const d = daysFromToday((initial || defaults || {}).eta)
    return d == null ? !isNew : d <= 7
  })

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      // Editar va por PUT a la colección con el id en el body: es el único camino
      // que persiste también el bloque de retiro (/api/tracking/[id] solo escribe
      // los campos base y lo usan los registros de pago).
      const r = isNew
        ? await fetch('/api/tracking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        : await fetch('/api/tracking', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, id: initial.id }) })
      if (!r.ok) {
        let msg = 'Error al guardar'
        try { const j = await r.json(); msg = j.error || msg } catch {}
        throw new Error(msg)
      }
      let saved = { ...(initial || {}), ...form }
      if (isNew) { try { saved = await r.json() } catch {} }
      gToast.success(isNew ? 'Embarque creado.' : 'Embarque guardado.')
      onSaved?.(saved)
    } catch (e) {
      gToast.error(e.message || 'Error de conexión.')
    } finally { setSaving(false) }
  }

  const st = statusChipStyle(form.status)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }} onClick={onClose}>
      <div style={{ ...CARD, width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{isNew ? 'Cargar embarque' : `Embarque #${form.num || ''}`}</h3>
            {!isNew && form.status && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fff', color: st.c, border: `1px solid ${st.border}`, fontSize: '0.64rem', fontWeight: 600, padding: '0.18rem 0.5rem', borderRadius: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />{form.status}
              </span>
            )}
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <p style={SEC}>Logística</p>
        <div className="track-cost-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: '1.25rem' }}>
          <div><label style={LBL}>N°</label><input value={form.num} onChange={e => upd('num', e.target.value)} style={INP} /></div>
          <div><label style={LBL}>Agente de carga</label>
            <input list="agentes-datalist" value={form.agente} onChange={e => upd('agente', e.target.value)} style={INP} placeholder="Bruce, Global Trade…" />
            <datalist id="agentes-datalist">
              {agentesSugeridos.map(a => <option key={a} value={a} />)}
            </datalist>
          </div>
          <div><label style={LBL}>Origen</label><input value={form.origen} onChange={e => upd('origen', e.target.value)} style={INP} /></div>
          <div><label style={LBL}>Destino</label><input value={form.destino} onChange={e => upd('destino', e.target.value)} style={INP} /></div>
          <div><label style={LBL}>Contenedores</label><input value={form.contenedores} onChange={e => upd('contenedores', e.target.value)} style={INP} placeholder="1×40HQ o 3×40HQ" /></div>
          <div><label style={LBL}>Modo</label><input value={form.modo} onChange={e => upd('modo', e.target.value)} style={INP} placeholder="FOB / EXW" /></div>
          <div style={{ gridColumn: 'span 2' }}><label style={LBL}>B/L Number</label><input value={form.bl} onChange={e => upd('bl', e.target.value)} style={{ ...INP, fontFamily: 'ui-monospace,monospace' }} /></div>
          <div style={{ gridColumn: 'span 2' }}><label style={LBL}>Carrier / naviera</label>
            <input list="navieras-datalist" value={form.carrier} onChange={e => upd('carrier', e.target.value)} style={INP} placeholder="MSK / COSCO / CMA CGM…" />
            <datalist id="navieras-datalist">
              {navieras.map(c => <option key={c.id} value={c.nombre} />)}
            </datalist>
            {navieraMatch ? (
              <p style={{ fontSize: '0.62rem', color: '#475569', marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} title={navieraMatch.observaciones || ''}>
                {navieraMatch.telefono && <a href={'tel:' + navieraMatch.telefono} style={{ color: '#0284c7', fontWeight: 600 }}>📞 {navieraMatch.telefono}</a>}
                {navieraMatch.email && <a href={'mailto:' + navieraMatch.email} style={{ color: '#0284c7', fontWeight: 600 }}>✉️ {navieraMatch.email}</a>}
                {navieraMatch.contacto && <span style={{ color: '#64748b' }}>{navieraMatch.contacto}</span>}
                {!navieraMatch.telefono && !navieraMatch.email && !navieraMatch.contacto && <a href="/gestion/contactos" style={{ color: '#94a3b8' }}>sin datos — completar en Contactos →</a>}
              </p>
            ) : (form.carrier || '').trim() ? (
              <p style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: 3 }}>
                naviera no está en <a href="/gestion/contactos" style={{ color: '#0284c7', fontWeight: 600 }}>Contactos</a> — sumala para tener tel/mail a mano
              </p>
            ) : null}
          </div>
          <div><label style={LBL}>Zarpe (ETD)</label><input type="date" value={form.etd} onChange={e => upd('etd', e.target.value)} style={INP} /></div>
          <div><label style={LBL}>ETA</label><input type="date" value={form.eta} onChange={e => upd('eta', e.target.value)} style={INP} /></div>
          <div style={{ gridColumn: 'span 2' }}><label style={LBL}>Estado</label>
            <select value={form.status} onChange={e => upd('status', e.target.value)} style={{ ...INP, cursor: 'pointer' }}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              {form.status && !STATUSES.includes(form.status) && <option value={form.status}>{form.status}</option>}
            </select>
          </div>
        </div>

        <div style={{ ...SEC, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span>Retiro y devolución</span>
          <button type="button" onClick={() => setRetiroOpen(o => !o)} title="Free time, canal, turno de retiro y devolución del vacío" style={{ ...linkBtn, fontSize: '0.66rem' }}>
            {retiroOpen ? 'ocultar' : 'completar'}
          </button>
        </div>
        <div className="track-cost-grid" style={{ display: retiroOpen ? 'grid' : 'none', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: avisos.length ? '0.75rem' : '1.25rem' }}>

          {/* Panel 1 — arribo real, free time y canal */}
          <div style={PANEL}>
            <p style={PANEL_T}>Arribo, free time y canal</p>
            <label style={{ ...LBL, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <span>Arribo real</span>
              {!form.arribo_real && (
                <span style={{ display: 'inline-flex', gap: 10 }}>
                  <button type="button" onClick={() => upd('arribo_real', hoyISO())} style={linkBtn}>hoy</button>
                  {isISO(form.eta) && <button type="button" onClick={() => upd('arribo_real', form.eta)} style={linkBtn}>usar ETA {fmtFecha(form.eta)}</button>}
                </span>
              )}
            </label>
            <input type="date" value={form.arribo_real} onChange={e => upd('arribo_real', e.target.value)} style={{ ...INP, marginBottom: '0.7rem' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 8 }}>
              <div>
                <label style={LBL}>Free time (días)</label>
                <input value={form.free_time_dias} onChange={e => { setFreeAuto(true); upd('free_time_dias', e.target.value) }} inputMode="numeric" style={INP} placeholder="14" />
                <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                  {[7, 14, 21].map(d => (
                    <button key={d} type="button" onClick={() => { setFreeAuto(true); upd('free_time_dias', String(d)) }}
                      style={miniBtn(String(form.free_time_dias) === String(d))}>{d}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ ...LBL, display: 'inline-flex', alignItems: 'center' }}>Vence <CalcChip auto={freeAuto} onToggle={() => setFreeAuto(a => !a)} /></label>
                <input type="date" value={form.free_time_hasta} onChange={e => { setFreeAuto(false); upd('free_time_hasta', e.target.value) }} readOnly={freeAuto}
                  title={freeAuto ? 'Calculado: arribo real + días de free time' : 'Fecha límite manual'}
                  style={{ ...INP, background: freeAuto ? '#f8fafc' : '#fff', color: freeAuto ? '#334155' : '#0f172a' }} />
              </div>
            </div>

            <div style={{ marginTop: '0.75rem' }}>
              <label style={LBL}>Canal asignado</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {CANALES.map(c => {
                  const on = form.canal === c.v
                  return (
                    <button key={c.v} type="button" onClick={() => upd('canal', on ? '' : c.v)} title={on ? 'Tocá de nuevo para dejarlo sin asignar' : ''}
                      style={{ flex: 1, minHeight: 34, borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: on ? 800 : 600, border: `1px solid ${on ? c.bd : '#e2e8f0'}`, background: on ? c.bg : '#fff', color: on ? c.c : '#6b7280' }}>
                      {c.lbl}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Panel 2 — turnos de terminal y devolución del vacío */}
          <div style={PANEL}>
            <p style={PANEL_T}>Turnos de terminal</p>
            <label style={LBL}>Retiro del contenedor</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 8 }}>
              <input type="date" value={form.turno_retiro_fecha} onChange={e => upd('turno_retiro_fecha', e.target.value)} style={INP} />
              <input type="time" value={form.turno_retiro_hora} onChange={e => upd('turno_retiro_hora', e.target.value)} style={INP} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 34, marginTop: 4, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, color: form.retiro_ok ? '#0f172a' : '#6b7280' }}>
              <input type="checkbox" checked={!!form.retiro_ok} onChange={toggleRetiro} style={{ width: 16, height: 16, accentColor: '#111827', cursor: 'pointer' }} />
              Contenedor retirado
            </label>
            {form.retiro_ok ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <span style={{ fontSize: '0.66rem', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>Retirado el</span>
                <input type="date" value={form.retiro_real_fecha} onChange={e => upd('retiro_real_fecha', e.target.value)} style={{ ...INP, padding: '0.35rem 0.5rem' }} />
              </div>
            ) : null}

            <div style={DIV} />

            <label style={LBL}>Devolución del vacío</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 8 }}>
              <input type="date" value={form.devol_vacio_fecha} onChange={e => upd('devol_vacio_fecha', e.target.value)} style={INP} />
              <input type="time" value={form.devol_vacio_hora} onChange={e => upd('devol_vacio_hora', e.target.value)} style={INP} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 34, marginTop: 4, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, color: form.devol_vacio_ok ? '#0f172a' : '#6b7280' }}>
              <input type="checkbox" checked={!!form.devol_vacio_ok} onChange={() => toggle('devol_vacio_ok')} style={{ width: 16, height: 16, accentColor: '#111827', cursor: 'pointer' }} />
              Vacío devuelto
            </label>
          </div>
        </div>

        {avisos.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            {avisos.map((a, i) => (
              <p key={i} style={{ fontSize: '0.7rem', lineHeight: 1.5, fontWeight: a.tone === 'mute' ? 500 : 600, color: TONE[a.tone] }}>{a.txt}</p>
            ))}
          </div>
        )}

        <p style={SEC}>Costos del agente</p>
        <div className="track-cost-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.25rem' }}>

          {/* Panel 1 — build-up del costo → Total */}
          <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 10, padding: '0.9rem 1rem' }}>
            <p style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: '0.75rem' }}>Lo que pagás al agente</p>
            <div><label style={LBL}>Flete (USD)</label><input value={form.sea_freight_usd} onChange={e => upd('sea_freight_usd', e.target.value)} inputMode="decimal" style={{ ...INP, marginBottom: '0.6rem' }} placeholder="0" /></div>
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
            <div>
              <label style={{ ...LBL, display: 'inline-flex', alignItems: 'center' }}>A pagar (USD) <CalcChip auto={dueAuto} onToggle={() => setDueAuto(a => !a)} /></label>
              <input value={form.amount_due_usd} onChange={e => { setDueAuto(false); upd('amount_due_usd', e.target.value) }} readOnly={dueAuto} inputMode="decimal"
                title={dueAuto ? 'Copiado del Total al agente — tocá el chip si le pagás distinto a lo facturado' : 'Ingreso manual'}
                style={{ ...INP, background: dueAuto ? '#f8fafc' : '#fff', color: dueAuto ? '#334155' : '#0f172a' }} />
              {dueAuto && dueEraCero
                ? <p style={{ fontSize: '0.64rem', color: '#d97706', fontWeight: 600, margin: '4px 0 0' }}>Estaba en cero: se completó con el Total. Revisá antes de guardar.</p>
                : null}
              {!dueAuto && numUSD(form.amount_due_usd) <= 0 && numUSD(form.total_usd) > 0
                ? <p style={{ fontSize: '0.64rem', color: '#d97706', fontWeight: 600, margin: '4px 0 0' }}>Total USD {fmtCalc(numUSD(form.total_usd))} y A pagar en cero: no va a figurar como deuda ni disparar la alerta de pago.</p>
                : null}
              <div style={{ height: '0.6rem' }} />
            </div>
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
        <div className="track-cost-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1.5rem' }}>
          <div><label style={LBL}>Proveedores</label><textarea value={form.suppliers} onChange={e => upd('suppliers', e.target.value)} style={{ ...INP, minHeight: 56, resize: 'vertical' }} /></div>
          <div><label style={LBL}>Notas</label><textarea value={form.notes} onChange={e => upd('notes', e.target.value)} style={{ ...INP, minHeight: 56, resize: 'vertical' }} /></div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '0.55rem 1.1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ padding: '0.55rem 1.3rem', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Guardando…' : (isNew ? 'Crear embarque' : 'Guardar cambios')}</button>
        </div>
      </div>
    </div>
  )
}
