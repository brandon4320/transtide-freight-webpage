import { NextResponse } from 'next/server'
import { d1Query, d1Exec, d1Batch } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mapea el contType del cotizador → label de contenedor de operaciones
const CONT_LABEL: Record<string, string> = { '20': '20 Pies', '40hq': '40HQ', 'fr': 'Flat Rack', 'roro': 'RORO', 'bulk': 'Break Bulk' }

// Columnas agregadas después del alta original de las tablas. El proyecto no tiene
// migraciones versionadas: se garantizan on-the-fly (PRAGMA + ALTER dentro de un try,
// mismo patrón que operations/[id]/detail). Si un ALTER falla, la conversión sigue
// sin ese campo en vez de romperse.
const EXTRA_COLS: [string, string][] = [
  ['operations', 'ncm'],
  ['operations', 'mercaderia'],
  ['operations', 'cotizado_detalle'],
  ['proveedores_op', 'cobrar_extra'],
]
let ready: Record<string, boolean> | null = null
async function ensureCols(): Promise<Record<string, boolean>> {
  if (ready) return ready
  const out: Record<string, boolean> = {}
  for (const [table, col] of EXTRA_COLS) {
    try {
      const info = await d1Query<{ name: string }>(`PRAGMA table_info(${table})`)
      if (info.some(c => c.name === col)) { out[col] = true; continue }
      await d1Exec(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT DEFAULT NULL`)
      out[col] = true
    } catch {
      // El ALTER puede fallar porque otra ruta lo corrió en el mismo momento
      // (columna duplicada): si la columna quedó, sirve igual.
      try {
        const info = await d1Query<{ name: string }>(`PRAGMA table_info(${table})`)
        out[col] = info.some(c => c.name === col)
      } catch { out[col] = false }
      if (!out[col]) console.warn(`[convertir] no se pudo agregar ${table}.${col}; se convierte sin ese campo`)
    }
  }
  ready = out
  return out
}

// ─── helpers numéricos (espejo del cotizador) ────────────────────────────────
const n = (v: any) => {
  const x = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}
const r2 = (v: number) => Math.round(v * 100) / 100

/** % de la cotización; si el dato no viaja (cotización vieja) vale el default del cotizador. */
const pc = (d: any, k: string, def: number) => (d[k] === undefined || d[k] === null || d[k] === '' ? def : n(d[k]))

/**
 * ¿La percepción aplica? Igual que el restore del cotizador: sin el flag guardado
 * se asume que sí; pre-v2 el toggle solo tocaba el costo real, así que un % > 0
 * alcanzaba para que se cobrara.
 */
const aplica = (d: any, flag: string, pk: string, def: number) => {
  if (d[flag] === undefined) return true
  return d.arancelToggles === 'v2' ? !!d[flag] : (!!d[flag] || pc(d, pk, def) > 0)
}

/** Tributos aduaneros sobre una base declarada + flete (misma fórmula que el cotizador). */
function tributos(d: any, fobDeclarado: number, flete: number) {
  const seg = fobDeclarado * 0.01
  const cif = fobDeclarado + flete + seg
  const der = cif * (pc(d, 'pDer', 35) / 100)
  const tas = cif * (pc(d, 'pTas', 0) / 100)
  const biv = cif + der + tas
  const iva = biv * (pc(d, 'pIva', 21) / 100) // el IVA siempre se paga
  const ivaA = aplica(d, 'pagaIvaA', 'pIvaA', 20) ? biv * (pc(d, 'pIvaA', 20) / 100) : 0
  const gan = aplica(d, 'pagaGan', 'pGan', 6) ? biv * (pc(d, 'pGan', 6) / 100) : 0
  const iibb = aplica(d, 'pagaIIBB', 'pIIBB', 2.5) ? biv * (pc(d, 'pIIBB', 2.5) / 100) : 0
  return { seg, cif, der, tas, iva, ivaA, gan, iibb, total: der + tas + iva + ivaA + gan + iibb }
}

type Linea = { cat: string; desc: string; usd: number }

const EST = 'estimado s/cotización'

/**
 * Traduce la cotización a líneas de gasto de la operación.
 *
 * Se siembra el LADO REAL (lo que paga Transtide), que es lo que las categorías de
 * la operación representan. Todo va en USD **sin T.C.**: la cotización no tiene tipo
 * de cambio, y una línea con USD y sin T.C. no entra al total en pesos ni al
 * prorrateo (la operación ya la marca en ámbar como "USD s/TC"). O sea: el número
 * queda cargado para no volver a tipearlo, pero no se cuela como costo real hasta
 * que se le pone el T.C. de la factura verdadera.
 */
function estimar(modo: string, d: any) {
  const lineas: Linea[] = []
  const push = (cat: string, concepto: string, usd: number) => {
    if (usd > 0.005) lineas.push({ cat, desc: `${concepto} — ${EST}`, usd: r2(usd) })
  }

  let fleteR = 0
  let gasR = 0 // gastos locales reales (sin flete ni tributos)
  let gasC = 0 // los mismos gastos, cobrados al cliente
  let fleteC = 0

  if (modo === 'aereo') {
    fleteR = n(d.fleteRealInput)
    fleteC = n(d.fleteCliInput)
    const awb = n(d.awbReal), hand = n(d.handReal), ter = n(d.terReal), des = n(d.desReal), tra = n(d.traReal)
    push('fleteIntl', 'Flete aéreo', fleteR)
    push('naviera', 'AWB / aerolínea', awb)
    push('terminal', 'Handling', hand)
    push('terminal', 'Terminal / depósito fiscal', ter)
    push('despachante', 'Despachante', des)
    push('transporte', 'Transporte interno', tra)
    gasR = awb + hand + ter + des + tra
    gasC = n(d.awbCli) + n(d.handCli) + n(d.terCli) + n(d.desCli) + n(d.traCli)
  } else {
    const contType = d.contType || '40hq'
    const capM3 = n((d.contM3 || {})[contType])
    const costs = (d.contCosts || {})[contType] || {}
    const m3 = n(d.m3Merch)
    // Prorrateo por m³ ocupados en el contenedor, igual que el cotizador.
    const ratio = capM3 > 0 && m3 > 0 ? m3 / capM3 : 0
    fleteR = n(d.fleteRealInput) || n(costs.flete) * ratio
    fleteC = n(d.fleteCli)
    const des = n(costs.despachante) * ratio
    const ter = n(costs.terminal) * ratio
    const nav = n(costs.naviera) * ratio
    const log = n(costs.logistica) * ratio
    push('fleteIntl', 'Flete internacional', fleteR)
    push('naviera', 'Naviera', nav)
    push('terminal', 'Terminal', ter)
    push('despachante', 'Despachante', des)
    push('transporte', 'Logística interna', log)
    gasR = des + ter + nav + log
    gasC = n(d.gDes) + n(d.gTer) + n(d.gNav) + n(d.gLog)
  }

  // Tributos: se siembran como línea de VEP estimado. El VEP real (en pesos) se
  // carga después; el `tributosUSD` por proveedor se deja vacío a propósito, para
  // no cobrarle al cliente un estimado creyendo que es el VEP verdadero.
  const fobR = n(d.fobReal)
  const fobC = n(d.fobCliente)
  const fobDR = n(d.fobDecReal) || n(d.fobDecCli) || fobR
  const fobDC = n(d.fobDecCli) || fobC
  const tR = tributos(d, fobDR, fleteR)
  const tC = tributos(d, fobDC, fleteC)
  push('aduana', 'VEP tributos', tR.total)

  // Totales por categoría, para el cotejo "estimado vs real" del expediente.
  const cats: Record<string, number> = {}
  for (const l of lineas) cats[l.cat] = r2((cats[l.cat] || 0) + l.usd)
  const totalCostos = r2(lineas.reduce((s, l) => s + l.usd, 0))

  // Honorarios cotizados: % sobre el costo al cliente con piso en USD.
  const honPct = pc(d, 'pHon', 4)
  const honMin = d.pHonMin === undefined ? null : n(d.pHonMin)
  const totConC = fobC + (fleteC + tC.seg + tC.total) + gasC
  // Sin costo al cliente no hay honorarios (el mínimo no se cobra solo), igual que el cotizador.
  const honorarios = totConC > 0 ? Math.max(totConC * (honPct / 100), honMin ?? 0) : 0

  // Ganancia esperada, con la misma fórmula del cotizador (para comparar contra
  // la ganancia real de la operación cuando esté cerrada).
  let ganancia: number
  if (d.mode === 'personal') {
    const totConR = fobR + fleteR + tR.seg + tR.total + gasR
    const totSinR = totConR - tR.iva - tR.ivaA
    ganancia = totSinR * (pc(d, 'pMrg', 20) / 100)
  } else {
    const mAranc = tC.total - tR.total
    // Con sociedad del cliente los aranceles los paga él: no hay margen arancelario.
    const mArancEff = d.usaSociedadPropia ? 0 : mAranc
    ganancia = (fobC - fobR) + (fleteC - fleteR) + mArancEff + (gasC - gasR) + honorarios
  }

  return { lineas, cats, totalCostos, honPct, honMin, ganancia: r2(ganancia) }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('cotizador')
  if (!g.ok) return g.res

  const { id } = await params
  const rows = await d1Query<any>(`SELECT * FROM cotizaciones WHERE id = ?`, [id])
  if (rows.length === 0) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
  const q = rows[0]

  // Si ya fue convertida, devolver la operación existente
  if (q.operation_id) {
    const ex = await d1Query<any>(`SELECT id FROM operations WHERE id = ?`, [q.operation_id])
    if (ex.length) return NextResponse.json({ operationId: q.operation_id, alreadyConverted: true })
  }

  const cols = await ensureCols()

  let data: any = {}
  try { data = JSON.parse(q.data || '{}') } catch {}

  const modo = q.modo || 'maritimo'
  const cliente = (data.cliente || q.cliente || q.nombre || 'Cliente').toString()
  const contenedor = modo === 'aereo' ? 'Aéreo' : (CONT_LABEL[data.contType] || '40HQ')
  const m3 = modo === 'aereo' ? (data.m3Input || '') : (data.m3Merch || '')
  const fob = (data.fobReal || data.fobCliente || '').toString()
  const ncm = (data.clasificacion || '').toString().trim()
  const mercaderia = (data.descripcion || '').toString().trim()

  const opId = 'op-' + Date.now()
  const nombre = (q.nombre || cliente).toString()

  // 1) Crear la operación (guardando el precio cotizado al cliente + el vínculo a la cotización)
  await d1Exec(
    `INSERT INTO operations (id, nombre, contenedor, bl, eta, m3, estado, fecha, puerto_origen, cotizacion_id, total_cotizado_usd, created_at, updated_at)
     VALUES (?, ?, ?, '', '', ?, 'Consolidando', ?, '', ?, ?, datetime('now'), datetime('now'))`,
    [opId, nombre, contenedor, m3, new Date().toLocaleDateString('es-AR'), id, q.total_usd || null]
  )

  // 2) Buscar si el cliente existe en la tabla clientes (para vincular)
  let clienteId: string | null = null
  if (cliente) {
    const cl = await d1Query<any>(`SELECT id FROM clientes WHERE lower(nombre) = ? LIMIT 1`, [cliente.toLowerCase()])
    if (cl.length) clienteId = cl[0].id
  }

  // 3) Sembrar el expediente con lo que la cotización YA tiene cargado.
  //    Todo esto es un extra: si algo falla, la operación queda creada igual.
  const est = estimar(modo, data)
  let sembrado = 0
  try {
    // 3a) NCM + descripción de la mercadería (el dato que más plata cuesta cuando
    //     el despacho sale distinto a lo declarado).
    const sets: string[] = []
    const ps: any[] = []
    if (cols.ncm) { sets.push('ncm = ?'); ps.push(ncm || null) }
    if (cols.mercaderia) { sets.push('mercaderia = ?'); ps.push(mercaderia || null) }
    if (cols.cotizado_detalle) {
      sets.push('cotizado_detalle = ?')
      ps.push(JSON.stringify({
        v: 1,
        modo,
        mode: data.mode === 'personal' ? 'personal' : 'cliente',
        cotizacionId: id,
        generado: new Date().toISOString().slice(0, 10),
        m3: m3 || '',
        cats: est.cats,
        totalCostosUsd: est.totalCostos,
        honPct: est.honPct,
        honMin: est.honMin,
        gananciaUsd: est.ganancia,
        precioClienteUsd: q.total_usd != null ? n(q.total_usd) : null,
      }))
    }
    if (sets.length) {
      await d1Exec(`UPDATE operations SET ${sets.join(', ')} WHERE id = ?`, [...ps, opId])
    }

    // 3b) Los costos cotizados, como líneas estimadas en su categoría.
    const pos: Record<string, number> = {}
    const stmts = est.lineas.map(l => {
      const i = pos[l.cat] || 0
      pos[l.cat] = i + 1
      return {
        sql: `INSERT OR REPLACE INTO gastos (operation_id, categoria, position, descripcion, factura, usd, tc, pesos, created_at)
              VALUES (?, ?, ?, ?, '', ?, '', '', datetime('now'))`,
        params: [opId, l.cat, i, l.desc, String(l.usd)],
      }
    })
    if (stmts.length) await d1Batch(stmts)
    sembrado = stmts.length
  } catch (e) {
    console.warn('[convertir] no se pudo sembrar la operación con la cotización:', e)
  }

  // 4) Crear el proveedor inicial (el cliente de la cotización) con FOB, m³ y los
  //    honorarios ya activados con el mínimo cotizado. Los defaults de giro (1,5% +
  //    USD 45) quedan puestos para no tipearlos si después se usa el servicio.
  const honActivo = data.mode === 'personal' ? 0 : 1
  const extra: Record<string, string | boolean> = { giroPct: '1.5', giroFijo: '45' }
  if (honActivo) {
    extra.honPct = String(est.honPct)
    // honMin null = cotización vieja sin mínimo → se usa el default de la casa.
    const min = est.honMin === null ? 500 : est.honMin
    if (min > 0) extra.honMin = String(min)
  }
  await d1Exec(
    `INSERT INTO proveedores_op (operation_id, position, nombre, tipo, cliente_id, m3, fob_usd, gastos_origen_usd, tributos_usd, tributos_tc, cobrar_tc, honorarios, desp_adic, cobrado, fecha_cobro${cols.cobrar_extra ? ', cobrar_extra' : ''}, created_at)
     VALUES (?, 0, ?, 'Cliente', ?, ?, ?, '', '', '', '', ?, '', 0, ''${cols.cobrar_extra ? ', ?' : ''}, datetime('now'))`,
    [opId, cliente, clienteId, m3, fob, honActivo, ...(cols.cobrar_extra ? [JSON.stringify(extra)] : [])]
  )

  // 5) Vincular la cotización a la operación + marcar aprobada
  await d1Exec(
    `UPDATE cotizaciones SET operation_id = ?, estado = 'aprobada', updated_at = datetime('now') WHERE id = ?`,
    [opId, id]
  )

  return NextResponse.json({
    operationId: opId,
    nombre,
    contenedor,
    ncm,
    lineasEstimadas: sembrado,
    estimadoUsd: est.totalCostos,
  })
}
