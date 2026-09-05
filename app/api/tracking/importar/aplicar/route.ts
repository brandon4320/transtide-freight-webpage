import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'
import { auditar } from '@/lib/auditoria'
import { ensureSoftDelete, filtroVivos } from '@/lib/soft-delete'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── Importador de la planilla de Bruce · paso 2: APLICAR ────────────────────
// Recibe lo que el usuario dejó tildado en el diff (../route.ts) y lo escribe:
//   · nuevos  → INSERT en shipments (agente default 'Bruce'; si hay una única
//               operación viva con ese B/L, se vincula por operation_id)
//   · cambios → UPDATE solo de los campos aceptados, uno por uno
// Nunca borra ni vacía nada. Cada alta y cada campo cambiado queda en auditoría.
//
// Body:      { nuevos: [fila], cambios: [{ id, campos: [{ campo, despues }] }] }
// Respuesta: { insertados, actualizados, vinculadas, omitidos: [{ bl?, id?, motivo }], errores: [{ bl?, id?, error }] }

const CAMPOS = [
  'num', 'origen', 'destino', 'contenedores', 'modo', 'bl', 'carrier', 'etd', 'eta', 'status',
  'sea_freight_usd', 'other_fees_rmb', 'other_fees_usd', 'discount_usd', 'total_usd', 'suppliers',
  'amount_due_usd', 'amount_rec_usd', 'balance_usd', 'payment_date', 'notes', 'agente',
] as const
type Campo = typeof CAMPOS[number]
const CAMPOS_SET = new Set<string>(CAMPOS)

// Columnas del INSERT: las mismas que usa POST /api/tracking (sin el bloque de
// retiro, que la planilla no trae). tc_rmb y operation_id van explícitos.
const COLS_INSERT = [...CAMPOS, 'tc_rmb', 'operation_id']

const MAX_ITEMS = 3000

const blNorm = (s: any) => String(s ?? '').replace(/[\s-]/g, '').toUpperCase()
const BL_SQL = `upper(replace(replace(bl, ' ', ''), '-', ''))`

function sanear(raw: any): Record<Campo, string> {
  const f = {} as Record<Campo, string>
  for (const c of CAMPOS) f[c] = raw && raw[c] != null ? String(raw[c]).trim() : ''
  return f
}

export async function POST(request: Request) {
  const g = await requireWrite('tracking')
  if (!g.ok) return g.res
  const usuario = g.s.name || g.s.username || ''

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 }) }
  const nuevos: any[] = Array.isArray(body?.nuevos) ? body.nuevos : []
  const cambios: any[] = Array.isArray(body?.cambios) ? body.cambios : []
  if (!nuevos.length && !cambios.length) return NextResponse.json({ error: 'No hay nada para aplicar.' }, { status: 400 })
  if (nuevos.length + cambios.length > MAX_ITEMS) return NextResponse.json({ error: `Demasiados ítems (máximo ${MAX_ITEMS}).` }, { status: 400 })

  const vivosShip = await ensureSoftDelete('shipments')
  const whereVivos = filtroVivos(vivosShip)
  // operations puede no tener papelera todavía: se degrada a '1=1'.
  let whereOpsVivas = '1=1'
  try { whereOpsVivas = filtroVivos(await ensureSoftDelete('operations')) } catch {}

  let insertados = 0
  let actualizados = 0
  let vinculadas = 0
  const omitidos: { bl?: string; id?: number; motivo: string }[] = []
  const errores: { bl?: string; id?: number; error: string }[] = []

  // ── Nuevos ────────────────────────────────────────────────────────────────
  for (const raw of nuevos) {
    const fila = sanear(raw)
    const k = blNorm(fila.bl)
    if (!k) { omitidos.push({ bl: fila.bl, motivo: 'sin B/L' }); continue }
    try {
      // Doble clic, dos pestañas o una carga manual entre el diff y el aplicar:
      // si ya existe un embarque vivo con ese B/L, no se duplica.
      const ya = await d1Query<{ id: number }>(`SELECT id FROM shipments WHERE ${BL_SQL} = ? AND ${whereVivos} LIMIT 1`, [k])
      if (ya.length) { omitidos.push({ bl: fila.bl, motivo: 'ya existía en el sistema' }); continue }

      if (!fila.agente) fila.agente = 'Bruce'

      // Vínculo con la operación por B/L (solo si es única). Es un extra: si
      // falla, el embarque se crea igual sin operation_id, como hoy.
      let operationId: string | null = null
      try {
        const ops = await d1Query<{ id: any }>(`SELECT id FROM operations WHERE ${BL_SQL} = ? AND ${whereOpsVivas} LIMIT 2`, [k])
        if (ops.length === 1) operationId = String(ops[0].id)
      } catch {}

      const values = COLS_INSERT.map(c => {
        if (c === 'tc_rmb') return null
        if (c === 'operation_id') return operationId
        return fila[c as Campo]
      })
      const placeholders = COLS_INSERT.map(() => '?').join(', ')
      const res = await d1Exec(
        `INSERT INTO shipments (${COLS_INSERT.join(', ')}, created_at, updated_at) VALUES (${placeholders}, datetime('now'), datetime('now'))`,
        values
      )
      insertados++
      if (operationId) vinculadas++
      await auditar({
        entidad: 'shipments', id: res.lastRowId ?? fila.bl, accion: 'crear', campo: 'importar_planilla',
        despues: { ...fila, operation_id: operationId }, usuario,
      })
    } catch (e) {
      errores.push({ bl: fila.bl, error: (e as Error)?.message || 'error al insertar' })
    }
  }

  // ── Cambios ───────────────────────────────────────────────────────────────
  for (const c of cambios) {
    const id = Number(c?.id)
    if (!Number.isFinite(id)) { omitidos.push({ motivo: 'id inválido' }); continue }
    // Solo campos importables; nunca el B/L (es la llave del match) ni nada
    // fuera de la planilla (operation_id, tc_rmb, retiro…).
    const campos = (Array.isArray(c?.campos) ? c.campos : [])
      .filter((x: any) => x && CAMPOS_SET.has(String(x.campo)) && String(x.campo) !== 'bl')
      .map((x: any) => ({ campo: String(x.campo) as Campo, despues: x.despues == null ? '' : String(x.despues).trim() }))
    // Vacío nunca pisa: el diff tampoco lo propone, pero acá se vuelve a garantizar.
    const utiles = campos.filter((x: { despues: string }) => x.despues !== '')
    if (!utiles.length) { omitidos.push({ id, motivo: 'sin campos aceptados' }); continue }

    try {
      const antesRows = await d1Query<any>(`SELECT id, ${CAMPOS.join(', ')} FROM shipments WHERE id = ? AND ${whereVivos} LIMIT 1`, [id])
      const antes = antesRows[0]
      if (!antes) { omitidos.push({ id, motivo: 'el embarque ya no existe' }); continue }

      const setClause = utiles.map((x: { campo: string }) => `${x.campo} = ?`).join(', ')
      await d1Exec(
        `UPDATE shipments SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
        [...utiles.map((x: { despues: string }) => x.despues), id]
      )
      actualizados++
      for (const x of utiles) {
        await auditar({
          entidad: 'shipments', id, accion: 'editar', campo: x.campo,
          antes: antes[x.campo] == null ? '' : String(antes[x.campo]), despues: x.despues, usuario,
        })
      }
    } catch (e) {
      errores.push({ id, error: (e as Error)?.message || 'error al actualizar' })
    }
  }

  return NextResponse.json({ insertados, actualizados, vinculadas, omitidos, errores })
}
