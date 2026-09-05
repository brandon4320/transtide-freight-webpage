import { NextResponse } from 'next/server'
import { d1Exec, d1Batch, d1Query } from '@/lib/d1'
import { requireWrite, getSessionInfo, type SessionInfo } from '@/lib/perms'
import { auditar } from '@/lib/auditoria'
import { softDelete } from '@/lib/soft-delete'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Columnas agregadas después del alta original de `operations`. El proyecto no
// tiene migraciones versionadas: se garantizan on-the-fly (PRAGMA + ALTER dentro
// de un try, mismo patrón que detail/route.ts) y si el ALTER falla se degrada el
// guardado (se escribe sin ese campo) en vez de romper el PUT entero.
//  · cierre_json    → qué quedó abierto al marcar Liquidado y por cuánta plata
//  · successi_json  → reintegros a Successi Ing SA que el ledger no aceptó
const EXTRA_COLS: [string, string][] = [
  ['operations', 'cierre_json'],
  ['operations', 'successi_json'],
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
      // El ALTER puede fallar porque otra request lo corrió en el mismo momento
      // (columna duplicada): si la columna quedó, sirve igual.
      try {
        const info = await d1Query<{ name: string }>(`PRAGMA table_info(${table})`)
        out[col] = info.some(c => c.name === col)
      } catch { out[col] = false }
      if (!out[col]) console.warn(`[operations] no se pudo agregar ${table}.${col}; se guarda sin ese campo`)
    }
  }
  ready = out
  return out
}

// Fechas: se guardan SIEMPRE en ISO (yyyy-mm-dd), igual que el POST de la lista.
// Formato desconocido → se guarda tal cual (nunca se pierde el dato).
const toISODate = (v: unknown): string | null => {
  const s = String(v ?? '').trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const ar = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (ar) return `${ar[3]}-${ar[2].padStart(2, '0')}-${ar[1].padStart(2, '0')}`
  return s
}

// Estados que sacan la operación de la lista activa. Si una operación vuelve a
// un estado abierto, el acta de cierre deja de tener sentido y se limpia sola.
const ESTADOS_CERRADOS = ['Entregado', 'Liquidado', 'Cancelado']

// `id` reservado (las operaciones reales se crean como `op-<timestamp>`): trae de
// una sola vez el acta de cierre de TODAS las operaciones, para que la lista
// pueda marcar las cerradas con plata pendiente sin pedir una request por fila.
const CIERRES_ID = '__cierres'

type Pendiente = { id: string; label: string; detalle: string; monto: number }
type Cierre = {
  fecha: string; por: string; estado: string; checklist: string;
  completo: boolean; totalUsd: number; pendientes: Pendiente[];
}

const hoyISO = () => new Date().toISOString().slice(0, 10)
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

// Acta de cierre: qué condiciones quedaron sin cumplir y por cuánta plata.
// `completo` y `totalUsd` se derivan acá (no se confía en lo que mande el
// cliente) para que "cerrada sin pendientes" no pueda mentir.
function normalizeCierre(raw: any, s: SessionInfo): Cierre | null {
  if (!raw || typeof raw !== 'object') return null
  const pendientes: Pendiente[] = (Array.isArray(raw.pendientes) ? raw.pendientes : [])
    .slice(0, 20)
    .map((x: any) => ({
      id: String(x?.id || ''),
      label: String(x?.label || ''),
      detalle: String(x?.detalle || ''),
      monto: Math.max(0, r2(x?.monto)),
    }))
    .filter((x: Pendiente) => x.label)
  return {
    // Fecha y autor los estampa el servidor la primera vez; si la operación se
    // vuelve a guardar entera (el PUT manda el objeto completo) se conservan.
    fecha: String(raw.fecha || '') || hoyISO(),
    por: String(raw.por || '') || s.name || s.username || '',
    estado: String(raw.estado || 'Liquidado'),
    checklist: String(raw.checklist || ''),
    completo: pendientes.length === 0,
    totalUsd: r2(pendientes.reduce((a, b) => a + b.monto, 0)),
    pendientes,
  }
}

// Reintegros a Successi que se guardan en la operación. Es el plan B del ledger
// (/api/db/pagos con scope 'successi'): si esa ruta no acepta el scope, el
// reintegro se registra igual acá en vez de perderse.
function normalizeReintegros(raw: any, s: SessionInfo) {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 200).map((x: any, i: number) => ({
    id: String(x?.id || `loc-${Date.now()}-${i}`),
    fecha: String(x?.fecha || ''),
    monto: String(x?.monto ?? '').trim(),
    metodo: String(x?.metodo || ''),
    nota: String(x?.nota || ''),
    por: String(x?.por || '') || s.name || s.username || '',
    created_at: String(x?.created_at || '') || new Date().toISOString(),
  })).filter(x => x.monto)
}

function parseJson(raw: string | null | undefined): any {
  try {
    const j = JSON.parse(raw || '')
    return j && typeof j === 'object' ? j : null
  } catch { return null }
}

// ─── Auditoría y papelera ────────────────────────────────────────────────────
// Quién tocó qué: el PUT deja una línea de auditoría por campo que cambió (solo
// los que cambian, para no llenar la tabla) y el DELETE manda la fila a la
// papelera en vez de borrarla. Lo que cuelga de la operación (gastos,
// proveedores, checklist) NO se toca al borrar: por eso restaurar la devuelve
// entera. El borrado físico (?hard=1) es solo para la purga programada y exige
// que la fila lleve más de PAPELERA_DIAS en la papelera.
const PAPELERA_DIAS = 30
const usuarioDe = (s: SessionInfo) => s.name || s.username || ''

// Comparación tolerante para el diff: null/undefined/'' son lo mismo y los
// números se comparan por valor ('100' vs '100.0' no es un cambio).
const norm = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  const s = String(v).trim()
  if (s !== '' && /^-?\d+(\.\d+)?$/.test(s)) return String(Number(s))
  return s
}

async function auditarCambios(id: string, antes: Record<string, any>, campos: string[], vals: any[], usuario: string) {
  const tareas: Promise<void>[] = []
  campos.forEach((campo, i) => {
    if (norm(antes[campo]) === norm(vals[i])) return
    tareas.push(auditar({ entidad: 'operations', id, accion: 'editar', campo, antes: antes[campo] ?? null, despues: vals[i] ?? null, usuario }))
  })
  await Promise.all(tareas)
}

// Cumplió la cuarentena en la papelera (condición para el borrado físico).
function purgable(deletedAt: unknown): boolean {
  const t = Date.parse(String(deletedAt || ''))
  if (!isFinite(t)) return false
  return Date.now() - t >= PAPELERA_DIAS * 86400000
}

// lib/soft-delete acepta una foto previa opcional (queda en la auditoría para
// poder reconstruir la fila si algún día se purga); se tipa acá para no
// depender de que el contrato base la liste.
type SoftDeleteFn = (table: string, id: string | number, usuario: string, antes?: any) => Promise<void>

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const cols = await ensureCols()

  // Mapa { operation_id: cierre } de todas las operaciones cerradas con acta.
  if (id === CIERRES_ID) {
    if (!cols.cierre_json) return NextResponse.json({})
    try {
      const rows = await d1Query<{ id: string; cierre_json: string | null }>(
        `SELECT id, cierre_json FROM operations WHERE COALESCE(cierre_json, '') <> ''`
      )
      const out: Record<string, any> = {}
      for (const r of rows) { const c = parseJson(r.cierre_json); if (c) out[r.id] = c }
      return NextResponse.json(out)
    } catch {
      return NextResponse.json({})
    }
  }

  // Si algún ALTER falló, esa columna no se pide (evita romper el GET entero).
  const extra = (['cierre_json', 'successi_json'] as const).filter(c => cols[c]).map(c => `, ${c}`).join('')
  const rows = await d1Query<any>(
    `SELECT id, nombre, contenedor, bl, eta, m3, estado, fecha${extra} FROM operations WHERE id = ?`,
    [id]
  )
  if (!rows.length) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  const row = rows[0]
  const successi = parseJson(row.successi_json)
  return NextResponse.json({
    id: row.id,
    nombre: row.nombre || '',
    contenedor: row.contenedor || '',
    bl: row.bl || '',
    eta: row.eta || '',
    m3: row.m3 || '',
    estado: row.estado || '',
    fecha: row.fecha || '',
    cierre: parseJson(row.cierre_json),
    successiReintegros: Array.isArray(successi) ? successi : [],
  })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('operaciones')
  if (!g.ok) return g.res

  const { id } = await params
  const body = await request.json()
  const cols = await ensureCols()

  // Foto previa: alimenta el diff de la auditoría y evita editar una fila que no existe.
  const previas = await d1Query<any>(`SELECT * FROM operations WHERE id = ?`, [id])
  if (!previas.length) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  const antes = previas[0]

  // Update parcial: solo se tocan las columnas que vienen en el body. Los
  // llamados de siempre mandan la operación entera y se comportan igual que
  // antes; un PUT de "cerrar con condiciones" puede mandar solo estado+cierre
  // sin borrar el resto de la ficha.
  const sets: string[] = []
  const vals: any[] = []
  const campos: string[] = [] // columna de cada posición de `vals` (para el diff)
  const set = (col: string, v: any) => { sets.push(`${col} = ?`); vals.push(v); campos.push(col) }
  const put = (col: string, key: string) => {
    if (key in body) set(col, body[key] || null)
  }
  put('nombre', 'nombre')
  put('contenedor', 'contenedor')
  put('bl', 'bl')
  if ('eta' in body)   set('eta', toISODate(body.eta))
  put('m3', 'm3')
  put('estado', 'estado')
  if ('fecha' in body) set('fecha', toISODate(body.fecha))

  // --- Acta de cierre ---
  let cierre: Cierre | null | undefined
  if (cols.cierre_json) {
    // La operación vuelve a un estado abierto: el acta anterior ya no aplica y se
    // borra aunque el cliente la haya mandado de vuelta en el objeto completo.
    if ('estado' in body && !ESTADOS_CERRADOS.includes(String(body.estado || ''))) {
      cierre = null
      set('cierre_json', null)
    } else if ('cierre' in body) {
      cierre = normalizeCierre(body.cierre, g.s)
      set('cierre_json', cierre ? JSON.stringify(cierre) : null)
    }
  }

  // --- Reintegros a Successi (plan B del ledger) ---
  let reintegros: ReturnType<typeof normalizeReintegros> | undefined
  if ('successiReintegros' in body && cols.successi_json) {
    reintegros = normalizeReintegros(body.successiReintegros, g.s)
    set('successi_json', reintegros.length ? JSON.stringify(reintegros) : null)
  }

  if (sets.length) {
    await d1Exec(
      `UPDATE operations SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      [...vals, id]
    )
    await auditarCambios(id, antes, campos, vals, usuarioDe(g.s))
  }

  return NextResponse.json({
    ...body,
    id,
    ...('eta' in body ? { eta: toISODate(body.eta) || '' } : {}),
    ...(cierre !== undefined ? { cierre } : {}),
    ...(reintegros !== undefined ? { successiReintegros: reintegros } : {}),
  })
}

// Borrar = mandar a la papelera. Las tablas hijas (gastos, proveedores,
// categorías, checklist) quedan intactas y siguen colgando de la operación, así
// restaurar la devuelve completa. Con ?hard=1 se borra físicamente en cascada
// (D1 HTTP no aplica ON DELETE CASCADE), pero solo si ya pasó por la papelera y
// cumplió los 30 días: es el camino de la purga programada, no del botón Eliminar.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('operaciones')
  if (!g.ok) return g.res

  const { id } = await params
  const usuario = usuarioDe(g.s)
  const hard = new URL(request.url).searchParams.get('hard') === '1'

  const filas = await d1Query<any>(`SELECT * FROM operations WHERE id = ?`, [id])
  if (!filas.length) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  const fila = filas[0]

  if (hard) {
    if (!fila.deleted_at) {
      return NextResponse.json({ error: 'Para borrar definitivamente primero tiene que pasar por la papelera.' }, { status: 409 })
    }
    if (!purgable(fila.deleted_at)) {
      return NextResponse.json({ error: `Todavía no lleva ${PAPELERA_DIAS} días en la papelera.` }, { status: 409 })
    }
    await d1Batch([
      { sql: `DELETE FROM gastos WHERE operation_id = ?`, params: [id] },
      { sql: `DELETE FROM proveedores_op WHERE operation_id = ?`, params: [id] },
      { sql: `DELETE FROM custom_categories WHERE operation_id = ?`, params: [id] },
      { sql: `DELETE FROM checklist WHERE operation_id = ?`, params: [id] },
      { sql: `DELETE FROM operations WHERE id = ?`, params: [id] },
    ])
    await auditar({ entidad: 'operations', id, accion: 'borrar', campo: 'purga', antes: fila, despues: null, usuario })
    return NextResponse.json({ ok: true, id, purgada: true })
  }

  // Ya estaba en la papelera: no se vuelve a marcar ni a auditar.
  if (fila.deleted_at) return NextResponse.json({ ok: true, id, papelera: true, deleted_at: fila.deleted_at })

  try {
    // softDelete deja la línea de auditoría 'borrar' con la foto previa.
    await (softDelete as SoftDeleteFn)('operations', id, usuario, fila)
  } catch (e) {
    // Sin columnas de papelera no se cae a un DELETE real: un borrado
    // irreversible por accidente es justamente lo que se quiere evitar.
    console.warn('[operations] no se pudo mover a la papelera:', (e as Error)?.message)
    return NextResponse.json({ error: 'No se pudo mover a la papelera. No se borró nada.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id, papelera: true })
}
