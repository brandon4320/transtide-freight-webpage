import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { d1Query, d1Exec, d1First } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'
import { auditar } from '@/lib/auditoria'
import { ensureSoftDelete, filtroVivos, softDelete } from '@/lib/soft-delete'
import { cuitNormalizado } from '@/app/gestion/cuit'

// Clientes se editan desde varias secciones (clientes, alta inline en operaciones/cotizador).
const CLIENTE_SECTIONS = ['clientes', 'operaciones', 'cotizador']

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── Columna `activo` (desactivar en vez de borrar) ─────────────────────────
// Mismo patrón que ensureCols: PRAGMA + ALTER dentro de try; si falla, se
// degrada a "todos activos" sin romper el guardado. (Duplicado a propósito con
// ../route.ts: un route.ts no puede exportar helpers.)
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
        if (!cols.size) return false
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
  return activoLista.then(ok => { if (!ok) activoLista = null; return ok })
}

const DIGITOS_CUIT = `REPLACE(REPLACE(REPLACE(COALESCE(cuit, ''), '-', ''), '.', ''), ' ', '')`

type Dup = { id: string; nombre: string | null; activo: number }

async function buscarPorCuit(cuit: string, excluirId: string): Promise<Dup | null> {
  const digitos = cuit.replace(/\D/g, '')
  if (!digitos) return null
  const [conActivo, conPapelera] = await Promise.all([ensureActivo(), ensureSoftDelete('clientes')])
  const rows = await d1Query<Dup>(
    `SELECT id, nombre, ${conActivo ? 'COALESCE(activo, 1)' : '1'} AS activo
     FROM clientes
     WHERE ${DIGITOS_CUIT} = ? AND id <> ? AND ${filtroVivos(conPapelera)}
     LIMIT 1`,
    [digitos, excluirId]
  )
  return rows[0] || null
}

const limpio = (v: any): string | null => { const s = v == null ? '' : String(v).trim(); return s || null }
const esActivo = (v: any): number => (v == null || v === '' ? 1 : Number(v) ? 1 : 0)

type ClienteRow = {
  id: string
  nombre: string | null
  cuit: string | null
  email: string | null
  telefono: string | null
  notas: string | null
  activo?: number | null
}

async function leerCliente(id: string): Promise<{ fila: ClienteRow | null; conActivo: boolean; conPapelera: boolean }> {
  const [conActivo, conPapelera] = await Promise.all([ensureActivo(), ensureSoftDelete('clientes')])
  const fila = await d1First<ClienteRow>(`SELECT * FROM clientes WHERE id = ? AND ${filtroVivos(conPapelera)}`, [id])
  return { fila, conActivo, conPapelera }
}

// Operaciones que referencian al cliente (proveedores_op.cliente_id).
async function contarOperaciones(id: string): Promise<number> {
  const r = await d1First<{ n: number }>(`SELECT COUNT(DISTINCT operation_id) AS n FROM proveedores_op WHERE cliente_id = ?`, [id])
  return Number(r?.n || 0)
}

// ─── GET ─────────────────────────────────────────────────────────────────────
// Ficha del cliente + cuántas operaciones lo usan (la UI decide entre
// "Eliminar" y "Desactivar" antes de pedir la confirmación).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { fila, conActivo } = await leerCliente(id)
  if (!fila) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  let operaciones = 0
  try { operaciones = await contarOperaciones(id) } catch { operaciones = 0 }

  return NextResponse.json({
    id: fila.id, nombre: fila.nombre, cuit: fila.cuit, email: fila.email, telefono: fila.telefono, notas: fila.notas,
    activo: conActivo ? esActivo(fila.activo) : 1,
    operaciones,
  })
}

// ─── PUT ─────────────────────────────────────────────────────────────────────
// Acepta el cuerpo completo (form de Clientes) o parcial ({ activo: 0 }): lo que
// no viene se conserva. CUIT validado y normalizado; 409 si lo tiene otro cliente.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite(CLIENTE_SECTIONS)
  if (!g.ok) return g.res

  const { id } = await params
  const body = await request.json().catch(() => ({})) as Record<string, any>
  const tiene = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

  const { fila: actual, conActivo } = await leerCliente(id)
  if (!actual) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const texto = (k: keyof ClienteRow) => (tiene(k) ? limpio(body[k]) : limpio(actual[k]))

  const nombre = texto('nombre')
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio', campo: 'nombre' }, { status: 400 })

  let cuit: string | null = limpio(actual.cuit)
  if (tiene('cuit')) {
    const raw = limpio(body.cuit)
    if (!raw) cuit = null
    else {
      cuit = cuitNormalizado(raw) || null
      if (!cuit) return NextResponse.json({ error: 'El CUIT no es válido: tiene que tener 11 dígitos y cerrar el verificador', campo: 'cuit' }, { status: 400 })
    }
  }
  if (cuit) {
    const dup = await buscarPorCuit(cuit, id)
    if (dup) {
      return NextResponse.json(
        { error: 'Ya existe un cliente con ese CUIT', id: dup.id, nombre: dup.nombre, activo: dup.activo },
        { status: 409 }
      )
    }
  }

  const email = texto('email')
  const telefono = texto('telefono')
  const notas = texto('notas')

  const activoAntes = conActivo ? esActivo(actual.activo) : 1
  let activo = activoAntes
  if (tiene('activo') && conActivo) {
    const v = body.activo
    activo = (v === true || v === 1 || v === '1') ? 1 : 0
  }

  await d1Exec(
    `UPDATE clientes
     SET nombre = ?, cuit = ?, email = ?, telefono = ?, notas = ?${conActivo ? ', activo = ?' : ''}, updated_at = datetime('now')
     WHERE id = ?`,
    conActivo
      ? [nombre, cuit, email, telefono, notas, activo, id]
      : [nombre, cuit, email, telefono, notas, id]
  )

  // Auditoría por campo: auditar() ya descarta los que quedaron iguales.
  const usuario = g.s.name || g.s.username
  const cambios: Array<[string, string | null, string | null]> = [
    ['nombre', limpio(actual.nombre), nombre],
    ['cuit', limpio(actual.cuit), cuit],
    ['email', limpio(actual.email), email],
    ['telefono', limpio(actual.telefono), telefono],
    ['notas', limpio(actual.notas), notas],
  ]
  await Promise.all(cambios.map(([campo, antes, despues]) =>
    auditar({ entidad: 'clientes', id, accion: 'editar', campo, antes, despues, usuario })
  ))
  if (conActivo && activo !== activoAntes) {
    await auditar({ entidad: 'clientes', id, accion: activo ? 'restaurar' : 'archivar', campo: 'activo', antes: activoAntes, despues: activo, usuario })
  }

  return NextResponse.json({ id, nombre, cuit, email, telefono, notas, activo })
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
// Un cliente con operaciones no se borra: 409 con la cantidad, la UI ofrece
// desactivarlo. Sin operaciones va a la papelera (soft-delete); si la tabla no
// admite papelera, borrado físico con la foto en la auditoría.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireWrite(CLIENTE_SECTIONS)
  if (!g.ok) return g.res

  const { id } = await params
  const { fila: actual, conActivo, conPapelera } = await leerCliente(id)
  if (!actual) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  let operaciones = 0
  try {
    operaciones = await contarOperaciones(id)
  } catch {
    // Si no se puede verificar, no se borra: un cliente huérfano en una operación es peor que un error.
    return NextResponse.json({ error: 'No se pudo verificar si el cliente tiene operaciones. Intentá de nuevo.' }, { status: 500 })
  }
  if (operaciones > 0) {
    const n = operaciones
    return NextResponse.json(
      {
        error: `Este cliente tiene ${n} ${n === 1 ? 'operación vinculada' : 'operaciones vinculadas'}. Desactivalo en vez de eliminarlo.`,
        operaciones: n,
        activo: conActivo ? esActivo(actual.activo) : 1,
      },
      { status: 409 }
    )
  }

  const usuario = g.s.name || g.s.username
  if (conPapelera) {
    await softDelete('clientes', id, usuario, actual) // deja la línea de auditoría
    return NextResponse.json({ ok: true, papelera: true })
  }
  await d1Exec(`DELETE FROM clientes WHERE id = ?`, [id])
  await auditar({ entidad: 'clientes', id, accion: 'borrar', antes: actual, usuario })
  return NextResponse.json({ ok: true, papelera: false })
}
