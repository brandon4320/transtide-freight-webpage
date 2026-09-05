import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { d1Query, d1Exec } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'
import { auditar } from '@/lib/auditoria'
import { ensureSoftDelete, filtroVivos } from '@/lib/soft-delete'
import { cuitNormalizado } from '@/app/gestion/cuit'

// Clientes se crean desde varias secciones (clientes, alta inline en operaciones/cotizador).
const CLIENTE_SECTIONS = ['clientes', 'operaciones', 'cotizador']

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── Columna `activo` (desactivar en vez de borrar) ─────────────────────────
// Sin migraciones versionadas: se agrega on-the-fly con PRAGMA + ALTER dentro de
// try. Si el ALTER falla, la tabla sigue funcionando sin activo/inactivo.
let activoLista: Promise<boolean> | null = null

async function columnasClientes(): Promise<Set<string>> {
  const info = await d1Query<{ name: string }>(`PRAGMA table_info(clientes)`)
  return new Set(info.map(c => c.name))
}

function ensureActivo(): Promise<boolean> {
  if (!activoLista) {
    activoLista = (async () => {
      try {
        let cols = await columnasClientes()
        if (!cols.size) return false // la tabla no existe todavía
        if (!cols.has('activo')) {
          try { await d1Exec(`ALTER TABLE clientes ADD COLUMN activo INTEGER DEFAULT 1`) } catch {}
          cols = await columnasClientes()
        }
        const ok = cols.has('activo')
        if (!ok) console.warn('[clientes] no se pudo agregar clientes.activo; se opera sin inactivos')
        return ok
      } catch (e) {
        console.warn('[clientes] no se pudo verificar la columna activo:', (e as Error)?.message)
        return false
      }
    })()
  }
  // Solo se cachea el éxito: un fallo se reintenta en el próximo request.
  return activoLista.then(ok => { if (!ok) activoLista = null; return ok })
}

// El CUIT se compara por dígitos: las filas viejas pueden tener '33708307209' y
// las nuevas '33-70830720-9'. Son el mismo cliente.
const DIGITOS_CUIT = `REPLACE(REPLACE(REPLACE(COALESCE(cuit, ''), '-', ''), '.', ''), ' ', '')`

type Dup = { id: string; nombre: string | null; activo: number }

async function buscarPorCuit(cuit: string): Promise<Dup | null> {
  const digitos = cuit.replace(/\D/g, '')
  if (!digitos) return null
  const [conActivo, conPapelera] = await Promise.all([ensureActivo(), ensureSoftDelete('clientes')])
  const rows = await d1Query<Dup>(
    `SELECT id, nombre, ${conActivo ? 'COALESCE(activo, 1)' : '1'} AS activo
     FROM clientes
     WHERE ${DIGITOS_CUIT} = ? AND ${filtroVivos(conPapelera)}
     LIMIT 1`,
    [digitos]
  )
  return rows[0] || null
}

const limpio = (v: any): string | null => { const s = v == null ? '' : String(v).trim(); return s || null }

// ─── GET ─────────────────────────────────────────────────────────────────────
// Por defecto devuelve solo los activos (es lo que consumen los selectores de
// operaciones/cotizador/buscador). ?todos=1 incluye los inactivos (directorio).
export async function GET(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const todos = new URL(request.url).searchParams.get('todos') === '1'
  const [conActivo, conPapelera] = await Promise.all([ensureActivo(), ensureSoftDelete('clientes')])

  const where = [filtroVivos(conPapelera)]
  if (!todos && conActivo) where.push('COALESCE(activo, 1) = 1')

  const rows = await d1Query(
    `SELECT id, nombre, cuit, email, telefono, notas, ${conActivo ? 'COALESCE(activo, 1)' : '1'} AS activo
     FROM clientes
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC`
  )
  return NextResponse.json(rows)
}

// ─── POST ────────────────────────────────────────────────────────────────────
// 400 si el CUIT no cierra (módulo 11); 409 si ya hay un cliente con ese CUIT
// (viene el id para que la UI ofrezca "Abrir el existente").
export async function POST(request: Request) {
  const g = await requireWrite(CLIENTE_SECTIONS)
  if (!g.ok) return g.res

  const body = await request.json().catch(() => ({})) as Record<string, any>
  const nombre = limpio(body.nombre)
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio', campo: 'nombre' }, { status: 400 })

  let cuit: string | null = null
  const cuitRaw = limpio(body.cuit)
  if (cuitRaw) {
    cuit = cuitNormalizado(cuitRaw) || null
    if (!cuit) return NextResponse.json({ error: 'El CUIT no es válido: tiene que tener 11 dígitos y cerrar el verificador', campo: 'cuit' }, { status: 400 })
    const dup = await buscarPorCuit(cuit)
    if (dup) {
      return NextResponse.json(
        { error: 'Ya existe un cliente con ese CUIT', id: dup.id, nombre: dup.nombre, activo: dup.activo },
        { status: 409 }
      )
    }
  }

  const id = String(body.id || `c${Date.now()}`)
  const conActivo = await ensureActivo()
  const fila = { id, nombre, cuit, email: limpio(body.email), telefono: limpio(body.telefono), notas: limpio(body.notas), activo: 1 }

  await d1Exec(
    `INSERT INTO clientes (id, nombre, cuit, email, telefono, notas${conActivo ? ', activo' : ''}, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?${conActivo ? ', 1' : ''}, datetime('now'), datetime('now'))`,
    [fila.id, fila.nombre, fila.cuit, fila.email, fila.telefono, fila.notas]
  )

  await auditar({ entidad: 'clientes', id, accion: 'crear', despues: fila, usuario: g.s.name || g.s.username })
  return NextResponse.json(fila)
}
