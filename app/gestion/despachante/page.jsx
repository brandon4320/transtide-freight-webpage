'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { gToast } from '../toast'
import FichaImportacion from '../ficha-importacion'
import { metodoLabel } from '../pagos-metodos'
import { useSeleccionMultiple, BarraSeleccion, Casilla } from '../seleccion-multiple'

const INP = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '16px', color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const LBL = { display: 'block', fontSize: '0.68rem', fontWeight: 500, color: '#9ca3af', marginBottom: 4 }
const PANEL = { background: '#fff', borderRadius: 12, padding: '1.5rem 1.75rem' }
const TXTBTN = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.74rem', fontWeight: 500, color: '#6b7280', fontFamily: 'inherit' }
const PRIMARY = '#111827'

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
function saldoInfo(saldo, totalHon) {
  if (saldo > 0)  return { c: '#dc2626', label: 'debés' }
  if (saldo < 0)  return { c: '#d97706', label: 'a tu favor' }
  if (totalHon > 0) return { c: '#059669', label: 'saldado' }
  return { c: '#9ca3af', label: 'sin costos' }
}

// Punto negro de 5px: marca de concepto "en negro".
const Dot = () => <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#111827', marginRight: 4, verticalAlign: 'middle' }} />

// Toggle Factura/Negro como texto plano (sin pills).
function FNToggle({ f, onChange, small }) {
  const B = (on, lbl, col, val) => (
    <button key={lbl} onClick={() => onChange(val)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 3px', fontFamily: 'inherit', fontSize: small ? '0.68rem' : '0.72rem', fontWeight: on ? 600 : 400, color: on ? col : '#9ca3af', borderBottom: on ? `2px solid ${col}` : '2px solid transparent', whiteSpace: 'nowrap' }}>
      {lbl}
    </button>
  )
  return (
    <div style={{ display: 'flex', gap: 14, justifyContent: 'flex-end' }}>
      {B(!!f, 'Factura', '#059669', 1)}
      {B(!f, 'Negro', '#111827', 0)}
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
  const [showSaldadas, setShowSaldadas] = useState(false) // saldadas colapsadas al fondo

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

  // "Seleccionar todas" alcanza SOLO lo que está a la vista: si las saldadas están
  // colapsadas no entran, para no borrar algo que no se ve.
  const saldadasAbiertas = showSaldadas || filter === 'saldado' || query.trim() !== ''
  const esSaldada = (r) => numUSD(r.saldo) === 0 && numUSD(r.total_honorarios) > 0
  const aLaVista = useMemo(
    () => (saldadasAbiertas ? filtered : filtered.filter(r => !esSaldada(r))),
    [filtered, saldadasAbiertas]
  )
  const selm = useSeleccionMultiple({
    items: aLaVista,
    // Se llama dentro de una arrow: delMuchos se declara más abajo y referenciarlo
    // directo acá rompe al montar (zona muerta temporal).
    onEliminar: (ids) => delMuchos(ids),
    nombre: ['operación', 'operaciones'],
  })

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

  // Borrado en lote (ya confirmado y con el deshacer vencido).
  const delMuchos = useCallback(async (ids) => {
    const res = await Promise.all(ids.map(id =>
      fetch(`/api/db/despachante/${id}`, { method: 'DELETE' }).then(r => r.ok).catch(() => false)
    ))
    const ok = res.filter(Boolean).length
    setRows(prev => prev.filter(r => !ids.includes(r.id)))
    if (ok === ids.length) gToast.success(ok === 1 ? 'Operación eliminada.' : `${ok} operaciones eliminadas.`)
    else gToast.error(`Se eliminaron ${ok} de ${ids.length}. Recargá para ver el estado real.`)
  }, [])

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

  // Una fila plana de la lista (closed → saldada, atenuada).
  const renderRow = (r, closed = false) => {
    const saldo = numUSD(r.saldo)
    const st = saldoInfo(saldo, numUSD(r.total_honorarios))
    const ship = shipByBL[blNorm(r.bl)]
    const hon = numUSD(r.total_honorarios), pag = numUSD(r.total_pagado)
    const pct = hon > 0 ? Math.max(0, Math.min(1, pag / hon)) : (pag > 0 ? 1 : 0)
    const rc = parseConc(r)
    const rs = concSplit(rc)
    const hist = pagos[String(r.id)] || []
    const partes = CONCEPTOS.filter(([k]) => rc[k] && numUSD(rc[k].m) > 0)
    return (
      <div key={r.id} className="dsp-row" style={{ padding: '0.8rem 0.25rem', borderBottom: '1px solid #f1f5f9', opacity: closed ? 0.55 : 1, background: selm.esta(r.id) ? '#f8fafc' : undefined }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ paddingTop: 2 }}>
            <Casilla checked={selm.esta(r.id)} onChange={() => selm.alternar(r.id)} label={`Seleccionar ${r.descripcion || 'operación'}`} />
          </span>
          <div onClick={() => r.bl ? setFicha({ bl: r.bl, desp: r, ship }) : openEdit(r)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
            <p style={{ fontSize: '0.88rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.descripcion || '— sin descripción —'}</p>
            <p style={{ marginTop: 2, fontSize: '0.68rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.bl && <><span style={{ fontFamily: 'ui-monospace,monospace' }}>{r.bl}</span> · </>}
              {r.estado || 'En curso'}
              {ship && <> · <span onClick={e => { e.stopPropagation(); window.location.href = '/gestion/tracking' }} style={{ cursor: 'pointer', color: '#6b7280' }}>embarque #{ship.num}</span></>}
              {r.facturado
                ? <> · <span style={{ color: '#059669' }}>Facturado{r.factura_nro ? ` ${r.factura_nro}` : ''}</span></>
                : rs.fact > 0 ? <> · <span style={{ color: '#dc2626' }}>Sin facturar</span></> : null}
            </p>
          </div>
          <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
            <p style={{ fontSize: '0.95rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: st.c, lineHeight: 1.15 }}>
              {saldo !== 0 ? fmtUSD(Math.abs(saldo)) : (hon > 0 ? fmtUSD(hon) : '—')}
            </p>
            <p style={{ fontSize: '0.6rem', color: '#9ca3af', marginTop: 2 }}>{st.label}</p>
          </div>
          <div className="dsp-acts" style={{ display: 'flex', gap: 2, flex: '0 0 auto', marginTop: 1 }}>
            <button onClick={() => openEdit(r)} title="Editar" aria-label="Editar" className="dsp-ico" style={{ width: 24, height: 24, border: 'none', background: 'none', color: '#c4c9d4', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button onClick={() => setConfirmDel(r.id)} title="Eliminar" aria-label="Eliminar" className="dsp-ico" style={{ width: 24, height: 24, border: 'none', background: 'none', color: '#c4c9d4', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
            </button>
          </div>
        </div>

        {/* Desglose de conceptos: detalle indentado, dot negro = en negro */}
        {partes.length > 0 && (
          <p style={{ marginTop: 6, paddingLeft: 12, fontSize: '0.72rem', color: '#6b7280', lineHeight: 1.9 }}>
            {partes.map(([k, lbl], i) => {
              const negro = !rc[k].f
              return (
                <span key={k} title={negro ? 'En negro' : 'Te lo factura'} style={{ whiteSpace: 'nowrap' }}>
                  {i > 0 && <span style={{ color: '#d1d5db' }}>  ·  </span>}
                  {negro && <Dot />}
                  {lbl} <span style={{ color: '#374151', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtUSD(numUSD(rc[k].m)).replace('USD ', '')}</span>
                </span>
              )
            })}
          </p>
        )}

        {/* Progreso: solo cuando hay pagos parciales en curso */}
        {pag > 0 && saldo > 0 && (
          <div style={{ marginTop: 8, paddingLeft: 12 }}>
            <div style={{ height: 3, background: '#f1f5f9' }}>
              <div style={{ height: '100%', width: `${Math.round(pct * 100)}%`, background: '#d97706', transition: 'width .2s' }} />
            </div>
            <p style={{ marginTop: 3, fontSize: '0.64rem', color: '#9ca3af', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>Pagado {fmtUSD(pag)} de {fmtUSD(hon)}</p>
          </div>
        )}

        {/* Historial de pagos (ledger) */}
        {hist.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 6, paddingLeft: 12, borderTop: '1px solid #f8fafc' }}>
            {hist.map(pg => (
              <div key={pg.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.15rem 0', fontSize: '0.72rem', color: '#9ca3af' }}>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pg.fecha || '—'}</span>
                <span>{metodoLabel(pg.metodo)}</span>
                {pg.nota && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pg.nota}</span>}
                <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(numUSD(pg.monto))}</span>
                <button onClick={() => setConfirmPago({ row: r, pg })} title="Borrar pago" aria-label="Borrar pago" className="dsp-ico" style={{ width: 18, height: 18, border: 'none', background: 'none', color: '#c4c9d4', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1, padding: 0 }}>×</button>
              </div>
            ))}
          </div>
        )}

        {(saldo > 0 || hon === 0) && (
          <div style={{ display: 'flex', gap: 16, marginTop: 8, paddingLeft: 12 }}>
            {saldo > 0 && (
              <button onClick={() => setPagoModal({ row: r, fecha: hoy(), monto: fmtCalc(saldo), metodo: 'transferencia', nota: '' })} className="dsp-txtbtn" style={TXTBTN}>+ Registrar pago</button>
            )}
            {hon === 0 && (
              <button onClick={() => openEdit(r)} className="dsp-txtbtn" style={TXTBTN}>Cargar costos</button>
            )}
          </div>
        )}
      </div>
    )
  }

  // Métrica de la línea de cuenta corriente.
  const Met = ({ v, l, c, dot }) => (
    <div>
      <p style={{ fontSize: '1.15rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: c || '#111827', lineHeight: 1.2 }}>{dot && <Dot />}{v}</p>
      <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginTop: 2 }}>{l}</p>
    </div>
  )

  const visiblesSel = selm.filtrar(filtered)
  const cerradas = visiblesSel.filter(r => numUSD(r.saldo) === 0 && numUSD(r.total_honorarios) > 0)
  const saldadasOpen = showSaldadas || filter === 'saldado' || query.trim() !== ''

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 350, letterSpacing: '-0.02em', color: '#111827', marginBottom: '0.2rem' }}>Despachante de aduana</h2>
          <p style={{ fontSize: '0.74rem', color: '#9ca3af' }}>Costos, factura o negro y pagos por operación · {rows.length} operaciones{stats.saldadas > 0 ? ` · ${stats.saldadas} saldadas` : ''}</p>
        </div>
        <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', borderRadius: 6, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nueva operación
        </button>
      </div>

      {/* Cuenta corriente con el despachante: una línea de métricas, sin cajas */}
      <div className="dsp-metrics" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem 2.5rem', marginBottom: '1.75rem' }}>
        <Met
          v={fmtUSD(Math.abs(stats.neto))}
          l={stats.neto > 0 ? 'Le debés (neto)' : stats.neto < 0 ? 'A tu favor (neto)' : 'Todo saldado'}
          c={stats.neto > 0 ? '#dc2626' : stats.neto < 0 ? '#d97706' : '#059669'}
        />
        <Met v={fmtUSD(stats.totalHon)} l="Costos" />
        <Met v={fmtUSD(stats.totalPag)} l="Pagado" />
        {stats.fact > 0 && <Met v={fmtUSD(stats.fact)} l="Te factura" c="#059669" />}
        {stats.negro > 0 && <Met v={fmtUSD(stats.negro)} l="En negro" dot />}
        {stats.sinFact > 0 && <Met v={stats.sinFact} l="Sin facturar" c="#d97706" />}
      </div>
      {stats.debe > 0 && stats.favor > 0 && (
        <p style={{ fontSize: '0.66rem', color: '#9ca3af', margin: '-1.25rem 0 1.5rem' }}>Debés {fmtUSD(stats.debe)} en unas · {fmtUSD(stats.favor)} a favor en otras → se compensan.</p>
      )}

      {/* Alertas del flujo */}
      {alertas.length > 0 && (
        <div style={{ borderLeft: '2px solid #d97706', paddingLeft: 12, marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Alertas · {alertas.length}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {alertas.slice(0, 6).map((a, i) => (
              <button key={i} onClick={() => a.row.bl && setFicha({ bl: a.row.bl, desp: a.row, ship: shipByBL[blNorm(a.row.bl)] })} style={{ background: 'none', border: 'none', padding: '0.1rem 0', cursor: 'pointer', textAlign: 'left', fontSize: '0.78rem', color: '#6b7280', fontFamily: 'inherit' }}>
                <span style={{ color: '#111827', fontWeight: 600 }}>{a.row.descripcion}</span> — mercadería arribó{a.sem != null ? ` hace ${a.sem} semana${a.sem === 1 ? '' : 's'}` : ''}, saldo <span style={{ color: '#d97706', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(a.monto)}</span> al despachante
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Buscador + filtros: una única línea fina */}
      <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar BL, descripción, factura…" className="dsp-search"
          style={{ flex: 1, minWidth: 200, border: 'none', borderBottom: '1px solid #e5e7eb', borderRadius: 0, background: 'transparent', padding: '0.35rem 0', fontSize: '16px', color: '#111827', outline: 'none', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: '1.1rem', flexWrap: 'wrap' }}>
          {[['todos', 'Todos'], ['debe', 'Debés'], ['favor', 'A favor'], ['saldado', 'Saldados'], ['sinfact', 'Sin facturar']].map(([id, lbl]) => {
            const on = filter === id
            return (
              <button key={id} onClick={() => setFilter(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 4px', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: on ? 600 : 400, color: on ? '#111827' : '#9ca3af', borderBottom: on ? '2px solid #111827' : '2px solid transparent', whiteSpace: 'nowrap' }}>{lbl}</button>
            )
          })}
        </div>
      </div>

      {/* Listas: filas planas agrupadas */}
      {loading ? (
        <div style={{ padding: '3.5rem 0', textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>
          <div style={{ width: 28, height: 28, border: '2px solid #f1f5f9', borderTopColor: '#111827', borderRadius: '50%', margin: '0 auto 0.8rem', animation: 'spin 0.8s linear infinite' }} />
          Cargando…
        </div>
      ) : loadError ? (
        <div style={{ padding: '3.5rem 0', textAlign: 'center' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#dc2626', fontSize: '0.85rem' }}>No se pudieron cargar los datos</p>
          <button onClick={load} className="dsp-txtbtn" style={{ ...TXTBTN, fontSize: '0.78rem', fontWeight: 600, color: '#111827', borderBottom: '1px solid #111827', paddingBottom: 2 }}>Reintentar</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '3.5rem 0', textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>
          {rows.length === 0 ? (
            <>
              <p style={{ fontWeight: 600, color: '#6b7280', marginBottom: 4, fontSize: '0.85rem' }}>Todavía no hay operaciones.</p>
              <p>Creá una con «Nueva operación» (solo descripción y B/L) y después cargale los costos.</p>
            </>
          ) : 'Sin registros que coincidan.'}
        </div>
      ) : (
        <div>
          {[
            { key: 'debe',  label: 'Le debés al despachante', c: '#dc2626', test: r => numUSD(r.saldo) > 0 },
            { key: 'favor', label: 'A tu favor (compensar)',  c: '#d97706', test: r => numUSD(r.saldo) < 0 },
            { key: 'curso', label: 'En curso / sin costos',   c: '#9ca3af', test: r => numUSD(r.saldo) === 0 && numUSD(r.total_honorarios) === 0 },
          ].map(g => {
            const items = visiblesSel.filter(g.test)
            if (!items.length) return null
            const sub = items.reduce((a, r) => a + numUSD(r.saldo), 0)
            return (
              <div key={g.key}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '1.5rem 0 0.1rem' }}>
                  <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{g.label}</span>
                  <span style={{ fontSize: '0.64rem', color: '#9ca3af' }}>· {items.length}</span>
                  {g.key !== 'curso' && Math.abs(sub) > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#9ca3af' }}>
                      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: g.c }}>{fmtUSD(Math.abs(sub))}</span>{g.key === 'favor' ? ' a favor' : ''}
                    </span>
                  )}
                </div>
                {items.map(r => renderRow(r))}
              </div>
            )
          })}

          {/* Saldadas: al fondo, colapsadas por defecto */}
          {cerradas.length > 0 && (
            <div style={{ marginTop: '2rem' }}>
              <button onClick={() => setShowSaldadas(s => !s)} className="dsp-txtbtn" style={{ ...TXTBTN, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#9ca3af' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: saldadasOpen ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}><polyline points="9 18 15 12 9 6"/></svg>
                Saldadas · {cerradas.length}
              </button>
              {saldadasOpen && <div style={{ marginTop: '0.1rem' }}>{cerradas.map(r => renderRow(r, true))}</div>}
            </div>
          )}
        </div>
      )}

      {/* Edit / new modal — minimal: vincular, describir, 5 conceptos, listo */}
      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setModal(null)}>
          <div style={{ ...PANEL, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>{modal === 'new' ? 'Nueva operación' : (form.descripcion || 'Editar')}</h3>
              <button onClick={() => setModal(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: '#9ca3af', cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
            </div>

            {ops.length > 0 && (
              <select value={linkOp} onChange={e => {
                const v = e.target.value; setLinkOp(v)
                const o = ops.find(x => String(x.id) === v)
                if (o) setForm(f => ({ ...f, bl: o.bl || f.bl, descripcion: f.descripcion.trim() ? f.descripcion : (o.nombre || '') }))
              }} className="dsp-inp" style={{ ...INP, cursor: 'pointer', marginBottom: 10, color: linkOp ? '#111827' : '#9ca3af' }}>
                <option value="">Vincular a una operación de Operaciones…</option>
                {ops.map(o => <option key={o.id} value={String(o.id)}>{o.nombre || '(sin nombre)'}{o.bl ? ` · ${o.bl}` : ''}</option>)}
              </select>
            )}

            <div style={{ marginBottom: 8 }}>
              <input value={form.descripcion} onChange={e => upd('descripcion', e.target.value)} className="dsp-inp" style={INP} placeholder="Descripción de la carga *" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8, marginBottom: '1.25rem' }}>
              <input value={form.bl} onChange={e => upd('bl', e.target.value)} className="dsp-inp" style={{ ...INP, fontFamily: 'ui-monospace,monospace' }} placeholder="N° B/L / Referencia" />
              <select value={form.estado} onChange={e => upd('estado', e.target.value)} className="dsp-inp" style={{ ...INP, cursor: 'pointer' }}>
                {ESTADOS_IMP.map(s => <option key={s} value={s}>{s}</option>)}
                {form.estado && !ESTADOS_IMP.includes(form.estado) && <option value={form.estado}>{form.estado}</option>}
              </select>
            </div>

            <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: 8 }}>Costos · solo los que apliquen</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {CONCEPTOS.map(([k, lbl]) => (
                <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 100px 120px', gap: 10, alignItems: 'center' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: numUSD(conc[k].m) > 0 ? 600 : 400, color: numUSD(conc[k].m) > 0 ? '#111827' : '#6b7280' }}>{lbl}</label>
                  <input value={conc[k].m} onChange={e => updConc(k, { m: e.target.value })} inputMode="decimal" placeholder="0" className="dsp-inp"
                    style={{ ...INP, padding: '0.4rem 0.55rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: numUSD(conc[k].m) > 0 ? 600 : 400 }} />
                  <FNToggle f={conc[k].f} onChange={f => updConc(k, { f })} small />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '0.6rem 0 0', borderTop: '1px solid #f1f5f9', marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                {formTotals.fact > 0 && <>Te factura <b style={{ color: '#059669', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(formTotals.fact)}</b></>}
                {formTotals.fact > 0 && formTotals.negro > 0 && ' · '}
                {formTotals.negro > 0 && <><Dot />En negro <b style={{ color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(formTotals.negro)}</b></>}
              </span>
              <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>Total <b style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(formTotals.total)}</b></span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>Factura recibida</span>
                {[[1, 'Sí'], [0, 'No']].map(([v, l]) => {
                  const on = !!form.facturado === !!v
                  return (
                    <button key={l} onClick={() => upd('facturado', v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 3px', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: on ? 600 : 400, color: on ? '#111827' : '#9ca3af', borderBottom: on ? '2px solid #111827' : '2px solid transparent' }}>{l}</button>
                  )
                })}
              </div>
              <input value={form.factura_nro} onChange={e => upd('factura_nro', e.target.value)} className="dsp-inp" style={{ ...INP, padding: '0.4rem 0.55rem' }} placeholder="N° factura / comprobante" />
            </div>

            <input value={form.notas} onChange={e => upd('notas', e.target.value)} className="dsp-inp" style={{ ...INP, marginBottom: '1.25rem' }} placeholder="Observaciones (opcional)" />

            {modal !== 'new' && numUSD(modal.total_pagado) > 0 && (
              <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '-0.6rem 0 1rem' }}>
                Ya pagado <b style={{ color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(numUSD(modal.total_pagado))}</b> → saldo tras guardar: <b style={{ color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(formTotals.total - numUSD(modal.total_pagado))}</b>
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 18 }}>
              <button onClick={() => setModal(null)} className="dsp-txtbtn" style={{ ...TXTBTN, fontSize: '0.78rem' }}>Cancelar</button>
              <button onClick={save} disabled={saving} style={{ padding: '0.5rem 1.1rem', borderRadius: 6, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 600, fontSize: '0.78rem', cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>{saving ? 'Guardando…' : (modal === 'new' ? 'Crear operación' : 'Guardar')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }} onClick={() => setConfirmDel(null)}>
          <div style={{ ...PANEL, maxWidth: 340, width: '100%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', marginBottom: 6 }}>¿Eliminar registro?</p>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '1.25rem' }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 22, justifyContent: 'center', alignItems: 'center' }}>
              <button onClick={() => setConfirmDel(null)} className="dsp-txtbtn" style={{ ...TXTBTN, fontSize: '0.78rem' }}>Cancelar</button>
              <button onClick={() => del(confirmDel)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: '#dc2626', fontFamily: 'inherit' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Borrar pago confirm */}
      {confirmPago && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }} onClick={() => setConfirmPago(null)}>
          <div style={{ ...PANEL, maxWidth: 360, width: '100%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', marginBottom: 6 }}>¿Borrar este pago?</p>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '1.25rem' }}>
              {confirmPago.pg.fecha || 's/fecha'} · {metodoLabel(confirmPago.pg.metodo)} · <b style={{ color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(numUSD(confirmPago.pg.monto))}</b><br />
              Sale del historial y el saldo se recalcula.
            </p>
            <div style={{ display: 'flex', gap: 22, justifyContent: 'center', alignItems: 'center' }}>
              <button onClick={() => setConfirmPago(null)} className="dsp-txtbtn" style={{ ...TXTBTN, fontSize: '0.78rem' }}>Cancelar</button>
              <button onClick={delPago} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: '#dc2626', fontFamily: 'inherit' }}>Borrar pago</button>
            </div>
          </div>
        </div>
      )}

      {/* Registrar pago (cuenta corriente): evento en el ledger + actualiza el saldo */}
      {pagoModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setPagoModal(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ ...PANEL, width: '100%', maxWidth: 380 }}>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', marginBottom: 3 }}>Registrar pago al despachante</p>
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '1.25rem' }}>{pagoModal.row.descripcion} · saldo {fmtUSD(numUSD(pagoModal.row.saldo))} · puede ser parcial</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div><label style={LBL}>Fecha</label><input type="date" value={pagoModal.fecha} onChange={e => setPagoModal(f => ({ ...f, fecha: e.target.value }))} className="dsp-inp" style={INP} /></div>
              <div><label style={LBL}>Monto (USD)</label><input inputMode="decimal" value={pagoModal.monto} onChange={e => setPagoModal(f => ({ ...f, monto: e.target.value }))} className="dsp-inp" style={{ ...INP, fontVariantNumeric: 'tabular-nums' }} placeholder="0" /></div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={LBL}>Método</label>
              <div style={{ display: 'flex', gap: 16 }}>
                {[['transferencia', 'Transferencia'], ['cash', 'Efectivo']].map(([v, l]) => {
                  const on = pagoModal.metodo === v
                  return (
                    <button key={v} onClick={() => setPagoModal(f => ({ ...f, metodo: v }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 3px', fontFamily: 'inherit', fontSize: '0.76rem', fontWeight: on ? 600 : 400, color: on ? '#111827' : '#9ca3af', borderBottom: on ? '2px solid #111827' : '2px solid transparent' }}>{l}</button>
                  )
                })}
              </div>
            </div>
            <div style={{ marginBottom: '1.25rem' }}><label style={LBL}>Nota (opcional)</label><input value={pagoModal.nota} onChange={e => setPagoModal(f => ({ ...f, nota: e.target.value }))} className="dsp-inp" style={INP} placeholder="Ej: adelanto 50%" /></div>
            <div style={{ display: 'flex', gap: 18, justifyContent: 'flex-end', alignItems: 'center' }}>
              <button onClick={() => setPagoModal(null)} className="dsp-txtbtn" style={{ ...TXTBTN, fontSize: '0.78rem' }}>Cancelar</button>
              <button onClick={savePagoDesp} disabled={pagoBusy} style={{ padding: '0.5rem 1.1rem', borderRadius: 6, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 600, fontSize: '0.78rem', cursor: pagoBusy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>{pagoBusy ? 'Guardando…' : 'Registrar'}</button>
            </div>
          </div>
        </div>
      )}

      {ficha && <FichaImportacion bl={ficha.bl} seed={{ desp: ficha.desp, ship: ficha.ship }} onClose={() => setFicha(null)} onChanged={load} />}

      <BarraSeleccion s={selm} />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .dsp-row:hover { background: #fafafa; }
        .dsp-search:focus { border-bottom-color: #111827 !important; }
        .dsp-inp:focus { border-color: #111827 !important; }
        .dsp-txtbtn:hover { color: #111827 !important; }
        .dsp-ico:hover { color: #6b7280 !important; }
        @media (hover: hover) {
          .dsp-acts { opacity: 0; transition: opacity .12s; }
          .dsp-row:hover .dsp-acts, .dsp-row:focus-within .dsp-acts { opacity: 1; }
        }
        @media (max-width: 640px) {
          .dsp-metrics { gap: 0.85rem 1.5rem !important; }
        }
      `}</style>
    </div>
  )
}
