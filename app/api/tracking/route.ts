import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { d1Query, d1Exec } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'

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

let retiroReady: boolean | null = null
async function ensureRetiroCols(): Promise<boolean> {
  if (retiroReady !== null) return retiroReady
  try {
    const info = await d1Query<{ name: string }>(`PRAGMA table_info(shipments)`)
    const have = new Set(info.map(c => c.name))
    for (const col of RETIRO_FIELDS) {
      if (have.has(col)) continue
      await d1Exec(`ALTER TABLE shipments ADD COLUMN ${col} TEXT DEFAULT NULL`)
    }
    retiroReady = true
  } catch {
    retiroReady = false
    console.warn('[tracking] no se pudieron agregar las columnas de retiro; se opera sin ellas')
  }
  return retiroReady
}

// Columnas realmente disponibles para leer/escribir (base + retiro si el ALTER anduvo).
async function allFields(): Promise<string[]> {
  return (await ensureRetiroCols()) ? [...FIELDS, ...RETIRO_FIELDS] : FIELDS
}

// Normaliza un B/L para comparación (igual que blNorm del cliente): mayúsculas, sin espacios ni guiones.
function blNorm(s: string) {
  return String(s || '').replace(/[\s-]/g, '').toUpperCase()
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const bl = url.searchParams.get('bl')
  const cols = await allFields()

  // Búsqueda puntual por B/L (evita traer toda la tabla solo para matchear 1 fila).
  if (bl != null) {
    const target = blNorm(bl)
    if (!target) return NextResponse.json({ shipments: [], count: 0 })
    const rows = await d1Query<any>(
      `SELECT id, ${cols.join(', ')} FROM shipments
       WHERE upper(replace(replace(bl, ' ', ''), '-', '')) = ? LIMIT 5`,
      [target]
    )
    return NextResponse.json({ shipments: rows, count: rows.length })
  }

  const rows = await d1Query(
    `SELECT id, ${cols.join(', ')} FROM shipments ORDER BY CAST(num AS INTEGER) DESC, id DESC`
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
  const setClause = fields.map(f => `${f} = ?`).join(', ')
  const values = fields.map(f => body[f] ?? null)
  await d1Exec(
    `UPDATE shipments SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
    [...values, id]
  )
  const rows = await d1Query<any>(`SELECT id, ${fields.join(', ')} FROM shipments WHERE id = ?`, [id])
  return NextResponse.json(rows[0] || { ok: true, id, ...body })
}
