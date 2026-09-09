'use client'

// Importar la planilla de Bruce (ContainerTracker .xlsx) a Forwarding.
//
// Tres pasos en un modal Flat:
//   1. elegir el archivo (o arrastrarlo)
//   2. parseo en el navegador: hoja BOOKINGS (o la primera con columna B/L),
//      encabezados por nombre, importes en formato inglés → es-AR, fechas → ISO
//   3. diff contra el sistema (POST /api/tracking/importar): nuevos / cambios /
//      iguales, con casillas; "Aplicar N cambios" → POST /api/tracking/importar/aplicar
//
// Nada se guarda hasta apretar Aplicar. El servidor nunca borra ni vacía campos.
//
// Uso: <ImportarPlanilla onClose={() => …} onAplicado={(res) => recargar()} />

import { useEffect, useMemo, useRef, useState } from 'react'
import { gToast } from './toast'
import { labelStatusES } from './estados'
import { Casilla } from './seleccion-multiple'

// ─── Estilos (Transtide Flat) ────────────────────────────────────────────────
const OVERLAY = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }
const PANEL = { background: '#fff', borderRadius: 12, padding: '1.5rem 1.75rem', width: '100%', maxWidth: 760, boxSizing: 'border-box', maxHeight: '92vh', display: 'flex', flexDirection: 'column', outline: 'none' }
const TITULO = { fontSize: '1.02rem', fontWeight: 600, color: '#111827', margin: 0, lineHeight: 1.3 }
const SUBTITULO = { fontSize: '0.78rem', color: '#6b7280', margin: '4px 0 0', lineHeight: 1.5 }
const TXT = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 500, color: '#6b7280' }
const PRIMARIO = { background: '#111827', color: '#fff', border: 'none', borderRadius: 6, padding: '0.55rem 1.05rem', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }
const NUM = { fontVariantNumeric: 'tabular-nums' }
const SECCION = { fontSize: '0.68rem', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.04em', textTransform: 'uppercase', margin: '1.1rem 0 0.35rem' }
const FILA = { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.55rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.78rem', color: '#111827' }

// ─── Modelo de la planilla ───────────────────────────────────────────────────
// Encabezado normalizado (mayúsculas, sin puntuación) → campo del sistema.
// Se aceptan variantes porque la planilla la editan dos personas.
const ALIAS = {
  '#': 'num', 'NO': 'num', 'N': 'num', 'NUM': 'num', 'NUMBER': 'num', 'ID': 'num',
  'ORIGIN PORT': 'origen', 'ORIGIN': 'origen', 'POL': 'origen', 'FROM': 'origen',
  'DESTINATION': 'destino', 'DESTINATION PORT': 'destino', 'POD': 'destino', 'TO': 'destino',
  'CONTAINERS': 'contenedores', 'CONTAINER': 'contenedores', 'CONTAINER NO': 'contenedores', 'CNTR': 'contenedores',
  'MODE': 'modo', 'TYPE': 'modo',
  'B L NUMBER': 'bl', 'B L': 'bl', 'BL': 'bl', 'BL NUMBER': 'bl', 'B L NO': 'bl', 'BL NO': 'bl', 'HBL': 'bl', 'MBL': 'bl',
  'CARRIER': 'carrier', 'SHIPPING LINE': 'carrier', 'LINE': 'carrier',
  'SHIPPED ON BOARD': 'etd', 'ETD': 'etd', 'SOB': 'etd', 'ON BOARD': 'etd',
  'ETA': 'eta', 'ARRIVAL': 'eta',
  'STATUS': 'status',
  'SEA FREIGHT USD': 'sea_freight_usd', 'SEA FREIGHT': 'sea_freight_usd', 'FREIGHT USD': 'sea_freight_usd', 'AIR FREIGHT USD': 'sea_freight_usd', 'FREIGHT': 'sea_freight_usd',
  'OTHER FEES RMB': 'other_fees_rmb', 'OTHER FEE RMB': 'other_fees_rmb', 'FEES RMB': 'other_fees_rmb',
  'OTHER FEES USD': 'other_fees_usd', 'OTHER FEE USD': 'other_fees_usd', 'FEES USD': 'other_fees_usd',
  'DISCOUNT USD': 'discount_usd', 'DISCOUNT': 'discount_usd',
  'TOTAL USD': 'total_usd', 'TOTAL': 'total_usd',
  'SUPPLIERS': 'suppliers', 'SUPPLIER': 'suppliers',
  'AMOUNT DUE USD': 'amount_due_usd', 'AMOUNT DUE': 'amount_due_usd',
  'AMOUNT REC USD': 'amount_rec_usd', 'AMOUNT RECEIVED USD': 'amount_rec_usd', 'AMOUNT REC': 'amount_rec_usd', 'AMOUNT RECEIVED': 'amount_rec_usd', 'RECEIVED USD': 'amount_rec_usd',
  'BALANCE USD': 'balance_usd', 'BALANCE': 'balance_usd',
  'PAYMENT DATE': 'payment_date', 'PAID ON': 'payment_date',
  'NOTES': 'notes', 'NOTE': 'notes', 'REMARKS': 'notes',
  'AGENT': 'agente', 'AGENTE': 'agente', 'FORWARDER': 'agente',
}
const NUMERICOS = new Set(['sea_freight_usd', 'other_fees_rmb', 'other_fees_usd', 'discount_usd', 'total_usd', 'amount_due_usd', 'amount_rec_usd', 'balance_usd'])
const FECHAS = new Set(['etd', 'eta', 'payment_date'])

const CAMPO_LABEL = {
  num: 'Nº', origen: 'Origen', destino: 'Destino', contenedores: 'Contenedores', modo: 'Modo', bl: 'B/L',
  carrier: 'Naviera', etd: 'Embarcado (ETD)', eta: 'Llegada (ETA)', status: 'Estado',
  sea_freight_usd: 'Flete (USD)', other_fees_rmb: 'Otros gastos (RMB)', other_fees_usd: 'Otros gastos (USD)',
  discount_usd: 'Descuento (USD)', total_usd: 'Total (USD)', suppliers: 'Proveedores',
  amount_due_usd: 'A pagar (USD)', amount_rec_usd: 'Pagado (USD)', balance_usd: 'Saldo (USD)',
  payment_date: 'Fecha de pago', notes: 'Notas', agente: 'Agente',
}

// Estados viejos de la tabla shipments (se guardan en inglés; la pantalla los
// traduce con labelStatusES). La planilla los escribe con variantes.
const STATUS_CANON = {
  intransit: 'In Transit', transit: 'In Transit', shipped: 'In Transit', onboard: 'In Transit',
  deliveredpaymentpending: 'Delivered - Payment Pending', deliveredpending: 'Delivered - Payment Pending', paymentpending: 'Delivered - Payment Pending',
  deliveredpaid: 'Delivered - Paid', paid: 'Delivered - Paid',
  cancelled: 'Cancelled', canceled: 'Cancelled',
  booked: 'Booked', booking: 'Booked',
  customs: 'Customs', arrived: 'Customs',
}

const normHeader = (h) => String(h ?? '').toUpperCase().replace(/[^A-Z0-9#]+/g, ' ').trim()
const blNorm = (b) => String(b ?? '').replace(/[\s-]/g, '').toUpperCase()

// ─── Números ─────────────────────────────────────────────────────────────────
// numAR: lee un string es-AR ("6.580" / "2.182,97") como número; null si no hay nada.
function numAR(v) {
  const t = String(v ?? '').trim()
  if (!t) return null
  const n = parseFloat(t.replace(/[^\d,.\-]/g, '').replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}

// fmtAR: número → string es-AR con punto de miles y coma decimal (máx. 2 decimales).
// Sin depender del locale del navegador para que el resultado sea siempre el mismo.
export function fmtAR(n) {
  if (typeof n !== 'number' || !isFinite(n)) return ''
  const r = Math.round(n * 100) / 100
  const abs = Math.abs(r)
  let [ent, dec] = abs.toFixed(2).split('.')
  dec = dec.replace(/0+$/, '')
  ent = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return (r < 0 ? '-' : '') + ent + (dec ? ',' + dec : '')
}

// parseNumLoose: lee un texto numérico en formato inglés O es-AR.
// Regla: si hay dos separadores distintos, el último es el decimal. Si hay uno
// solo y lo siguen exactamente 3 dígitos, es de miles (en cualquiera de los dos
// idiomas: "6,580" y "6.580" son 6580); si lo siguen 1, 2 o 4+ dígitos, es decimal.
// Excepción: "0.500" / "0,500" es decimal (0,5): nadie escribe cero mil así.
function parseNumLoose(s) {
  let t = String(s ?? '').trim()
  if (!t) return null
  let neg = false
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1) }
  t = t.replace(/[^\d.,\-]/g, '')
  if (t.startsWith('-')) { neg = !neg }
  t = t.replace(/-/g, '')
  if (!/\d/.test(t)) return null
  const iDot = t.lastIndexOf('.'), iComma = t.lastIndexOf(',')
  let ent, dec = ''
  if (iDot >= 0 && iComma >= 0) {
    const i = Math.max(iDot, iComma)
    ent = t.slice(0, i).replace(/[.,]/g, '')
    dec = t.slice(i + 1).replace(/[.,]/g, '')
  } else if (iDot >= 0 || iComma >= 0) {
    const sep = iDot >= 0 ? '.' : ','
    const partes = t.split(sep)
    const cabeza = partes[0], cola = partes[partes.length - 1]
    if (partes.length > 2) ent = partes.join('')
    else if (cola.length === 3 && cabeza !== '' && cabeza !== '0') ent = cabeza + cola
    else { ent = cabeza; dec = cola }
  } else ent = t
  const n = parseFloat((ent || '0') + (dec ? '.' + dec : ''))
  if (isNaN(n)) return null
  return neg ? -n : n
}

// toAR: cualquier valor de la planilla → string es-AR que numUSD() del sistema
// vuelve a leer bien. Casos de prueba (entrada → salida):
//   6580             → '6.580'
//   6580.5           → '6.580,5'
//   2182.97          → '2.182,97'
//   0                → '0'
//   '6,580'          → '6.580'          (inglés: coma de miles)
//   '6,580.00'       → '6.580'
//   '2,182.97'       → '2.182,97'
//   '1,234,567.89'   → '1.234.567,89'
//   '6.580'          → '6.580'          (ya es-AR: punto + 3 dígitos = miles)
//   '2.182,97'       → '2.182,97'       (ya es-AR)
//   '1.234.567,89'   → '1.234.567,89'
//   '6580'           → '6.580'
//   '6,58'           → '6,58'           (coma + 2 dígitos = decimal)
//   '0.5' / '0,5'    → '0,5'
//   '0.500'          → '0,5'
//   '$ 6,580.00'     → '6.580'
//   'USD 1,200'      → '1.200'
//   '-500'           → '-500'
//   '(500)'          → '-500'
//   '' / null / '-' / 'n/a' / 'TBD' → ''
export function toAR(v) {
  if (v == null) return ''
  if (typeof v === 'number') return fmtAR(v)
  if (typeof v === 'boolean') return ''
  const t = String(v).trim()
  if (!t || /^(-+|—|n\/?a|na|tbd|tba|pending)$/i.test(t)) return ''
  const n = parseNumLoose(t)
  return n == null ? '' : fmtAR(n)
}

// ─── Fechas ──────────────────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`

// Serial de Excel (sistema 1900) → YYYY-MM-DD. 45870 → 2025-08-01.
function serialExcelAISO(n) {
  const ms = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000
  const d = new Date(ms)
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

// toISO: Date de Excel, serial, 'YYYY-M-D', 'D/M/YYYY' (o 'M/D/YYYY' si el primer
// número pasa de 12), 'Aug 14, 2025'… → 'YYYY-MM-DD'. Si no se entiende, devuelve
// el texto tal cual (se ve en el diff; nunca esconde el dato).
export function toISO(v) {
  if (v == null || v === '') return ''
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : iso(v.getFullYear(), v.getMonth() + 1, v.getDate())
  if (typeof v === 'number') return v > 20000 && v < 80000 ? serialExcelAISO(v) : String(v)
  const t = String(v).trim()
  if (!t || /^(-+|—|n\/?a|na|tbd|tba)$/i.test(t)) return ''
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (m) {
    let a = +m[1], b = +m[2], y = +m[3]
    if (y < 100) y += 2000
    // Convención es-AR día/mes; si el primero no puede ser mes, es mes/día (planilla en inglés).
    const [d, mo] = a > 12 ? [a, b] : b > 12 ? [b, a] : [a, b]
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return iso(y, mo, d)
    return t
  }
  const p = Date.parse(t)
  if (!isNaN(p)) { const d = new Date(p); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()) }
  return t
}

// ─── Estado ──────────────────────────────────────────────────────────────────
function statusCanon(v, fila) {
  const t = String(v ?? '').trim()
  if (!t) return ''
  const k = t.toLowerCase().replace(/[^a-z]/g, '')
  if (STATUS_CANON[k]) return STATUS_CANON[k]
  if (k === 'delivered') {
    // "Delivered" a secas: se decide por la plata.
    const due = numAR(fila.amount_due_usd) ?? 0, bal = numAR(fila.balance_usd)
    return due > 0 && bal != null && Math.abs(bal) < 0.005 ? 'Delivered - Paid' : 'Delivered - Payment Pending'
  }
  return t
}

// ─── Parseo del workbook ─────────────────────────────────────────────────────
// Devuelve { hoja, filas, sinBl, total, columnas } o tira un Error con mensaje en español.
export function parsearWorkbook(XLSX, data) {
  let wb
  try { wb = XLSX.read(data, { type: 'array', cellDates: false }) } catch { throw new Error('No pude leer el archivo. ¿Es un .xlsx?') }
  const nombres = wb.SheetNames || []
  if (!nombres.length) throw new Error('El archivo no tiene hojas.')

  const detectar = (nombre) => {
    const ws = wb.Sheets[nombre]
    if (!ws) return null
    const grilla = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' })
    let mejor = null
    for (let r = 0; r < Math.min(grilla.length, 40); r++) {
      const fila = grilla[r] || []
      const mapa = {}
      let hits = 0
      fila.forEach((celda, c) => {
        const campo = ALIAS[normHeader(celda)]
        if (campo && mapa[campo] == null) { mapa[campo] = c; hits++ }
      })
      if (hits >= 3 && (!mejor || (mapa.bl != null && mejor.mapa.bl == null))) mejor = { r, mapa, hits }
      if (mejor && mejor.mapa.bl != null && hits <= mejor.hits && r > mejor.r) break
    }
    return mejor ? { nombre, grilla, ...mejor } : null
  }

  const bookings = nombres.find(n => String(n).trim().toUpperCase() === 'BOOKINGS')
  let hoja = bookings ? detectar(bookings) : null
  if (!hoja || hoja.mapa.bl == null) {
    for (const n of nombres) { const d = detectar(n); if (d && d.mapa.bl != null) { hoja = d; break } }
  }
  if (!hoja) throw new Error('No encontré una fila de encabezados conocida (B/L NUMBER, ORIGIN PORT, ETA…).')
  if (hoja.mapa.bl == null) throw new Error(`La hoja ${hoja.nombre} no tiene columna B/L.`)

  const filas = []
  let sinBl = 0, total = 0
  for (let r = hoja.r + 1; r < hoja.grilla.length; r++) {
    const fila = hoja.grilla[r] || []
    const vacia = fila.every(c => c === '' || c == null)
    if (vacia) continue
    total++
    const obj = {}
    for (const campo of Object.keys(hoja.mapa)) {
      const v = fila[hoja.mapa[campo]]
      if (NUMERICOS.has(campo)) obj[campo] = toAR(v)
      else if (FECHAS.has(campo)) obj[campo] = toISO(v)
      else if (campo === 'num') obj[campo] = typeof v === 'number' ? String(Math.round(v)) : String(v ?? '').replace(/^#/, '').trim()
      else obj[campo] = typeof v === 'number' ? String(v) : String(v ?? '').trim()
    }
    if (!blNorm(obj.bl)) { sinBl++; continue }
    obj.status = statusCanon(obj.status, obj)

    // Plata: si la planilla dice pagado y no trae recibido, recibido = adeudado y
    // saldo 0; si dice pendiente, saldo = adeudado − recibido. Si no trae saldo,
    // se calcula. Nunca se inventa el adeudado.
    const due = numAR(obj.amount_due_usd), rec = numAR(obj.amount_rec_usd), bal = numAR(obj.balance_usd)
    if (obj.status === 'Delivered - Paid' && due != null && rec == null) { obj.amount_rec_usd = fmtAR(due); obj.balance_usd = '0' }
    else if (obj.status === 'Delivered - Payment Pending' && due != null && bal == null) obj.balance_usd = fmtAR(due - (rec ?? 0))
    else if (due != null && bal == null) obj.balance_usd = fmtAR(due - (rec ?? 0))

    filas.push(obj)
  }
  return { hoja: hoja.nombre, filas, sinBl, total, columnas: Object.keys(hoja.mapa) }
}

// ─── Componente ──────────────────────────────────────────────────────────────
export function ImportarPlanilla({ onClose, onAplicado }) {
  const [paso, setPaso] = useState(1)              // 1 archivo · 2 leyendo/comparando · 3 diff
  const [arrastrando, setArrastrando] = useState(false)
  const [error, setError] = useState('')
  const [lectura, setLectura] = useState(null)     // { nombre, hoja, total, sinBl, filas }
  const [diff, setDiff] = useState(null)           // respuesta de /api/tracking/importar
  const [selNuevos, setSelNuevos] = useState({})   // { [idx]: bool }
  const [selCampos, setSelCampos] = useState({})   // { ['id|campo']: bool }
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)
  const panelRef = useRef(null)
  const cerrarRef = useRef(onClose)
  cerrarRef.current = onClose

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); cerrarRef.current && cerrarRef.current() } }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [busy])

  useEffect(() => { const t = setTimeout(() => { panelRef.current && panelRef.current.focus() }, 0); return () => clearTimeout(t) }, [])

  const cerrar = () => { if (!busy && onClose) onClose() }

  async function leerArchivo(file) {
    if (!file) return
    setError('')
    setPaso(2)
    try {
      // SheetJS es CommonJS: según el bundler (webpack/Turbopack) el namespace
      // llega directo o adentro de default. Se acepta cualquiera de los dos.
      const mod = await import('xlsx')
      const XLSX = mod && typeof mod.read === 'function' ? mod : (mod.default || mod)
      const data = new Uint8Array(await file.arrayBuffer())
      const r = parsearWorkbook(XLSX, data)
      if (!r.filas.length) throw new Error(`No encontré filas con B/L en la hoja ${r.hoja}.`)
      setLectura({ nombre: file.name, ...r })
      const res = await fetch('/api/tracking/importar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filas: r.filas }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'No pude comparar con el sistema.')
      setDiff(j)
      const sn = {}; (j.nuevos || []).forEach((_, i) => { sn[i] = true })
      const sc = {}; (j.cambios || []).forEach(c => c.campos.forEach(x => { sc[`${c.id}|${x.campo}`] = true }))
      setSelNuevos(sn); setSelCampos(sc)
      setPaso(3)
    } catch (e) {
      setError(e?.message || 'No pude leer la planilla.')
      setLectura(null); setDiff(null)
      setPaso(1)
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onDrop = (e) => {
    e.preventDefault(); setArrastrando(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) leerArchivo(f)
  }

  // ── Selección ────────────────────────────────────────────────────────────
  const nuevos = diff?.nuevos || []
  const cambios = diff?.cambios || []
  const nuevosSel = useMemo(() => nuevos.filter((_, i) => selNuevos[i]), [nuevos, selNuevos])
  const cambiosSel = useMemo(() => cambios
    .map(c => ({ id: c.id, campos: c.campos.filter(x => selCampos[`${c.id}|${x.campo}`]).map(x => ({ campo: x.campo, despues: x.despues })) }))
    .filter(c => c.campos.length), [cambios, selCampos])
  const total = nuevosSel.length + cambiosSel.length
  const nadaQueHacer = diff && nuevos.length === 0 && cambios.length === 0

  const marcarNuevos = (v) => { const s = {}; nuevos.forEach((_, i) => { s[i] = v }); setSelNuevos(s) }
  const marcarCambios = (v) => { const s = {}; cambios.forEach(c => c.campos.forEach(x => { s[`${c.id}|${x.campo}`] = v })); setSelCampos(s) }
  const marcarEmbarque = (c, v) => setSelCampos(s => { const n = { ...s }; c.campos.forEach(x => { n[`${c.id}|${x.campo}`] = v }); return n })

  async function aplicar() {
    if (busy || total === 0) return
    setBusy(true)
    try {
      const res = await fetch('/api/tracking/importar/aplicar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nuevos: nuevosSel.map(n => n.fila), cambios: cambiosSel }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'No se pudo aplicar la importación.')
      const partes = []
      if (j.insertados) partes.push(`${j.insertados} nuevo${j.insertados === 1 ? '' : 's'}`)
      if (j.actualizados) partes.push(`${j.actualizados} actualizado${j.actualizados === 1 ? '' : 's'}`)
      if (j.vinculadas) partes.push(`${j.vinculadas} vinculado${j.vinculadas === 1 ? '' : 's'} a su operación`)
      const omitidos = (j.omitidos || []).length
      gToast.success(partes.length ? `Planilla aplicada: ${partes.join(' · ')}${omitidos ? ` · ${omitidos} omitido${omitidos === 1 ? '' : 's'}` : ''}` : 'No había nada para aplicar.')
      if (j.errores?.length) gToast.error(`${j.errores.length} ítem${j.errores.length === 1 ? '' : 's'} con error: ${j.errores[0].error}`)
      onAplicado && onAplicado(j)
      onClose && onClose()
    } catch (e) {
      gToast.error(e?.message || 'No se pudo aplicar la importación.')
    } finally { setBusy(false) }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const mostrar = (campo, v) => {
    const t = String(v ?? '')
    if (!t) return <span style={{ color: '#9ca3af' }}>vacío</span>
    if (campo === 'status') return labelStatusES(t)
    return t
  }

  return (
    <div style={OVERLAY} onClick={() => { if (paso === 1) cerrar() }}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Importar planilla" aria-busy={busy || paso === 2 ? true : undefined} style={PANEL} onClick={e => e.stopPropagation()}>
        <div style={{ flex: '0 0 auto' }}>
          <h2 style={TITULO}>Importar planilla</h2>
          <p style={SUBTITULO}>
            {paso === 1 && 'Subí el ContainerTracker de Bruce (.xlsx). Nada se guarda hasta que apliques los cambios.'}
            {paso === 2 && (lectura ? `Leí ${lectura.filas.length} embarques de ${lectura.nombre} · comparando con el sistema…` : 'Leyendo la planilla…')}
            {paso === 3 && lectura && `Leí ${lectura.filas.length} embarque${lectura.filas.length === 1 ? '' : 's'} de ${lectura.nombre} · hoja ${lectura.hoja}.`}
          </p>
        </div>

        {/* Paso 1 · archivo */}
        {paso === 1 && (
          <div style={{ marginTop: '1.1rem' }}>
            <div
              onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={onDrop}
              style={{ border: `1px dashed ${arrastrando ? '#111827' : '#d1d5db'}`, borderRadius: 8, padding: '2rem 1rem', textAlign: 'center', background: arrastrando ? '#f8fafc' : '#fff' }}
            >
              <p style={{ fontSize: '0.82rem', color: '#111827', margin: 0 }}>Arrastrá el archivo acá</p>
              <p style={{ fontSize: '0.74rem', color: '#9ca3af', margin: '4px 0 0' }}>.xlsx, .xls o .csv · hoja BOOKINGS o la primera con columna B/L</p>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm,.csv" onChange={e => leerArchivo(e.target.files?.[0])} style={{ display: 'none' }} />
            </div>
            {error ? <p role="alert" style={{ fontSize: '0.78rem', color: '#dc2626', margin: '10px 0 0', lineHeight: 1.5 }}>{error}</p> : null}
            <p style={{ fontSize: '0.74rem', color: '#6b7280', margin: '12px 0 0', lineHeight: 1.5 }}>
              Los importes en formato inglés (6,580) se convierten a 6.580. Las filas sin B/L se ignoran. Los embarques nuevos se cargan a Bruce salvo que la planilla traiga una columna de agente.
            </p>
          </div>
        )}

        {/* Paso 2 · leyendo */}
        {paso === 2 && (
          <div style={{ marginTop: '1.5rem', fontSize: '0.78rem', color: '#6b7280' }}>Un momento…</div>
        )}

        {/* Paso 3 · diff */}
        {paso === 3 && diff && (
          <div style={{ marginTop: '0.9rem', overflowY: 'auto', flex: '1 1 auto', minHeight: 0, paddingRight: 2 }}>
            <p style={{ fontSize: '0.82rem', color: '#111827', margin: 0, ...NUM }}>
              <b style={{ fontWeight: 600 }}>{nuevos.length}</b> nuevo{nuevos.length === 1 ? '' : 's'} · <b style={{ fontWeight: 600 }}>{cambios.length}</b> con cambios · <b style={{ fontWeight: 600 }}>{diff.iguales}</b> igual{diff.iguales === 1 ? '' : 'es'}
            </p>
            <p style={{ fontSize: '0.74rem', color: '#6b7280', margin: '4px 0 0', lineHeight: 1.5, ...NUM }}>
              Los importes en formato inglés (6,580) se convierten a 6.580. Un valor vacío en la planilla no borra lo que ya está cargado.
              {lectura?.sinBl ? ` ${lectura.sinBl} fila${lectura.sinBl === 1 ? '' : 's'} sin B/L se ignoraron.` : ''}
              {diff.duplicadosPlanilla ? ` ${diff.duplicadosPlanilla} B/L repetido${diff.duplicadosPlanilla === 1 ? '' : 's'} en la planilla: vale la primera fila.` : ''}
            </p>
            {diff.ambiguos?.length ? (
              <p role="status" style={{ fontSize: '0.74rem', color: '#d97706', margin: '6px 0 0', lineHeight: 1.5 }}>
                {diff.ambiguos.length === 1 ? 'Un B/L tiene' : `${diff.ambiguos.length} B/L tienen`} más de un embarque en el sistema y no se tocan: {diff.ambiguos.map(a => a.bl).join(', ')}.
              </p>
            ) : null}

            {nadaQueHacer && (
              <p style={{ fontSize: '0.82rem', color: '#059669', margin: '1.25rem 0 0.5rem' }}>Todo igual: la planilla y el sistema coinciden.</p>
            )}

            {nuevos.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                  <p style={SECCION}>Nuevos · {nuevos.length}</p>
                  <button type="button" onClick={() => marcarNuevos(true)} style={{ ...TXT, fontSize: '0.68rem' }}>todos</button>
                  <button type="button" onClick={() => marcarNuevos(false)} style={{ ...TXT, fontSize: '0.68rem' }}>ninguno</button>
                </div>
                {nuevos.map((n, i) => {
                  const f = n.fila || {}
                  const tot = f.total_usd || f.amount_due_usd
                  return (
                    <div key={i} style={FILA}>
                      <span style={{ paddingTop: 2 }}><Casilla checked={!!selNuevos[i]} onChange={v => setSelNuevos(s => ({ ...s, [i]: v }))} label={`Importar ${f.bl}`} /></span>
                      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', alignItems: 'baseline' }}>
                          <span style={{ fontWeight: 600, ...NUM }}>{f.num ? `#${f.num}` : 'sin nº'}</span>
                          <span style={{ color: '#374151', ...NUM }}>{f.bl}</span>
                          {(f.origen || f.destino) && <span style={{ color: '#6b7280' }}>{f.origen || '?'} → {f.destino || '?'}</span>}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: '0.72rem', color: '#6b7280', marginTop: 2, ...NUM }}>
                          <span>{f.agente || 'Bruce'}</span>
                          {f.status && <span>{labelStatusES(f.status)}</span>}
                          {f.eta && <span>ETA {f.eta}</span>}
                          {tot && <span>USD {tot}</span>}
                          {f.suppliers && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{f.suppliers}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}

            {cambios.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                  <p style={SECCION}>Cambios · {cambios.length}</p>
                  <button type="button" onClick={() => marcarCambios(true)} style={{ ...TXT, fontSize: '0.68rem' }}>todos</button>
                  <button type="button" onClick={() => marcarCambios(false)} style={{ ...TXT, fontSize: '0.68rem' }}>ninguno</button>
                </div>
                {cambios.map(c => {
                  const marcados = c.campos.filter(x => selCampos[`${c.id}|${x.campo}`]).length
                  const todos = marcados === c.campos.length
                  return (
                    <div key={c.id} style={{ borderBottom: '1px solid #f1f5f9', padding: '0.55rem 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.78rem' }}>
                        <Casilla checked={todos} indeterminate={marcados > 0 && !todos} onChange={v => marcarEmbarque(c, v)} label={`Aplicar cambios de ${c.bl}`} />
                        <span style={{ fontWeight: 600, ...NUM }}>{c.num ? `#${c.num}` : 'sin nº'}</span>
                        <span style={{ color: '#374151', ...NUM }}>{c.bl}</span>
                        <span style={{ color: '#9ca3af', fontSize: '0.7rem', ...NUM }}>{c.campos.length} campo{c.campos.length === 1 ? '' : 's'}</span>
                      </div>
                      <div style={{ marginLeft: 25, marginTop: 4 }}>
                        {c.campos.map(x => {
                          const k = `${c.id}|${x.campo}`
                          return (
                            <div key={k} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '3px 0', fontSize: '0.74rem', flexWrap: 'wrap' }}>
                              <span style={{ position: 'relative', top: 2 }}><Casilla checked={!!selCampos[k]} onChange={v => setSelCampos(s => ({ ...s, [k]: v }))} label={`${CAMPO_LABEL[x.campo] || x.campo} de ${c.bl}`} /></span>
                              <span style={{ color: '#6b7280', minWidth: 130 }}>{CAMPO_LABEL[x.campo] || x.campo}</span>
                              <span style={{ color: '#9ca3af', textDecoration: 'line-through', ...NUM }}>{mostrar(x.campo, x.antes)}</span>
                              <span style={{ color: '#9ca3af' }}>→</span>
                              <span style={{ color: '#111827', fontWeight: 500, ...NUM }}>{mostrar(x.campo, x.despues)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}

        {/* Pie: un solo botón primario por pantalla */}
        <div style={{ flex: '0 0 auto', display: 'flex', gap: 22, justifyContent: 'flex-end', alignItems: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
          {paso === 3 && !nadaQueHacer && (
            <button type="button" onClick={() => { setDiff(null); setLectura(null); setError(''); setPaso(1) }} disabled={busy} style={{ ...TXT, marginRight: 'auto', cursor: busy ? 'default' : 'pointer' }}>Elegir otro archivo</button>
          )}
          <button type="button" onClick={cerrar} disabled={busy} style={{ ...TXT, cursor: busy ? 'default' : 'pointer' }}>{nadaQueHacer ? 'Cerrar' : 'Cancelar'}</button>
          {paso === 1 && (
            <button type="button" onClick={() => inputRef.current && inputRef.current.click()} style={PRIMARIO}>Elegir archivo</button>
          )}
          {paso === 3 && !nadaQueHacer && (
            <button
              type="button"
              onClick={aplicar}
              disabled={busy || total === 0}
              style={{ ...PRIMARIO, opacity: busy || total === 0 ? 0.5 : 1, cursor: busy || total === 0 ? 'default' : 'pointer', ...NUM }}
            >
              {busy ? 'Aplicando…' : `Aplicar ${total} cambio${total === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ImportarPlanilla
