// Borrado diferido (papelera). Borrar una operación con pagos, o un embarque
// que otra pantalla referencia por B/L, hoy es irreversible y deja huérfanos.
// Con deleted_at la fila sigue existiendo, las listas la ocultan, y se puede
// restaurar; la purga física la hace después una tarea programada.
//
// Sin migraciones versionadas, las columnas se agregan on-the-fly con el mismo
// patrón de ensureCols (PRAGMA + ALTER dentro de try). Si el ALTER falla, la
// tabla sigue funcionando sin papelera y el que llama decide (ver softDelete).
import { d1Query, d1Exec } from '@/lib/d1'
import { auditar } from '@/lib/auditoria'

const COLS = ['deleted_at', 'deleted_by'] as const

// Cache por tabla de "las columnas ya están". Se guarda la promesa para que dos
// rutas que arrancan a la vez compartan un solo PRAGMA. Solo se cachea el éxito:
// un fallo se reintenta en el próximo request.
const listas = new Map<string, Promise<boolean>>()

// Los nombres de tabla van interpolados en el SQL (PRAGMA y ALTER no aceptan
// parámetros): se restringen a identificadores simples.
const nombreValido = (t: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(t)

async function columnas(table: string): Promise<Set<string>> {
  const info = await d1Query<{ name: string }>(`PRAGMA table_info(${table})`)
  return new Set(info.map(c => c.name))
}

/** Garantiza deleted_at / deleted_by en la tabla. Devuelve si quedaron disponibles. */
export async function ensureSoftDelete(table: string): Promise<boolean> {
  if (!nombreValido(table)) return false
  const cached = listas.get(table)
  if (cached) return cached
  const p = (async () => {
    try {
      let cols = await columnas(table)
      if (!cols.size) return false // la tabla no existe: nada que agregar
      let alterado = false
      for (const c of COLS) {
        if (cols.has(c)) continue
        alterado = true
        try {
          await d1Exec(`ALTER TABLE ${table} ADD COLUMN ${c} TEXT DEFAULT NULL`)
        } catch {
          // Puede fallar porque otra ruta lo corrió en el mismo momento (columna
          // duplicada): se verifica abajo en vez de dar por perdido.
        }
      }
      if (alterado) cols = await columnas(table)
      const ok = COLS.every(c => cols.has(c))
      if (!ok) console.warn(`[soft-delete] ${table} sigue sin deleted_at/deleted_by; se opera sin papelera`)
      return ok
    } catch (e) {
      console.warn(`[soft-delete] no se pudo verificar ${table}:`, (e as Error)?.message)
      return false
    }
  })()
  listas.set(table, p)
  const ok = await p
  if (!ok) listas.delete(table)
  return ok
}

/**
 * Manda la fila a la papelera y deja auditoría. Si las columnas no están
 * disponibles TIRA en vez de fingir: un "eliminado" que sigue apareciendo es
 * peor que un error. La ruta decide si cae a un DELETE real o devuelve 500.
 * `antes` (opcional) guarda la foto de la fila en la auditoría para poder
 * reconstruirla si algún día se purga.
 */
export async function softDelete(table: string, id: string | number, usuario: string, antes?: any): Promise<void> {
  const ok = await ensureSoftDelete(table)
  if (!ok) throw new Error(`soft-delete no disponible en ${table}`)
  const ahora = new Date().toISOString()
  const r = await d1Exec(
    `UPDATE ${table} SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL`,
    [ahora, usuario || '', id]
  )
  // Si ya estaba borrada no se vuelve a auditar: el historial refleja hechos, no reintentos.
  if (r.changes > 0) await auditar({ entidad: table, id, accion: 'borrar', campo: 'deleted_at', antes: antes ?? null, despues: ahora, usuario: usuario || '' })
}

/** Saca la fila de la papelera. `usuario` es opcional para que el contrato
 *  restaurar(table, id) siga valiendo; si viene, queda en la auditoría. */
export async function restaurar(table: string, id: string | number, usuario?: string): Promise<void> {
  const ok = await ensureSoftDelete(table)
  if (!ok) throw new Error(`soft-delete no disponible en ${table}`)
  const r = await d1Exec(
    `UPDATE ${table} SET deleted_at = NULL, deleted_by = NULL WHERE id = ? AND deleted_at IS NOT NULL`,
    [id]
  )
  if (r.changes > 0) await auditar({ entidad: table, id, accion: 'restaurar', campo: 'deleted_at', despues: null, usuario: usuario || '' })
}

/**
 * Condición para concatenar en un WHERE: solo filas vivas. Recibe el resultado
 * de ensureSoftDelete para que una tabla sin columnas no rompa la consulta
 * ('1=1'). `alias` acepta 's' o 's.' indistintamente.
 */
export function filtroVivos(ok: boolean, alias?: string): string {
  if (!ok) return '1=1'
  const a = alias ? (alias.endsWith('.') ? alias : alias + '.') : ''
  return `${a}deleted_at IS NULL`
}

/** Lo que hay en la papelera de una tabla, lo más reciente primero (para /gestion/papelera). */
export async function listarBorrados<T = any>(table: string, limit = 200): Promise<T[]> {
  const ok = await ensureSoftDelete(table)
  if (!ok) return []
  // LIMIT interpolado y saneado: d1 manda los parámetros como texto.
  const n = Math.max(1, Math.min(1000, Math.floor(Number(limit) || 200)))
  try {
    return await d1Query<T>(`SELECT * FROM ${table} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ${n}`)
  } catch {
    return []
  }
}
