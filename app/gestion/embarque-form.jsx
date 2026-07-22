'use client'

// ─── Formulario de embarque (compartido) ─────────────────────────────────────
// Una sola fuente para cargar/editar embarques del agente de carga. Se usa
// desde la OPERACIÓN (la carga de datos vive en el expediente) y desde el
// resumen por agente (Tracking). Escribe siempre en /api/tracking.

import { useState, useEffect } from 'react'
import { gToast } from './toast'

export const AGENTES = ['Bruce', 'Shaina', 'Yachao'] // Bruce y Shaina marítimo · Yachao aéreo
export const STATUSES = ['In Transit', 'Delivered - Payment Pending', 'Delivered - Paid', 'Cancelled', 'Booked', 'Customs']

const CARD = { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf1', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }
const INP = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '16px', color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const LBL = { display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#64748b', letterSpacing: 0, marginBottom: 5 }
const SEC = { fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.85rem', paddingBottom: '0.45rem', borderBottom: '1px solid #f1f5f9' }

const numUSD = (v) => { const n = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n }
const fmtCalc = (n) => { if (!isFinite(n)) return ''; const r = Math.round(n * 100) / 100; return r.toLocaleString('es-AR', { maximumFractionDigits: 2 }) }
const TC_RMB_DEFAULT = 7
const rmbToUsd = (rmb, tc) => { const r = numUSD(rmb); if (!r) return 0; const t = numUSD(tc) || TC_RMB_DEFAULT; return t > 0 ? r / t : 0 }

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

export const EMBARQUE_EMPTY = { num: '', agente: 'Bruce', origen: '', destino: '', contenedores: '', modo: '', bl: '', carrier: '', etd: '', eta: '', status: 'In Transit', sea_freight_usd: '', other_fees_rmb: '', tc_rmb: '', other_fees_usd: '', discount_usd: '', total_usd: '', suppliers: '', amount_due_usd: '', amount_rec_usd: '', balance_usd: '', payment_date: '', notes: '', operation_id: '' }

// initial: null = nuevo · shipObj = editar. defaults: precarga para nuevos
// (ej. desde la operación: bl, contenedores, eta, operation_id).
export function EmbarqueModal({ initial = null, defaults = {}, onClose, onSaved }) {
  const isNew = !initial
  const [form, setForm] = useState(() => ({ ...EMBARQUE_EMPTY, ...(isNew ? defaults : {}), ...(initial || {}) }))
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
  const [balAuto, setBalAuto] = useState(() => {
    if (isNew) return true
    const calcB = fmtCalc(numUSD(initial.amount_due_usd) - numUSD(initial.amount_rec_usd))
    return !initial.balance_usd || String(initial.balance_usd) === calcB
  })

  const upd = (f, v) => setForm(p => ({ ...p, [f]: v }))

  useEffect(() => {
    if (!totalAuto) return
    const v = fmtCalc(numUSD(form.sea_freight_usd) + numUSD(form.other_fees_usd) + rmbToUsd(form.other_fees_rmb, form.tc_rmb) - numUSD(form.discount_usd))
    setForm(p => p.total_usd === v ? p : ({ ...p, total_usd: v }))
  }, [form.sea_freight_usd, form.other_fees_usd, form.other_fees_rmb, form.tc_rmb, form.discount_usd, totalAuto])

  useEffect(() => {
    if (!balAuto) return
    const v = fmtCalc(numUSD(form.amount_due_usd) - numUSD(form.amount_rec_usd))
    setForm(p => p.balance_usd === v ? p : ({ ...p, balance_usd: v }))
  }, [form.amount_due_usd, form.amount_rec_usd, balAuto])

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      const r = isNew
        ? await fetch('/api/tracking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        : await fetch(`/api/tracking/${initial.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
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
