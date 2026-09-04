// Diccionario de estados compartido por todos los módulos de gestión.
//
// Hoy cada entidad tiene un único campo de estado que intenta decir todo a la vez
// (Forwarding: "Delivered - Payment Pending" mezcla dónde está el contenedor con
// si le pagaste al agente). Acá se separan en EJES independientes, cada uno con
// su propia fuente de verdad:
//   · físico  → se deriva del embarque (fechas + bloque de retiro), nunca se tipea
//   · aduana  → vive en el despacho
//   · plata   → se deriva de los libros de pagos (adeudado vs. recibido)
//   · op      → los 9 estados manuales de operations, que NO se tocan todavía
//
// Este archivo no tiene dependencias ni hooks: se importa igual desde componentes
// cliente, rutas de API y alertas-core. Ninguna función tira: los datos viejos
// vienen sucios (NULL, formatos mixtos, inglés) y una fila rara no puede tumbar
// una lista entera.

const TONE = {
  ok: '#059669',      // entregado
  atencion: '#d97706', // arribado / retirado: hay plazos corriendo (free time, vacío)
  neutro: '#6b7280',
  peligro: '#dc2626',  // cancelado / deuda
  mudo: '#9ca3af',     // no aplica (por ejemplo, nada que pagar)
}

// ─── Eje físico ──────────────────────────────────────────────────────────────
export const ESTADOS_FISICO = [
  { id: 'reservado', label: 'Reservado' },
  { id: 'embarcado', label: 'Embarcado' },
  { id: 'transito', label: 'En tránsito' },
  { id: 'arribado', label: 'Arribado' },
  { id: 'retirado', label: 'Retirado' },
  { id: 'entregado', label: 'Entregado' },
  { id: 'cancelado', label: 'Cancelado' },
]

const FISICO_TONE = {
  reservado: TONE.neutro,
  embarcado: TONE.neutro,
  transito: TONE.neutro,
  arribado: TONE.atencion,
  retirado: TONE.atencion,
  entregado: TONE.ok,
  cancelado: TONE.peligro,
}

const FISICO_POR_ID = Object.fromEntries(ESTADOS_FISICO.map(e => [e.id, e]))

function fisico(id) {
  const e = FISICO_POR_ID[id] || FISICO_POR_ID.reservado
  return { id: e.id, label: e.label, tone: FISICO_TONE[e.id] || TONE.neutro }
}

// Fechas: se comparan como strings ISO (YYYY-MM-DD) para no depender de la zona
// horaria del servidor ni del navegador. "Hoy" se arma con la fecha local porque
// toISOString() da UTC y a la noche adelanta un día.
function hoyISO() {
  const d = new Date()
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Acepta lo que hay en la base: ISO puro, ISO con hora, o DD/MM/YYYY heredado de
// las planillas. Cualquier otra cosa se ignora (null), no se adivina.
function aISO(v) {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

// D1 guarda los tildes como '1' | '' (texto); los formularios a veces pasan booleanos.
const tildado = (v) => v === true || v === 1 || v === '1' || v === 'true'

/**
 * Deriva el estado físico de un embarque (fila de shipments o el form del modal).
 * Los datos duros (retiro, arribo, fechas) le ganan al texto del status viejo,
 * porque el status se elige a ojo y queda desactualizado; las fechas se cargan
 * cuando pasan las cosas. Orden de evaluación, del hecho más tardío al más temprano:
 *   vacío devuelto → entregado (no se devuelve el vacío sin haber descargado en destino)
 *   status Delivered/Entregado → entregado (confirmación manual de entrega)
 *   retiro tildado o fecha real de retiro → retirado
 *   arribo real cargado → arribado
 *   status Cancelled → cancelado (bandera: solo manda si no hay hechos posteriores)
 *   ETA cumplida → arribado
 *   ETD cargado → en tránsito si ya pasó, embarcado si es futuro
 *   sin fechas → el status viejo es la única pista; si tampoco, reservado
 */
export function fisicoDesdeEmbarque(s) {
  try {
    const sh = s || {}
    const st = String(sh.status || '').toLowerCase()
    const hoy = hoyISO()

    if (tildado(sh.devol_vacio_ok)) return fisico('entregado')
    if (/deliver|entreg/.test(st)) return fisico('entregado')
    if (tildado(sh.retiro_ok) || aISO(sh.retiro_real_fecha)) return fisico('retirado')
    if (aISO(sh.arribo_real)) return fisico('arribado')
    if (/cancel/.test(st)) return fisico('cancelado')

    const eta = aISO(sh.eta)
    if (eta && eta <= hoy) return fisico('arribado')

    const etd = aISO(sh.etd)
    if (etd) return fisico(etd <= hoy ? 'transito' : 'embarcado')

    if (/transit|tr[aá]nsito/.test(st)) return fisico('transito')
    if (/customs|aduana|arrib/.test(st)) return fisico('arribado')
    return fisico('reservado')
  } catch {
    return fisico('reservado')
  }
}

// Los rótulos viejos de Forwarding (embarque-form.jsx STATUSES) traducidos para
// mostrar. Se buscan en minúsculas y sin espacios repetidos porque en la base hay
// variantes tipeadas a mano.
const STATUS_VIEJO_ES = {
  'in transit': 'En tránsito',
  'delivered - paid': 'Entregado',
  'delivered - payment pending': 'Entregado',
  'delivered': 'Entregado',
  'cancelled': 'Cancelado',
  'canceled': 'Cancelado',
  'booked': 'Reservado',
  'customs': 'Arribado',
}

/** Traduce un status viejo de shipments; lo desconocido vuelve tal cual. */
export function labelStatusES(statusViejo) {
  if (statusViejo == null) return ''
  const s = String(statusViejo)
  const clave = s.trim().toLowerCase().replace(/\s+/g, ' ')
  return STATUS_VIEJO_ES[clave] || s
}

/** Entregado o cancelado: el eje físico ya no se mueve. Acepta un embarque, un
 *  resultado de fisicoDesdeEmbarque o directamente el id del estado. */
export function esCerradaFisica(s) {
  let id
  if (typeof s === 'string') id = s
  else if (s && typeof s.id === 'string' && FISICO_POR_ID[s.id] && !('status' in s) && !('bl' in s)) id = s.id
  else id = fisicoDesdeEmbarque(s).id
  return id === 'entregado' || id === 'cancelado'
}

// ─── Ejes de plata ───────────────────────────────────────────────────────────
// Los montos vienen como número (ya parseado) o como texto con la convención del
// proyecto: miles con punto y decimales con coma ("6.975,50"). Si ya tenés el
// número, pasalo como número: un string "1234.56" se leería como 123456.
function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const s = String(v ?? '').trim()
  if (!s) return 0
  const n = parseFloat(s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

const redondear = (n) => Math.round(n * 100) / 100

// Un mismo criterio para los cuatro libros: sin movimiento / parcial / completo.
// `saldo` viene de regalo para no recalcularlo en cada pantalla; `tone` es mudo
// cuando no hay nada que pagar ni pagado (no es deuda, es que no aplica).
function estadoLibro(total, movido, ids) {
  const t = num(total), m = num(movido)
  const saldo = redondear(t - m)
  if (m <= 0) return { ...ids.nada, tone: t <= 0 ? TONE.mudo : TONE.peligro, saldo }
  if (saldo <= 0) return { ...ids.completo, tone: TONE.ok, saldo }
  return { ...ids.parcial, tone: TONE.atencion, saldo }
}

const IDS_PAGO = {
  nada: { id: 'sin_pagar', label: 'Sin pagar' },
  parcial: { id: 'parcial', label: 'Pagado parcial' },
  completo: { id: 'pagado', label: 'Pagado' },
}
const IDS_COBRO = {
  nada: { id: 'sin_cobrar', label: 'Sin cobrar' },
  parcial: { id: 'parcial', label: 'Cobrado parcial' },
  completo: { id: 'cobrado', label: 'Cobrado' },
}

/** Lo que le debés a alguien (agente, despachante, Successi) vs. lo que ya pagaste. */
export function pagoDesdeSaldo(adeudado, recibido) {
  return estadoLibro(adeudado, recibido, IDS_PAGO)
}

/** Lo que te debe el cliente vs. lo que ya cobraste. */
export function cobroDesdeSaldo(aCobrar, cobrado) {
  return estadoLibro(aCobrar, cobrado, IDS_COBRO)
}

// ─── Eje aduana ──────────────────────────────────────────────────────────────
export const ESTADOS_ADUANA = [
  { id: 'sin_despacho', label: 'Sin despacho' },
  { id: 'carpeta', label: 'Carpeta enviada' },
  { id: 'oficializado', label: 'Oficializado' },
  { id: 'liberado', label: 'Liberado' },
  { id: 'bloqueado', label: 'Bloqueado' },
]

// ─── Estado manual de la operación ───────────────────────────────────────────
// Son los 9 rótulos que hoy se guardan en operations.estado (operaciones/page.jsx).
// El `label` es el valor exacto de la base; el `id` es un alias estable para
// comparar sin depender de tildes ni barras. No se cambian en esta etapa: el
// estado general derivado viene después y convive con estos.
export const ESTADOS_OP = [
  { id: 'consolidando', label: 'Consolidando' },
  { id: 'transito', label: 'En tránsito' },
  { id: 'arribado', label: 'Arribado' },
  { id: 'aduana', label: 'En aduana' },
  { id: 'listo_retiro', label: 'Listo p/ retiro' },
  { id: 'transito_local', label: 'En tránsito local' },
  { id: 'entregado', label: 'Entregado' },
  { id: 'liquidado', label: 'Liquidado' },
  { id: 'cancelado', label: 'Cancelado' },
]
