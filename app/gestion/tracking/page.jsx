'use client'

import { useState, useEffect, useMemo } from 'react'

const CARD = { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf1', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }
const INP = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '16px', color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const LBL = { display: 'block', fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }

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
  if (/transit|tránsito|transito/.test(s)) return { c: '#ea580c', bg: '#fff4ee', border: '#fed7aa', dot: '#ea580c' }
  if (/customs|aduana|arrived/.test(s))    return { c: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', dot: '#0891b2' }
  return { c: '#64748b', bg: '#f1f5f9', border: '#e2e8f0', dot: '#94a3b8' }
}

const blNorm = (b) => (b || '').replace(/[\s-]/g, '').toUpperCase()
const numUSD = (v) => { const n = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n }
const fmtUSD = (n) => 'USD ' + Math.round(n).toLocaleString('es-AR')

const EMPTY = { num: '', agente: 'Bruce', origen: '', destino: '', contenedores: '', modo: '', bl: '', carrier: '', etd: '', eta: '', status: 'In Transit', sea_freight_usd: '', other_fees_usd: '', discount_usd: '', total_usd: '', suppliers: '', amount_due_usd: '', amount_rec_usd: '', balance_usd: '', payment_date: '', notes: '' }

export default function TrackingPage() {
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

  const load = async () => {
    setLoading(true)
    try {
      const [t, o] = await Promise.all([fetch('/api/tracking'), fetch('/api/db/operations')])
      const td = await t.json()
      setShips(td.shipments || [])
      if (o.ok) setOps(await o.json())
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

  const stats = useMemo(() => {
    const base = agenteFilter === 'todos' ? ships : ships.filter(s => (s.agente || 'Bruce') === agenteFilter)
    const transito = base.filter(s => /transit/i.test(s.status)).length
    const pendientePago = base.filter(s => /pending|pendiente/i.test(s.status)).length
    const saldoPagar = base.reduce((a, s) => a + numUSD(s.balance_usd), 0)
    return { total: base.length, transito, pendientePago, saldoPagar }
  }, [ships, agenteFilter])

  const openNew  = () => { setForm({ ...EMPTY }); setModal('new') }
  const openEdit = (s) => { setForm({ ...EMPTY, ...s }); setModal(s) }

  const save = async () => {
    setSaving(true)
    try {
      if (modal === 'new') {
        const r = await fetch('/api/tracking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        if (r.ok) { const created = await r.json(); setShips([created, ...ships]) }
      } else {
        const r = await fetch(`/api/tracking/${modal.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        if (r.ok) setShips(ships.map(s => s.id === modal.id ? { ...s, ...form } : s))
      }
      setModal(null)
    } finally { setSaving(false) }
  }
  const del = async (id) => {
    const r = await fetch(`/api/tracking/${id}`, { method: 'DELETE' })
    if (r.ok) setShips(ships.filter(s => s.id !== id))
    setConfirmDel(null)
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
        <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 1.1rem', borderRadius: 50, border: 'none', background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
          + Nuevo embarque
        </button>
      </div>

      {/* Selector de agente */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Agente:</span>
        {['todos', ...AGENTES].map(a => {
          const sel = agenteFilter === a
          const st = a === 'todos' ? { c: '#0f172a', bg: '#0f172a' } : agenteStyle(a)
          return (
            <button key={a} onClick={() => setAgenteFilter(a)} style={{
              padding: '0.4rem 0.95rem', borderRadius: 50, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
              border: `1.5px solid ${sel ? (a === 'todos' ? '#0f172a' : st.c) : '#e2e8f0'}`,
              background: sel ? (a === 'todos' ? '#0f172a' : st.bg) : '#fff',
              color: sel ? (a === 'todos' ? '#fff' : st.c) : '#64748b',
            }}>
              {a === 'todos' ? 'Todos' : a}{a === 'Bruce' ? ' · marítimo' : a === 'Yachao' ? ' · aéreo' : ''}
            </button>
          )
        })}
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[
          { lbl: 'Total embarques', val: stats.total, color: '#1e293b' },
          { lbl: 'En tránsito', val: stats.transito, color: '#ea580c' },
          { lbl: 'Pendiente de pago', val: stats.pendientePago, color: '#d97706' },
          { lbl: 'Saldo a pagar al agente', val: fmtUSD(stats.saldoPagar), color: '#dc2626' },
        ].map(k => (
          <div key={k.lbl} style={{ ...CARD, padding: '0.7rem 1rem', flex: 1, minWidth: 150 }}>
            <p style={{ fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{k.lbl}</p>
            <p style={{ fontSize: '1.15rem', fontWeight: 800, color: k.color }}>{k.val}</p>
          </div>
        ))}
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
          <div style={{ width: 36, height: 36, border: '3px solid #e8ecf1', borderTopColor: '#ea580c', borderRadius: '50%', margin: '0 auto 1rem', animation: 'spin 0.8s linear infinite' }} />
          Cargando embarques…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Sin embarques que coincidan.</div>
      ) : (
        <div style={{ ...CARD, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['#','Agente','Ruta','Cont.','Proveedores','B/L','ETA','Estado','Total','Saldo','Oper.',''].map(h => (
                    <th key={h} style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.6rem 0.65rem', textAlign: 'left', borderBottom: '1px solid #e8ecf1', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const st = statusStyle(s.status)
                  const op = opByBL[blNorm(s.bl)]
                  const bal = numUSD(s.balance_usd)
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: op ? '#fafffe' : 'transparent' }}
                      onClick={() => openEdit(s)}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = op ? '#fafffe' : 'transparent'}>
                      <td style={{ padding: '0.55rem 0.65rem', color: '#94a3b8', fontWeight: 600 }}>{s.num || '—'}</td>
                      <td style={{ padding: '0.55rem 0.65rem', whiteSpace: 'nowrap' }}>
                        {(() => { const ag = s.agente || 'Bruce'; const a = agenteStyle(ag); return (
                          <span style={{ background: a.bg, color: a.c, border: `1px solid ${a.border}`, fontSize: '0.66rem', fontWeight: 700, padding: '0.12rem 0.5rem', borderRadius: 5 }}>{ag}</span>
                        )})()}
                      </td>
                      <td style={{ padding: '0.55rem 0.65rem', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{s.origen || '—'}</span>
                        <span style={{ color: '#cbd5e1', margin: '0 4px' }}>→</span>
                        <span style={{ color: '#475569' }}>{s.destino || '—'}</span>
                        {s.carrier && <span style={{ fontSize: '0.64rem', color: '#94a3b8', marginLeft: 6 }}>· {s.carrier}</span>}
                      </td>
                      <td style={{ padding: '0.55rem 0.65rem', color: '#475569', whiteSpace: 'nowrap' }}>{s.contenedores || '—'}</td>
                      <td style={{ padding: '0.55rem 0.65rem', maxWidth: 220 }}>
                        {s.suppliers ? (
                          <span title={s.suppliers} style={{ fontSize: '0.72rem', color: '#475569', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.suppliers}</span>
                        ) : <span style={{ color: '#cbd5e1', fontSize: '0.72rem' }}>—</span>}
                      </td>
                      <td style={{ padding: '0.55rem 0.65rem', fontFamily: 'ui-monospace,monospace', fontSize: '0.72rem', color: '#475569', whiteSpace: 'nowrap' }}>{s.bl || '—'}</td>
                      <td style={{ padding: '0.55rem 0.65rem', color: s.eta ? '#059669' : '#cbd5e1', fontWeight: 600, whiteSpace: 'nowrap' }}>{s.eta || '—'}</td>
                      <td style={{ padding: '0.55rem 0.65rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: st.bg, color: st.c, border: `1px solid ${st.border}`, fontSize: '0.66rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 5, whiteSpace: 'nowrap' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />{s.status || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '0.55rem 0.65rem', color: '#1e293b', fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{s.total_usd ? 'USD ' + s.total_usd : '—'}</td>
                      <td style={{ padding: '0.55rem 0.65rem', fontWeight: 700, whiteSpace: 'nowrap', color: bal > 0 ? '#dc2626' : '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{bal > 0 ? 'USD ' + s.balance_usd : '✓'}</td>
                      <td style={{ padding: '0.55rem 0.65rem', whiteSpace: 'nowrap' }}>
                        {op ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#059669', fontSize: '0.7rem', fontWeight: 600 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>{op.nombre?.length > 18 ? op.nombre.slice(0,18)+'…' : op.nombre}</span> : <span style={{ color: '#cbd5e1', fontSize: '0.7rem' }}>—</span>}
                      </td>
                      <td style={{ padding: '0.55rem 0.65rem' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setConfirmDel(s.id)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #fee2e2', background: '#fff', color: '#dc2626', fontSize: '0.85rem', cursor: 'pointer' }}>×</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit / new modal */}
      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setModal(null)}>
          <div style={{ ...CARD, width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{modal === 'new' ? 'Nuevo embarque' : `Embarque #${form.num || ''}`}</h3>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: '#94a3b8', cursor: 'pointer' }}>×</button>
            </div>

            <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Logística</p>
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
              <div><label style={LBL}>Zarpe (ETD)</label><input value={form.etd} onChange={e => upd('etd', e.target.value)} style={INP} placeholder="2026-04-09" /></div>
              <div><label style={LBL}>ETA</label><input value={form.eta} onChange={e => upd('eta', e.target.value)} style={INP} placeholder="2026-06-14" /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={LBL}>Estado</label>
                <select value={form.status} onChange={e => upd('status', e.target.value)} style={{ ...INP, cursor: 'pointer' }}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  {form.status && !STATUSES.includes(form.status) && <option value={form.status}>{form.status}</option>}
                </select>
              </div>
            </div>

            <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Lo que pagás al agente (USD)</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: '1.25rem' }}>
              <div><label style={LBL}>Sea Freight</label><input value={form.sea_freight_usd} onChange={e => upd('sea_freight_usd', e.target.value)} style={INP} /></div>
              <div><label style={LBL}>Other Fees</label><input value={form.other_fees_usd} onChange={e => upd('other_fees_usd', e.target.value)} style={INP} /></div>
              <div><label style={LBL}>Descuento</label><input value={form.discount_usd} onChange={e => upd('discount_usd', e.target.value)} style={INP} /></div>
              <div><label style={LBL}>Total</label><input value={form.total_usd} onChange={e => upd('total_usd', e.target.value)} style={{ ...INP, fontWeight: 700 }} /></div>
              <div><label style={LBL}>A pagar</label><input value={form.amount_due_usd} onChange={e => upd('amount_due_usd', e.target.value)} style={INP} /></div>
              <div><label style={LBL}>Pagado</label><input value={form.amount_rec_usd} onChange={e => upd('amount_rec_usd', e.target.value)} style={INP} /></div>
              <div><label style={LBL}>Saldo a pagar</label><input value={form.balance_usd} onChange={e => upd('balance_usd', e.target.value)} style={{ ...INP, color: numUSD(form.balance_usd) > 0 ? '#dc2626' : '#0f172a', fontWeight: 600 }} /></div>
              <div><label style={LBL}>Fecha pago</label><input value={form.payment_date} onChange={e => upd('payment_date', e.target.value)} style={INP} /></div>
            </div>

            <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Proveedores & notas</p>
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
