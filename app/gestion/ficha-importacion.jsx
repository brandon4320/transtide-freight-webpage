'use client'

// ─── Ficha integral de importación ────────────────────────────────────────────
// La OPERACIÓN es el expediente: el embarque (agente de carga), el despacho de
// aduana, los gastos y los cobros cuelgan de ella. Esta ficha junta todo eso en
// un solo lugar y se abre desde Inicio, Tracking, Despachante, Operaciones y el
// buscador clickeando una fila.
//
// Cómo encuentra sus piezas (migración en curso):
//   1) por operation_id (seed.op / seed.opId / operation_id del embarque o del
//      despacho recibido en el seed),
//   2) si no hay, por el B/L normalizado (texto sin espacios ni guiones).
// Si un B/L tiene VARIOS embarques (dos contenedores), se listan todos y los
// pagos van por embarque: nunca se toma el primero en silencio.
//
// Los pagos se REGISTRAN como eventos (fecha/monto/método) y actualizan los
// totales de los módulos — no se editan celdas a mano. Crear el despacho desde
// acá es un DRAFT: nada llega a la base hasta apretar Confirmar.

import { useState, useEffect, useMemo, useRef } from 'react'
import { gToast } from './toast'
import { EmbarqueModal } from './embarque-form'
import { METODOS_PAGO, metodoLabel } from './pagos-metodos'
import { DraftPanel } from './acciones-fila'
import { fisicoDesdeEmbarque, labelStatusES, pagoDesdeSaldo } from './estados'

const blNorm = (b) => (b || '').replace(/[\s-]/g, '').toUpperCase()
// Montos de tracking/despachante: texto es-AR ("6.975,50").
const num = (v) => { const x = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isNaN(x) ? 0 : x }
// Montos del detalle de la operación: se guardan con punto decimal ("1234.56").
const nd = (v) => { const x = parseFloat(v); return isNaN(x) ? 0 : x }
const fmtN = (v) => { const r = Math.round(v * 100) / 100; return r === 0 ? '' : r.toLocaleString('es-AR', { maximumFractionDigits: 2 }) }
const usd = (v) => 'USD ' + Math.round(v).toLocaleString('es-AR')
const pesos = (v) => '$ ' + Math.round(v).toLocaleString('es-AR')
const hoy = () => { const d = new Date(); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
const enc = encodeURIComponent

// ─── Transtide Flat ──────────────────────────────────────────────────────────
const INK = '#111827', BODY = '#6b7280', MUTED = '#9ca3af', HAIR = '#f1f5f9', LINE = '#e5e7eb'
const RED = '#dc2626', GREEN = '#059669', AMBER = '#d97706'
const TAB = { fontVariantNumeric: 'tabular-nums' }
const LBL = { display: 'block', fontSize: '0.68rem', fontWeight: 500, color: MUTED, marginBottom: 4 }
const INP = { width: '100%', padding: '0.45rem 0.6rem', border: `1px solid ${LINE}`, borderRadius: 6, fontSize: '0.84rem', color: INK, background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const SECT = { fontSize: '0.64rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.6rem' }
const BTN_PRIMARY = { background: INK, color: '#fff', border: 'none', borderRadius: 6, padding: '0.45rem 0.9rem', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const BTN_TXT = { background: 'none', border: 'none', padding: 0, fontSize: '0.76rem', fontWeight: 500, color: BODY, cursor: 'pointer', fontFamily: 'inherit' }
const BTN_INK = { ...BTN_TXT, color: INK, fontWeight: 600 }
const ROW = { padding: '1rem 1.25rem', borderTop: `1px solid ${HAIR}` }
const OVERLAY = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }
const PANEL = { background: '#fff', borderRadius: 12, padding: '1.5rem 1.75rem', width: '100%', maxWidth: 380, boxSizing: 'border-box' }

const Chip = ({ label, tone }) => label
  ? <span style={{ fontSize: '0.7rem', fontWeight: 600, color: tone || BODY, whiteSpace: 'nowrap' }}>{label}</span>
  : null

// Las tres puntas de arriba: número grande con su sub-rótulo.
function Punta({ label, value, tone = INK, sub }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: '0.62rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</p>
      <p style={{ fontSize: '1.05rem', fontWeight: 600, color: tone, lineHeight: 1.15, ...TAB }}>{value}</p>
      {sub && <p style={{ fontSize: '0.68rem', color: MUTED, marginTop: 3, lineHeight: 1.4 }}>{sub}</p>}
    </div>
  )
}

// Cifras chicas dentro de cada bloque (Total · Pagado · Saldo).
function Cifra({ label, value, tone = INK, sub }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: '0.6rem', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: '0.9rem', fontWeight: 600, color: tone, lineHeight: 1.15, ...TAB }}>{value}</p>
      {sub && <p style={{ fontSize: '0.64rem', color: MUTED, marginTop: 2 }}>{sub}</p>}
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

const dedupe = (arr) => {
  const seen = new Set()
  return arr.filter(x => {
    if (!x || x.id == null) return false
    const k = String(x.id)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// ─── Cuenta del expediente ───────────────────────────────────────────────────
// Misma cuenta que computeCalc en operaciones/page.jsx (costos en pesos por
// categoría, VEP incluido, y "a cobrar" por proveedor). Se replica acá porque
// vive dentro de esa pantalla y no se exporta; si cambia allá, cambia acá.
// Nunca tira: un detalle raro devuelve null y la ficha degrada al agente +
// despachante.
function calcularExpediente(detail) {
  try {
    const CATS = ['naviera', 'terminal', 'aduana', 'transporte', 'despachante', 'admin', 'fleteIntl']
    const custom = Array.isArray(detail.customGastos) ? detail.customGastos.filter(c => c && c.id) : []
    const rowPesos = (r) => nd(r.usd) > 0 && nd(r.tc) > 0 ? nd(r.usd) * nd(r.tc) : nd(r.pesos)
    const rowUSD = (r) => nd(r.usd) > 0 && nd(r.tc) === 0 ? nd(r.usd) : 0
    const sum = (rows, f) => (Array.isArray(rows) ? rows : []).reduce((s, r) => s + f(r || {}), 0)
    const normPag = (v) => (v === 'successi' ? 'blanco' : v)
    const split = (rows, def) => (Array.isArray(rows) ? rows : []).reduce((a, r) => {
      const k = normPag((r || {}).pagadoPor)
      a[k === 'blanco' || k === 'cash' ? k : def] += rowPesos(r || {})
      return a
    }, { blanco: 0, cash: 0 })

    const tAdu = sum(detail.aduana, rowPesos) // VEP Aduana: siempre sociedad
    let blanco = tAdu, cash = 0
    ;[['naviera', 'blanco'], ['terminal', 'blanco'], ['transporte', 'blanco'], ['despachante', 'blanco'], ['admin', 'blanco'], ['fleteIntl', 'cash']]
      .forEach(([c, def]) => { const s = split(detail[c], def); blanco += s.blanco; cash += s.cash })
    custom.forEach(cg => { const s = split(detail[cg.id], cg.kind === 'cash' ? 'cash' : 'blanco'); blanco += s.blanco; cash += s.cash })
    const totalPesos = blanco + cash
    const usdSinTC = [...CATS, ...custom.map(c => c.id)].reduce((s, c) => s + sum(detail[c], rowUSD), 0)

    const provs = Array.isArray(detail.proveedores) ? detail.proveedores : []
    const cobrar = Array.isArray(detail.cobrar) ? detail.cobrar : []
    const totalM3 = sum(provs, p => nd(p.m3))
    const fallbackTC = provs.reduce((tc, p, i) => {
      if (tc > 0) return tc
      const cb = cobrar[i] || {}
      return nd(cb.tc) > 0 ? nd(cb.tc) : (nd(p.tributosTC) > 0 ? nd(p.tributosTC) : 0)
    }, 0)
    const filas = provs.map((p, i) => {
      const cb = cobrar[i] || {}
      const ratio = totalM3 > 0 ? nd(p.m3) / totalM3 : 0
      const prorPesos = Math.round(ratio * (blanco - tAdu)) + Math.round(ratio * cash)
      const vepPesos = Math.round(nd(p.tributosUSD) * nd(p.tributosTC))
      const costoFinal = prorPesos + vepPesos
      const tcOwn = nd(cb.tc) > 0 ? nd(cb.tc) : nd(p.tributosTC)
      const tcUsed = tcOwn > 0 ? tcOwn : fallbackTC
      const gastosUSD = tcUsed > 0 ? Math.round((costoFinal / tcUsed) * 100) / 100 : 0
      const origenUSD = nd(p.gastosOrigenUSD)
      const hon4 = Math.round((gastosUSD + origenUSD) * 0.04 * 100) / 100
      const honorarios = cb.honorarios ? Math.max(hon4, nd(cb.honMin)) : 0
      const giroBase = nd(cb.giroMonto) * (nd(cb.giroPct) / 100) + nd(cb.giroFijo)
      const giroUSD = nd(cb.giroTotal) > 0 ? nd(cb.giroTotal) : Math.round(giroBase * 100) / 100
      const totalUSD = Math.round((gastosUSD + origenUSD + honorarios + nd(cb.despAdic) + nd(cb.ganancia) + giroUSD) * 100) / 100
      return { nombre: p.nombre || '', cobrado: !!cb.cobrado, totalUSD }
    })
    const aCobrar = filas.reduce((s, f) => s + f.totalUSD, 0)
    const cobrado = filas.reduce((s, f) => s + (f.cobrado ? f.totalUSD : 0), 0)
    return { totalPesos, usdSinTC, fallbackTC, filas, aCobrar, cobrado, sinCobrar: filas.filter(f => !f.cobrado) }
  } catch {
    return null
  }
}

export default function FichaImportacion({ bl, seed = {}, draft: draftInicial = null, onClose, onChanged }) {
  // La ficha abre INSTANTÁNEA con lo que ya tiene la fila clickeada (seed);
  // cada sección restante carga por su cuenta y se completa cuando llega.
  const seedShips = seed.ships || (seed.ship ? [seed.ship] : [])
  const seedDesps = seed.desps || (seed.desp ? [seed.desp] : [])
  const [ships, setShips] = useState(seedShips)
  const [desps, setDesps] = useState(seedDesps)
  const [op, setOp] = useState(seed.op || null)
  const [detail, setDetail] = useState(undefined) // undefined = cargando · null = no hay
  const [pagos, setPagos] = useState(null) // null = cargando
  const [pagoForm, setPagoForm] = useState(null) // null | {scope, ref, fecha, monto, metodo, nota}
  const [editShip, setEditShip] = useState(null) // embarque abierto en el editor compartido
  const [draft, setDraft] = useState(null) // null | {modo:'crear'|'existente', ...}
  const [busy, setBusy] = useState(false)
  const [perm, setPerm] = useState(null) // null = no se sabe → se muestra todo (el server decide)
  const seq = useRef(0)

  const key = blNorm(bl)
  const opIdSeed = seed.op?.id ?? seed.opId ?? seed.operationId ?? seed.ship?.operation_id ?? seed.desp?.operation_id ?? null
  // Match SOLO por B/L real: sin esto, un B/L vacío matchea cualquier registro
  // que también tenga el B/L vacío (colisión — abría el despacho equivocado).
  const sameBL = (r) => key !== '' && !!r && !!r.bl && blNorm(r.bl) === key
  const deOp = (opId) => (r) => opId != null && String(opId) !== '' && !!r && r.operation_id != null && String(r.operation_id) !== '' && String(r.operation_id) === String(opId)

  // ¿Puede escribir en la sección? Si la sesión no expone rol/secciones, se
  // asume que sí: el server valida igual (requireWrite) y avisa con el error.
  useEffect(() => {
    fetchJSON('/api/auth/session', 6000).then(j => {
      const u = j && j.user
      if (!u || u.role == null) return
      setPerm({ role: String(u.role), secs: String(u.sections || '').split(',').map(s => s.trim()).filter(Boolean) })
    })
  }, [])
  const puedeEscribir = (sec) => !perm || perm.role === 'admin' || (perm.role === 'editor' && perm.secs.includes(sec))

  // Carga completa. Devuelve {ships, desps, op} para quien necesite los datos
  // recién bajados (el draft automático) sin depender del estado todavía viejo.
  const load = async () => {
    const mio = ++seq.current
    const vivo = () => seq.current === mio
    const opIdInicial = opIdSeed ?? (op && op.id) ?? null

    const [ops, jBL, despAll] = await Promise.all([
      fetchJSON('/api/db/operations'),
      key ? fetchJSON('/api/tracking?bl=' + enc(bl)) : Promise.resolve(null),
      fetchJSON('/api/db/despachante'),
    ])
    if (!vivo()) return null

    const opsArr = Array.isArray(ops) ? ops : []
    const opF = (opIdInicial != null && opsArr.find(o => String(o.id) === String(opIdInicial))) || opsArr.find(sameBL) || seed.op || null
    const opId = (opF && opF.id) ?? opIdInicial ?? null
    const esDeOp = deOp(opId)

    // Embarques: primero los de la operación, después los del B/L. El endpoint
    // de tracking no filtra por operation_id (devuelve todo): se filtra acá.
    let shipsOp = []
    let jOp = null
    if (opId != null) {
      jOp = await fetchJSON('/api/tracking?operation_id=' + enc(opId))
      if (!vivo()) return null
      shipsOp = ((jOp && jOp.shipments) || []).filter(esDeOp)
    }
    const shipsBL = ((jBL && jBL.shipments) || []).filter(sameBL)
    let shipsF = dedupe([...shipsOp, ...shipsBL])
    if (!shipsF.length && jBL === null && jOp === null) shipsF = seedShips // red caída: se queda con el seed

    const vivosD = (Array.isArray(despAll) ? despAll : []).filter(d => d && !d.deleted_at)
    let despsF = dedupe([...vivosD.filter(esDeOp), ...vivosD.filter(sameBL)])
    if (!despsF.length && despAll === null) despsF = seedDesps

    setOp(opF)
    setShips(shipsF)
    setDesps(despsF)

    // Historial de pagos: por B/L, más los de embarques/despachos que cuelgan de
    // la operación pero tienen otro B/L (o ninguno) — se buscan por ref.
    const pedidos = [key ? fetchJSON('/api/db/pagos?bl=' + enc(bl)) : Promise.resolve([])]
    for (const s of shipsF) if (!sameBL(s)) pedidos.push(fetchJSON(`/api/db/pagos?scope=agente&ref_id=${enc(s.id)}`))
    for (const d of despsF) if (!sameBL(d)) pedidos.push(fetchJSON(`/api/db/pagos?scope=despachante&ref_id=${enc(d.id)}`))
    const detalleP = opF && opF.id != null ? fetchJSON(`/api/db/operations/${enc(opF.id)}/detail`) : Promise.resolve(null)
    const [listas, det] = await Promise.all([Promise.all(pedidos), detalleP])
    if (!vivo()) return null
    const todos = dedupe(listas.flatMap(x => (Array.isArray(x) ? x : [])))
    todos.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || (Number(b.id) || 0) - (Number(a.id) || 0))
    setPagos(todos)
    setDetail(det && typeof det === 'object' && !Array.isArray(det) ? det : null)

    return { ships: shipsF, desps: despsF, op: opF }
  }

  useEffect(() => {
    let activo = true
    load().then(ctx => { if (activo && ctx && draftInicial === 'despacho') abrirDraftDespacho(ctx) })
    return () => { activo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bl])

  // Escape cierra la ficha cuando no hay nada abierto encima (los modales
  // manejan su propio Escape).
  useEffect(() => {
    if (pagoForm || draft || editShip) return
    const h = (e) => { if (e.key === 'Escape') onClose && onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [pagoForm, draft, editShip, onClose])

  // ─── Cuentas ───────────────────────────────────────────────────────────────
  const agTotal = ships.reduce((s, x) => s + num(x.total_usd), 0)
  const agSaldo = ships.reduce((s, x) => s + Math.max(0, num(x.balance_usd)), 0)
  const deTotal = desps.reduce((s, x) => s + num(x.total_honorarios), 0)
  const deSaldo = desps.reduce((s, x) => s + Math.max(0, num(x.saldo)), 0)
  const calc = useMemo(() => (detail ? calcularExpediente(detail) : null), [detail])

  // Cuánto costó: el expediente (todas las categorías + VEP) si la operación
  // tiene gastos; si no, agente + despachante.
  const costo = calc && calc.totalPesos > 0
    ? {
        value: pesos(calc.totalPesos),
        sub: (calc.fallbackTC > 0
          ? `≈ ${usd(calc.totalPesos / calc.fallbackTC)} al T.C. ${calc.fallbackTC.toLocaleString('es-AR')} · VEP incluido`
          : 'gastos del expediente, VEP incluido') + (calc.usdSinTC > 0 ? ` · + ${usd(calc.usdSinTC)} sin T.C.` : ''),
      }
    : {
        value: agTotal + deTotal > 0 ? usd(agTotal + deTotal) : '—',
        sub: op ? (detail === undefined ? 'agente + despachante · cargando el expediente' : 'agente + despachante · el expediente no tiene gastos cargados') : 'agente + despachante · sin operación vinculada',
      }

  // Falta pagar: saldo al agente (por embarque) + saldo al despachante, con a quién.
  const faltaPagar = agSaldo + deSaldo
  const aQuien = [
    ...ships.filter(x => num(x.balance_usd) > 0).map(x => `a ${x.agente || 'agente sin asignar'} ${usd(num(x.balance_usd))}`),
    ...desps.filter(x => num(x.saldo) > 0).map(x => `al despachante ${usd(num(x.saldo))}`),
  ]

  // Falta cobrar: proveedores/clientes del expediente sin tildar como cobrados.
  const faltaCobrar = calc ? Math.round((calc.aCobrar - calc.cobrado) * 100) / 100 : null
  const cobrarUI = !calc
    ? { value: '—', tone: MUTED, sub: op ? (detail === undefined ? 'cargando el expediente' : 'sin datos del expediente') : 'sin operación vinculada' }
    : faltaCobrar > 0
      ? { value: usd(faltaCobrar), tone: AMBER, sub: `${calc.sinCobrar.length} de ${calc.filas.length} ${calc.filas.length === 1 ? 'cliente' : 'clientes'} sin cobrar` }
      : calc.filas.length
        ? { value: 'Todo cobrado', tone: GREEN, sub: `${calc.filas.length} ${calc.filas.length === 1 ? 'cliente' : 'clientes'} al día` }
        : { value: '—', tone: MUTED, sub: 'sin clientes cargados' }

  // ─── Registrar pago ────────────────────────────────────────────────────────
  // A los agentes se les gira desde la cuenta de USA; al despachante, local.
  const abrirPago = (scope, ref) => setPagoForm({ scope, ref, fecha: hoy(), monto: '', metodo: scope === 'agente' ? 'usa' : 'transferencia', nota: '' })

  // Crea el evento en el ledger Y actualiza los totales del módulo.
  const savePago = async () => {
    const f = pagoForm
    if (!f || busy) return
    if (num(f.monto) <= 0) { gToast.error('Cargá el monto.'); return }
    setBusy(true)
    try {
      const ref = f.ref || {}
      const r = await fetch('/api/db/pagos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: f.scope, ref_id: String(ref.id ?? ''), bl: ref.bl || bl || '', fecha: f.fecha, monto: f.monto, metodo: f.metodo, nota: f.nota }),
      })
      if (!r.ok) {
        let m = 'No se pudo registrar el pago'
        try { const j = await r.json(); if (j && j.error) m = j.error } catch {}
        throw new Error(m)
      }
      const creado = await r.json().catch(() => null)
      // El "Pagado" del módulo es la proyección del ledger: si el server devuelve
      // el total recalculado (agg), se escribe ESE número, no una suma a mano.
      const aggTotal = creado && creado.agg && typeof creado.agg.total === 'number' ? creado.agg.total : null

      if (f.scope === 'agente' && ref.id != null) {
        const rec = aggTotal != null ? aggTotal : num(ref.amount_rec_usd) + num(f.monto)
        const bal = num(ref.amount_due_usd) - rec
        await fetch(`/api/tracking/${ref.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...ref, amount_rec_usd: fmtN(rec), balance_usd: fmtN(bal), payment_date: f.fecha }),
        })
      }
      if (f.scope === 'despachante' && ref.id != null) {
        const cash = num(ref.pago_cash) + (f.metodo === 'cash' ? num(f.monto) : 0)
        const transf = num(ref.pago_transferencia) + (f.metodo === 'cash' ? 0 : num(f.monto))
        const pagado = cash + transf
        // Saldo = total de costos − pagado. UNA sola fórmula en todo el sistema
        // (la pantalla Despachante calcula igual).
        const saldo = num(ref.total_honorarios) - pagado
        await fetch(`/api/db/despachante/${ref.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...ref, pago_cash: fmtN(cash), pago_transferencia: fmtN(transf), total_pagado: fmtN(pagado), saldo: fmtN(saldo), fecha_pago: f.fecha }),
        })
      }
      gToast.success('Pago registrado.')
      setPagoForm(null)
      load()
      onChanged?.()
    } catch (e) {
      gToast.error(e.message || 'Error al registrar el pago.')
    } finally { setBusy(false) }
  }

  // ─── Draft: crear el despacho ──────────────────────────────────────────────
  // Busca un despacho vivo para la operación (o el B/L) con datos FRESCOS antes
  // de mostrar nada: si existe, se ofrece abrirlo y no se crea otro.
  const buscarExistente = async (opId) => {
    const lista = await fetchJSON('/api/db/despachante')
    const vivos = (Array.isArray(lista) ? lista : []).filter(d => d && !d.deleted_at)
    return vivos.find(deOp(opId)) || vivos.find(sameBL) || null
  }

  const abrirDraftDespacho = async (ctx) => {
    if (busy) return
    const c = ctx || { ships, desps, op }
    const opAct = c.op || null
    const opId = (opAct && opAct.id) ?? opIdSeed ?? (c.ships.find(s => s.operation_id)?.operation_id) ?? null
    setBusy(true)
    try {
      const existente = (await buscarExistente(opId)) || (c.desps && c.desps[0]) || null
      if (existente) { setDraft({ modo: 'existente', existente }); return }

      const contactos = await fetchJSON('/api/db/contactos', 8000)
      const despachantes = (Array.isArray(contactos) ? contactos : []).filter(x => x && x.tipo === 'despachante' && x.nombre).map(x => String(x.nombre))
      const s0 = c.ships.length === 1 ? c.ships[0] : null
      const descripcion = (opAct && opAct.nombre)
        || (s0 && (s0.suppliers || '').split(/[、,]/)[0].trim())
        || (s0 && `${s0.origen || ''} → ${s0.destino || ''}`.trim().replace(/^→$/, ''))
        || 'Importación'
      const estado = s0 && fisicoDesdeEmbarque(s0).id === 'entregado' ? 'Terminada' : 'En curso'
      setDraft({
        modo: 'crear',
        descripcion, estado,
        // Con varios embarques se pide elegir; con uno se precarga; sin ninguno
        // (flete de terceros) el despacho sale sin B/L.
        shipId: s0 ? String(s0.id) : '',
        despachante: despachantes[0] || '',
        despachantes,
      })
    } finally { setBusy(false) }
  }

  const shipDelDraft = () => (draft && draft.shipId ? ships.find(s => String(s.id) === String(draft.shipId)) || null : null)
  const blDelDraft = () => { const s = shipDelDraft(); return (s && s.bl) || (ships.length > 1 ? '' : (bl || (op && op.bl) || '')) }

  const confirmarDraft = async () => {
    if (!draft || draft.modo !== 'crear' || busy) return
    const desc = String(draft.descripcion || '').trim()
    if (!desc) { gToast.error('Cargá la descripción.'); return }
    if (ships.length > 1 && !draft.shipId) { gToast.error('Elegí a qué embarque corresponde el despacho.'); return }
    const shipSel = shipDelDraft()
    const opId = (op && op.id) ?? opIdSeed ?? (shipSel && shipSel.operation_id) ?? null
    setBusy(true)
    try {
      // Reintento con red caída: si el POST anterior sí llegó, acá se detecta y
      // no se duplica.
      const yaEsta = await buscarExistente(opId)
      if (yaEsta) { setDraft({ modo: 'existente', existente: yaEsta }); return }

      const body = {
        bl: blDelDraft(),
        operation_id: opId != null ? String(opId) : '',
        descripcion: desc,
        estado: draft.estado || 'En curso',
      }
      if (draft.despachante) body.despachante = draft.despachante
      const r = await fetch('/api/db/despachante', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        let m = 'No se pudo crear el despacho'
        try { const j = await r.json(); if (j && j.error) m = j.error } catch {}
        throw new Error(m)
      }
      const creado = await r.json().catch(() => null)
      gToast.success('Despacho creado')
      setDraft(null)
      if (creado && creado.id != null) setDesps(prev => dedupe([creado, ...prev]))
      load()
      onChanged?.()
    } catch (e) {
      gToast.error(e.message || 'Error al crear el despacho.')
    } finally { setBusy(false) }
  }

  const ir = (href) => { window.location.href = href }
  const refPago = (p) => {
    if (p.scope !== 'agente') return 'Despachante'
    const s = ships.find(x => String(x.id) === String(p.ref_id))
    return s && ships.length > 1 ? `Agente #${s.num}` : 'Agente'
  }

  const fisicoHeader = ships.length === 1 ? fisicoDesdeEmbarque(ships[0]) : null
  const titulo = (op && op.nombre) || bl || 'Importación'

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose && onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1050, display: 'flex', justifyContent: 'flex-end' }}>
      <div role="dialog" aria-modal="true" aria-label="Ficha de importación" style={{ background: '#fff', width: '100%', maxWidth: 560, height: '100%', overflowY: 'auto', borderLeft: `1px solid ${LINE}` }}>

        {/* header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 5, background: '#fff', borderBottom: `1px solid ${HAIR}`, padding: '1rem 1.25rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '0.62rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ficha de importación</p>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 400, color: INK, margin: '2px 0 0', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.74rem', color: BODY, fontFamily: 'ui-monospace, monospace' }}>{bl ? `B/L ${bl}` : 'Sin B/L'}</span>
              {fisicoHeader && <Chip label={fisicoHeader.label} tone={fisicoHeader.tone} />}
              {ships.length > 1 && <Chip label={`${ships.length} embarques`} tone={AMBER} />}
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ ...BTN_TXT, fontSize: '1.3rem', lineHeight: 1, color: MUTED, flex: '0 0 auto', padding: '0 2px' }}>×</button>
        </div>

        {/* las tres puntas */}
        <div style={{ ...ROW, borderTop: 'none', display: 'flex', gap: 16 }}>
          <Punta label="Cuánto costó" value={costo.value} sub={costo.sub} />
          <Punta label="Falta pagar" value={faltaPagar > 0 ? usd(faltaPagar) : 'Nada pendiente'} tone={faltaPagar > 0 ? RED : GREEN}
            sub={faltaPagar > 0 ? aQuien.join(' · ') : (ships.length || desps.length ? 'agente y despachante al día' : 'sin embarque ni despacho')} />
          <Punta label="Falta cobrar" value={cobrarUI.value} tone={cobrarUI.tone} sub={cobrarUI.sub} />
        </div>

        {/* embarques · agente de carga */}
        <div style={ROW}>
          <p style={SECT}>{ships.length > 1 ? `Embarques · ${ships.length} con este B/L` : 'Embarque · agente de carga'}</p>
          {ships.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: MUTED }}>{op ? 'Sin embarque para esta operación (flete de terceros o todavía no cargado).' : 'Sin embarque con este B/L en Forwarding.'}</p>
          ) : ships.map((s, i) => {
            const fis = fisicoDesdeEmbarque(s)
            const pg = pagoDesdeSaldo(num(s.amount_due_usd), num(s.amount_rec_usd))
            const saldo = num(s.balance_usd)
            const viejo = labelStatusES(s.status)
            return (
              <div key={s.id} style={{ paddingTop: i ? 12 : 0, marginTop: i ? 12 : 0, borderTop: i ? `1px solid ${HAIR}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: '0.86rem', fontWeight: 600, color: INK }}>
                    #{s.num} · {s.origen || '—'} → {s.destino || '—'}{s.carrier ? ` · ${s.carrier}` : ''}
                  </p>
                  <Chip label={fis.label} tone={fis.tone} />
                </div>
                <p style={{ fontSize: '0.7rem', color: MUTED, marginTop: 2 }}>
                  {s.contenedores || '—'} · ETD {s.etd || '—'} · ETA {s.eta || '—'} · {s.agente || 'agente sin asignar'}
                  {s.bl && !sameBL(s) ? ` · B/L ${s.bl}` : ''}
                  {viejo && viejo !== fis.label ? ` · cargado como ${viejo}` : ''}
                </p>
                <div style={{ display: 'flex', gap: 16, margin: '10px 0' }}>
                  <Cifra label="Total" value={s.total_usd ? 'USD ' + s.total_usd : '—'} />
                  <Cifra label="Pagado" value={s.amount_rec_usd ? 'USD ' + s.amount_rec_usd : '—'} />
                  <Cifra label="Saldo" value={saldo > 0 ? 'USD ' + s.balance_usd : 'Saldado'} tone={saldo > 0 ? RED : GREEN} sub={pg.label} />
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  {saldo > 0 && puedeEscribir('tracking') && <button onClick={() => abrirPago('agente', s)} style={BTN_PRIMARY}>Registrar pago</button>}
                  {puedeEscribir('tracking') && <button onClick={() => setEditShip(s)} style={BTN_TXT}>Editar embarque</button>}
                  <button onClick={() => ir('/gestion/tracking')} style={BTN_TXT}>Ver en Forwarding</button>
                </div>
              </div>
            )
          })}
        </div>

        {/* despachante */}
        <div style={ROW}>
          <p style={SECT}>Despachante de aduana</p>
          {desps.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <p style={{ fontSize: '0.8rem', color: MUTED }}>{op ? 'Sin despacho cargado para esta operación.' : 'Sin despacho cargado para este B/L.'}</p>
              {(ships.length > 0 || op) && puedeEscribir('despachante') && (
                <button onClick={() => abrirDraftDespacho()} disabled={busy} style={{ ...BTN_INK, cursor: busy ? 'wait' : 'pointer' }}>
                  {bl ? 'Crear despacho con este B/L' : 'Crear despacho'}
                </button>
              )}
            </div>
          ) : desps.map((d, i) => {
            const saldo = num(d.saldo)
            const pg = pagoDesdeSaldo(num(d.total_honorarios), num(d.total_pagado))
            return (
              <div key={d.id} style={{ paddingTop: i ? 12 : 0, marginTop: i ? 12 : 0, borderTop: i ? `1px solid ${HAIR}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: '0.86rem', fontWeight: 600, color: INK }}>{d.descripcion || 'Despacho'}</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Chip label={d.estado || 'En curso'} tone={BODY} />
                    {d.facturado
                      ? <Chip label={`Facturado${d.factura_nro ? ` · ${d.factura_nro}` : ''}`} tone={GREEN} />
                      : <Chip label="Sin facturar" tone={AMBER} />}
                  </div>
                </div>
                {d.bl && !sameBL(d) && <p style={{ fontSize: '0.7rem', color: MUTED, marginTop: 2 }}>B/L {d.bl}</p>}
                <div style={{ display: 'flex', gap: 16, margin: '10px 0' }}>
                  <Cifra label="Honorarios" value={d.total_honorarios ? 'USD ' + d.total_honorarios : '—'} />
                  <Cifra label="Pagado" value={d.total_pagado ? 'USD ' + d.total_pagado : '—'} />
                  <Cifra label="Saldo"
                    value={saldo > 0 ? 'USD ' + d.saldo : saldo < 0 ? `USD ${fmtN(Math.abs(saldo))} a favor` : 'Saldado'}
                    tone={saldo > 0 ? RED : saldo < 0 ? AMBER : GREEN}
                    sub={pg.label} />
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  {saldo > 0 && puedeEscribir('despachante') && <button onClick={() => abrirPago('despachante', d)} style={BTN_PRIMARY}>Registrar pago</button>}
                  <button onClick={() => ir('/gestion/despachante')} style={BTN_TXT}>Abrir en Despachante</button>
                </div>
              </div>
            )
          })}
        </div>

        {/* operación / clientes */}
        <div style={ROW}>
          <p style={SECT}>Operación · clientes</p>
          {op ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '0.86rem', fontWeight: 600, color: INK }}>{op.nombre || 'Operación'}</p>
                <p style={{ fontSize: '0.7rem', color: MUTED, marginTop: 2 }}>
                  {op.estado || '—'}{op.contenedor ? ` · ${op.contenedor}` : ''}{op.m3_total ? ` · ${op.m3_total} m³` : ''}
                  {op.bl && !sameBL(op) ? ` · B/L de referencia ${op.bl}` : ''}
                </p>
                {calc && calc.sinCobrar.length > 0 && (
                  <p style={{ fontSize: '0.7rem', color: MUTED, marginTop: 2 }}>
                    Sin cobrar: {calc.sinCobrar.map(f => `${f.nombre || 'cliente s/nombre'} ${usd(f.totalUSD)}`).join(' · ')}
                  </p>
                )}
              </div>
              <button onClick={() => ir(`/gestion/operaciones?op=${enc(op.id)}`)} style={BTN_TXT}>Abrir operación</button>
            </div>
          ) : (
            <p style={{ fontSize: '0.8rem', color: MUTED }}>Sin operación vinculada a este B/L.</p>
          )}
        </div>

        {/* historial de pagos */}
        <div style={{ ...ROW, paddingBottom: '2rem' }}>
          <p style={SECT}>Historial de pagos</p>
          {pagos === null ? (
            <p style={{ fontSize: '0.76rem', color: MUTED }}>Cargando historial…</p>
          ) : pagos.length === 0 ? (
            <p style={{ fontSize: '0.76rem', color: MUTED }}>Todavía no hay pagos registrados.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {pagos.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0.45rem 0', borderTop: `1px solid ${HAIR}`, fontSize: '0.76rem' }}>
                  <span style={{ color: BODY, flex: '0 0 auto', ...TAB }}>{p.fecha || '—'}</span>
                  <span style={{ color: MUTED, flex: '0 0 auto' }}>{refPago(p)}{String(p.tipo || 'pago') === 'ajuste' ? ' · ajuste' : ''}</span>
                  <span style={{ color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {metodoLabel(p.metodo)}{p.nota ? ` · ${p.nota}` : ''}{p.created_by ? ` · cargó ${p.created_by}` : ''}
                  </span>
                  <span style={{ fontWeight: 600, color: INK, flex: '0 0 auto', ...TAB }}>USD {p.monto}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* editor de embarque — el mismo formulario compartido, sin salir de la ficha */}
        {editShip && (
          <EmbarqueModal
            initial={editShip}
            onClose={() => setEditShip(null)}
            onSaved={(sv) => {
              setEditShip(null)
              if (sv && sv.id != null) setShips(prev => prev.map(x => (String(x.id) === String(sv.id) ? sv : x)))
              load()
              onChanged?.()
            }}
          />
        )}

        {/* draft: ya existe un despacho para esta operación */}
        {draft && draft.modo === 'existente' && (
          <DraftPanel
            abierto
            titulo="Despacho de aduana"
            subtitulo={`${draft.existente.descripcion || 'Despacho'} · ${draft.existente.estado || 'En curso'}${draft.existente.bl ? ` · B/L ${draft.existente.bl}` : ''}`}
            aviso="Ya existe un despacho para esta operación"
            confirmar="Abrir el existente"
            busy={busy}
            onCancel={() => setDraft(null)}
            onConfirm={() => { const ex = draft.existente; setDesps(prev => dedupe([ex, ...prev])); setDraft(null) }}
          >
            <div style={{ display: 'flex', gap: 16 }}>
              <Cifra label="Honorarios" value={draft.existente.total_honorarios ? 'USD ' + draft.existente.total_honorarios : '—'} />
              <Cifra label="Pagado" value={draft.existente.total_pagado ? 'USD ' + draft.existente.total_pagado : '—'} />
              <Cifra label="Saldo" value={num(draft.existente.saldo) > 0 ? 'USD ' + draft.existente.saldo : 'Saldado'} tone={num(draft.existente.saldo) > 0 ? RED : GREEN} />
            </div>
            <p style={{ fontSize: '0.76rem', color: BODY, marginTop: 14 }}>No se crea otro: se abre el que ya está cargado.</p>
          </DraftPanel>
        )}

        {/* draft: crear el despacho con los datos precargados */}
        {draft && draft.modo === 'crear' && (
          <DraftPanel
            abierto
            titulo="Nuevo despacho de aduana"
            subtitulo={`${op ? `Operación ${op.nombre || op.id}` : 'Sin operación vinculada'} · revisá y confirmá. No se guarda nada hasta apretar Crear despacho.`}
            confirmar="Crear despacho"
            busy={busy}
            onCancel={() => setDraft(null)}
            onConfirm={confirmarDraft}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LBL}>Operación</label>
                <p style={{ fontSize: '0.84rem', color: op ? INK : MUTED }}>{op ? (op.nombre || op.id) : 'Sin operación — el despacho queda vinculado por B/L'}</p>
              </div>
              <div>
                <label style={LBL}>Embarque</label>
                {ships.length > 1 ? (
                  <select value={draft.shipId} onChange={e => setDraft(d => ({ ...d, shipId: e.target.value }))} style={INP}>
                    <option value="">Elegí el embarque…</option>
                    {ships.map(s => <option key={s.id} value={String(s.id)}>#{s.num} · {s.contenedores || s.bl || 'sin contenedor'}</option>)}
                  </select>
                ) : (
                  <p style={{ fontSize: '0.84rem', color: ships.length ? INK : MUTED }}>{ships.length ? `#${ships[0].num} · ${ships[0].contenedores || '—'}` : 'Sin embarque (flete de terceros)'}</p>
                )}
              </div>
              <div>
                <label style={LBL}>B/L</label>
                <p style={{ fontSize: '0.84rem', color: blDelDraft() ? INK : MUTED, fontFamily: 'ui-monospace, monospace' }}>{blDelDraft() || (ships.length > 1 ? 'según el embarque elegido' : 'sin B/L')}</p>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LBL}>Descripción</label>
                <input value={draft.descripcion} onChange={e => setDraft(d => ({ ...d, descripcion: e.target.value }))} style={INP} placeholder="Ej: Repuestos CNC" />
              </div>
              <div>
                <label style={LBL}>Despachante</label>
                <input list="ficha-despachantes" value={draft.despachante} onChange={e => setDraft(d => ({ ...d, despachante: e.target.value }))} style={INP} placeholder="Sin asignar" />
                {draft.despachantes.length > 0 && (
                  <datalist id="ficha-despachantes">{draft.despachantes.map(n => <option key={n} value={n} />)}</datalist>
                )}
              </div>
              <div>
                <label style={LBL}>Estado</label>
                <select value={draft.estado} onChange={e => setDraft(d => ({ ...d, estado: e.target.value }))} style={INP}>
                  {['En curso', 'Terminada', 'Demorada'].map(x => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>
            </div>
          </DraftPanel>
        )}

        {/* mini-modal: registrar pago */}
        {pagoForm && (
          <div onClick={e => { if (e.target === e.currentTarget && !busy) setPagoForm(null) }} style={OVERLAY}>
            <div role="dialog" aria-modal="true" style={PANEL}>
              <p style={{ fontSize: '1rem', fontWeight: 600, color: INK, marginBottom: 2 }}>Registrar pago</p>
              <p style={{ fontSize: '0.76rem', color: BODY, marginBottom: 14 }}>
                {pagoForm.scope === 'agente'
                  ? `Agente de carga${pagoForm.ref && pagoForm.ref.agente ? ` · ${pagoForm.ref.agente}` : ''}${pagoForm.ref && ships.length > 1 ? ` · embarque #${pagoForm.ref.num}` : ''}`
                  : `Despachante${pagoForm.ref && pagoForm.ref.descripcion ? ` · ${pagoForm.ref.descripcion}` : ''}`}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div><label style={LBL}>Fecha</label><input type="date" value={pagoForm.fecha} onChange={e => setPagoForm(f => ({ ...f, fecha: e.target.value }))} style={INP} /></div>
                <div><label style={LBL}>Monto (USD)</label><input inputMode="decimal" value={pagoForm.monto} onChange={e => setPagoForm(f => ({ ...f, monto: e.target.value }))} style={{ ...INP, ...TAB }} placeholder="0" /></div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={LBL}>{pagoForm.scope === 'agente' ? 'Pagado desde' : 'Método'}</label>
                <div style={{ display: 'flex', gap: 3, background: HAIR, borderRadius: 6, padding: 3 }}>
                  {(pagoForm.scope === 'agente' ? METODOS_PAGO : METODOS_PAGO.filter(([v]) => v !== 'usa')).map(([v, l]) => {
                    const on = pagoForm.metodo === v
                    return (
                      <button key={v} type="button" onClick={() => setPagoForm(f => ({ ...f, metodo: v }))}
                        style={{ flex: 1, padding: '0.35rem', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: '0.74rem', fontWeight: on ? 600 : 500, background: on ? '#fff' : 'transparent', color: on ? INK : BODY, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                        {l}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ marginBottom: 16 }}><label style={LBL}>Nota (opcional)</label><input value={pagoForm.nota} onChange={e => setPagoForm(f => ({ ...f, nota: e.target.value }))} style={INP} placeholder="Ej: adelanto 50%" /></div>
              <div style={{ display: 'flex', gap: 22, justifyContent: 'flex-end', alignItems: 'center' }}>
                <button type="button" onClick={() => setPagoForm(null)} disabled={busy} style={BTN_TXT}>Cancelar</button>
                <button type="button" onClick={savePago} disabled={busy} style={{ ...BTN_PRIMARY, padding: '0.55rem 1.05rem', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Guardando…' : 'Registrar'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
