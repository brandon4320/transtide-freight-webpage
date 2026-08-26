import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Los montos se guardan como texto en formato es-AR ("1.234,56").
const numUSD = (v: any) => {
  const n = parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}
const r2 = (n: number) => Math.round(n * 100) / 100

// Total imputado a un ref después de tocar el ledger: quien borra el pago
// escribe ESTE número en el módulo (recalcula, no resta a mano).
async function aggOf(scope: string, refId: string) {
  let rows: any[] = []
  try {
    rows = await d1Query<any>(
      `SELECT * FROM pagos_registro WHERE scope = ? AND ref_id = ? ORDER BY fecha DESC, id DESC`,
      [scope, refId]
    )
  } catch { rows = [] }
  let total = 0, pagos = 0, ajuste = 0, n = 0, ultimo_metodo = '', ultima_fecha = ''
  for (const r of rows) {
    const v = numUSD(r.monto)
    total += v
    n += 1
    if (String(r.tipo || 'pago') === 'ajuste') ajuste += v
    else pagos += v
    if (!ultimo_metodo && r.metodo) ultimo_metodo = String(r.metodo)
    if (!ultima_fecha && r.fecha) ultima_fecha = String(r.fecha)
  }
  return { ref_id: refId, scope, total: r2(total), pagos: r2(pagos), ajuste: r2(ajuste), n, ultimo_metodo, ultima_fecha }
}

// Borrar un pago mal cargado del ledger. El permiso es el de la sección donde
// impacta el pago (igual criterio que el POST de /api/db/pagos). Devuelve el
// saldo recalculado (`agg`) para que el módulo lo escriba sin hacer cuentas.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rows = await d1Query<any>(`SELECT scope, ref_id FROM pagos_registro WHERE id = ?`, [id])
  if (rows.length === 0) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const scope = String(rows[0].scope || '')
  const refId = String(rows[0].ref_id || '')
  const g = await requireWrite(scope === 'despachante' ? 'despachante' : 'tracking')
  if (!g.ok) return g.res
  await d1Exec(`DELETE FROM pagos_registro WHERE id = ?`, [id])
  const agg = await aggOf(scope, refId)
  return NextResponse.json({ ok: true, agg })
}
