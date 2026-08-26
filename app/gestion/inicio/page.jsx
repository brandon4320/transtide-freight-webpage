'use client'

// ─── Inicio · "qué tengo que hacer hoy" ───────────────────────────────────────
// La agenda del día: TODAS las alertas del sistema en una sola pantalla,
// ordenadas por urgencia y por plata en juego, y cada una con la acción que la
// resuelve sin salir de acá (registrar pago, cargar despacho, abrir la ficha o
// la operación). La lógica vive en ../alertas-core.js y se genera a partir de
// la OPERACIÓN, así que las importaciones donde el flete lo contrató el cliente
// —solo aduana o solo giro de divisas— también aparecen.
// Pensada para leerse del celular a la mañana.

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { gToast } from '../toast'
import FichaImportacion from '../ficha-importacion'
import {
  construirAlertas, numUSD, fmtUSD, parseFecha, diasEntre, hoyCero, relDias, blNorm,
} from '../alertas-core'

// ——— Transtide Flat: hoja blanca, líneas finas, color solo semántico ———
const BTN_SEC = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.74rem', fontWeight: 500, color: '#6b7280', fontFamily: 'inherit' }
const BTN_ICO = { width: 24, height: 24, border: 'none', background: 'none', color: '#c4c9d4', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }

const ROJO = '#dc2626', AMBAR = '#d97706', VERDE = '#059669', TINTA = '#111827', GRIS = '#9ca3af'

// Cada banda de la agenda con su tono: lo que ya está costando plata en rojo,
// lo que vence estos días en ámbar, el seguimiento en gris.
const BANDAS = [
  { key: 'ahora', label: 'Ahora', color: ROJO, hint: 'vencido o vence hoy' },
  { key: 'pronto', label: 'Estos días', color: AMBAR, hint: 'la semana que viene' },
  { key: 'seguimiento', label: 'Seguimiento', color: '#c4c9d4', hint: 'plata abierta, sin fecha dura' },
]

const ESTADOS_CERRADOS = ['Liquidado', 'Cancelado']

const capit = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const hoyLargo = () => capit(new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }))

// devOps/devShips/devDesps: inyección de datos para preview de diseño (evita
// auth y D1), igual que Forwarding y Despachante.
export default function InicioPage(props) {
  const { devOps = null, devShips = null, devDesps = null } = props || {}
  const router = useRouter()
  const [ops, setOps] = useState([])
  const [ships, setShips] = useState([])
  const [desps, setDesps] = useState([])
  const [hechas, setHechas] = useState(() => new Set())
  const [recientes, setRecientes] = useState({})   // id → true mientras se pueda deshacer
  const [verHechas, setVerHechas] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [ficha, setFicha] = useState(null)         // { bl, ship } abierto en la ficha integral

  // silencioso = refresco después de una acción (registrar un pago desde la
  // ficha): no se blanquea la pantalla ni se pierde dónde estabas mirando.
  const load = async (silencioso = false) => {
    if (devOps) { setOps(devOps); setShips(devShips || []); setDesps(devDesps || []); setLoading(false); return }
    if (!silencioso) setLoading(true)
    setLoadError(false)
    try {
      const [o, t, d] = await Promise.all([
        fetch('/api/db/operations'),
        fetch('/api/tracking'),
        fetch('/api/db/despachante'),
      ])
      if (!o.ok && !t.ok) throw new Error('inicio')
      if (o.ok) { const j = await o.json(); setOps(Array.isArray(j) ? j : []) }
      if (t.ok) { const j = await t.json(); setShips(j.shipments || []) }
      if (d.ok) { const j = await d.json(); setDesps(Array.isArray(j) ? j : []) }
      fetch('/api/db/alertas').then(x => x.ok ? x.json() : []).then(arr => { if (Array.isArray(arr)) setHechas(new Set(arr)) }).catch(() => {})
    } catch {
      if (!silencioso) setLoadError(true)
      gToast.error('No se pudo cargar la agenda. Revisá tu conexión.')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const alertas = useMemo(
    () => construirAlertas({ operaciones: ops, embarques: ships, despachos: desps }),
    [ops, ships, desps]
  )

  // Visibles = las no tachadas + las recién tachadas (que siguen un rato con su
  // "deshacer", para que un toque de más no te borre el recordatorio).
  const visibles = useMemo(() => alertas.filter(a => !hechas.has(a.id) || recientes[a.id]), [alertas, hechas, recientes])
  const pendientes = useMemo(() => alertas.filter(a => !hechas.has(a.id)), [alertas, hechas])
  const tachadas = useMemo(() => alertas.filter(a => hechas.has(a.id) && !recientes[a.id]), [alertas, hechas, recientes])

  // Plata: lo que se debe hoy, salga o no en una alerta.
  const deuda = useMemo(() => {
    const ag = ships.reduce((s, x) => s + Math.max(0, numUSD(x.balance_usd)), 0)
    const de = desps.reduce((s, x) => s + Math.max(0, numUSD(x.saldo)), 0)
    return ag + de
  }, [ships, desps])

  const activas = useMemo(() => ops.filter(o => !ESTADOS_CERRADOS.includes(o.estado || '')).length, [ops])

  // Próximos arribos: la agenda de la semana que viene (operación primero,
  // embarque como respaldo para las que no tienen operación cargada).
  const arribos = useMemo(() => {
    const hoy = hoyCero()
    const out = []
    const vistos = new Set()
    ops.forEach(o => {
      if (ESTADOS_CERRADOS.includes(o.estado || '')) return
      const ship = ships.find(s => (s.operation_id && String(s.operation_id) === String(o.id))) ||
        (o.bl ? ships.find(s => s.bl && blNorm(s.bl) === blNorm(o.bl)) : null)
      const eta = parseFecha(ship && ship.eta) || parseFecha(o.eta)
      if (!eta) return
      const d = diasEntre(hoy, eta)
      if (d < 0 || d > 14) return
      if (ship) vistos.add(ship.id)
      out.push({ key: 'op-' + o.id, dias: d, eta, nombre: o.nombre || 'Operación', bl: o.bl || (ship && ship.bl) || '', estado: o.estado || '', agente: (ship && ship.agente) || '', opId: o.id, ship })
    })
    ships.forEach(s => {
      if (vistos.has(s.id) || /cancel/i.test(s.status || '')) return
      if (ops.some(o => o.bl && s.bl && blNorm(o.bl) === blNorm(s.bl))) return
      const eta = parseFecha(s.eta)
      if (!eta) return
      const d = diasEntre(hoy, eta)
      if (d < 0 || d > 14) return
      out.push({ key: 'sh-' + s.id, dias: d, eta, nombre: `Embarque #${s.num || s.id}`, bl: s.bl || '', estado: s.status || '', agente: s.agente || '', opId: null, ship: s })
    })
    return out.sort((a, b) => a.dias - b.dias).slice(0, 6)
  }, [ops, ships])

  // ── acciones ────────────────────────────────────────────────────────────────

  // Navegación interna que respeta el guardado sucio de la pantalla actual
  // (mismo contrato que usa el menú lateral).
  const irA = (href) => {
    const ev = new CustomEvent('gestion:navigate', { detail: { href }, cancelable: true })
    if (!window.dispatchEvent(ev)) return
    router.push(href)
  }

  const abrir = (acc) => {
    if (!acc) return
    if (acc.tipo === 'ficha' && acc.bl) { setFicha({ bl: acc.bl, ship: acc.ship || null }); return }
    if (acc.opId) irA('/gestion/operaciones?op=' + encodeURIComponent(acc.opId))
  }

  // Tachar / destachar. Optimista, pero si el backend rechaza (permisos) se
  // revierte: una alerta que parece hecha y no lo está es peor que no tacharla.
  const toggleHecha = async (a, done = true) => {
    setHechas(prev => { const n = new Set(prev); done ? n.add(a.id) : n.delete(a.id); return n })
    if (done) {
      setRecientes(r => ({ ...r, [a.id]: true }))
      setTimeout(() => setRecientes(r => { const n = { ...r }; delete n[a.id]; return n }), 9000)
    } else {
      setRecientes(r => { const n = { ...r }; delete n[a.id]; return n })
    }
    try {
      const r = await fetch('/api/db/alertas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ akey: a.id, undo: !done }),
      })
      if (!r.ok) throw new Error('no')
    } catch {
      setHechas(prev => { const n = new Set(prev); done ? n.delete(a.id) : n.add(a.id); return n })
      setRecientes(r => { const n = { ...r }; delete n[a.id]; return n })
      gToast.error('No se pudo guardar el cambio de la alerta.')
    }
  }

  // ── piezas de UI ────────────────────────────────────────────────────────────

  const metric = (val, label, color = TINTA) => (
    <div>
      <p style={{ fontSize: '1.15rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color, lineHeight: 1.2 }}>{val}</p>
      <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: GRIS, marginTop: 2 }}>{label}</p>
    </div>
  )
  const divider = <span style={{ width: 1, alignSelf: 'stretch', background: '#f1f5f9', flex: '0 0 auto' }} aria-hidden="true" />

  const filaAlerta = (a, tachada) => (
    <div key={a.id} className="ini-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.6rem 0.25rem', borderBottom: '1px solid #f1f5f9', opacity: tachada ? 0.5 : 1 }}>
      <button className="ini-check" onClick={() => toggleHecha(a, !tachada)}
        title={tachada ? 'Volver a activar' : 'Marcar como hecho'} aria-label={tachada ? 'Volver a activar' : 'Marcar como hecho'}
        style={{ ...BTN_ICO, width: 22, height: 22, flex: '0 0 auto', marginTop: 1, color: tachada ? VERDE : '#c4c9d4' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="12" cy="12" r="9"/><polyline points="8.5 12.5 11 15 15.5 9.5"/></svg>
      </button>
      <button onClick={() => !tachada && abrir(a.accion)} className="ini-body"
        style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: tachada ? 'default' : 'pointer', fontFamily: 'inherit' }}>
        <p style={{ fontSize: '0.82rem', fontWeight: 600, color: TINTA, lineHeight: 1.35, textDecoration: tachada ? 'line-through' : 'none' }}>{a.titulo}</p>
        <p style={{ fontSize: '0.7rem', color: GRIS, lineHeight: 1.4, marginTop: 1 }}>{a.detalle}</p>
      </button>
      {a.monto > 0 && (
        <span className="ini-monto" style={{ flex: '0 0 auto', fontSize: '0.78rem', fontWeight: 700, color: ROJO, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', marginTop: 1 }}>
          {fmtUSD(a.monto)}
        </span>
      )}
      {tachada ? (
        <button className="ini-sec" onClick={() => toggleHecha(a, false)} style={{ ...BTN_SEC, flex: '0 0 auto', whiteSpace: 'nowrap' }}>Deshacer</button>
      ) : a.accion ? (
        <button className="ini-sec" onClick={() => abrir(a.accion)} style={{ ...BTN_SEC, flex: '0 0 auto', whiteSpace: 'nowrap' }}>
          {a.accion.label}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      ) : null}
    </div>
  )

  return (
    <div style={{ background: '#fff' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.4rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 350, letterSpacing: '-0.02em', color: TINTA, marginBottom: '0.25rem' }}>Inicio</h2>
          <p style={{ fontSize: '0.74rem', color: GRIS }}>
            {hoyLargo()} · lo que hay que hacer hoy, ordenado por urgencia y plata en juego
          </p>
        </div>
        <button className="ini-sec" onClick={() => irA('/gestion/operaciones')} style={{ ...BTN_SEC, fontSize: '0.76rem' }}>
          Ver todas las operaciones
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      {/* Línea de métricas — sin cajas */}
      <div style={{ display: 'flex', gap: '2.5rem', rowGap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end', paddingBottom: '1.1rem', borderBottom: '1px solid #f1f5f9', marginBottom: '1.4rem' }}>
        {metric(pendientes.length, 'pendientes', pendientes.some(a => a.nivel === 'ahora') ? ROJO : pendientes.length ? AMBAR : VERDE)}
        {metric(pendientes.filter(a => a.nivel === 'ahora').length, 'para ahora', pendientes.some(a => a.nivel === 'ahora') ? ROJO : GRIS)}
        {divider}
        {metric(fmtUSD(deuda), 'a pagar', deuda > 0 ? ROJO : VERDE)}
        {divider}
        {metric(activas, 'operaciones activas')}
        {metric(arribos.filter(a => a.dias <= 7).length, 'arriban en 7 días')}
      </div>

      {/* Agenda */}
      {loading ? (
        <div style={{ padding: '4rem 0', textAlign: 'center', color: GRIS, fontSize: '0.8rem' }}>
          <div style={{ width: 28, height: 28, border: '2px solid #f1f5f9', borderTopColor: TINTA, borderRadius: '50%', margin: '0 auto 0.9rem', animation: 'ini-spin 0.8s linear infinite' }} />
          Armando la agenda…
        </div>
      ) : loadError ? (
        <div style={{ padding: '4rem 0', textAlign: 'center', color: GRIS }}>
          <p style={{ fontWeight: 600, marginBottom: '0.3rem', color: ROJO, fontSize: '0.88rem' }}>No se pudo cargar la agenda</p>
          <p style={{ fontSize: '0.78rem', marginBottom: '1.25rem' }}>Puede ser un problema de conexión.</p>
          <button onClick={() => load()} className="ini-sec" style={{ ...BTN_SEC, fontSize: '0.78rem', fontWeight: 600, color: TINTA, borderBottom: '1px solid #111827', paddingBottom: 2 }}>Reintentar</button>
        </div>
      ) : visibles.length === 0 ? (
        <div style={{ padding: '3rem 0', textAlign: 'center' }}>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: VERDE, marginBottom: '0.3rem' }}>Sin pendientes</p>
          <p style={{ fontSize: '0.78rem', color: GRIS }}>
            {alertas.length ? 'Todo lo de esta semana ya está tachado.' : 'No hay vencimientos ni saldos abiertos con fecha.'}
          </p>
        </div>
      ) : (
        BANDAS.map(b => {
          const list = visibles.filter(a => a.nivel === b.key)
          if (!list.length) return null
          const plata = list.reduce((s, a) => s + (a.monto || 0), 0)
          return (
            <div key={b.key} style={{ borderLeft: `2px solid ${b.color}`, paddingLeft: 12, marginBottom: '1.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: '0.25rem' }}>
                <p style={{ fontSize: '0.64rem', fontWeight: 700, color: b.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {b.label} · {list.length}
                </p>
                <span className="ini-hint" style={{ fontSize: '0.64rem', color: '#c4c9d4' }}>{b.hint}</span>
                {plata > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: GRIS }}>
                    en juego <span style={{ fontWeight: 700, color: ROJO, fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(plata)}</span>
                  </span>
                )}
              </div>
              {list.map(a => filaAlerta(a, hechas.has(a.id)))}
            </div>
          )
        })
      )}

      {/* Hechas: se pueden reactivar (antes el tilde borraba el recordatorio para siempre) */}
      {!loading && tachadas.length > 0 && (
        <div>
          <button onClick={() => setVerHechas(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '0.4rem 0.25rem', cursor: 'pointer', color: GRIS, fontSize: '0.72rem', fontWeight: 500, fontFamily: 'inherit' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: verHechas ? 'rotate(180deg)' : 'none', flex: '0 0 auto' }}><polyline points="6 9 12 15 18 9"/></svg>
            Hechas · {tachadas.length}
          </button>
          {verHechas && <div>{tachadas.map(a => filaAlerta(a, true))}</div>}
        </div>
      )}

      {/* Próximos arribos — la otra mitad de la agenda: lo que viene */}
      {!loading && !loadError && arribos.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, paddingBottom: '0.45rem', borderBottom: '1px solid #f1f5f9' }}>
            <p style={{ fontSize: '0.64rem', fontWeight: 700, color: GRIS, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Próximos arribos</p>
            <span style={{ fontSize: '0.64rem', color: '#c4c9d4', fontVariantNumeric: 'tabular-nums' }}>{arribos.length}</span>
          </div>
          {arribos.map(x => (
            <div key={x.key} className="ini-row" onClick={() => x.bl ? setFicha({ bl: x.bl, ship: x.ship }) : x.opId ? irA('/gestion/operaciones?op=' + encodeURIComponent(x.opId)) : null}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.6rem 0.25rem', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.82rem', fontWeight: 600, color: TINTA, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.nombre}</p>
                <p style={{ fontSize: '0.68rem', color: GRIS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[x.bl, x.agente, x.estado].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <span style={{ flex: '0 0 auto', fontSize: '0.74rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: x.dias <= 2 ? ROJO : x.dias <= 7 ? AMBAR : GRIS }}>
                {relDias(x.dias)}
              </span>
            </div>
          ))}
        </div>
      )}

      {ficha && (
        <FichaImportacion
          bl={ficha.bl}
          seed={ficha.ship ? { ship: ficha.ship } : {}}
          onClose={() => setFicha(null)}
          onChanged={() => load(true)}
        />
      )}

      <style>{`
        @keyframes ini-spin { to { transform: rotate(360deg) } }
        .ini-row:hover { background: #fafafa }
        .ini-sec:hover { color: #111827 !important }
        .ini-check:hover { color: #d97706 !important }
        @media (max-width: 640px) {
          /* En el celular: el texto ocupa la línea, el monto y la acción caen
             debajo (la acción a la derecha, cómoda para el pulgar). */
          .ini-hint { display: none }
          .ini-row { flex-wrap: wrap; row-gap: 6px }
          .ini-row .ini-body { flex: 1 1 calc(100% - 60px) }
          .ini-row .ini-monto { margin-left: 32px }
          .ini-row .ini-sec { margin-left: auto }
        }
      `}</style>
    </div>
  )
}
