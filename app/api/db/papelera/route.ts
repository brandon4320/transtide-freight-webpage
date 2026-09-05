import { NextResponse } from 'next/server'
import { d1Query } from '@/lib/d1'
import { getSessionInfo, hasSection, requireWrite, type SessionInfo } from '@/lib/perms'
import { ensureSoftDelete, restaurar } from '@/lib/soft-delete'
import { labelStatusES } from '@/app/gestion/estados'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── Papelera ─────────────────────────────────────────────────────────────────
// Vista única de lo que se borró desde Operaciones, Forwarding y Despachante.
// Nada se eliminó físicamente: las filas tienen deleted_at/deleted_by y las
// listas las ocultan. Restaurar vuelve a dejar la fila viva con todo lo que
// cuelga de ella (gastos, proveedores, pagos), porque nunca se fue.
//
// GET  → { operaciones: [...], embarques: [...], despachos: [...] }
//        cada ítem: { id, tabla, titulo, deleted_at, deleted_by, resumen }
// POST { tabla, id } → restaura una fila (audita 'restaurar').
//
// Cada grupo se lee y se escribe con el permiso de su sección: quien no ve
// Forwarding tampoco ve sus embarques borrados.
const GRUPOS = [
  { key: 'operaciones', tabla: 'operations', seccion: 'operaciones' },
  { key: 'embarques', tabla: 'shipments', seccion: 'tracking' },
  { key: 'despachos', tabla: 'despachante_pagos', seccion: 'despachante' },
] as const
type Grupo = typeof GRUPOS[number]
const LIMITE = 500

type Item = {
  id: string | number
  tabla: Grupo['tabla']
  titulo: string
  deleted_at: string
  deleted_by: string
  resumen: string
}

const usuarioDe = (s: SessionInfo) => s.name || s.username || ''
const txt = (v: unknown) => String(v ?? '').trim()

// 'YYYY-MM-DD' → 'DD/MM/YYYY'; lo que ya está en formato local o desconocido
// vuelve tal cual (las filas viejas quedaron en dd/mm/aaaa y no se migran).
function fechaAR(v: unknown): string {
  const s = txt(v)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s
}

const unir = (partes: (string | null | undefined)[]) => partes.filter(p => p && p.trim()).join(' · ')

function itemDe(g: Grupo, r: any): Item {
  const base = { id: r.id, tabla: g.tabla, deleted_at: txt(r.deleted_at), deleted_by: txt(r.deleted_by) }
  if (g.tabla === 'operations') {
    return {
      ...base,
      titulo: txt(r.nombre) || `Operación ${r.id}`,
      resumen: unir([
        txt(r.contenedor) ? `Contenedor ${txt(r.contenedor)}` : null,
        txt(r.bl) ? `B/L ${txt(r.bl)}` : null,
        txt(r.estado),
        txt(r.eta) ? `ETA ${fechaAR(r.eta)}` : null,
      ]),
    }
  }
  if (g.tabla === 'shipments') {
    const ruta = [txt(r.origen), txt(r.destino)].filter(Boolean).join(' → ')
    return {
      ...base,
      titulo: txt(r.num) ? `Embarque ${txt(r.num)}` : `Embarque #${r.id}`,
      resumen: unir([
        txt(r.bl) ? `B/L ${txt(r.bl)}` : null,
        txt(r.agente),
        ruta,
        labelStatusES(r.status),
        txt(r.eta) ? `ETA ${fechaAR(r.eta)}` : null,
      ]),
    }
  }
  return {
    ...base,
    titulo: txt(r.descripcion) || `Despacho #${r.id}`,
    resumen: unir([
      txt(r.bl) ? `B/L ${txt(r.bl)}` : null,
      txt(r.estado),
      txt(r.fecha_pago) ? `pago ${fechaAR(r.fecha_pago)}` : null,
    ]),
  }
}

// Lo borrado de una tabla, lo más reciente primero. Sin columnas de papelera
// (ALTER fallido) la tabla simplemente no tiene nada que mostrar.
async function listar(g: Grupo): Promise<Item[]> {
  const ok = await ensureSoftDelete(g.tabla)
  if (!ok) return []
  const rows = await d1Query<any>(
    `SELECT * FROM ${g.tabla} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ${LIMITE}`
  )
  return rows.map(r => itemDe(g, r))
}

export async function GET() {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const out: Record<Grupo['key'], Item[]> = { operaciones: [], embarques: [], despachos: [] }
    await Promise.all(GRUPOS.map(async g => {
      if (!hasSection(s, g.seccion)) return
      out[g.key] = await listar(g)
    }))
    return NextResponse.json(out)
  } catch (e) {
    console.warn('[papelera] no se pudo listar:', (e as Error)?.message)
    return NextResponse.json({ error: 'No se pudo cargar la papelera.' }, { status: 500 })
  }
}

// lib/soft-delete acepta el usuario como 3.er parámetro opcional (queda en la
// auditoría); se tipa acá para no depender de que el contrato base lo liste.
type RestaurarFn = (table: string, id: string | number, usuario?: string) => Promise<void>

export async function POST(request: Request) {
  let body: any = {}
  try { body = await request.json() } catch { body = {} }

  // Se acepta la tabla real ('shipments') o el nombre del grupo ('embarques').
  const clave = txt(body?.tabla) || txt(body?.grupo)
  const g = GRUPOS.find(x => x.tabla === clave || x.key === clave)
  if (!g) return NextResponse.json({ error: 'Tabla desconocida' }, { status: 400 })
  const id = body?.id
  if (id === undefined || id === null || txt(id) === '') return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  const guard = await requireWrite(g.seccion)
  if (!guard.ok) return guard.res

  const ok = await ensureSoftDelete(g.tabla)
  if (!ok) return NextResponse.json({ error: 'La papelera no está disponible para esta tabla.' }, { status: 500 })

  const filas = await d1Query<any>(`SELECT id, deleted_at FROM ${g.tabla} WHERE id = ?`, [id])
  if (!filas.length) return NextResponse.json({ error: 'Ya no existe: puede haberse eliminado definitivamente.' }, { status: 404 })
  // Ya estaba viva: no se vuelve a auditar.
  if (!filas[0].deleted_at) return NextResponse.json({ ok: true, tabla: g.tabla, id, yaEstaba: true })

  // restaurar deja la línea de auditoría 'restaurar' con el usuario.
  await (restaurar as RestaurarFn)(g.tabla, id, usuarioDe(guard.s))
  return NextResponse.json({ ok: true, tabla: g.tabla, id })
}
