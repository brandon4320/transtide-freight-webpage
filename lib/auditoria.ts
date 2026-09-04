// Registro de quién tocó qué. Hoy, cuando un B/L o un monto aparece "mal
// cargado", no hay forma de saber si fue un error de carga, un cambio a
// propósito o una pisada entre dos personas. Cada ruta PUT/DELETE deja acá una
// línea por campo cambiado.
//
// Nunca tira: auditar es un efecto secundario del guardado y no puede hacer
// fallar un guardado que ya salió bien. Si D1 no responde, se loguea y sigue.
import { d1Query, d1Exec } from '@/lib/d1'

export type AccionAuditoria = 'crear' | 'editar' | 'borrar' | 'restaurar' | 'archivar'

export type EventoAuditoria = {
  entidad: string          // tabla o módulo: 'operations', 'shipments', 'despachante_pagos'…
  id: string | number      // id de la fila afectada
  accion: AccionAuditoria
  campo?: string           // si es un cambio de un campo puntual
  antes?: any              // valor anterior (se serializa a JSON si no es texto)
  despues?: any
  usuario: string          // g.s.name || g.s.username del requireWrite
}

export type FilaAuditoria = {
  id: number
  entidad: string
  entidad_id: string
  accion: AccionAuditoria
  campo: string | null
  antes: any
  despues: any
  usuario: string
  created_at: string
}

// El proyecto no tiene migraciones versionadas: la tabla se garantiza en la
// primera escritura y se cachea la promesa para no repetir el CREATE por request.
let tablaLista: Promise<boolean> | null = null

function ensureTabla(): Promise<boolean> {
  if (!tablaLista) {
    tablaLista = (async () => {
      try {
        await d1Exec(
          `CREATE TABLE IF NOT EXISTS auditoria (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entidad TEXT NOT NULL,
            entidad_id TEXT NOT NULL,
            accion TEXT NOT NULL,
            campo TEXT DEFAULT NULL,
            antes TEXT DEFAULT NULL,
            despues TEXT DEFAULT NULL,
            usuario TEXT DEFAULT '',
            created_at TEXT NOT NULL
          )`
        )
        // La lectura típica es "historial de esta fila": el índice paga solo.
        try { await d1Exec(`CREATE INDEX IF NOT EXISTS idx_auditoria_entidad ON auditoria (entidad, entidad_id)`) } catch {}
        return true
      } catch (e) {
        // Que el próximo request vuelva a intentar en vez de quedar apagado para siempre.
        tablaLista = null
        console.warn('[auditoria] no se pudo crear la tabla:', (e as Error)?.message)
        return false
      }
    })()
  }
  return tablaLista
}

// d1 convierte cada parámetro con String(p): un objeto llegaría como
// "[object Object]". Se serializa acá, con un tope para que un JSON gigante
// (detalle completo de una operación) no infle la tabla.
const TOPE = 20_000
function serializar(v: any): string | null {
  if (v === undefined || v === null) return null
  let s: string
  if (typeof v === 'string') s = v
  else if (typeof v === 'number' || typeof v === 'boolean') s = String(v)
  else {
    try { s = JSON.stringify(v) } catch { s = String(v) }
  }
  return s.length > TOPE ? s.slice(0, TOPE) + '…' : s
}

/** Deja una línea en la auditoría. No tira nunca. */
export async function auditar(e: EventoAuditoria): Promise<void> {
  try {
    const antes = serializar(e.antes)
    const despues = serializar(e.despues)
    // Un "editar" de un campo que quedó igual no es un cambio: no ensucia el historial.
    if (e.accion === 'editar' && e.campo && antes === despues) return
    const ok = await ensureTabla()
    if (!ok) return
    await d1Exec(
      `INSERT INTO auditoria (entidad, entidad_id, accion, campo, antes, despues, usuario, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.entidad, String(e.id), e.accion, e.campo ?? null, antes, despues, e.usuario || '', new Date().toISOString()]
    )
  } catch (err) {
    console.warn('[auditoria] no se pudo registrar:', (err as Error)?.message)
  }
}

/** Historial de una fila, del más nuevo al más viejo. antes/despues vuelven
 *  parseados si eran JSON. Devuelve [] si la tabla no existe o falla la lectura. */
export async function leerAuditoria(entidad: string, id: string | number, limit = 50): Promise<FilaAuditoria[]> {
  try {
    const ok = await ensureTabla()
    if (!ok) return []
    // LIMIT se interpola saneado: d1 manda los parámetros como texto y SQLite no
    // acepta texto en LIMIT.
    const n = Math.max(1, Math.min(500, Math.floor(Number(limit) || 50)))
    const rows = await d1Query<any>(
      `SELECT * FROM auditoria WHERE entidad = ? AND entidad_id = ? ORDER BY id DESC LIMIT ${n}`,
      [entidad, String(id)]
    )
    const parse = (s: any) => {
      if (s == null) return null
      if (typeof s !== 'string') return s
      const t = s.trim()
      if (!(t.startsWith('{') || t.startsWith('['))) return s
      try { return JSON.parse(t) } catch { return s }
    }
    return rows.map(r => ({ ...r, antes: parse(r.antes), despues: parse(r.despues) }))
  } catch {
    return []
  }
}
