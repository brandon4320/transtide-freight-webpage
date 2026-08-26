import { NextResponse } from 'next/server'
import { d1Exec, d1Query } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('contactos')
  if (!g.ok) return g.res
  const { id } = await params
  const body = await request.json()
  if (!String(body.nombre || '').trim()) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  }
  // La columna personas puede no existir todavía (se crea on-the-fly en el GET/POST
  // de la colección): si no está, se guarda el resto igual.
  let conPersonas = false
  try {
    const info = await d1Query<{ name: string }>(`PRAGMA table_info(contactos)`)
    conPersonas = info.some(c => c.name === 'personas')
    if (!conPersonas) {
      await d1Exec(`ALTER TABLE contactos ADD COLUMN personas TEXT DEFAULT NULL`)
      conPersonas = true
    }
  } catch { conPersonas = false }

  const personas = Array.isArray(body.personas)
    ? (() => {
        const out = body.personas
          .map((p: any) => ({
            nombre: String(p?.nombre || '').trim(),
            puesto: String(p?.puesto || '').trim(),
            email: String(p?.email || '').trim(),
            telefono: String(p?.telefono || '').trim(),
          }))
          .filter((p: any) => p.nombre || p.email || p.telefono)
        return out.length ? JSON.stringify(out) : null
      })()
    : null

  await d1Exec(
    `UPDATE contactos SET tipo = ?, nombre = ?, contacto = ?, email = ?, telefono = ?, web = ?, observaciones = ?${conPersonas ? ', personas = ?' : ''}, updated_at = datetime('now') WHERE id = ?`,
    conPersonas
      ? [body.tipo || 'naviera', body.nombre.trim(), body.contacto || '', body.email || '', body.telefono || '', body.web || '', body.observaciones || '', personas, id]
      : [body.tipo || 'naviera', body.nombre.trim(), body.contacto || '', body.email || '', body.telefono || '', body.web || '', body.observaciones || '', id]
  )
  return NextResponse.json({ ok: true, id, ...body })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite('contactos')
  if (!g.ok) return g.res
  const { id } = await params
  await d1Exec(`DELETE FROM contactos WHERE id = ?`, [id])
  return NextResponse.json({ ok: true })
}
