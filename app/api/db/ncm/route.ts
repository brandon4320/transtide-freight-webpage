import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { getSessionInfo, canEdit } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FIELDS = ['codigo', 'producto', 'der', 'tasa', 'iva', 'iva_adic', 'ganancias', 'iibb', 'notas']

export async function GET() {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Orden alfabético por código
  const rows = await d1Query(
    `SELECT id, ${FIELDS.join(', ')}, created_by, updated_at FROM ncm ORDER BY codigo COLLATE NOCASE ASC`
  )
  return NextResponse.json(rows)
}

// Crea o actualiza (upsert por código). Útil para el guardado automático al cotizar.
export async function POST(request: Request) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canEdit(s)) return NextResponse.json({ error: 'Tu usuario es de solo lectura' }, { status: 403 })

  const body = await request.json()
  const codigo = String(body.codigo || '').trim()
  if (!codigo) return NextResponse.json({ error: 'El código NCM es obligatorio' }, { status: 400 })

  const existing = await d1Query<any>(`SELECT id FROM ncm WHERE codigo = ?`, [codigo])
  const createdBy = s.name || s.username || ''

  if (existing.length > 0) {
    // upsert: actualizar (no pisar producto/notas con vacío si ya existían)
    await d1Exec(
      `UPDATE ncm SET producto = COALESCE(NULLIF(?, ''), producto), der = ?, tasa = ?, iva = ?, iva_adic = ?, ganancias = ?, iibb = ?, notas = COALESCE(NULLIF(?, ''), notas), updated_at = datetime('now') WHERE codigo = ?`,
      [body.producto || '', body.der || '', body.tasa || '', body.iva || '', body.iva_adic || '', body.ganancias || '', body.iibb || '', body.notas || '', codigo]
    )
    return NextResponse.json({ ok: true, id: existing[0].id, codigo, updated: true })
  }

  const id = 'ncm-' + Date.now()
  await d1Exec(
    `INSERT INTO ncm (id, codigo, producto, der, tasa, iva, iva_adic, ganancias, iibb, notas, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [id, codigo, body.producto || '', body.der || '', body.tasa || '', body.iva || '', body.iva_adic || '', body.ganancias || '', body.iibb || '', body.notas || '', createdBy]
  )
  return NextResponse.json({ ok: true, id, codigo, created: true })
}
