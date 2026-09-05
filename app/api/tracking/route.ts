import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { d1Query, d1Exec } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'
import { ensureSoftDelete, filtroVivos } from '@/lib/soft-delete'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FIELDS = [
  'num', 'origen', 'destino', 'contenedores', 'modo', 'bl', 'carrier', 'etd', 'eta', 'status',
  'sea_freight_usd', 'other_fees_rmb', 'tc_rmb', 'other_fees_usd', 'discount_usd', 'total_usd', 'suppliers',
  'amount_due_usd', 'amount_rec_usd', 'balance_usd', 'payment_date', 'notes', 'agente', 'operation_id',
]

// ─── Bloque "Retiro y devolución" ────────────────────────────────────────────
// Los cuatro puntos donde el embarque empieza a costar plata por sorpresa:
// free time vencido, turno de terminal, canal rojo y detention por devolver el
// vacío tarde. Antes no existían como dato (todo se calculaba contra el ETA).
// Son la materia prima de las alertas de retiro/devolución.
//
// El proyecto no tiene migraciones versionadas: las columnas se garantizan
// on-the-fly con PRAGMA table_info + ALTER TABLE (mismo patrón que ensureCols
// en /api/db/operations/[id]/detail). Si el ALTER falla, se guarda SIN esos
// campos en vez de romper el alta/edición del embarque.
//
// Todo se guarda como TEXT, igual que el resto de la tabla:
//   arribo_real        'YYYY-MM-DD'  arribo real del buque/avión
//   free_time_dias     número en texto ('7', '14', '21'…)
//   free_time_hasta    'YYYY-MM-DD'  fecha límite (auto = arribo_real + días)
//   canal              'verde' | 'naranja' | 'rojo' | ''
//   retiro_real_fecha  'YYYY-MM-DD'  cuándo se retiró de verdad (arranca el vacío)
//   turno_retiro_fecha 'YYYY-MM-DD'  turno de retiro en terminal
//   turno_retiro_hora  'HH:MM'
//   retiro_ok          '1' | ''      contenedor efectivamente retirado
//   devol_vacio_fecha  'YYYY-MM-DD'  turno de devolución del vacío
//   devol_vacio_hora   'HH:MM'
//   devol_vacio_ok     '1' | ''      vacío efectivamente devuelto
// El orden importa un poco: retiro_real_fecha va antes que turno_retiro_fecha
// para que un lector por patrón de nombre agarre primero la fecha real.
const RETIRO_FIELDS = [
  'arribo_real', 'free_time_dias', 'free_time_hasta', 'canal',
  'retiro_real_fecha', 'turno_retiro_fecha', 'turno_retiro_hora', 'retiro_ok',
  'devol_vacio_fecha', 'devol_vacio_hora', 'devol_vacio_ok',
]

// ─── Identidad y archivo ─────────────────────────────────────────────────────
//   agente_id     → contactos.id (tipo agente). El texto libre `agente` sigue
//                   existiendo para lo viejo; el selector nuevo escribe los dos.
//   archivado_at  'YYYY-MM-DD' (o ISO). El embarque salió de la lista activa de
//                   Forwarding pero sigue en la ficha de su operación y en los
//                   totales históricos. Archivar NO es borrar (eso es deleted_at).
const EXTRA_FIELDS = ['agente_id', 'archivado_at']
const OPCIONALES = [...RETIRO_FIELDS, ...EXTRA_FIELDS]

let opcionalesListas: Promise<Set<string>> | null = null
function ensureOpcionales(): Promise<Set<string>> {
  if (opcionalesListas) return opcionalesListas
  const p = (async () => {
    const tiene = new Set<string>()
    try {
      const leer = async () => new Set((await d1Query<{ name: string }>(`PRAGMA table_info(shipments)`)).map(c => c.name))
      let have = await leer()
      let alterado = false
      for (const col of OPCIONALES) {
        if (have.has(col)) continue
        alterado = true
        // Puede fallar porque otra ruta lo corrió en el mismo momento (columna
        // duplicada): se verifica abajo en vez de dar por perdido.
        try { await d1Exec(`ALTER TABLE shipments ADD COLUMN ${col} TEXT DEFAULT NULL`) } catch {}
      }
      if (alterado) have = await leer()
      for (const col of OPCIONALES) if (have.has(col)) tiene.add(col)
      const faltan = OPCIONALES.filter(c => !tiene.has(c))
      if (faltan.length) console.warn(`[tracking] shipments sin las columnas ${faltan.join(', ')}; se opera sin ellas`)
    } catch (e) {
      console.warn('[tracking] no se pudieron verificar las columnas opcionales:', (e as Error)?.message)
    }
    return tiene
  })()
  opcionalesListas = p
  // Solo se cachea el éxito completo: si faltó alguna, se reintenta en el próximo request.
  p.then(t => { if (t.size !== OPCIONALES.length) opcionalesListas = null })
  return p
}

// Columnas realmente disponibles para leer/escribir (base + las opcionales que el ALTER dejó).
async function allFields(): Promise<string[]> {
  const tiene = await ensureOpcionales()
  return [...FIELDS, ...OPCIONALES.filter(c => tiene.has(c))]
}

// Normaliza un B/L para comparación (igual que blNorm del cliente): mayúsculas, sin espacios ni guiones.
function blNorm(s: string) {
  return String(s || '').replace(/[\s-]/g, '').toUpperCase()
}

const ORDEN = `ORDER BY CAST(num AS INTEGER) DESC, id DESC`

export async function GET(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const bl = url.searchParams.get('bl')
  const opId = url.searchParams.get('operation_id')
  const incluirArchivados = url.searchParams.get('incluirArchivados')
  const [cols, vivos] = await Promise.all([allFields(), ensureSoftDelete('shipments')])
  const sel = `SELECT id, ${cols.join(', ')} FROM shipments`
  const vivo = filtroVivos(vivos)

  // Búsqueda por operación (el vínculo real). Si la operación no tiene embarques
  // colgados por id y vino también el B/L, cae al match por B/L (migración).
  if (opId) {
    const rows = await d1Query<any>(`${sel} WHERE operation_id = ? AND ${vivo} ${ORDEN}`, [opId])
    if (rows.length || bl == null) return NextResponse.json({ shipments: rows, count: rows.length, por: 'operation_id' })
  }

  // Búsqueda puntual por B/L (evita traer toda la tabla solo para matchear 1 fila).
  if (bl != null) {
    const target = blNorm(bl)
    if (!target) return NextResponse.json({ shipments: [], count: 0, por: 'bl' })
    const rows = await d1Query<any>(
      `${sel} WHERE upper(replace(replace(bl, ' ', ''), '-', '')) = ? AND ${vivo} LIMIT 5`,
      [target]
    )
    return NextResponse.json({ shipments: rows, count: rows.length, por: 'bl' })
  }

  // Lista completa. Los archivados vienen igual, con archivado_at, para que la UI
  // los muestre colapsados; ?incluirArchivados=0 los deja afuera del lado del
  // servidor (=1 o ausente: se devuelven todos). Lo borrado (deleted_at) nunca.
  const soloActivos = incluirArchivados === '0' && cols.includes('archivado_at')
  const rows = await d1Query(
    `${sel} WHERE ${vivo}${soloActivos ? ' AND archivado_at IS NULL' : ''} ${ORDEN}`
  )
  return NextResponse.json({ shipments: rows, count: rows.length })
}

export async function POST(request: Request) {
  const g = await requireWrite('tracking')
  if (!g.ok) return g.res

  const body = await request.json()
  const fields = await allFields()
  const cols = fields.join(', ')
  const placeholders = fields.map(() => '?').join(', ')
  const params = fields.map(f => body[f] ?? null)

  const res = await d1Exec(
    `INSERT INTO shipments (${cols}, created_at, updated_at) VALUES (${placeholders}, datetime('now'), datetime('now'))`,
    params
  )
  const created = await d1Query(`SELECT id, ${cols} FROM shipments WHERE id = ?`, [res.lastRowId])
  return NextResponse.json(created[0] || { id: res.lastRowId, ...body })
}

// PUT sobre la colección con el id en el body. Es el camino que usa el formulario
// de embarque para editar: actualiza base + bloque de retiro en una sola pasada.
// El PUT de /api/tracking/[id] sigue existiendo intacto para los pagos (Forwarding
// y la ficha del B/L), que solo tocan los campos de plata.
export async function PUT(request: Request) {
  const g = await requireWrite('tracking')
  if (!g.ok) return g.res

  const body = await request.json()
  const id = body?.id
  if (!id && id !== 0) return NextResponse.json({ error: 'Falta el id del embarque.' }, { status: 400 })

  const fields = await allFields()
  // agente_id y archivado_at solo se tocan si vienen en el body: un PUT viejo que
  // no las conoce no las pisa con NULL (un embarque archivado seguiría archivado
  // después de editarlo desde el formulario).
  const aSetear = fields.filter(f => !EXTRA_FIELDS.includes(f) || body[f] !== undefined)
  const setClause = aSetear.map(f => `${f} = ?`).join(', ')
  const values = aSetear.map(f => body[f] ?? null)
  await d1Exec(
    `UPDATE shipments SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
    [...values, id]
  )
  const rows = await d1Query<any>(`SELECT id, ${fields.join(', ')} FROM shipments WHERE id = ?`, [id])
  return NextResponse.json(rows[0] || { ok: true, id, ...body })
}
