import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { getSessionInfo, requireWrite } from '@/lib/perms'
import { ensureSoftDelete, filtroVivos } from '@/lib/soft-delete'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BASE_FIELDS = [
  'bl', 'descripcion', 'estado', 'hon_regulares', 'adu_extras', 'otros_gastos', 'total_honorarios',
  'fecha_pago', 'pago_transferencia', 'pago_cash', 'total_pagado', 'comision', 'facturado', 'factura_nro', 'saldo', 'notas',
]

// Columnas agregadas después del alta original. Sin migraciones versionadas: se
// garantizan on-the-fly (PRAGMA + ALTER, mismo patrón que ensureCols en
// operations/[id]/detail) y si un ALTER falla se opera sin esa columna.
//   conceptos           JSON con el desglose factura/negro
//   operation_id        vínculo canónico con la operación (el B/L queda como
//                       referencia mientras dure la migración)
//   nro_oficializacion  ej. 26001IC04158745C → eje aduana "Oficializado"
//   canal               'verde' | 'naranja' | 'rojo' | ''
//   liberado_at         'YYYY-MM-DD' cuando están las 3 llaves (libramiento,
//                       B/L liberado, libre deuda) → eje aduana "Liberado"
const EXTRA_COLS: [string, string][] = [
  ['conceptos', `TEXT DEFAULT ''`],
  ['operation_id', 'TEXT DEFAULT NULL'],
  ['nro_oficializacion', `TEXT DEFAULT ''`],
  ['canal', `TEXT DEFAULT ''`],
  ['liberado_at', 'TEXT DEFAULT NULL'],
]
const CANALES = ['verde', 'naranja', 'rojo', '']

let colsListas: Promise<Record<string, boolean>> | null = null
function ensureCols(): Promise<Record<string, boolean>> {
  if (colsListas) return colsListas
  const p = (async () => {
    const out: Record<string, boolean> = {}
    try {
      const leer = async () => new Set((await d1Query<{ name: string }>(`PRAGMA table_info(despachante_pagos)`)).map(c => c.name))
      let have = await leer()
      let alterado = false
      for (const [col, decl] of EXTRA_COLS) {
        if (have.has(col)) continue
        alterado = true
        // Puede fallar porque otra ruta lo corrió en el mismo momento: se verifica abajo.
        try { await d1Exec(`ALTER TABLE despachante_pagos ADD COLUMN ${col} ${decl}`) } catch {}
      }
      if (alterado) have = await leer()
      for (const [col] of EXTRA_COLS) out[col] = have.has(col)
      const faltan = EXTRA_COLS.filter(([c]) => !out[c]).map(([c]) => c)
      if (faltan.length) console.warn(`[despachante] despachante_pagos sin las columnas ${faltan.join(', ')}; se opera sin ellas`)
    } catch (e) {
      for (const [col] of EXTRA_COLS) out[col] = false
      console.warn('[despachante] no se pudieron verificar las columnas:', (e as Error)?.message)
    }
    return out
  })()
  colsListas = p
  // Solo se cachea el éxito completo: si faltó alguna, se reintenta en el próximo request.
  p.then(out => { if (EXTRA_COLS.some(([c]) => !out[c])) colsListas = null })
  return p
}

const fieldsDe = (cols: Record<string, boolean>) => [...BASE_FIELDS, ...EXTRA_COLS.map(([c]) => c).filter(c => cols[c])]

// Mismo blNorm que el cliente: mayúsculas, sin espacios ni guiones. BL_SQL es la
// versión SQL para comparar contra columnas.
const blNorm = (s: unknown) => String(s || '').replace(/[\s-]/g, '').toUpperCase()
const BL_SQL = (col: string) => `upper(replace(replace(COALESCE(${col}, ''), ' ', ''), '-', ''))`

// Fallback de migración: mientras las pantallas viejas no manden operation_id,
// el B/L identifica la operación si (y solo si) matchea UNA operación viva, por
// operations.bl o por shipments.bl → operation_id. Con dos candidatas no se
// adivina: el que llama tiene que elegir.
async function operacionPorBL(bl: unknown): Promise<{ id: string | null; candidatas: string[] }> {
  const k = blNorm(bl)
  if (!k) return { id: null, candidatas: [] }
  const [vivosOps, vivosShips] = await Promise.all([ensureSoftDelete('operations'), ensureSoftDelete('shipments')])
  const ops = await d1Query<{ id: string }>(
    `SELECT id FROM operations WHERE ${BL_SQL('bl')} = ? AND ${filtroVivos(vivosOps)}`, [k]
  )
  const ships = await d1Query<{ operation_id: string }>(
    `SELECT DISTINCT operation_id FROM shipments WHERE COALESCE(operation_id, '') <> '' AND ${BL_SQL('bl')} = ? AND ${filtroVivos(vivosShips)}`, [k]
  )
  const ids = new Set<string>(ops.map(o => String(o.id)))
  for (const s of ships) {
    const id = String(s.operation_id)
    if (ids.has(id)) continue
    // El embarque puede apuntar a una operación borrada: no cuenta.
    const viva = await d1Query<{ id: string }>(`SELECT id FROM operations WHERE id = ? AND ${filtroVivos(vivosOps)}`, [id])
    if (viva.length) ids.add(id)
  }
  const candidatas = [...ids]
  return { id: candidatas.length === 1 ? candidatas[0] : null, candidatas }
}

export async function GET(request: Request) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const opId = url.searchParams.get('operation_id')
  const bl = url.searchParams.get('bl')
  const [cols, vivos] = await Promise.all([ensureCols(), ensureSoftDelete('despachante_pagos')])
  const f = fieldsDe(cols)

  // Sin filtros: la colección entera (menos la papelera). Con ?operation_id= se
  // lee por id; si además viene ?bl=, se suman los despachos viejos que todavía
  // no tienen operation_id y matchean por B/L (doble lectura de migración).
  const where = [filtroVivos(vivos)]
  const params: any[] = []
  if (opId && cols.operation_id) {
    if (bl) { where.push(`(operation_id = ? OR (COALESCE(operation_id, '') = '' AND ${BL_SQL('bl')} = ?))`); params.push(opId, blNorm(bl)) }
    else { where.push(`operation_id = ?`); params.push(opId) }
  } else if (bl) {
    where.push(`${BL_SQL('bl')} = ?`); params.push(blNorm(bl))
  } else if (opId) {
    where.push('0 = 1') // sin columna operation_id nada puede estar vinculado por id
  }
  const rows = await d1Query(
    `SELECT id, ${f.join(', ')}, updated_at FROM despachante_pagos WHERE ${where.join(' AND ')} ORDER BY id DESC`,
    params
  )
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  const g = await requireWrite('despachante')
  if (!g.ok) return g.res

  const url = new URL(request.url)
  const sinOperacion = url.searchParams.get('sinOperacion') === '1'
  const permitirSegundo = url.searchParams.get('permitirSegundo') === '1'
  const [cols, vivos] = await Promise.all([ensureCols(), ensureSoftDelete('despachante_pagos')])
  const body = await request.json()
  if (!String(body.descripcion || '').trim()) {
    return NextResponse.json({ error: 'La descripción es obligatoria' }, { status: 400 })
  }

  // Identidad canónica: el despacho cuelga de una operación. Si la pantalla no
  // mandó operation_id, se intenta por B/L (una sola operación viva); si no se
  // puede, 400 salvo ?sinOperacion=1 (la operación todavía no existe). Si la
  // columna no está disponible, se degrada: se guarda sin vínculo, como antes.
  let opId: string | null = String(body.operation_id || '').trim() || null
  if (!opId && !sinOperacion && cols.operation_id) {
    let res: { id: string | null; candidatas: string[] }
    try { res = await operacionPorBL(body.bl) } catch {
      return NextResponse.json({ error: 'No se pudo verificar la operación. Probá de nuevo.' }, { status: 500 })
    }
    if (res.candidatas.length > 1) {
      return NextResponse.json(
        { error: 'El B/L corresponde a más de una operación: elegí a cuál pertenece este despacho.', candidatas: res.candidatas },
        { status: 400 }
      )
    }
    if (!res.id) {
      return NextResponse.json(
        { error: 'Falta la operación: vinculá el despacho a una operación (o mandá ?sinOperacion=1 si todavía no existe).' },
        { status: 400 }
      )
    }
    opId = res.id
  }

  // Un despacho por operación, salvo que se pida explícitamente el segundo
  // (B/L con dos contenedores despachados por separado, por ejemplo).
  if (opId && cols.operation_id && !permitirSegundo) {
    const dup = await d1Query<{ id: number }>(
      `SELECT id FROM despachante_pagos WHERE operation_id = ? AND ${filtroVivos(vivos)} ORDER BY id DESC LIMIT 1`, [opId]
    )
    if (dup.length) return NextResponse.json({ error: 'Ya hay un despacho para esta operación', id: dup[0].id }, { status: 409 })
  }

  const canal = CANALES.includes(String(body.canal ?? '')) ? String(body.canal ?? '') : ''
  const f = fieldsDe(cols)
  const vals = f.map(col => {
    if (col === 'facturado') return body[col] ? 1 : 0
    if (col === 'operation_id') return opId
    if (col === 'liberado_at') return String(body.liberado_at || '').trim() || null
    if (col === 'canal') return canal
    if (col === 'nro_oficializacion') return String(body.nro_oficializacion ?? '').trim()
    return body[col] ?? ''
  })
  const res = await d1Exec(
    `INSERT INTO despachante_pagos (${f.join(', ')}, created_at, updated_at)
     VALUES (${f.map(() => '?').join(', ')}, datetime('now'), datetime('now'))`,
    vals
  )
  const created = await d1Query<any>(`SELECT id, ${f.join(', ')}, updated_at FROM despachante_pagos WHERE id = ?`, [res.lastRowId])
  return NextResponse.json(created[0] || { ok: true, id: res.lastRowId, operation_id: opId })
}
