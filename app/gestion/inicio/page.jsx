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
  LISTA_DUENOS, fmtFechaLegible,
} from '../alertas-core'
import { labelStatusES } from '../estados'

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

// Select sin caja, como los filtros del resto del panel.
const SELECT_FLAT = { background: 'none', border: 'none', borderBottom: '1px solid #e5e7eb', borderRadius: 0, padding: '0 0 3px', fontSize: '0.74rem', fontWeight: 500, color: '#6b7280', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }

// 'YYYY-MM-DD' en hora local: toISOString() da UTC y de noche adelanta un día.
const p2 = (x) => String(x).padStart(2, '0')
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` }

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
// "Brandon Quevedo" → 'Brandon'; "germán" → 'Germán'. Si el usuario logueado no
// es ninguno de los dueños (un admin, por ejemplo), devuelve '' y el select
// queda en el primero: "Míos" igual sirve eligiendo a mano.
const duenoDeUsuario = (nombre) => {
  const n = norm(nombre)
  if (!n) return ''
  return LISTA_DUENOS.find(d => n === norm(d) || n.split(/\s+/)[0] === norm(d) || n.includes(norm(d))) || ''
}

// Cómo se muestra el vencimiento de una alerta: rojo si ya venció, ámbar si
// vence hoy, gris si todavía hay margen. Sin fecha, no se muestra nada.
const venceDe = (a) => {
  const d = parseFecha(a && a.vence)
  if (!d) return null
  const n = diasEntre(hoyCero(), d)
  if (n < 0) return { texto: `venció ${fmtFechaLegible(d)}`, color: ROJO }
  if (n === 0) return { texto: 'vence hoy', color: AMBAR }
  return { texto: `vence ${fmtFechaLegible(d)}`, color: GRIS }
}

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
  const [ficha, setFicha] = useState(null)         // { bl, ship, opId, draft } abierto en la ficha integral
  const [dueno, setDueno] = useState(LISTA_DUENOS[0] || '')  // dueño elegido para "Míos"
  const [soloMios, setSoloMios] = useState(false)
  const [hechasInfo, setHechasInfo] = useState({}) // akey → { por, cuando } (quién y cuándo la tachó)
  const [deshacer, setDeshacer] = useState(null)   // { alerta, t }: la recién tachada, con su Deshacer a mano

  // Quién está logueado: el layout no lo expone por contexto, así que se le
  // pregunta a NextAuth y, si no contesta, se lee del encabezado del panel. Con
  // el nombre se preselecciona el dueño del filtro "Míos".
  useEffect(() => {
    let vivo = true
    const desdeDOM = () => { const el = document.querySelector('.username-text'); return el ? el.textContent.trim() : '' }
    const aplicar = (nombre) => { if (!vivo) return; const d = duenoDeUsuario(nombre); if (d) setDueno(d) }
    fetch('/api/auth/session').then(r => r.ok ? r.json() : null)
      .then(j => aplicar((j && j.user && j.user.name) || desdeDOM()))
      .catch(() => aplicar(desdeDOM()))
    return () => { vivo = false }
  }, [])

  // El aviso "Hecha · Deshacer" se va solo a los 9 segundos (mismo plazo que
  // la fila sigue visible con su tilde).
  useEffect(() => {
    if (!deshacer) return
    const t = setTimeout(() => setDeshacer(d => (d && d.t === deshacer.t ? null : d)), 9000)
    return () => clearTimeout(t)
  }, [deshacer])

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
      // full=1 trae quién y cuándo tachó cada una (para el desplegable de
      // hechas). Se toleran las dos formas: array de akeys o de objetos.
      fetch('/api/db/alertas?full=1').then(x => x.ok ? x.json() : []).then(arr => {
        if (!Array.isArray(arr)) return
        const keys = new Set(), info = {}
        arr.forEach(r => {
          const k = typeof r === 'string' ? r : r && r.akey
          if (!k) return
          keys.add(k)
          if (r && typeof r === 'object') info[k] = { por: r.done_by || '', cuando: r.done_at || '' }
        })
        setHechas(keys)
        setHechasInfo(info)
      }).catch(() => {})
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

  // Filtro por dueño: "Míos" deja solo lo del dueño elegido (preseleccionado
  // con el nombre de la sesión). Métricas, bandas y hechas siguen al filtro.
  const filtradas = useMemo(
    () => (soloMios && dueno ? alertas.filter(a => a.dueno === dueno) : alertas),
    [alertas, soloMios, dueno]
  )

  // Visibles = las no tachadas + las recién tachadas (que siguen un rato con su
  // "deshacer", para que un toque de más no te borre el recordatorio).
  const visibles = useMemo(() => filtradas.filter(a => !hechas.has(a.id) || recientes[a.id]), [filtradas, hechas, recientes])
  const pendientes = useMemo(() => filtradas.filter(a => !hechas.has(a.id)), [filtradas, hechas])
  const tachadas = useMemo(() => filtradas.filter(a => hechas.has(a.id) && !recientes[a.id]), [filtradas, hechas, recientes])

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
      // Ya cuelga de una operación (por id primero, por B/L como respaldo): la
      // operación es la que aparece, no el embarque suelto.
      if (s.operation_id && ops.some(o => String(o.id) === String(s.operation_id))) return
      if (ops.some(o => o.bl && s.bl && blNorm(o.bl) === blNorm(s.bl))) return
      const eta = parseFecha(s.eta)
      if (!eta) return
      const d = diasEntre(hoy, eta)
      if (d < 0 || d > 14) return
      out.push({ key: 'sh-' + s.id, dias: d, eta, nombre: `Embarque #${s.num || s.id}`, bl: s.bl || '', estado: labelStatusES(s.status), agente: s.agente || '', opId: null, ship: s })
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

  // Si la acción CREA algo (acc.draft, ej. 'despacho'), la ficha abre un
  // borrador con los datos precargados y un Confirmar: nunca se crea al toque.
  const abrir = (acc) => {
    if (!acc) return
    if (acc.tipo === 'ficha' && acc.bl) {
      setFicha({ bl: acc.bl, ship: acc.ship || null, opId: acc.opId ?? null, draft: acc.draft || null })
      return
    }
    if (acc.opId) irA('/gestion/operaciones?op=' + encodeURIComponent(acc.opId))
  }

  // Tachar / destachar. Optimista, pero si el backend rechaza (permisos) se
  // revierte: una alerta que parece hecha y no lo está es peor que no tacharla.
  const toggleHecha = async (a, done = true) => {
    setHechas(prev => { const n = new Set(prev); done ? n.add(a.id) : n.delete(a.id); return n })
    if (done) {
      setRecientes(r => ({ ...r, [a.id]: true }))
      setTimeout(() => setRecientes(r => { const n = { ...r }; delete n[a.id]; return n }), 9000)
      setDeshacer({ alerta: a, t: Date.now() })
    } else {
      setRecientes(r => { const n = { ...r }; delete n[a.id]; return n })
      setDeshacer(d => (d && d.alerta.id === a.id ? null : d))
    }
    try {
      const r = await fetch('/api/db/alertas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // akey sigue siendo bl|tipo (la comparte Forwarding). operation_id, bl y
        // tipo van aparte para que la hecha sobreviva a corregir un B/L.
        body: JSON.stringify({ akey: a.id, undo: !done, operation_id: a.opId ?? null, bl: a.bl || '', tipo: a.tipo }),
      })
      if (!r.ok) throw new Error('no')
      const j = await r.json().catch(() => ({}))
      setHechasInfo(m => {
        const n = { ...m }
        if (done) n[a.id] = { por: (j && j.done_by) || '', cuando: hoyISO() }
        else delete n[a.id]
        return n
      })
    } catch {
      setHechas(prev => { const n = new Set(prev); done ? n.delete(a.id) : n.add(a.id); return n })
      setRecientes(r => { const n = { ...r }; delete n[a.id]; return n })
      setDeshacer(d => (d && d.alerta.id === a.id ? null : d))
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

  const filaAlerta = (a, tachada) => {
    const vence = tachada ? null : venceDe(a)
    const info = tachada ? hechasInfo[a.id] : null
    return (
    <div key={a.id} className="ini-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.6rem 0.25rem', borderBottom: '1px solid #f1f5f9', opacity: tachada ? 0.5 : 1 }}>
      <button className="ini-check" onClick={() => toggleHecha(a, !tachada)}
        title={tachada ? 'Reactivar' : 'Marcar como hecha'} aria-label={tachada ? 'Reactivar' : 'Marcar como hecha'}
        style={{ ...BTN_ICO, width: 22, height: 22, flex: '0 0 auto', marginTop: 1, color: tachada ? VERDE : '#c4c9d4' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="12" cy="12" r="9"/><polyline points="8.5 12.5 11 15 15.5 9.5"/></svg>
      </button>
      <button onClick={() => !tachada && abrir(a.accion)} className="ini-body"
        style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: tachada ? 'default' : 'pointer', fontFamily: 'inherit' }}>
        <p style={{ fontSize: '0.82rem', fontWeight: 600, color: TINTA, lineHeight: 1.35, textDecoration: tachada ? 'line-through' : 'none' }}>{a.titulo}</p>
        <p style={{ fontSize: '0.7rem', color: GRIS, lineHeight: 1.4, marginTop: 1 }}>
          {a.detalle}
          {/* Dueño y vencimiento: la agenda dice quién y para cuándo. */}
          {!tachada && a.dueno ? <> · {a.dueno}</> : null}
          {vence ? <> · <span style={{ color: vence.color, fontWeight: vence.color === GRIS ? 400 : 600 }}>{vence.texto}</span></> : null}
          {info ? <> · hecha{info.por ? ` por ${info.por}` : ''}{info.cuando && fmtFechaLegible(info.cuando) ? ` el ${fmtFechaLegible(info.cuando)}` : ''}</> : null}
        </p>
      </button>
      {a.monto > 0 && (
        <span className="ini-monto" style={{ flex: '0 0 auto', fontSize: '0.78rem', fontWeight: 700, color: ROJO, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', marginTop: 1 }}>
          {fmtUSD(a.monto)}
        </span>
      )}
      {tachada ? (
        <button className="ini-sec" onClick={() => toggleHecha(a, false)} style={{ ...BTN_SEC, flex: '0 0 auto', whiteSpace: 'nowrap' }}>Reactivar</button>
      ) : a.accion ? (
        <button className="ini-sec" onClick={() => abrir(a.accion)} style={{ ...BTN_SEC, flex: '0 0 auto', whiteSpace: 'nowrap' }}>
          {a.accion.label}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      ) : null}
    </div>
    )
  }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          {/* Filtro de la agenda: dueño + Todos · Míos. Elegir otro dueño pasa
              a "Míos" solo: nadie cambia el nombre para seguir viendo todo. */}
          <select aria-label="Dueño" value={dueno} onChange={e => { setDueno(e.target.value); setSoloMios(true) }} style={SELECT_FLAT}>
            {LISTA_DUENOS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '0.9rem' }}>
            {[[false, 'Todos'], [true, 'Míos']].map(([v, lbl]) => {
              const on = soloMios === v
              return (
                <button key={lbl} onClick={() => setSoloMios(v)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 4px', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: on ? 600 : 400, color: on ? TINTA : GRIS, borderBottom: on ? `2px solid ${TINTA}` : '2px solid transparent', whiteSpace: 'nowrap' }}>
                  {lbl}
                </button>
              )
            })}
          </div>
          <button className="ini-sec" onClick={() => irA('/gestion/operaciones')} style={{ ...BTN_SEC, fontSize: '0.76rem' }}>
            Ver todas las operaciones
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
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
            {soloMios && alertas.length > filtradas.length
              ? `Nada pendiente para ${dueno}. Mirá "Todos" para ver el resto.`
              : filtradas.length ? 'Todo lo de esta semana ya está tachado.' : 'No hay vencimientos ni saldos abiertos con fecha.'}
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
            Hechas ({tachadas.length})
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
            <div key={x.key} className="ini-row" onClick={() => x.bl ? setFicha({ bl: x.bl, ship: x.ship, opId: x.opId ?? null }) : x.opId ? irA('/gestion/operaciones?op=' + encodeURIComponent(x.opId)) : null}
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

      {/* Hecha · Deshacer: para todos los tipos de alerta, sin buscarla en el
          desplegable. Centrado abajo para no pisar el toaster general. */}
      {deshacer && (
        <div role="status" style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1100, display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.6rem 0.9rem', fontSize: '0.78rem', color: TINTA, boxShadow: '0 6px 20px rgba(15,23,42,0.08)', maxWidth: 'min(92vw, 440px)', boxSizing: 'border-box' }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: VERDE, fontWeight: 600 }}>Hecha</span> · {deshacer.alerta.titulo}
          </span>
          <button onClick={() => { const a = deshacer.alerta; setDeshacer(null); toggleHecha(a, false) }}
            style={{ ...BTN_SEC, flex: '0 0 auto', color: TINTA, fontWeight: 600, borderBottom: `1px solid ${TINTA}`, paddingBottom: 1 }}>
            Deshacer
          </button>
        </div>
      )}

      {ficha && (
        <FichaImportacion
          bl={ficha.bl}
          draft={ficha.draft || null}
          // La ficha resuelve la operación por seed.opId primero y por B/L como
          // respaldo: así la alerta abre la operación correcta aunque el B/L
          // esté repetido o mal tipeado.
          seed={{ ...(ficha.ship ? { ship: ficha.ship } : {}), ...(ficha.opId != null ? { opId: ficha.opId } : {}) }}
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
