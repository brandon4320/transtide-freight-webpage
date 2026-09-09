import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { requireWrite, type SessionInfo } from '@/lib/perms'
import { auditar } from '@/lib/auditoria'
import { softDelete } from '@/lib/soft-delete'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FIELDS = [
  'bl', 'descripcion', 'estado', 'hon_regulares', 'adu_extras', 'otros_gastos', 'total_honorarios',
  'fecha_pago', 'pago_transferencia', 'pago_cash', 'total_pagado', 'comision', 'facturado', 'factura_nro', 'saldo', 'notas', 'conceptos',
]

let ensured = false
async function ensureConceptos() {
  if (ensured) return
  try { await d1Exec(`ALTER TABLE despachante_pagos ADD COLUMN conceptos TEXT DEFAULT ''`) } catch {}
  ensured = true
}

// ─── Auditoría y papelera ────────────────────────────────────────────────────
// El PUT deja una línea de auditoría por campo que cambió (solo los que
// cambian). El DELETE manda el despacho a la papelera; el borrado físico
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
  const g = await requireWrite('despachante')
  if (!g.ok) return g.res
  const { id } = await params
  await ensureConceptos()
  const body = await request.json()

  // Foto previa: alimenta el diff de la auditoría y evita editar una fila que no existe.
  const existing = await d1Query<any>(`SELECT * FROM despachante_pagos WHERE id = ?`, [id])
  if (existing.length === 0) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const antes = existing[0]

  const campos = [...FIELDS]
  const vals: any[] = FIELDS.map(f => f === 'facturado' ? (body[f] ? 1 : 0) : (body[f] ?? ''))

  // operation_id (vínculo canónico con la operación; la crea /api/db/despachante)
  // solo se toca si viene en el body Y la columna existe: un PUT viejo que no la
  // conoce no la pisa con NULL, y si el ALTER de la lista falló no rompe el guardado.
  // `'operation_id' in antes` sale del SELECT * de arriba: es el PRAGMA implícito.
  if ('operation_id' in body && 'operation_id' in antes) {
    campos.push('operation_id')
    vals.push(String(body.operation_id ?? '').trim() || null)
  }

  await d1Exec(
    `UPDATE despachante_pagos SET ${campos.map(f => `${f} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
    [...vals, id]
  )

  const usuario = usuarioDe(g.s)
  await Promise.all(
    campos
      .map((f, i) => ({ campo: f, despues: vals[i] }))
      .filter(x => norm(antes[x.campo]) !== norm(x.despues))
      .map(x => auditar({ entidad: 'despachante_pagos', id, accion: 'editar', campo: x.campo, antes: antes[x.campo] ?? null, despues: x.despues ?? null, usuario }))
  )
  return NextResponse.json({ ok: true, id })
}

// Borrar = mandar a la papelera. Con ?hard=1 se borra físicamente, pero solo si
// ya pasó por la papelera y cumplió los 30 días (camino de la purga programada).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('despachante')
  if (!g.ok) return g.res
  const { id } = await params
  const usuario = usuarioDe(g.s)
  const hard = new URL(request.url).searchParams.get('hard') === '1'

  const filas = await d1Query<any>(`SELECT * FROM despachante_pagos WHERE id = ?`, [id])
  if (!filas.length) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const fila = filas[0]

  if (hard) {
    if (!fila.deleted_at) {
      return NextResponse.json({ error: 'Para borrar definitivamente primero tiene que pasar por la papelera.' }, { status: 409 })
    }
    if (!purgable(fila.deleted_at)) {
      return NextResponse.json({ error: `Todavía no lleva ${PAPELERA_DIAS} días en la papelera.` }, { status: 409 })
    }
    await d1Exec(`DELETE FROM despachante_pagos WHERE id = ?`, [id])
    await auditar({ entidad: 'despachante_pagos', id, accion: 'borrar', campo: 'purga', antes: fila, despues: null, usuario })
    return NextResponse.json({ ok: true, id, purgada: true })
  }

  // Ya estaba en la papelera: no se vuelve a marcar ni a auditar.
  if (fila.deleted_at) return NextResponse.json({ ok: true, id, papelera: true, deleted_at: fila.deleted_at })

  try {
    // softDelete deja la línea de auditoría 'borrar' con la foto previa.
    await (softDelete as SoftDeleteFn)('despachante_pagos', id, usuario, fila)
  } catch (e) {
    // Sin columnas de papelera no se cae a un DELETE real: un borrado
    // irreversible por accidente es justamente lo que se quiere evitar.
    console.warn('[despachante] no se pudo mover a la papelera:', (e as Error)?.message)
    return NextResponse.json({ error: 'No se pudo mover a la papelera. No se borró nada.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id, papelera: true })
}
