import { NextResponse } from 'next/server'
import { d1Exec, d1Query } from '@/lib/d1'
import { getSessionInfo, requireWrite, type SessionInfo } from '@/lib/perms'
import { auditar } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── Archivar un embarque ────────────────────────────────────────────────────
// Archivar, no borrar: un embarque cerrado con el agente deja de aparecer en
// Forwarding pero sigue existiendo, colgado de su operación y sumando en los
// totales históricos. La condición es que no le deba nada al agente
// (balance_usd 0 o a favor). POST archiva, DELETE lo vuelve a la lista.
//
// La columna archivado_at se garantiza on-the-fly (PRAGMA + ALTER dentro de un
// try, mismo patrón que ensureCols en /api/db/operations/[id]/detail). Si el
// ALTER falla, la ruta contesta un error claro sin tocar nada.
let archivadoReady: Promise<boolean> | null = null
function ensureArchivado(): Promise<boolean> {
  if (archivadoReady) return archivadoReady
  const p = (async () => {
    try {
      const info = await d1Query<{ name: string }>(`PRAGMA table_info(shipments)`)
      if (info.some(c => c.name === 'archivado_at')) return true
      await d1Exec(`ALTER TABLE shipments ADD COLUMN archivado_at TEXT DEFAULT NULL`)
      return true
    } catch {
      // El ALTER puede fallar porque otra request lo corrió en el mismo momento
      // (columna duplicada): si la columna quedó, sirve igual.
      try {
        const info = await d1Query<{ name: string }>(`PRAGMA table_info(shipments)`)
        return info.some(c => c.name === 'archivado_at')
      } catch { return false }
    }
  })()
  archivadoReady = p
  // Solo se cachea el éxito: un fallo se reintenta en el próximo request.
  p.then(ok => { if (!ok) { archivadoReady = null; console.warn('[tracking] no se pudo agregar shipments.archivado_at') } })
  return p
}

// Gemelo server-side de numUSD en app/gestion/tracking/page.jsx: los importes
// del embarque se guardan como texto en formato es-AR ('1.234,50').
const numUSD = (v: unknown): number => {
  const n = parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}
const usuarioDe = (s: SessionInfo) => s.name || s.username || ''

const SALDO_PENDIENTE = 'Tiene saldo pendiente con el agente'

async function traer(id: string) {
  const filas = await d1Query<any>(`SELECT * FROM shipments WHERE id = ?`, [id])
  return filas[0] || null
}

/** Estado de archivo del embarque: si está archivado y si podría archivarse. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await ensureArchivado()
  const fila = await traer(id)
  if (!fila) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const saldo = numUSD(fila.balance_usd)
  const puedeArchivar = saldo <= 0.005
  return NextResponse.json({
    id: fila.id,
    archivado_at: fila.archivado_at || null,
    saldo,
    puedeArchivar,
    motivo: puedeArchivar ? '' : SALDO_PENDIENTE,
  })
}

/** Archiva el embarque. 400 si le debe plata al agente. Idempotente. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('tracking')
  if (!g.ok) return g.res
  const { id } = await params

  const ok = await ensureArchivado()
  if (!ok) return NextResponse.json({ error: 'No se pudo habilitar el archivo de embarques. No se cambió nada.' }, { status: 500 })

  const fila = await traer(id)
  if (!fila) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (fila.deleted_at) return NextResponse.json({ error: 'Está en la papelera: restauralo antes de archivarlo.' }, { status: 409 })

  const saldo = numUSD(fila.balance_usd)
  if (saldo > 0.005) return NextResponse.json({ error: SALDO_PENDIENTE, saldo }, { status: 400 })

  // Ya estaba archivado: no se vuelve a estampar ni a auditar.
  if (fila.archivado_at) return NextResponse.json({ ok: true, id, archivado_at: fila.archivado_at })

  await d1Exec(`UPDATE shipments SET archivado_at = datetime('now') WHERE id = ?`, [id])
  const despues = await traer(id)
  const archivado_at = despues?.archivado_at || null
  await auditar({ entidad: 'shipments', id, accion: 'archivar', campo: 'archivado_at', antes: null, despues: archivado_at, usuario: usuarioDe(g.s) })
  return NextResponse.json({ ok: true, id, archivado_at })
}

/** Desarchiva: el embarque vuelve a la lista de Forwarding. Idempotente. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('tracking')
  if (!g.ok) return g.res
  const { id } = await params

  const ok = await ensureArchivado()
  if (!ok) return NextResponse.json({ error: 'No se pudo habilitar el archivo de embarques. No se cambió nada.' }, { status: 500 })

  const fila = await traer(id)
  if (!fila) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (!fila.archivado_at) return NextResponse.json({ ok: true, id, archivado_at: null })

  await d1Exec(`UPDATE shipments SET archivado_at = NULL WHERE id = ?`, [id])
  await auditar({ entidad: 'shipments', id, accion: 'archivar', campo: 'archivado_at', antes: fila.archivado_at, despues: null, usuario: usuarioDe(g.s) })
  return NextResponse.json({ ok: true, id, archivado_at: null })
}
