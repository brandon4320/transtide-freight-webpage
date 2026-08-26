'use client'

import { Fragment, useState, useEffect, useMemo, useCallback } from 'react'
import { gToast } from '../toast'
import FichaImportacion from '../ficha-importacion'
import { EmbarqueModal, AGENTES } from '../embarque-form'
import { importFlowState, MiniFlow } from '../flujo-importacion'
import { METODOS_PAGO, METODO_DEFAULT_AGENTE, metodoLabel } from '../pagos-metodos'
import { useSeleccionMultiple, BarraSeleccion, Casilla } from '../seleccion-multiple'

// ——— Transtide Flat: hoja blanca, tipografía protagonista, líneas finas ———
const INP = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '16px', color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const LBL = { display: 'block', fontSize: '0.68rem', fontWeight: 500, color: '#9ca3af', marginBottom: 5 }
const PANEL = { background: '#fff', borderRadius: 12, padding: '1.5rem 1.75rem', width: '100%', boxSizing: 'border-box' }
const BTN_PRIMARY = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', borderRadius: 6, border: 'none', background: '#111827', color: '#fff', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }
const BTN_SEC = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.74rem', fontWeight: 500, color: '#6b7280', fontFamily: 'inherit' }
const BTN_ICO = { width: 24, height: 24, border: 'none', background: 'none', color: '#c4c9d4', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }
// Filtro como texto: activo negro con subrayado, inactivo gris.
const ftxt = (sel) => ({ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 4px', fontSize: '0.74rem', fontWeight: sel ? 600 : 400, color: sel ? '#111827' : '#9ca3af', borderBottom: sel ? '2px solid #111827' : '2px solid transparent', fontFamily: 'inherit', whiteSpace: 'nowrap' })

// STATUSES y AGENTES viven en embarque-form (formulario compartido con Operaciones)

// Tono del estado como texto plano: color solo cuando es semántico
// (rojo problema, verde ok, ámbar atención); el resto en gris.
function statusTone(raw) {
  const s = (raw || '').toLowerCase()
  if (/cancel/.test(s))                    return '#dc2626'
  if (/paid|pagad|deliver|entreg/.test(s)) return '#059669'
  if (/pending|pendiente/.test(s))         return '#d97706'
  return '#9ca3af'
}

// Cerrada = cancelada, o entregada/pagada con el agente ya saldado.
// Si arribó pero todavía le debés al forwarder, sigue activa (el pago manda).
const esCerrada = (s) => /cancel/i.test(s.status || '') || (/deliver|paid|entreg|pagad/i.test(s.status || '') && numUSD(s.balance_usd) <= 0)

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
  if (days < 0) return { rel: `hace ${-days}d`, tone: '#9ca3af' }
  if (days === 0) return { rel: 'hoy', tone: '#dc2626' }
  if (days <= 7) return { rel: `en ${days}d`, tone: '#d97706' }
  return { rel: `en ${days}d`, tone: '#9ca3af' }
}



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
  const [ficha, setFicha] = useState(null)   // B/L abierto en la ficha integral
  const [desps, setDesps] = useState([])     // despachos (estado de aduana por fila)
  const [hechas, setHechas] = useState(() => new Set())  // akeys de alertas ya resueltas
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [cerradasOpen, setCerradasOpen] = useState(false)  // sección "Cerradas" del fondo, colapsada por defecto
  const [pagoModal, setPagoModal] = useState(null) // registrar pago al forwarder
  const [pagoBusy, setPagoBusy] = useState(false)
  const [expandId, setExpandId] = useState(null)   // embarque con historial abierto
  const [histPagos, setHistPagos] = useState({})
  // Último método usado con cada agente → precarga el modal (Bruce siempre USA).
  const [ultMetodo, setUltMetodo] = useState({})
  // Totales del ledger por embarque (ref_id → {total, pagos, ajuste, n}): el
  // "Pagado"/"Saldo" del embarque se DERIVA de acá, no se tipea.
  const [agg, setAgg] = useState(null)             // null = historial sin cargar
  const [confirmPago, setConfirmPago] = useState(null) // { ship, pg } → borrar un pago
  const [conciliando, setConciliando] = useState(null) // id del embarque recalculándose
  const [undoAlert, setUndoAlert] = useState(null)     // última alerta tachada → deshacer
  const [hechasOpen, setHechasOpen] = useState(false)  // desplegable "Hechas (N)"
  const [hechasMeta, setHechasMeta] = useState({})     // akey → { done_by, done_at }

  async function errMsg(res, fallback) {
    try { const j = await res.json(); return j.error || fallback } catch { return fallback }
  }

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
      // Alertas tachadas (con quién y cuándo, para poder deshacerlas).
      fetch('/api/db/alertas?full=1').then(x => x.ok ? x.json() : []).then(arr => {
        if (!Array.isArray(arr)) return
        const keys = new Set(); const meta = {}
        arr.forEach(r => {
          const k = typeof r === 'string' ? r : (r && r.akey)
          if (!k) return
          keys.add(k)
          if (r && typeof r === 'object') meta[k] = { done_by: r.done_by || '', done_at: r.done_at || '' }
        })
        setHechas(keys); setHechasMeta(meta)
      }).catch(() => {})
      // Totales del ledger por embarque: de acá sale el pagado/saldo real.
      // Viene ordenado del pago más nuevo al más viejo, así que el primer ref de
      // cada agente trae el método que usaste la última vez con él.
      fetch('/api/db/pagos?scope=agente&agg=1').then(x => x.ok ? x.json() : null).then(arr => {
        // Si el historial no se puede leer, agg queda en null: sin comparar
        // contra datos viejos (mostraría desvíos falsos y ajustes de más).
        if (!Array.isArray(arr)) { setAgg(null); return }
        const m = {}; arr.forEach(a => { m[String(a.ref_id)] = a })
        setAgg(m)
        const byId = {}; shipments.forEach(s => { byId[String(s.id)] = s.agente || 'Bruce' })
        const um = {}
        arr.forEach(a => {
          const ag = byId[String(a.ref_id)]
          if (ag && a.ultimo_metodo && !um[ag]) um[ag] = a.ultimo_metodo
        })
        setUltMetodo(um)
      }).catch(() => setAgg(null))
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

  // "Seleccionar todos" alcanza SOLO lo que está a la vista: si las cerradas están
  // colapsadas no entran, para no borrar algo que no se ve.
  const cerradasAbiertas = cerradasOpen || filter === 'pagado'
  const aLaVista = useMemo(() => {
    const act = filtered.filter(s => !esCerrada(s))
    if (cerradasAbiertas || act.length === 0) return filtered
    return act
  }, [filtered, cerradasAbiertas])
  const selm = useSeleccionMultiple({
    items: aLaVista,
    // Se llama dentro de una arrow: delMuchos se declara más abajo y referenciarlo
    // directo acá rompe al montar (zona muerta temporal).
    onEliminar: (ids) => delMuchos(ids),
    nombre: ['embarque', 'embarques'],
  })

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
  // Tachadas pero todavía vigentes: se pueden reactivar (tachar no es definitivo).
  const alertasHechas = useMemo(() => alertas.filter(a => hechas.has(a.key)), [alertas, hechas])

  // El aviso de "deshacer" se va solo a los 12s (o al tocar deshacer).
  useEffect(() => {
    if (!undoAlert) return
    const t = setTimeout(() => setUndoAlert(null), 12000)
    return () => clearTimeout(t)
  }, [undoAlert])

  // Marcar/desmarcar una alerta como hecha (optimista + persistido en D1).
  // Si el guardado falla se revierte: la alerta no puede desaparecer en silencio.
  const toggleHecha = async (a, done = true) => {
    setHechas(prev => { const n = new Set(prev); done ? n.add(a.key) : n.delete(a.key); return n })
    setUndoAlert(done ? a : (u => (u && u.key === a.key ? null : u)))
    try {
      const r = await fetch('/api/db/alertas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ akey: a.key, undo: !done }) })
      if (!r.ok) throw new Error(await errMsg(r, 'No se pudo guardar la alerta.'))
      setHechasMeta(m => {
        const n = { ...m }
        if (done) n[a.key] = { done_by: '', done_at: new Date().toISOString().slice(0, 10) }
        else delete n[a.key]
        return n
      })
    } catch (e) {
      setHechas(prev => { const n = new Set(prev); done ? n.delete(a.key) : n.add(a.key); return n })
      setUndoAlert(u => (u && u.key === a.key ? null : u))
      gToast.error(e.message || 'No se pudo guardar la alerta. Volvió a la lista.')
    }
  }

  // Texto de cada alerta (una sola fuente para el panel). Lo importante en
  // oscuro (via .tk-alert b), los montos en ámbar.
  const alertText = (a) => {
    if (a.tipo === 'bl_china') return <><b>#{a.num}</b> llega {a.dias === 0 ? 'hoy' : `en ${a.dias} día${a.dias === 1 ? '' : 's'}`} — pedile a {a.agente} la liberación del B/L desde China</>
    if (a.tipo === 'naviera') return <><b>#{a.num}</b> llega {a.dias === 0 ? 'hoy' : `en ${a.dias} día${a.dias === 1 ? '' : 's'}`} — pagá naviera/terminal para liberar el contenedor a tiempo</>
    if (a.tipo === 'transporte') return <><b>#{a.num}</b> llega {a.dias === 0 ? 'hoy' : `en ${a.dias} día${a.dias === 1 ? '' : 's'}`}{a.destino ? ` a ${a.destino}` : ''} — coordiná el transporte interno</>
    if (a.tipo === 'liberar') return <><b>#{a.num}</b> arribó hace {a.dias} días y sigue sin liberar — riesgo de demoras/almacenaje</>
    if (a.tipo === 'despacho') return <><b>#{a.num}</b> arribó hace {a.sem} semana{a.sem === 1 ? '' : 's'} — cargá el despacho del despachante</>
    return <><b>#{a.num}</b> arribó{a.sem != null ? ` hace ${a.sem} semana${a.sem === 1 ? '' : 's'}` : ''} — saldo <span style={{ color: '#d97706', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(a.monto)}</span> a {a.agente}</>
  }

  // Título corto en texto plano (deshacer y lista de hechas, una línea).
  const alertTitulo = (a) => ({
    bl_china: `pedir la liberación del B/L a ${a.agente || 'el agente'}`,
    naviera: 'pagar naviera/terminal',
    transporte: `coordinar el transporte interno${a.destino ? ` a ${a.destino}` : ''}`,
    liberar: 'contenedor sin liberar',
    despacho: 'cargar el despacho',
    pago: `saldo ${fmtUSD(a.monto || 0)} a ${a.agente || 'Bruce'}`,
  }[a.tipo] || 'alerta del flujo')

  const hoyStr = () => new Date().toISOString().slice(0, 10)

  // ——— Saldo con el agente = historial de pagos ————————————————————————
  // El "Pagado"/"Saldo" del embarque son la proyección del ledger: cada vez que
  // se toca un pago se REESCRIBEN con el total que devuelve la API, nunca se les
  // suma/resta a mano. Lo que ya estaba tipeado sin respaldo se convierte en un
  // "ajuste manual" explícito y visible en el historial.
  const AJUSTE_NOTA = 'Ajuste manual — pagado cargado a mano, sin pago en el historial'

  // Diferencia entre el "Pagado" guardado en el embarque y lo que suma el ledger.
  const desvio = (sh) => {
    if (!agg) return null           // historial sin cargar: no se puede comparar
    const a = agg[String(sh.id)]
    const led = a ? a.total : 0
    const rec = numUSD(sh.amount_rec_usd)
    const d = Math.round((rec - led) * 100) / 100
    return Math.abs(d) < 0.5 ? null : { led, rec, d, n: a ? a.n : 0 }
  }

  // Escribe el pagado/saldo derivados en el embarque (una sola fuente de cuenta).
  const putSaldo = async (sh, rec, fecha) => {
    const bal = numUSD(sh.amount_due_usd) - rec
    const body = { ...sh, amount_rec_usd: fmtCalc(rec), balance_usd: fmtCalc(bal) }
    if (fecha) body.payment_date = fecha
    const res = await fetch(`/api/tracking/${sh.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await errMsg(res, 'No se pudo actualizar el saldo del embarque.'))
  }

  // Materializa como ajuste explícito la plata que el "Pagado" declara y el
  // historial no explica. Sin esto, derivar del ledger se comería esa carga vieja.
  const materializarAjuste = async (sh) => {
    const dv = desvio(sh)
    if (!dv || dv.d <= 0) return false
    const r = await fetch('/api/db/pagos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'agente', tipo: 'ajuste', ref_id: String(sh.id), bl: sh.bl || '', fecha: sh.payment_date || hoyStr(), monto: fmtCalc(dv.d), metodo: '', nota: AJUSTE_NOTA }),
    })
    if (!r.ok) throw new Error(await errMsg(r, 'No se pudo registrar el ajuste manual.'))
    return true
  }

  // Alinear embarque e historial. 'ajuste' → la diferencia queda registrada como
  // ajuste manual; 'historial' → manda el ledger y se descarta lo tipeado.
  const conciliar = async (sh, modo) => {
    if (conciliando) return
    const dv = desvio(sh)
    if (!dv) return
    setConciliando(sh.id)
    try {
      let rec = dv.led
      if (modo === 'ajuste') { await materializarAjuste(sh); rec = dv.rec }
      await putSaldo(sh, rec, null)
      gToast.success(modo === 'ajuste' ? 'Ajuste manual registrado en el historial.' : 'Saldo recalculado desde el historial.')
      setHistPagos(h => { const n = { ...h }; delete n[sh.id]; return n })
      load()
    } catch (e) {
      gToast.error(e.message || 'No se pudo recalcular el saldo.')
    } finally { setConciliando(null) }
  }

  // Registrar pago al forwarder: primero el EVENTO en el ledger (si eso falla no
  // se toca el saldo), después el saldo derivado del total que devuelve la API.
  const savePagoAgente = async () => {
    const f = pagoModal
    if (!f || pagoBusy) return
    if (numUSD(f.monto) <= 0) { gToast.error('Cargá el monto.'); return }
    setPagoBusy(true)
    try {
      const sh = f.ship
      await materializarAjuste(sh)
      const rp = await fetch('/api/db/pagos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'agente', tipo: 'pago', ref_id: String(sh.id), bl: sh.bl || '', fecha: f.fecha, monto: f.monto, metodo: f.metodo, nota: f.nota }),
      })
      if (!rp.ok) throw new Error(await errMsg(rp, 'No se pudo registrar el pago en el historial. El saldo quedó como estaba.'))
      const j = await rp.json().catch(() => null)
      // Derivado del ledger. Si el historial no se pudo leer al abrir la pantalla,
      // se cae al comportamiento viejo (sumar) para no pisar una carga a mano.
      const rec = (agg && j && j.agg && typeof j.agg.total === 'number') ? j.agg.total : numUSD(sh.amount_rec_usd) + numUSD(f.monto)
      setUltMetodo(m => ({ ...m, [sh.agente || 'Bruce']: f.metodo }))
      setPagoModal(null)
      setHistPagos(h => { const n = { ...h }; delete n[sh.id]; return n })
      try {
        await putSaldo(sh, rec, f.fecha)
        gToast.success('Pago registrado.')
      } catch {
        gToast.error('El pago quedó registrado, pero no se pudo actualizar el saldo. Abrí el historial del embarque y tocá "Usar el historial".')
      }
      load()
    } catch (e) {
      gToast.error(e.message || 'Error al registrar el pago.')
    } finally { setPagoBusy(false) }
  }

  // Borrar un pago mal cargado: sale del ledger y el saldo se recalcula solo.
  const delPago = async () => {
    const { ship: sh, pg } = confirmPago
    try {
      await materializarAjuste(sh)
      const res = await fetch(`/api/db/pagos/${pg.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await errMsg(res, 'No se pudo borrar el pago.'))
      const j = await res.json().catch(() => null)
      // Igual que al registrar: solo se deriva del ledger si pudimos comparar
      // contra el saldo guardado (si no, se resta, para no pisar cargas viejas).
      const rec = (agg && j && j.agg && typeof j.agg.total === 'number')
        ? j.agg.total
        : Math.max(0, numUSD(sh.amount_rec_usd) - numUSD(pg.monto))
      await putSaldo(sh, rec, null)
      gToast.success('Pago eliminado. El saldo se recalculó.')
      setHistPagos(h => { const n = { ...h }; delete n[sh.id]; return n })
      load()
    } catch (e) {
      gToast.error(e.message || 'Error al borrar el pago.')
    } finally { setConfirmPago(null) }
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

  // Borrado en lote (ya confirmado y con el deshacer vencido).
  const delMuchos = useCallback(async (ids) => {
    const res = await Promise.all(ids.map(id =>
      fetch(`/api/tracking/${id}`, { method: 'DELETE' }).then(r => r.ok).catch(() => false)
    ))
    const ok = res.filter(Boolean).length
    setShips(prev => prev.filter(s => !ids.includes(s.id)))
    if (ok === ids.length) gToast.success(ok === 1 ? 'Embarque eliminado.' : `${ok} embarques eliminados.`)
    else gToast.error(`Se eliminaron ${ok} de ${ids.length}. Recargá para ver el estado real.`)
  }, [])

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

  // Métrica de la línea horizontal: valor arriba, label chiquito debajo. Sin cajas.
  const metric = (val, label, color = '#111827') => (
    <div>
      <p style={{ fontSize: '1.15rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color, lineHeight: 1.2 }}>{val}</p>
      <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginTop: 2 }}>{label}</p>
    </div>
  )
  const metricDivider = <span style={{ width: 1, alignSelf: 'stretch', background: '#f1f5f9', flex: '0 0 auto' }} aria-hidden="true" />


  return (
    <div style={{ background: '#fff' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.4rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 350, letterSpacing: '-0.02em', color: '#111827', marginBottom: '0.25rem' }}>Forwarding</h2>
          <p style={{ fontSize: '0.74rem', color: '#9ca3af' }}>Cuenta corriente con tus agentes de carga — la carga vive en cada operación · {ships.length} embarques</p>
        </div>
        <button onClick={openNew} style={BTN_PRIMARY}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo embarque
        </button>
      </div>

      {/* Cuenta corriente con los forwarders — una sola línea de métricas, sin cajas */}
      {(() => {
        const base = agenteFilter === 'todos' ? ships : ships.filter(x => (x.agente || 'Bruce') === agenteFilter)
        const debe = base.reduce((a, x) => a + Math.max(0, numUSD(x.balance_usd)), 0)
        const favor = base.reduce((a, x) => a + Math.max(0, -numUSD(x.balance_usd)), 0)
        const neto = debe - favor
        const due = base.reduce((a, x) => a + numUSD(x.amount_due_usd), 0)
        const pag = base.reduce((a, x) => a + numUSD(x.amount_rec_usd), 0)
        const transito = base.filter(x => /transit/i.test(x.status || '')).length
        const quien = agenteFilter === 'todos' ? 'les debés' : `debés a ${agenteFilter}`
        return (
          <div style={{ display: 'flex', gap: '2.5rem', rowGap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end', paddingBottom: '1.1rem', borderBottom: '1px solid #f1f5f9', marginBottom: '1.4rem' }}>
            {metric(fmtUSD(Math.abs(neto)), neto > 0 ? `${quien} (neto)` : neto < 0 ? 'a tu favor (neto)' : 'todo saldado', neto > 0 ? '#dc2626' : neto < 0 ? '#d97706' : '#059669')}
            {metricDivider}
            {metric(fmtUSD(due), 'a pagar')}
            {metric(fmtUSD(pag), 'pagado')}
            {metricDivider}
            {metric(base.length, 'embarques')}
            {metric(transito, 'en tránsito')}
          </div>
        )
      })()}

      {/* Alertas del flujo — bloque con filete ámbar (tachá lo hecho, tocá para actuar) */}
      {(alertasVis.length > 0 || alertasHechas.length > 0) && (() => {
        const mostrar = alertsOpen ? alertasVis : alertasVis.slice(0, 5)
        return (
          <div className="tk-alert" style={{ borderLeft: `2px solid ${alertasVis.length > 0 ? '#d97706' : '#e5e7eb'}`, paddingLeft: 12, marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <p style={{ fontSize: '0.64rem', fontWeight: 700, color: alertasVis.length > 0 ? '#d97706' : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {alertasVis.length > 0
                  ? <>Alertas · {alertasVis.length} pendiente{alertasVis.length === 1 ? '' : 's'}</>
                  : <>Alertas · nada pendiente</>}
              </p>
              {alertasVis.length > 5 && (
                <button className="tk-sec" onClick={() => setAlertsOpen(o => !o)} style={{ ...BTN_SEC, fontSize: '0.7rem' }}>
                  {alertsOpen ? 'Ver menos' : `Ver todas (${alertasVis.length})`}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: alertsOpen ? 'rotate(180deg)' : 'none' }}><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              )}
            </div>
            {/* Deshacer lo último tachado — un toque de más no borra el recordatorio */}
            {undoAlert && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', marginBottom: '0.2rem' }}>
                <span style={{ flex: '0 0 auto', color: '#059669', display: 'inline-flex' }} aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="4 12.5 9 17.5 20 6.5"/></svg>
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: '0.74rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Tachada: #{undoAlert.num || '—'} · {alertTitulo(undoAlert)}
                </span>
                <button className="tk-sec" onClick={() => toggleHecha(undoAlert, false)} style={{ ...BTN_SEC, flex: '0 0 auto', color: '#111827', fontWeight: 600 }}>Deshacer</button>
              </div>
            )}
            <div style={{ maxHeight: alertsOpen ? 340 : 'none', overflowY: alertsOpen ? 'auto' : 'visible' }}>
              {mostrar.map((a) => (
                <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.32rem 0' }}>
                  <button className="tk-check" onClick={() => toggleHecha(a, true)} title="Marcar como hecho" aria-label="Marcar como hecho"
                    style={{ ...BTN_ICO, width: 20, height: 20, flex: '0 0 auto' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="9"/><polyline points="8.5 12.5 11 15 15.5 9.5"/></svg>
                  </button>
                  <button onClick={() => a.bl && setFicha(a.bl)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: a.bl ? 'pointer' : 'default', fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.4, padding: 0, fontFamily: 'inherit' }}>
                    {alertText(a)}
                  </button>
                  {a.bl && (
                    <button className="tk-sec" onClick={() => setFicha(a.bl)} title={a.tipo === 'pago' ? 'Registrar pago' : a.tipo === 'despacho' ? 'Cargar despacho' : 'Abrir ficha'}
                      style={{ ...BTN_SEC, flex: '0 0 auto', whiteSpace: 'nowrap' }}>
                      {a.tipo === 'pago' ? 'Registrar pago' : a.tipo === 'despacho' ? 'Cargar despacho' : 'Abrir'}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Hechas: siguen vigentes, solo tachadas. Se reactivan de a una. */}
            {alertasHechas.length > 0 && (
              <div style={{ marginTop: alertasVis.length > 0 ? '0.5rem' : 0, paddingTop: alertasVis.length > 0 ? '0.4rem' : 0, borderTop: alertasVis.length > 0 ? '1px solid #f1f5f9' : 'none' }}>
                <button className="tk-sec" onClick={() => setHechasOpen(o => !o)} style={{ ...BTN_SEC, fontSize: '0.72rem' }}>
                  Hechas ({alertasHechas.length})
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: hechasOpen ? 'rotate(180deg)' : 'none' }}><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {hechasOpen && (
                  <div style={{ marginTop: '0.3rem', maxHeight: 260, overflowY: 'auto' }}>
                    {alertasHechas.map(a => {
                      const meta = hechasMeta[a.key]
                      const cuando = meta && meta.done_at ? String(meta.done_at).slice(0, 10) : ''
                      return (
                        <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.3rem 0' }}>
                          <span style={{ flex: '0 0 auto', width: 20, color: '#d1d5db', display: 'inline-flex', justifyContent: 'center' }} aria-hidden="true">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="9"/><polyline points="8.5 12.5 11 15 15.5 9.5"/></svg>
                          </span>
                          <button onClick={() => a.bl && setFicha(a.bl)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: a.bl ? 'pointer' : 'default', fontSize: '0.74rem', color: '#c4c9d4', textDecoration: 'line-through', lineHeight: 1.4, padding: 0, fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            #{a.num || '—'} · {alertTitulo(a)}
                          </button>
                          {cuando && <span style={{ flex: '0 0 auto', fontSize: '0.64rem', color: '#d1d5db', fontVariantNumeric: 'tabular-nums' }}>{cuando}</span>}
                          <button className="tk-sec" onClick={() => toggleHecha(a, false)} style={{ ...BTN_SEC, flex: '0 0 auto', whiteSpace: 'nowrap' }}>Reactivar</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* Buscador + filtros — una sola línea fina, filtros como texto */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.5rem', rowGap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4c9d4" strokeWidth="2" style={{ position: 'absolute', left: 2, top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="tk-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar BL, carrier, origen, proveedor…"
            style={{ width: '100%', border: 'none', borderBottom: '1px solid #e5e7eb', borderRadius: 0, background: 'transparent', padding: '0.4rem 0.25rem 0.4rem 1.5rem', fontSize: '16px', color: '#111827', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#c4c9d4', paddingBottom: 6 }}>Agente</span>
          {['todos', ...agentesFiltro].map(a => (
            <button key={a} onClick={() => setAgenteFilter(a)} style={ftxt(agenteFilter === a)}>
              {a === 'todos' ? 'Todos' : a}{a === 'Yachao' ? ' · aéreo' : (a === 'Bruce' || a === 'Shaina') ? ' · marítimo' : ''}
            </button>
          ))}
        </div>
        <span style={{ width: 1, height: 16, background: '#f1f5f9', marginBottom: 3, flex: '0 0 auto' }} aria-hidden="true" />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
          {[['todos','Todos'],['transito','En tránsito'],['pendiente','Pend. pago'],['pagado','Pagados']].map(([id, lbl]) => (
            <button key={id} onClick={() => setFilter(id)} style={ftxt(filter === id)}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ padding: '4rem 0', textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>
          <div style={{ width: 28, height: 28, border: '2px solid #f1f5f9', borderTopColor: '#111827', borderRadius: '50%', margin: '0 auto 0.9rem', animation: 'spin 0.8s linear infinite' }} />
          Cargando embarques…
        </div>
      ) : loadError ? (
        <div style={{ padding: '4rem 0', textAlign: 'center', color: '#9ca3af' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.3rem', color: '#dc2626', fontSize: '0.88rem' }}>No se pudieron cargar los embarques</p>
          <p style={{ fontSize: '0.78rem', marginBottom: '1.25rem' }}>Puede ser un problema de conexión.</p>
          <button onClick={load} className="tk-sec" style={{ ...BTN_SEC, fontSize: '0.78rem', fontWeight: 600, color: '#111827', borderBottom: '1px solid #111827', paddingBottom: 2 }}>Reintentar</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '4rem 0', textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>Sin embarques que coincidan.</div>
      ) : (
        <div>
          {(() => {
            // Activas arriba (agrupadas por agente); cerradas todas al fondo, colapsadas.
            const visiblesSel = selm.filtrar(filtered)
            const activos = visiblesSel.filter(s => !esCerrada(s))
            const cerradas = visiblesSel.filter(s => esCerrada(s)).sort((a, b) => (parseInt(b.num, 10) || 0) - (parseInt(a.num, 10) || 0))
            // Si el filtro apunta a pagados (o no queda ninguna activa), las cerradas se muestran solas.
            const mostrarCerradas = cerradasOpen || filter === 'pagado' || activos.length === 0
            const groups = []
            activos.forEach(x => { const k = x.agente || 'Bruce'; let g = groups.find(y => y.key === k); if (!g) { g = { key: k, items: [] }; groups.push(g) } g.items.push(x) })
            groups.forEach(g => g.items.sort((a, b) => (numUSD(b.balance_usd) > 0 ? 1 : 0) - (numUSD(a.balance_usd) > 0 ? 1 : 0) || (parseInt(b.num, 10) || 0) - (parseInt(a.num, 10) || 0)))
            const grupos = groups.map(g => {
              const debe = g.items.reduce((x, r) => x + Math.max(0, numUSD(r.balance_usd)), 0)
              const favor = g.items.reduce((x, r) => x + Math.max(0, -numUSD(r.balance_usd)), 0)
              const neto = debe - favor
              return (
                <div key={g.key}>
                  {/* Header de grupo: label chiquito, contador en gris, subtotal a la derecha */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '1.5rem 0 0.1rem', padding: '0 0.25rem' }}>
                    <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{g.key}</span>
                    <span style={{ fontSize: '0.64rem', color: '#c4c9d4', fontVariantNumeric: 'tabular-nums' }}>{g.items.length}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#9ca3af' }}>
                      {neto > 0
                        ? <>le debés <span style={{ fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(neto)}</span></>
                        : neto < 0
                          ? <><span style={{ fontWeight: 700, color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(-neto)}</span> a tu favor</>
                          : <>saldado <span style={{ color: '#059669', fontWeight: 700 }}>✓</span></>}
                    </span>
                  </div>
                  <div>
                    {g.items.map(sh => {
                      const bal = numUSD(sh.balance_usd)
                      const due = numUSD(sh.amount_due_usd), rec = numUSD(sh.amount_rec_usd)
                      const pct = due > 0 ? Math.max(0, Math.min(1, rec / due)) : (rec > 0 ? 1 : 0)
                      const op = opByBL[blNorm(sh.bl)]
                      const d = despByBL[blNorm(sh.bl)]
                      const dSaldo = d ? numUSD(d.saldo) : 0
                      const eta = etaInfo(sh.eta)
                      const exp = expandId === sh.id
                      const hist = histPagos[sh.id]
                      // Historial: cuántos pagos tiene y si el saldo del embarque
                      // coincide con lo que suman (dv ≠ null → hay que conciliar).
                      const led = agg ? (agg[String(sh.id)] || null) : null
                      const cnt = Array.isArray(hist) ? hist.length : (agg ? (led ? led.n : 0) : null)
                      const dv = desvio(sh)
                      const busyConc = conciliando === sh.id
                      // Una sola línea de meta separada por puntos
                      const meta = []
                      if (sh.bl) meta.push(<span key="bl" style={{ fontFamily: 'ui-monospace,monospace' }}>{sh.bl}</span>)
                      if (sh.carrier) meta.push(<span key="ca">{sh.carrier}</span>)
                      if (sh.status) meta.push(<span key="st" style={{ fontWeight: 500, color: statusTone(sh.status) }}>{sh.status}</span>)
                      if (sh.eta) meta.push(<span key="eta" style={{ color: eta ? eta.tone : '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>ETA {sh.eta}{eta ? ` · ${eta.rel}` : ''}</span>)
                      meta.push(<MiniFlow key="mf" state={importFlowState({ op, ship: sh, desp: d })} />)
                      if (op) meta.push(
                        <span key="op" className="tk-sec" onClick={e => { e.stopPropagation(); window.location.href = '/gestion/operaciones?op=' + encodeURIComponent(op.id) }}
                          style={{ cursor: 'pointer', color: '#6b7280', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'bottom' }}>{op.nombre || 'Operación'}</span>
                      )
                      if (d) meta.push(dSaldo > 0
                        ? <span key="ad" style={{ fontWeight: 600, color: '#dc2626', whiteSpace: 'nowrap' }}>Aduana USD {d.saldo}</span>
                        : <span key="ad" style={{ fontWeight: 600, color: '#059669', whiteSpace: 'nowrap' }}>Aduana ✓</span>)
                      return (
                        <div key={sh.id} className="tk-row" onClick={() => sh.bl ? setFicha({ bl: sh.bl, ship: sh }) : openEdit(sh)}
                          style={{ padding: '0.8rem 0.25rem', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: selm.esta(sh.id) ? '#f8fafc' : undefined }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                            <span style={{ paddingTop: 2 }}>
                              <Casilla checked={selm.esta(sh.id)} onChange={() => selm.alternar(sh.id)} label={`Seleccionar embarque ${sh.num || ''}`} />
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: '0.88rem', fontWeight: 600, color: '#111827' }}>
                                #{sh.num || '—'} · {sh.origen || '—'} <span style={{ color: '#d1d5db' }}>→</span> {sh.destino || '—'}
                              </p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap', fontSize: '0.68rem', color: '#9ca3af' }}>
                                {meta.map((p, i) => <Fragment key={i}>{i > 0 && <span style={{ color: '#e5e7eb' }} aria-hidden="true">·</span>}{p}</Fragment>)}
                              </div>
                            </div>
                            <div className="tk-col-mid" style={{ flex: '0 0 auto', textAlign: 'right', minWidth: 80 }}>
                              <p style={{ fontSize: '0.74rem', color: '#6b7280', fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>{sh.total_usd ? `USD ${sh.total_usd}` : '—'}</p>
                              <p style={{ fontSize: '0.6rem', color: '#9ca3af', marginTop: 2 }}>total</p>
                            </div>
                            <div style={{ flex: '0 0 auto', textAlign: 'right', minWidth: 92 }}>
                              <p style={{ fontSize: '0.95rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.15, color: bal > 0 ? '#dc2626' : bal < 0 ? '#d97706' : due > 0 ? '#059669' : '#d1d5db' }}>
                                {bal !== 0 ? fmtUSD(Math.abs(bal)) : (due > 0 ? '✓' : '—')}
                              </p>
                              <p style={{ fontSize: '0.6rem', color: '#9ca3af', marginTop: 2 }}>{bal > 0 ? 'debés' : bal < 0 ? 'a tu favor' : due > 0 ? 'pagado' : 'sin monto'}</p>
                            </div>
                            <div className="tk-icons" style={{ flex: '0 0 auto', display: 'inline-flex', gap: 2, marginTop: 1 }}>
                              <button className="tk-ico" onClick={e => { e.stopPropagation(); openEdit(sh) }} title="Editar" aria-label={`Editar embarque ${sh.num || ''}`} style={BTN_ICO}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button className="tk-ico" onClick={e => { e.stopPropagation(); setConfirmDel(sh.id) }} title="Eliminar" aria-label={`Eliminar embarque ${sh.num || ''}`} style={BTN_ICO}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                              </button>
                            </div>
                          </div>

                          {/* Progreso: solo cuando hay pagos parciales en curso */}
                          {rec > 0 && bal > 0 && (
                            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ flex: 1, height: 3, background: '#f1f5f9', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.round(pct * 100)}%`, background: '#d97706', transition: 'width .2s' }} />
                              </div>
                              <p style={{ fontSize: '0.62rem', color: '#9ca3af', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>pagado {fmtUSD(rec)} de {fmtUSD(due)}</p>
                            </div>
                          )}

                          {/* Acciones secundarias como texto plano */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 18, rowGap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                            {bal > 0 && (
                              <button className="tk-sec" onClick={e => { e.stopPropagation(); setPagoModal({ ship: sh, fecha: hoyStr(), monto: fmtCalc(bal), metodo: ultMetodo[sh.agente || 'Bruce'] || METODO_DEFAULT_AGENTE, nota: '' }) }} style={BTN_SEC}>
                                + Registrar pago
                              </button>
                            )}
                            <button className="tk-sec" onClick={e => { e.stopPropagation(); toggleHist(sh) }} style={BTN_SEC}>
                              Historial{cnt != null ? ` (${cnt})` : ''}
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: exp ? 'rotate(180deg)' : 'none' }}><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                            {dv && (
                              <button className="tk-sec" onClick={e => { e.stopPropagation(); if (!exp) toggleHist(sh) }} style={{ ...BTN_SEC, color: '#d97706', fontWeight: 600 }}
                                title="El pagado del embarque no coincide con los pagos registrados">
                                {dv.d > 0 ? `Pagado a mano sin respaldo ${fmtUSD(dv.d)}` : `Historial ${fmtUSD(-dv.d)} por encima del saldo`}
                              </button>
                            )}
                          </div>

                          {/* Historial expandido: texto gris indentado, sin cajas.
                              De acá sale el pagado/saldo: cada línea se puede borrar y recalcula. */}
                          {exp && (() => {
                            const sumHist = Array.isArray(hist) ? hist.reduce((s, p) => s + numUSD(p.monto), 0) : (led ? led.total : 0)
                            return (
                            <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, paddingTop: 8, paddingLeft: 12, borderTop: '1px solid #f8fafc', cursor: 'default' }}>
                              {!Array.isArray(hist) ? (
                                <p style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Cargando…</p>
                              ) : hist.length === 0 ? (
                                <p style={{ fontSize: '0.72rem', color: '#c4c9d4' }}>Sin pagos registrados para este embarque.</p>
                              ) : (
                                <>
                                  {hist.map(pg => {
                                    const esAjuste = String(pg.tipo || 'pago') === 'ajuste'
                                    return (
                                      <div key={pg.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.18rem 0', fontSize: '0.72rem', color: '#9ca3af' }}>
                                        <span style={{ flex: '0 0 auto', fontVariantNumeric: 'tabular-nums' }}>{pg.fecha || '—'}</span>
                                        <span style={{ flex: '0 0 auto', color: esAjuste ? '#d97706' : '#9ca3af', fontWeight: esAjuste ? 600 : 400 }}>{esAjuste ? 'ajuste manual' : metodoLabel(pg.metodo)}</span>
                                        {pg.nota && <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pg.nota}</span>}
                                        {pg.created_by && <span className="tk-hist-by" style={{ flex: '0 0 auto', color: '#c4c9d4' }}>{pg.created_by}</span>}
                                        <span style={{ marginLeft: 'auto', flex: '0 0 auto', fontWeight: 600, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(numUSD(pg.monto))}</span>
                                        <button className="tk-ico" onClick={() => setConfirmPago({ ship: sh, pg })} title="Borrar pago" aria-label="Borrar pago"
                                          style={{ ...BTN_ICO, width: 18, height: 18, flex: '0 0 auto', fontSize: '0.9rem', lineHeight: 1, fontFamily: 'inherit' }}>×</button>
                                      </div>
                                    )
                                  })}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, paddingTop: 4, borderTop: '1px solid #f8fafc', fontSize: '0.68rem', color: '#9ca3af' }}>
                                    <span>Suma del historial</span>
                                    <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(sumHist)}</span>
                                  </div>
                                </>
                              )}

                              {/* Conciliación: el saldo tiene que salir del historial */}
                              {dv && (
                                <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #f8fafc' }}>
                                  <p style={{ fontSize: '0.7rem', color: '#d97706', lineHeight: 1.45 }}>
                                    El embarque dice pagado <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(dv.rec)}</b> y el historial suma <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(dv.led)}</b>
                                    {dv.d > 0 ? <> — hay {fmtUSD(dv.d)} cargados a mano que ningún pago respalda.</> : <> — el historial tiene {fmtUSD(-dv.d)} que el saldo todavía no tomó.</>}
                                  </p>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 18, rowGap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                                    {dv.d > 0 && (
                                      <button className="tk-sec" disabled={busyConc} onClick={() => conciliar(sh, 'ajuste')} style={{ ...BTN_SEC, color: '#111827', fontWeight: 600, cursor: busyConc ? 'wait' : 'pointer' }}>
                                        Dejarlo como ajuste manual
                                      </button>
                                    )}
                                    <button className="tk-sec" disabled={busyConc} onClick={() => conciliar(sh, 'historial')} style={{ ...BTN_SEC, cursor: busyConc ? 'wait' : 'pointer' }}>
                                      Usar el historial ({fmtUSD(dv.led)})
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                            )
                          })()}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
            return (
              <>
                {grupos}

                {/* Cerradas: canceladas o entregadas/pagadas ya saldadas — colapsadas por defecto */}
                {cerradas.length > 0 && (
                  <div>
                    <button onClick={() => setCerradasOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '0.8rem 0.25rem 0.2rem', marginTop: '1.75rem', cursor: 'pointer', color: '#9ca3af', textAlign: 'left', fontSize: '0.72rem', fontWeight: 500, fontFamily: 'inherit' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: mostrarCerradas ? 'rotate(180deg)' : 'none', flex: '0 0 auto' }}><polyline points="6 9 12 15 18 9"/></svg>
                      Cerradas · {cerradas.length}
                    </button>
                    {mostrarCerradas && (
                      <div style={{ marginTop: '0.2rem' }}>
                        {cerradas.map(sh => {
                          const due = numUSD(sh.amount_due_usd)
                          const cancelada = /cancel/i.test(sh.status || '')
                          const meta = [sh.bl, sh.agente || 'Bruce', sh.status || '', sh.eta ? `ETA ${sh.eta}` : ''].filter(Boolean).join(' · ')
                          return (
                            <div key={sh.id} className="tk-row" onClick={() => sh.bl ? setFicha({ bl: sh.bl, ship: sh }) : openEdit(sh)}
                              style={{ padding: '0.55rem 0.25rem', borderBottom: '1px solid #f1f5f9', opacity: 0.55, cursor: 'pointer' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>#{sh.num || '—'} · {sh.origen || '—'} → {sh.destino || '—'}</span>
                                  <span style={{ fontSize: '0.66rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</span>
                                </div>
                                <span style={{ flex: '0 0 auto', fontSize: '0.74rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: cancelada ? '#dc2626' : '#059669' }}>
                                  {cancelada ? 'Cancelada' : due > 0 ? `${fmtUSD(due)} ✓` : '✓'}
                                </span>
                                <div className="tk-icons" style={{ flex: '0 0 auto', display: 'inline-flex', gap: 2 }}>
                                  <button className="tk-ico" onClick={e => { e.stopPropagation(); openEdit(sh) }} title="Editar" aria-label={`Editar embarque ${sh.num || ''}`} style={BTN_ICO}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  </button>
                                  <button className="tk-ico" onClick={e => { e.stopPropagation(); setConfirmDel(sh.id) }} title="Eliminar" aria-label={`Eliminar embarque ${sh.num || ''}`} style={BTN_ICO}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }} onClick={() => setConfirmDel(null)}>
          <div style={{ ...PANEL, maxWidth: 340 }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', marginBottom: 6 }}>¿Eliminar embarque?</p>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '1.25rem' }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 20, justifyContent: 'flex-end', alignItems: 'center' }}>
              <button className="tk-sec" onClick={() => setConfirmDel(null)} style={BTN_SEC}>Cancelar</button>
              <button onClick={() => del(confirmDel)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: '#dc2626', fontFamily: 'inherit' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Borrar un pago mal cargado: sale del historial y el saldo se recalcula */}
      {confirmPago && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }} onClick={() => setConfirmPago(null)}>
          <div style={{ ...PANEL, maxWidth: 360, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', marginBottom: 6 }}>¿Borrar este pago?</p>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              {confirmPago.pg.fecha || 's/fecha'} · {String(confirmPago.pg.tipo || 'pago') === 'ajuste' ? 'ajuste manual' : metodoLabel(confirmPago.pg.metodo)} · <b style={{ color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(numUSD(confirmPago.pg.monto))}</b><br />
              Sale del historial y el saldo del embarque se recalcula.
            </p>
            <div style={{ display: 'flex', gap: 22, justifyContent: 'center', alignItems: 'center' }}>
              <button className="tk-sec" onClick={() => setConfirmPago(null)} style={{ ...BTN_SEC, fontSize: '0.78rem' }}>Cancelar</button>
              <button onClick={delPago} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: '#dc2626', fontFamily: 'inherit' }}>Borrar pago</button>
            </div>
          </div>
        </div>
      )}

      {/* Registrar pago al forwarder: evento en el ledger + actualiza el saldo */}
      {pagoModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setPagoModal(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ ...PANEL, maxWidth: 400 }}>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', marginBottom: 3 }}>Registrar pago a {pagoModal.ship.agente || 'Bruce'}</p>
            {(() => {
              const dvm = desvio(pagoModal.ship)
              return (
                <>
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: dvm && dvm.d > 0 ? 6 : '1.25rem' }}>#{pagoModal.ship.num} · {pagoModal.ship.origen} → {pagoModal.ship.destino} · saldo <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(numUSD(pagoModal.ship.balance_usd))}</span></p>
                  {dvm && dvm.d > 0 && (
                    <p style={{ fontSize: '0.68rem', color: '#d97706', marginBottom: '1.25rem', lineHeight: 1.45 }}>
                      Este embarque tiene {fmtUSD(dvm.d)} de “pagado” cargados a mano que ningún pago respalda. Se registran como ajuste manual junto con este pago, así el saldo pasa a salir del historial.
                    </p>
                  )}
                </>
              )
            })()}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1.25rem' }}>
              <div><label style={LBL}>Fecha</label><input className="tk-inp" type="date" value={pagoModal.fecha} onChange={e => setPagoModal(f => ({ ...f, fecha: e.target.value }))} style={INP} /></div>
              <div><label style={LBL}>Monto (USD)</label><input className="tk-inp" inputMode="decimal" value={pagoModal.monto} onChange={e => setPagoModal(f => ({ ...f, monto: e.target.value }))} style={INP} placeholder="0" /></div>
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={LBL}>Pagado desde</label>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 2 }}>
                {METODOS_PAGO.map(([v, l]) => (
                  <button key={v} onClick={() => setPagoModal(f => ({ ...f, metodo: v }))} style={{ ...ftxt(pagoModal.metodo === v), fontSize: '0.76rem' }}>{l}</button>
                ))}
              </div>
              {(() => {
                const ag = pagoModal.ship.agente || 'Bruce'
                const prev = ultMetodo[ag]
                return (
                  <p style={{ fontSize: '0.66rem', color: '#9ca3af', marginTop: 8 }}>
                    {prev
                      ? <>así le pagaste la última vez a <b style={{ color: '#6b7280', fontWeight: 600 }}>{ag}</b> — cambialo si esta vez fue distinto</>
                      : <>los pagos a agentes salen de la cuenta de USA por defecto</>}
                  </p>
                )
              })()}
            </div>
            <div style={{ marginBottom: '1.25rem' }}><label style={LBL}>Nota (opcional)</label><input className="tk-inp" value={pagoModal.nota} onChange={e => setPagoModal(f => ({ ...f, nota: e.target.value }))} style={INP} placeholder="Ej: adelanto 50%" /></div>
            <div style={{ display: 'flex', gap: 20, justifyContent: 'flex-end', alignItems: 'center' }}>
              <button className="tk-sec" onClick={() => setPagoModal(null)} style={BTN_SEC}>Cancelar</button>
              <button onClick={savePagoAgente} disabled={pagoBusy} style={{ ...BTN_PRIMARY, cursor: pagoBusy ? 'wait' : 'pointer', opacity: pagoBusy ? 0.7 : 1 }}>{pagoBusy ? 'Guardando…' : 'Registrar'}</button>
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

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .tk-row:hover { background: #fafafa }
        .tk-sec:hover { color: #111827 !important }
        .tk-check:hover { color: #d97706 !important }
        .tk-ico:hover { color: #6b7280 !important }
        .tk-search:focus { border-bottom-color: #111827 !important }
        .tk-inp:focus { border-color: #111827 !important }
        .tk-alert b { color: #111827; font-weight: 600 }
        @media (hover: hover) {
          .tk-icons { opacity: 0; transition: opacity .12s }
          .tk-row:hover .tk-icons, .tk-icons:focus-within { opacity: 1 }
        }
        @media (max-width: 640px) {
          .tk-col-mid { display: none }
          .tk-hist-by { display: none }
        }
      `}</style>

      <BarraSeleccion s={selm} />
    </div>
  )
}
