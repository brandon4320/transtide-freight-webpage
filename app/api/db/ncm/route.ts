import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { getSessionInfo, requireWrite } from '@/lib/perms'

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

// Crea o actualiza (upsert atómico por código). Útil para el guardado automático al cotizar.
// El ON CONFLICT (sobre el índice UNIQUE de `codigo`) evita duplicados ante guardados concurrentes.
export async function POST(request: Request) {
  const g = await requireWrite('cotizador')
  if (!g.ok) return g.res

  const body = await request.json()
  const codigo = String(body.codigo || '').trim()
  if (!codigo) return NextResponse.json({ error: 'El código NCM es obligatorio' }, { status: 400 })

  const createdBy = g.s.name || g.s.username || ''
  const id = 'ncm-' + Date.now()

  await d1Exec(
    `INSERT INTO ncm (id, codigo, producto, der, tasa, iva, iva_adic, ganancias, iibb, notas, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(codigo) DO UPDATE SET
       producto = COALESCE(NULLIF(excluded.producto, ''), ncm.producto),
       der = excluded.der, tasa = excluded.tasa, iva = excluded.iva, iva_adic = excluded.iva_adic,
       ganancias = excluded.ganancias, iibb = excluded.iibb,
       notas = COALESCE(NULLIF(excluded.notas, ''), ncm.notas),
       updated_at = datetime('now')`,
    [id, codigo, body.producto || '', body.der || '', body.tasa || '', body.iva || '', body.iva_adic || '', body.ganancias || '', body.iibb || '', body.notas || '', createdBy]
  )
  return NextResponse.json({ ok: true, codigo })
}
