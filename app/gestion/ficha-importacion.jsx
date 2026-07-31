'use client'

// ─── Ficha integral de importación ────────────────────────────────────────────
// El B/L es el eje del sistema: esta ficha junta en un solo lugar el embarque
// (agente de carga), el despacho de aduana, la operación/cliente y el historial
// de pagos. Se abre desde Tracking y desde Despachante clickeando una fila.
// Los pagos se REGISTRAN como eventos (fecha/monto/método) y actualizan los
// totales de los módulos — no se editan celdas a mano.

import { useState, useEffect } from 'react'
import { gToast } from './toast'
import { EmbarqueModal } from './embarque-form'
import { METODOS_PAGO, metodoLabel } from './pagos-metodos'

const blNorm = (b) => (b || '').replace(/[\s-]/g, '').toUpperCase()
const num = (v) => { const x = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isNaN(x) ? 0 : x }
const fmtN = (v) => { const r = Math.round(v * 100) / 100; return r === 0 ? '' : r.toLocaleString('es-AR', { maximumFractionDigits: 2 }) }
const usd = (v) => 'USD ' + Math.round(v).toLocaleString('es-AR')
const hoy = () => new Date().toISOString().slice(0, 10)

const CARD = { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf1' }
const LBL = { display: 'block', fontSize: '0.68rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }
const INP = { width: '100%', padding: '0.45rem 0.6rem', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.85rem', color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box' }
const SECT = { fontSize: '0.62rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.5rem' }

function statusChip(raw) {
  const s = (raw || '').toLowerCase()
  let c = { fg: '#64748b', bg: '#f1f5f9', bd: '#e2e8f0' }
  if (/paid/.test(s)) c = { fg: '#065f46', bg: '#ecfdf5', bd: '#a7f3d0' }
  else if (/pending/.test(s)) c = { fg: '#b45309', bg: '#fffbeb', bd: '#fde68a' }
  else if (/transit/.test(s)) c = { fg: '#1d4ed8', bg: '#eff6ff', bd: '#bfdbfe' }
  else if (/cancel/.test(s)) c = { fg: '#dc2626', bg: '#fef2f2', bd: '#fecaca' }
  return raw ? (
    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: c.fg, background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 5, padding: '0.14rem 0.5rem', whiteSpace: 'nowrap' }}>{raw}</span>
  ) : null
}

function Money({ label, value, tone = '#0f172a', sub }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 8, padding: '0.5rem 0.7rem' }}>
      <p style={{ fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: '0.98rem', fontWeight: 800, color: tone, fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>{value}</p>
      {sub && <p style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: 1 }}>{sub}</p>}
    </div>
  )
}

// fetch con timeout: una sección que no responde no puede colgar la ficha entera.
async function fetchJSON(url, ms = 12000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) return null
    return await r.json()
  } catch { return null } finally { clearTimeout(t) }
}

export default function FichaImportacion({ bl, seed = {}, onClose, onChanged }) {
  // La ficha abre INSTANTÁNEA con los datos que ya tiene la fila clickeada (seed);
  // cada sección restante carga por su cuenta y se completa cuando llega.
  const [ship, setShip] = useState(seed.ship || null)
  const [desp, setDesp] = useState(seed.desp || null)
  const [op, setOp] = useState(null)
  const [pagos, setPagos] = useState(null) // null = cargando
  const [pagoForm, setPagoForm] = useState(null) // null | {scope, fecha, monto, metodo, nota}
  const [editShip, setEditShip] = useState(false) // editor de embarque abierto desde la ficha
  const [busy, setBusy] = useState(false)

  const key = blNorm(bl)
  // Match SOLO por B/L real: sin esto, un B/L vacío matchea cualquier registro
  // que también tenga el B/L vacío (colisión — abría el despacho equivocado).
  const sameBL = (r) => key !== '' && r && r.bl && blNorm(r.bl) === key
  const load = (fresh = false) => {
    if (!key) { setShip(null); setDesp(seed.desp || null); setOp(null); setPagos([]); return }
    // Embarque: solo si no vino en el seed (o si hay que refrescar tras un pago).
    if (fresh || !seed.ship) {
      fetchJSON('/api/tracking?bl=' + encodeURIComponent(bl)).then(j => { if (j) setShip((j.shipments || [])[0] || null) })
    }
    if (fresh || !seed.desp) {
      fetchJSON('/api/db/despachante').then(j => { if (Array.isArray(j)) setDesp(j.find(sameBL) || null) })
    }
    fetchJSON('/api/db/operations').then(j => { if (Array.isArray(j)) setOp(j.find(sameBL) || null) })
    fetchJSON('/api/db/pagos?bl=' + encodeURIComponent(bl)).then(j => setPagos(Array.isArray(j) ? j : []))
  }
  useEffect(() => { load(false) }, [bl])
  const loading = false

  const agTotal = num(ship?.total_usd), agSaldo = num(ship?.balance_usd)
  const deTotal = num(desp?.total_honorarios), deSaldo = num(desp?.saldo)
  const totalImport = agTotal + deTotal
  const saldoImport = agSaldo + Math.max(0, deSaldo)

  // Registrar pago: crea el evento en el ledger Y actualiza los totales del módulo.
  const savePago = async () => {
    const f = pagoForm
    if (!f || busy) return
    if (num(f.monto) <= 0) { gToast.error('Cargá el monto.'); return }
    setBusy(true)
    try {
      const refId = f.scope === 'agente' ? ship?.id : desp?.id
      const r = await fetch('/api/db/pagos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: f.scope, ref_id: String(refId || ''), bl, fecha: f.fecha, monto: f.monto, metodo: f.metodo, nota: f.nota }),
      })
      if (!r.ok) throw new Error('No se pudo registrar el pago')

      if (f.scope === 'agente' && ship) {
        const rec = num(ship.amount_rec_usd) + num(f.monto)
        const bal = num(ship.amount_due_usd) - rec
        await fetch(`/api/tracking/${ship.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...ship, amount_rec_usd: fmtN(rec), balance_usd: fmtN(bal), payment_date: f.fecha }),
        })
      }
      if (f.scope === 'despachante' && desp) {
        const cash = num(desp.pago_cash) + (f.metodo === 'cash' ? num(f.monto) : 0)
        const transf = num(desp.pago_transferencia) + (f.metodo === 'cash' ? 0 : num(f.monto))
        const pagado = cash + transf
        const saldo = num(desp.total_honorarios) - pagado - num(desp.comision)
        await fetch(`/api/db/despachante/${desp.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...desp, pago_cash: fmtN(cash), pago_transferencia: fmtN(transf), total_pagado: fmtN(pagado), saldo: fmtN(saldo), fecha_pago: f.fecha }),
        })
      }
      gToast.success('Pago registrado.')
      setPagoForm(null)
      load(true)
      onChanged?.()
    } catch (e) {
      gToast.error(e.message || 'Error al registrar el pago.')
    } finally { setBusy(false) }
  }

  // Alta cruzada: crear el despacho desde el embarque, con el B/L precargado.
  const crearDespacho = async () => {
    if (busy) return
    setBusy(true)
    try {
      const descripcion = (ship?.suppliers || '').split(/[、,]/)[0].trim() || `${ship?.origen || ''} → ${ship?.destino || ''}`.trim() || 'Importación'
      const r = await fetch('/api/db/despachante', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bl, descripcion, estado: /paid|deliver/i.test(ship?.status || '') ? 'Terminada' : 'En curso' }),
      })
      if (!r.ok) throw new Error('No se pudo crear el despacho')
      gToast.success('Despacho creado y vinculado por B/L.')
      load(true)
      onChanged?.()
    } catch (e) {
      gToast.error(e.message || 'Error al crear el despacho.')
    } finally { setBusy(false) }
  }

  const BtnPago = ({ scope }) => (
    // A los agentes se les gira desde la cuenta de USA; al despachante, local.
    <button onClick={() => setPagoForm({ scope, fecha: hoy(), monto: '', metodo: scope === 'agente' ? 'usa' : 'transferencia', nota: '' })}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.35rem 0.75rem', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, background: '#0f172a', color: '#fff' }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Registrar pago
    </button>
  )

  const LinkBtn = ({ href, children }) => (
    <button onClick={() => { window.location.href = href }} style={{ padding: '0.35rem 0.75rem', borderRadius: 7, border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, background: '#fff', color: '#334155' }}>{children}</button>
  )

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(3px)', zIndex: 1050, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ background: '#f8fafc', width: '100%', maxWidth: 540, height: '100%', overflowY: 'auto', boxShadow: '-10px 0 40px rgba(0,0,0,0.2)' }}>

        {/* header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 5, background: '#fff', borderBottom: '1px solid #e8ecf1', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ficha de importación</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', fontFamily: 'ui-monospace,monospace' }}>{bl || '—'}</h3>
              {statusChip(ship?.status)}
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', background: '#f1f5f9', color: '#64748b', fontSize: '1.1rem', flex: '0 0 auto' }}>×</button>
        </div>

        {loading ? (
          <p style={{ padding: '2rem', color: '#94a3b8', fontSize: '0.85rem' }}>Cargando ficha…</p>
        ) : (
          <div style={{ padding: '1rem 1.25rem 2rem', display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* resumen de plata de TODA la importación */}
            <div style={{ display: 'flex', gap: 8 }}>
              <Money label="Total importación" value={usd(totalImport)} sub="agente + despachante" />
              <Money label="Saldo a pagar" value={saldoImport > 0 ? usd(saldoImport) : 'Saldado ✓'} tone={saldoImport > 0 ? '#dc2626' : '#16a34a'} />
            </div>

            {/* embarque / agente */}
            <div style={{ ...CARD, padding: '0.85rem 1rem' }}>
              <p style={SECT}>Embarque · agente de carga</p>
              {ship ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#1e293b', fontSize: '0.88rem' }}>
                    <span>{ship.origen || '—'}</span><span style={{ color: '#cbd5e1' }}>→</span><span>{ship.destino || '—'}</span>
                    {ship.carrier && <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#64748b', background: '#eef2f7', borderRadius: 4, padding: '0.05rem 0.35rem' }}>{ship.carrier}</span>}
                  </div>
                  <p style={{ fontSize: '0.68rem', color: '#94a3b8', margin: '2px 0 8px' }}>
                    #{ship.num} · {ship.contenedores || '—'} · ETD {ship.etd || '—'} · ETA {ship.eta || '—'} · {ship.agente || 'Bruce'}
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <Money label="Total" value={ship.total_usd ? 'USD ' + ship.total_usd : '—'} />
                    <Money label="Pagado" value={ship.amount_rec_usd ? 'USD ' + ship.amount_rec_usd : '—'} />
                    <Money label="Saldo" value={agSaldo > 0 ? 'USD ' + ship.balance_usd : '✓'} tone={agSaldo > 0 ? '#dc2626' : '#16a34a'} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {agSaldo > 0 && <BtnPago scope="agente" />}
                    <button onClick={() => setEditShip(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.35rem 0.75rem', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, background: '#059669', color: '#fff' }}>
                      ✎ Editar embarque
                    </button>
                    <LinkBtn href="/gestion/tracking">Forwarding</LinkBtn>
                  </div>
                </>
              ) : (
                <p style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Sin embarque con este B/L en Tracking.</p>
              )}
            </div>

            {/* despachante */}
            <div style={{ ...CARD, padding: '0.85rem 1rem' }}>
              <p style={SECT}>Despachante de aduana</p>
              {desp ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <p style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.85rem' }}>{desp.descripcion}</p>
                    {desp.facturado
                      ? <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 5, padding: '0.12rem 0.45rem' }}>Facturado{desp.factura_nro ? ` · ${desp.factura_nro}` : ''}</span>
                      : <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, padding: '0.12rem 0.45rem' }}>Sin facturar</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, margin: '8px 0 10px' }}>
                    <Money label="Honorarios" value={desp.total_honorarios ? 'USD ' + desp.total_honorarios : '—'} />
                    <Money label="Pagado" value={desp.total_pagado ? 'USD ' + desp.total_pagado : '—'} />
                    <Money label="Saldo" value={deSaldo > 0 ? 'USD ' + desp.saldo : deSaldo < 0 ? `USD ${fmtN(Math.abs(deSaldo))} a favor` : '✓'} tone={deSaldo > 0 ? '#dc2626' : deSaldo < 0 ? '#b45309' : '#16a34a'} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {deSaldo > 0 && <BtnPago scope="despachante" />}
                    <LinkBtn href="/gestion/despachante">Abrir en Despachante</LinkBtn>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Sin despacho cargado para este B/L.</p>
                  {ship && (
                    <button onClick={crearDespacho} disabled={busy} style={{ padding: '0.35rem 0.75rem', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, background: '#059669', color: '#fff' }}>
                      + Crear despacho con este B/L
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* operación / cliente */}
            <div style={{ ...CARD, padding: '0.85rem 1rem' }}>
              <p style={SECT}>Operación · clientes</p>
              {op ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.85rem' }}>{op.nombre || 'Operación'}</p>
                    <p style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 1 }}>{op.estado || '—'}{op.contenedor ? ` · ${op.contenedor}` : ''}{op.m3_total ? ` · ${op.m3_total} m³` : ''}</p>
                  </div>
                  <LinkBtn href={`/gestion/operaciones?op=${encodeURIComponent(op.id)}`}>Abrir operación</LinkBtn>
                </div>
              ) : (
                <p style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Sin operación vinculada a este B/L.</p>
              )}
            </div>

            {/* historial de pagos */}
            <div style={{ ...CARD, padding: '0.85rem 1rem' }}>
              <p style={SECT}>Historial de pagos</p>
              {pagos === null ? (
                <p style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>Cargando historial…</p>
              ) : pagos.length === 0 ? (
                <p style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>Todavía no hay pagos registrados para este B/L.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {pagos.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.4rem 0', borderBottom: '1px solid #f8fafc', fontSize: '0.75rem' }}>
                      <span style={{ color: '#64748b', fontVariantNumeric: 'tabular-nums', flex: '0 0 auto' }}>{p.fecha || '—'}</span>
                      <span style={{ fontSize: '0.6rem', fontWeight: 700, color: p.scope === 'agente' ? '#1d4ed8' : '#059669', background: p.scope === 'agente' ? '#eff6ff' : '#ecfdf5', borderRadius: 4, padding: '0.05rem 0.4rem', flex: '0 0 auto' }}>{p.scope === 'agente' ? 'Agente' : 'Despachante'}</span>
                      <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{metodoLabel(p.metodo)}{p.nota ? ` · ${p.nota}` : ''}</span>
                      <span style={{ fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums', flex: '0 0 auto' }}>USD {p.monto}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* editor de embarque — el mismo formulario compartido, sin salir de la ficha */}
        {editShip && ship && (
          <EmbarqueModal
            initial={ship}
            onClose={() => setEditShip(false)}
            onSaved={(sv) => { setEditShip(false); setShip(sv); load(true); onChanged?.() }}
          />
        )}

        {/* mini-modal: registrar pago */}
        {pagoForm && (
          <div onClick={e => { if (e.target === e.currentTarget) setPagoForm(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ ...CARD, width: '100%', maxWidth: 360, padding: '1.25rem', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
              <p style={{ fontWeight: 800, color: '#0f172a', marginBottom: 10, fontSize: '0.95rem' }}>
                Registrar pago · {pagoForm.scope === 'agente' ? 'agente de carga' : 'despachante'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div><label style={LBL}>Fecha</label><input type="date" value={pagoForm.fecha} onChange={e => setPagoForm(f => ({ ...f, fecha: e.target.value }))} style={INP} /></div>
                <div><label style={LBL}>Monto (USD)</label><input inputMode="decimal" value={pagoForm.monto} onChange={e => setPagoForm(f => ({ ...f, monto: e.target.value }))} style={INP} placeholder="0" /></div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={LBL}>{pagoForm.scope === 'agente' ? 'Pagado desde' : 'Método'}</label>
                <div style={{ display: 'flex', gap: 3, background: '#f1f5f9', borderRadius: 8, padding: 3 }}>
                  {(pagoForm.scope === 'agente' ? METODOS_PAGO : METODOS_PAGO.filter(([v]) => v !== 'usa')).map(([v, l]) => {
                    const on = pagoForm.metodo === v
                    return <button key={v} onClick={() => setPagoForm(f => ({ ...f, metodo: v }))} style={{ flex: 1, padding: '0.35rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.74rem', fontWeight: on ? 700 : 500, background: on ? '#fff' : 'transparent', color: on ? (v === 'usa' ? '#1d4ed8' : '#0f172a') : '#64748b', boxShadow: on ? '0 1px 2px rgba(15,23,42,0.1)' : 'none', whiteSpace: 'nowrap' }}>{v === 'usa' ? '🇺🇸 ' : ''}{l}</button>
                  })}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}><label style={LBL}>Nota (opcional)</label><input value={pagoForm.nota} onChange={e => setPagoForm(f => ({ ...f, nota: e.target.value }))} style={INP} placeholder="Ej: adelanto 50%" /></div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setPagoForm(null)} style={{ padding: '0.45rem 0.9rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={savePago} disabled={busy} style={{ padding: '0.45rem 1.1rem', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Guardando…' : 'Registrar'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
