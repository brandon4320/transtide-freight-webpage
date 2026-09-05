import { NextResponse } from 'next/server'
import { d1Exec, d1Query } from '@/lib/d1'
import { requireWrite, type SessionInfo } from '@/lib/perms'
import { auditar } from '@/lib/auditoria'
import { softDelete } from '@/lib/soft-delete'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FIELDS = [
  'num', 'origen', 'destino', 'contenedores', 'modo', 'bl', 'carrier', 'etd', 'eta', 'status',
  'sea_freight_usd', 'other_fees_rmb', 'tc_rmb', 'other_fees_usd', 'discount_usd', 'total_usd', 'suppliers',
  'amount_due_usd', 'amount_rec_usd', 'balance_usd', 'payment_date', 'notes', 'agente', 'operation_id',
]

// ─── Auditoría y papelera ────────────────────────────────────────────────────
// El PUT deja una línea de auditoría por campo que cambió (solo los que
// cambian). El DELETE manda el embarque a la papelera; el borrado físico
// (?hard=1) es solo para la purga programada y exige más de PAPELERA_DIAS en
// la papelera.
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

function purgable(deletedAt: unknown): boolean {
  const t = Date.parse(String(deletedAt || ''))
  if (!isFinite(t)) return false
  return Date.now() - t >= PAPELERA_DIAS * 86400000
}

// lib/soft-delete acepta una foto previa opcional (queda en la auditoría);
// se tipa acá para no depender de que el contrato base la liste.
type SoftDeleteFn = (table: string, id: string | number, usuario: string, antes?: any) => Promise<void>

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('tracking')
  if (!g.ok) return g.res
  const { id } = await params
  const body = await request.json()

  // Foto previa: alimenta el diff de la auditoría y evita editar una fila que no existe.
  const previas = await d1Query<any>(`SELECT * FROM shipments WHERE id = ?`, [id])
  if (!previas.length) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const antes = previas[0]

  const setClause = FIELDS.map(f => `${f} = ?`).join(', ')
  const values = FIELDS.map(f => body[f] ?? null)
  await d1Exec(
    `UPDATE shipments SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
    [...values, id]
  )

  const usuario = usuarioDe(g.s)
  await Promise.all(
    FIELDS
      .filter(f => norm(antes[f]) !== norm(body[f]))
      .map(f => auditar({ entidad: 'shipments', id, accion: 'editar', campo: f, antes: antes[f] ?? null, despues: body[f] ?? null, usuario }))
  )
  return NextResponse.json({ ok: true, id, ...body })
}

// Borrar = mandar a la papelera. Con ?hard=1 se borra físicamente, pero solo si
// ya pasó por la papelera y cumplió los 30 días (camino de la purga programada).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('tracking')
  if (!g.ok) return g.res
  const { id } = await params
  const usuario = usuarioDe(g.s)
  const hard = new URL(request.url).searchParams.get('hard') === '1'

  const filas = await d1Query<any>(`SELECT * FROM shipments WHERE id = ?`, [id])
  if (!filas.length) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const fila = filas[0]

  if (hard) {
    if (!fila.deleted_at) {
      return NextResponse.json({ error: 'Para borrar definitivamente primero tiene que pasar por la papelera.' }, { status: 409 })
    }
    if (!purgable(fila.deleted_at)) {
      return NextResponse.json({ error: `Todavía no lleva ${PAPELERA_DIAS} días en la papelera.` }, { status: 409 })
    }
    await d1Exec(`DELETE FROM shipments WHERE id = ?`, [id])
    await auditar({ entidad: 'shipments', id, accion: 'borrar', campo: 'purga', antes: fila, despues: null, usuario })
    return NextResponse.json({ ok: true, id, purgada: true })
  }

  // Ya estaba en la papelera: no se vuelve a marcar ni a auditar.
  if (fila.deleted_at) return NextResponse.json({ ok: true, id, papelera: true, deleted_at: fila.deleted_at })

  try {
    // softDelete deja la línea de auditoría 'borrar' con la foto previa.
    await (softDelete as SoftDeleteFn)('shipments', id, usuario, fila)
  } catch (e) {
    // Sin columnas de papelera no se cae a un DELETE real: un borrado
    // irreversible por accidente es justamente lo que se quiere evitar.
    console.warn('[tracking] no se pudo mover a la papelera:', (e as Error)?.message)
    return NextResponse.json({ error: 'No se pudo mover a la papelera. No se borró nada.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id, papelera: true })
}
