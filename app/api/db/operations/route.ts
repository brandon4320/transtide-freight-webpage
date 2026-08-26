import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { d1Query, d1Exec } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type OpRow = {
  id: string
  nombre: string | null
  contenedor: string | null
  bl: string | null
  eta: string | null
  m3: string | null
  estado: string | null
  fecha: string | null
  m3_total?: number | null
  proveedores_txt?: string | null
  clientes_txt?: string | null
}

// Fechas: se guardan SIEMPRE en ISO (yyyy-mm-dd) para que el mismo dato sirva
// para ordenar, comparar y precargar un <input type="date">. Las filas viejas
// quedaron en dd/mm/aaaa y NO se migran: se leen igual (el front normaliza al
// mostrarlas y el ORDER BY de acá abajo contempla los dos formatos).
const toISODate = (v: unknown): string | null => {
  const s = String(v ?? '').trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const ar = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (ar) return `${ar[3]}-${ar[2].padStart(2, '0')}-${ar[1].padStart(2, '0')}`
  return s // formato desconocido: se guarda tal cual, nunca se pierde el dato
}

// Orden por urgencia real (ETA más próxima primero, lo ya arribado arriba de
// todo) en vez de por fecha de alta. Sin ETA queda al fondo. El front vuelve a
// ordenar con el mismo criterio para que editar una ETA reacomode la fila.
const ORDER_BY = `
  ORDER BY
    CASE WHEN COALESCE(o.eta, '') = '' THEN 1 ELSE 0 END ASC,
    CASE WHEN COALESCE(o.eta, '') = '' THEN NULL
         WHEN substr(o.eta, 5, 1) = '-' THEN o.eta
         ELSE substr(o.eta, 7, 4) || '-' || substr(o.eta, 4, 2) || '-' || substr(o.eta, 1, 2) END ASC,
    o.created_at DESC`

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // proveedores_txt / clientes_txt alimentan el buscador de la lista sin obligar
  // a bajar el detalle de cada operación.
  const rows = await d1Query<OpRow>(
    `SELECT o.id, o.nombre, o.contenedor, o.bl, o.eta, o.m3, o.estado, o.fecha,
            COALESCE((SELECT SUM(CAST(p.m3 AS REAL)) FROM proveedores_op p WHERE p.operation_id = o.id), 0) AS m3_total,
            COALESCE((SELECT GROUP_CONCAT(p.nombre, ', ') FROM proveedores_op p
                      WHERE p.operation_id = o.id AND COALESCE(p.nombre, '') <> ''), '') AS proveedores_txt,
            COALESCE((SELECT GROUP_CONCAT(DISTINCT c.nombre) FROM proveedores_op p
                      JOIN clientes c ON c.id = p.cliente_id
                      WHERE p.operation_id = o.id AND COALESCE(c.nombre, '') <> ''), '') AS clientes_txt
     FROM operations o
     ${ORDER_BY}`
  )
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  const g = await requireWrite('operaciones')
  if (!g.ok) return g.res

  const body = await request.json()
  const id = body.id || `op-${Date.now()}`
  const eta = toISODate(body.eta)
  const fecha = toISODate(body.fecha)

  await d1Exec(
    `INSERT INTO operations (id, nombre, contenedor, bl, eta, m3, estado, fecha, puerto_origen, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [id, body.nombre || null, body.contenedor || null, body.bl || null, eta, body.m3 || null, body.estado || null, fecha, body.puertoOrigen || null]
  )
  return NextResponse.json({ ...body, id, eta: eta || '', fecha: fecha || '' })
}
