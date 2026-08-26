// ─── Núcleo de alertas · "qué tengo que hacer hoy" ────────────────────────────
// Una sola fuente de verdad para todas las alertas del sistema. Hasta acá las
// alertas vivían repartidas en tres pantallas (Forwarding, Operaciones y
// Despachante) y —lo más caro— se generaban recorriendo LOS EMBARQUES: una
// importación donde el flete lo contrató el cliente y Transtide hace solo
// aduana o el giro de divisas no disparaba nada, nunca.
//
// Acá el eje es LA OPERACIÓN (el expediente). El embarque y el despacho son
// datos que se le cuelgan: si están, suman alertas propias (saldo al agente,
// free time, turno de terminal); si no están, la operación igual avisa por su
// propia fecha y su propio estado.
//
// El módulo es JS puro (sin React, sin fetch) para poder usarse desde cualquier
// pantalla y testearse con datos de mentira.

// Agentes de origen conocidos (Bruce y Shaina marítimo · Yachao aéreo). Se usa
// solo para el aviso de "pedile la liberación del B/L": con un forwarder de
// texto libre igual se emite, nombrándolo.
const AGENTES_ORIGEN = ['Bruce', 'Shaina', 'Yachao']

// Estados de la operación (mismos labels que usa Operaciones).
const EST_LIBERADA = ['Listo p/ retiro', 'En tránsito local', 'Entregado', 'Liquidado']
const EST_ARRIBADA = ['Arribado', 'En aduana', ...EST_LIBERADA]
const EST_CERRADA = ['Liquidado', 'Cancelado']

// ─── utilidades ───────────────────────────────────────────────────────────────

export const blNorm = (b) => String(b || '').replace(/[\s-]/g, '').toUpperCase()

// Los montos llegan de D1 como texto en formato es-AR ("1.250,50"). Si ya viene
// número, se respeta tal cual (sacarle los puntos lo multiplicaría por 10).
export const numUSD = (v) => {
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const n = parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

export const fmtUSD = (n) => 'USD ' + Math.round(n || 0).toLocaleString('es-AR')

const mkDate = (y, mo, d) => {
  if (!y || !mo || !d || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(y, mo - 1, d)
  return isNaN(dt.getTime()) ? null : dt
}

// Acepta ISO (2026-08-25), es-AR (25/08/2026) y Date. La ETA se guarda distinto
// según de dónde venga, así que acá se toleran los dos formatos.
export function parseFecha(v) {
  if (!v) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  const s = String(v).trim()
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return mkDate(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return mkDate(y, +m[2], +m[1]) }
  return null
}

// Hora embebida en el valor (los turnos de terminal se cargan con hora).
export function parseHora(v) {
  const m = String(v || '').match(/(\d{1,2}):(\d{2})/)
  if (!m) return ''
  const h = Math.min(23, +m[1])
  return String(h).padStart(2, '0') + ':' + m[2]
}

export const hoyCero = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

// Días entre dos fechas (b − a). Positivo = b es posterior.
export const diasEntre = (a, b) => Math.round((b.getTime() - a.getTime()) / 86400000)

export const fmtFecha = (d) => d ? d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : ''

// "en 3 días" / "hoy" / "hace 6 días"
export function relDias(dias) {
  if (dias == null) return ''
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'mañana'
  if (dias > 0) return `en ${dias} días`
  const n = -dias
  return n === 1 ? 'ayer' : `hace ${n} días`
}

// ─── lectura tolerante del bloque de retiro ───────────────────────────────────
// Los campos de free time / canal / turnos los está sumando otro tramo del
// overhaul al embarque. Se leen por PATRÓN de nombre y por FORMA del valor: si
// todavía no existen, estas alertas simplemente no salen (nunca rompen).

const normKey = (k) => String(k || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

// La hora puede venir embebida en la fecha ("2026-08-27 09:30") o en un campo
// hermano (turno_retiro_fecha + turno_retiro_hora). Se buscan las dos formas.
function findHoraHermana(obj, reBase) {
  for (const k of Object.keys(obj)) {
    const nk = normKey(k)
    if (!/hora|hs$/.test(nk)) continue
    if (!reBase.test(nk.replace(/hora|hs$/g, ''))) continue
    const h = parseHora(obj[k])
    if (h) return h
  }
  return ''
}

function findVal(obj, re, kind) {
  if (!obj) return null
  for (const k of Object.keys(obj)) {
    if (!re.test(normKey(k))) continue
    const v = obj[k]
    if (v == null || v === '') continue
    if (kind === 'fecha') { const d = parseFecha(v); if (d) return { valor: v, fecha: d, hora: parseHora(v) } }
    // Solo un número pelado cuenta como número: así una fecha guardada en un
    // campo con nombre parecido no se cuela como "días de free time".
    else if (kind === 'num') { if (!/^\s*\d+([.,]\d+)?\s*$/.test(String(v))) continue; const n = numUSD(v); if (n > 0) return { valor: v, num: n } }
    else if (kind === 'bool') { const s = String(v).toLowerCase(); if (['1', 'true', 'si', 'sí', 'ok', 'y'].includes(s)) return { valor: v, si: true } }
    else if (kind === 'texto') { const s = String(v).trim(); if (s) return { valor: s } }
  }
  return null
}

// Devuelve { freeHasta, freeDias, arriboReal, canal, turno, turnoHora, retiro,
// vacioTurno, vacioOk } — todo opcional.
export function retiroDeEmbarque(ship) {
  if (!ship || typeof ship !== 'object') return {}
  const out = {}
  const arribo = findVal(ship, /arriboreal|fechaarribo|arriboefectivo|realarribo/, 'fecha')
  if (arribo) out.arriboReal = arribo.fecha
  const fh = findVal(ship, /free.?time.*(hasta|venc|limite|fin)|(venc|limite).*free/, 'fecha')
  if (fh) out.freeHasta = fh.fecha
  const fd = findVal(ship, /free.?time.*(dias|days)?$|freetime|diasfree/, 'num')
  if (fd && fd.num > 0 && fd.num < 120) out.freeDias = fd.num
  const canal = (() => {
    for (const k of Object.keys(ship)) {
      if (!/canal/.test(normKey(k))) continue
      const s = String(ship[k] || '').toLowerCase()
      if (/rojo/.test(s)) return 'rojo'
      if (/naranja|amarill/.test(s)) return 'naranja'
      if (/verde/.test(s)) return 'verde'
    }
    return ''
  })()
  if (canal) out.canal = canal
  const RE_TURNO = /turno.*(terminal|retiro)|(terminal|retiro).*turno/
  const turno = findVal(ship, RE_TURNO, 'fecha')
  if (turno) { out.turno = turno.fecha; out.turnoHora = turno.hora || findHoraHermana(ship, RE_TURNO) }
  const retiro = findVal(ship, /(fecha|dia).*retiro|retiro.*(fecha|real|efectiv)/, 'fecha')
  if (retiro) out.retiro = retiro.fecha
  const RE_VAC = /(turno|fecha|devol).*(vacio)|vacio.*(turno|fecha|devol)/
  const vt = findVal(ship, RE_VAC, 'fecha')
  if (vt) { out.vacioTurno = vt.fecha; out.vacioHora = vt.hora || findHoraHermana(ship, RE_VAC) || findHoraHermana(ship, /vacio/) }
  const vok = findVal(ship, /vacio.*(devuelt|ok|confirm|entregad)|devol.*vacio.*(ok|confirm)/, 'bool')
  if (vok) out.vacioOk = true
  return out
}

// ─── pesos de urgencia ────────────────────────────────────────────────────────
// urgencia: 0-100, más alto = más urgente. Todo el criterio vive acá para poder
// afinarlo en un solo lugar. La plata en juego suma unos puntos, así que entre
// dos alertas del mismo tipo primero aparece la más cara.
const plataBump = (monto) => Math.min(15, (numUSD(monto) || 0) / 1000)
const clamp = (n) => Math.max(1, Math.min(100, Math.round(n)))

export const nivelDe = (urgencia) => urgencia >= 80 ? 'ahora' : urgencia >= 55 ? 'pronto' : 'seguimiento'

export const NIVEL_LABEL = {
  ahora: 'Ahora',
  pronto: 'Estos días',
  seguimiento: 'Seguimiento',
}

// ─── construcción ─────────────────────────────────────────────────────────────

// { operaciones, embarques, despachos, hoy } → [alerta]
// alerta = { id, tipo, urgencia, nivel, titulo, detalle, monto, opId, bl,
//            shipId, despId, accion: { tipo, label, bl, opId, ship } }
export function construirAlertas({ operaciones = [], embarques = [], despachos = [], hoy = hoyCero() } = {}) {
  const ops = Array.isArray(operaciones) ? operaciones : []
  const ships = Array.isArray(embarques) ? embarques : []
  const desps = Array.isArray(despachos) ? despachos : []

  const despByBL = {}
  desps.forEach(d => { if (d && d.bl) despByBL[blNorm(d.bl)] = d })

  // Embarques por operación: primero por operation_id (el vínculo real), y si no
  // está, por B/L (que es como se matchea hoy en el resto del sistema).
  const usados = new Set()
  const shipsDeOp = (op) => {
    const list = ships.filter(s => s && s.operation_id && String(s.operation_id) === String(op.id))
    if (!list.length && op.bl) {
      const k = blNorm(op.bl)
      ships.forEach(s => { if (s && s.bl && blNorm(s.bl) === k) list.push(s) })
    }
    list.forEach(s => usados.add(s))
    // El embarque "principal" es el de ETA más cercana: manda para las fechas.
    return list.sort((a, b) => {
      const da = parseFecha(a.eta), db = parseFecha(b.eta)
      if (da && db) return da - db
      return da ? -1 : db ? 1 : 0
    })
  }

  const entidades = ops.map(op => ({ op, ships: shipsDeOp(op) }))
  // Embarques sin operación: siguen generando sus alertas (no se pierde nada de
  // lo que hoy muestra Forwarding).
  ships.forEach(s => { if (!usados.has(s)) entidades.push({ op: null, ships: [s] }) })

  const out = []
  const push = (a) => { if (a) out.push(a) }

  entidades.forEach(({ op, ships: list }) => {
    const ship = list[0] || null
    const bl = (op && op.bl) || (ship && ship.bl) || ''
    const blk = blNorm(bl)
    const desp = blk ? despByBL[blk] : null
    const opId = op ? op.id : null
    const nombre = (op && op.nombre) || (ship ? `Embarque #${ship.num || ship.id}` : 'Importación')
    const estado = (op && op.estado) || ''
    const statusShip = (ship && ship.status) || ''

    // Cancelada: no genera nada. Liquidada: solo lo que todavía es plata
    // (saldo al agente o al despachante) — el resto del flujo ya está cerrado.
    if (/cancel/i.test(estado)) return
    if (!op && /cancel/i.test(statusShip)) return
    const liquidada = EST_CERRADA.includes(estado)

    // Clave estable de cada alerta. Mismo formato que el panel de Forwarding
    // (bl|tipo) para que lo tachado en una pantalla también se vea tachado acá.
    const akey = (tipo, extra) => (blk ? blk : opId ? 'op:' + opId : 'x') + '|' + tipo + (extra ? '|' + extra : '')

    // Acción por defecto: la ficha del B/L si hay B/L (resuelve pagos y despacho
    // sin salir); si no, la operación.
    const accFicha = (label) => blk
      ? { tipo: 'ficha', label, bl, opId, ship }
      : opId ? { tipo: 'operacion', label: 'Abrir operación', opId } : null
    const accOp = (label = 'Abrir operación') => opId
      ? { tipo: 'operacion', label, opId }
      : accFicha('Abrir ficha')

    const ref = [nombre, bl ? bl : null].filter(Boolean).join(' · ')

    // Fecha de referencia: manda la del embarque; si no hay embarque (flete del
    // cliente), la ETA de la propia operación.
    const eta = parseFecha(ship && ship.eta) || parseFecha(op && op.eta)
    const dias = eta ? diasEntre(eta, hoy) : null   // > 0 = ya arribó
    const entregada = EST_LIBERADA.slice(2).includes(estado) || /deliver|paid|entreg/i.test(statusShip)
    const liberada = entregada || EST_LIBERADA.includes(estado)
    const arribo = entregada || EST_ARRIBADA.includes(estado) || (dias != null && dias > 0)
    const rt = retiroDeEmbarque(ship)

    // ── Pre-arribo ────────────────────────────────────────────────────────────
    if (!arribo && !liquidada && dias != null && dias <= 0) {
      const falta = -dias
      if (falta <= 7 && !liberada && ship && ship.agente) {
        const ag = ship.agente
        push({
          id: akey('bl_china'), tipo: 'bl_china', urgencia: clamp(80 - falta * 2),
          titulo: `Pedile a ${ag} la liberación del B/L`,
          detalle: `${ref} — llega ${relDias(falta)}${AGENTES_ORIGEN.includes(ag) ? '' : ' (agente de origen)'}`,
          monto: 0, opId, bl, shipId: ship.id, accion: accFicha('Abrir ficha'),
        })
      }
      if (falta <= 5 && !liberada) {
        push({
          id: akey('naviera'), tipo: 'naviera', urgencia: clamp(90 - falta * 3),
          titulo: 'Pagá naviera y terminal para liberar el contenedor',
          detalle: `${ref} — llega ${relDias(falta)} · si se libera tarde, corre almacenaje`,
          monto: 0, opId, bl, shipId: ship && ship.id, accion: accFicha('Abrir ficha'),
        })
      }
      if (falta <= 7) {
        const dest = (ship && ship.destino) || ''
        push({
          id: akey('transporte'), tipo: 'transporte', urgencia: clamp(72 - falta * 2),
          titulo: 'Coordiná el transporte interno',
          detalle: `${ref} — llega ${relDias(falta)}${dest ? ` a ${dest}` : ''}`,
          monto: 0, opId, bl, shipId: ship && ship.id, accion: accOp('Abrir operación'),
        })
      }
    }

    // ── Retiro: free time · canal · turno · vacío (si los campos existen) ─────
    const limiteFree = rt.freeHasta || (rt.freeDias && (rt.arriboReal || eta)
      ? new Date((rt.arriboReal || eta).getTime() + rt.freeDias * 86400000) : null)
    if (limiteFree && !rt.vacioOk && !liquidada) {
      const restan = diasEntre(hoy, limiteFree)
      if (restan <= 3) {
        push({
          id: akey('freetime'), tipo: 'freetime',
          urgencia: clamp(restan < 0 ? 100 : 98 - restan * 3),
          titulo: restan < 0 ? `Free time VENCIDO hace ${-restan} días` : `El free time vence ${relDias(restan)}`,
          detalle: `${ref} — límite ${fmtFecha(limiteFree)} · después corre almacenaje y detention`,
          monto: 0, opId, bl, shipId: ship && ship.id, accion: accFicha('Abrir ficha'),
        })
      }
    }
    if (rt.canal && rt.canal !== 'verde' && !entregada) {
      push({
        id: akey('canal'), tipo: 'canal', urgencia: rt.canal === 'rojo' ? 76 : 62,
        titulo: rt.canal === 'rojo' ? 'Canal rojo — verificación física' : 'Canal naranja — revisión documental',
        detalle: `${ref} — avisale al cliente que la entrega se puede correr`,
        monto: 0, opId, bl, shipId: ship && ship.id, accion: accFicha('Abrir ficha'),
      })
    }
    if (rt.turno && !liquidada) {
      const faltaT = diasEntre(hoy, rt.turno)
      if (faltaT >= 0 && faltaT <= 1) {
        push({
          id: akey('turno'), tipo: 'turno', urgencia: faltaT === 0 ? 90 : 82,
          titulo: `Turno de terminal ${relDias(faltaT)}${rt.turnoHora ? ` a las ${rt.turnoHora}` : ''}`,
          detalle: `${ref} — confirmá camión y documentación`,
          monto: 0, opId, bl, shipId: ship && ship.id, accion: accFicha('Abrir ficha'),
        })
      }
    }
    if (!rt.vacioOk && !liquidada && (rt.retiro || rt.vacioTurno)) {
      const desdeRetiro = rt.retiro ? diasEntre(rt.retiro, hoy) : null
      const turnoVac = rt.vacioTurno ? diasEntre(hoy, rt.vacioTurno) : null
      if ((desdeRetiro != null && desdeRetiro >= 4) || (turnoVac != null && turnoVac <= 1)) {
        push({
          id: akey('vacio'), tipo: 'vacio',
          urgencia: clamp(desdeRetiro != null ? 84 + Math.min(12, desdeRetiro - 4) : turnoVac <= 0 ? 90 : 82),
          titulo: 'Devolvé el contenedor vacío',
          detalle: `${ref} — ${desdeRetiro != null ? `retirado hace ${desdeRetiro} días` : `turno ${relDias(turnoVac)}`}${rt.vacioTurno ? ` · turno ${fmtFecha(rt.vacioTurno)}${rt.vacioHora ? ' ' + rt.vacioHora : ''}` : ''} · cada día tarde es detention`,
          monto: 0, opId, bl, shipId: ship && ship.id, accion: accFicha('Abrir ficha'),
        })
      }
    }

    // ── Post-arribo ───────────────────────────────────────────────────────────
    if (arribo && dias != null && dias >= 5 && !liberada) {
      push({
        id: akey('liberar'), tipo: 'liberar', urgencia: clamp(84 + Math.min(12, dias - 5)),
        titulo: `Arribó hace ${dias} días y sigue sin liberar`,
        detalle: `${ref} — riesgo de almacenaje y forzoso de terminal`,
        monto: 0, opId, bl, shipId: ship && ship.id, accion: accFicha('Abrir ficha'),
      })
    }
    // Solo con fecha de arribo real: una operación sin fecha (ej. un giro de
    // divisas suelto) no tiene por qué pedir un despacho de aduana.
    if (arribo && !desp && !liquidada && dias != null && dias >= 7) {
      const sem = Math.max(1, Math.floor(dias / 7))
      push({
        id: akey('despacho'), tipo: 'despacho', urgencia: clamp(60 + Math.min(15, sem * 3)),
        titulo: 'Cargá el despacho del despachante',
        detalle: `${ref} — arribó hace ${sem} semana${sem === 1 ? '' : 's'} y todavía no hay despacho cargado`,
        monto: 0, opId, bl, despId: null, accion: accFicha('Cargar despacho'),
      })
    }

    // Saldo con el agente: una alerta por embarque (un B/L puede tener varios).
    list.forEach(s => {
      const bal = numUSD(s.balance_usd)
      if (bal <= 0) return
      const eS = parseFecha(s.eta)
      const dS = eS ? diasEntre(eS, hoy) : dias
      const arribóS = /deliver|paid/i.test(s.status || '') || (dS != null && dS > 0) || arribo
      if (!arribóS) return
      if (dS != null && dS < 7) return
      const sem = dS != null ? Math.floor(dS / 7) : null
      const blS = s.bl || bl
      push({
        id: (blNorm(blS) || 'ship:' + s.id) + '|pago', tipo: 'pago',
        urgencia: clamp(55 + plataBump(bal) + (sem ? Math.min(10, sem * 2) : 0)),
        titulo: `Pagale ${fmtUSD(bal)} a ${s.agente || 'tu agente'}`,
        detalle: `${nombre}${blS ? ' · ' + blS : ''} — arribó${sem ? ` hace ${sem} semana${sem === 1 ? '' : 's'}` : ''}`,
        monto: bal, opId, bl: blS, shipId: s.id,
        accion: blS ? { tipo: 'ficha', label: 'Registrar pago', bl: blS, opId, ship: s } : accOp(),
      })
    })

    // Saldo con el despachante (antes vivía solo en su pantalla y exigía el
    // embarque vinculado: ahora alcanza con que la operación haya arribado).
    if (desp) {
      const saldoD = numUSD(desp.saldo)
      if (saldoD > 0 && arribo && (dias == null || dias >= 7)) {
        push({
          id: akey('pago_desp'), tipo: 'pago_desp', urgencia: clamp(53 + plataBump(saldoD)),
          titulo: `Pagale ${fmtUSD(saldoD)} al despachante`,
          detalle: `${ref} — ${desp.descripcion || 'despacho'} con saldo abierto`,
          monto: saldoD, opId, bl, despId: desp.id, accion: accFicha('Registrar pago'),
        })
      }
    }

    // Cobranza: entregada y sin liquidar. Sin fecha también avisa (más abajo en
    // la lista): es plata en la calle que hoy no aparecía en ningún lado.
    if (op && estado === 'Entregado') {
      const semC = dias != null ? Math.floor(dias / 7) : null
      if (dias == null || dias >= 7) {
        push({
          id: akey('cobranza'), tipo: 'cobranza', urgencia: clamp(50 + (semC ? Math.min(12, semC * 2) : 0)),
          titulo: 'Entregada y sin liquidar — revisá los cobros',
          detalle: `${ref}${semC ? ` — entregada hace ${semC} semana${semC === 1 ? '' : 's'}` : ''}`,
          monto: 0, opId, bl, accion: accOp('Abrir operación'),
        })
      }
    }
  })

  // Dedupe por clave: dos operaciones con el mismo B/L (o dos embarques con el
  // mismo B/L) generarían la misma alerta dos veces. Queda la más urgente.
  const porId = new Map()
  out.forEach(a => {
    const prev = porId.get(a.id)
    if (!prev) { porId.set(a.id, a); return }
    if (a.urgencia > prev.urgencia) { a.monto = Math.max(a.monto || 0, prev.monto || 0); porId.set(a.id, a) }
    else prev.monto = Math.max(prev.monto || 0, a.monto || 0)
  })
  const lista = [...porId.values()]

  // Orden: primero lo más urgente; a igual urgencia, primero la más cara.
  lista.forEach(a => { a.nivel = nivelDe(a.urgencia); a.monto = a.monto || 0 })
  return lista.sort((a, b) => b.urgencia - a.urgencia || b.monto - a.monto || String(a.id).localeCompare(String(b.id)))
}

// Resumen para la línea de métricas de la pantalla de inicio.
export function resumenAlertas(alertas = []) {
  const ahora = alertas.filter(a => a.nivel === 'ahora').length
  const plata = alertas.reduce((s, a) => s + (a.monto || 0), 0)
  return { total: alertas.length, ahora, plata }
}
