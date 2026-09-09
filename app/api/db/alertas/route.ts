import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { getSessionInfo, requireWrite } from '@/lib/perms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Alertas "hechas": las alertas se DERIVAN de los datos, pero las que son
// tareas puras (pedir BL, pagar naviera, coordinar transporte…) no tienen un
// dato que apagar. Este store guarda por qué alerta ya te encargaste, para
// tacharla. Tabla auto-migrante (primer POST la crea).
// Tachar NO es definitivo: el POST con `undo` la devuelve a la lista.
//
// Identidad de la alerta. La clave histórica era `bl|tipo`: corregir un B/L
// mal tipeado hacía volver todas las hechas. La clave canónica pasa a
// `operation_id|tipo` cuando la pantalla manda operation_id; la clave vieja se
// guarda aparte (akey_bl) y el GET devuelve TODAS las variantes de cada fila
// para que cualquier pantalla —la que ya matchea por operación y la que
// todavía matchea por B/L— encuentre la suya.
//   akey          clave canónica (PK): `<operation_id>|<tipo>` o, sin operación, la vieja `bl|tipo`
//   operation_id  → operations.id
//   tipo          'bl_china' | 'naviera' | 'pago' | … (ver alertas-core)
//   bl            B/L tal como vino (referencia de migración)
//   akey_bl       la clave vieja `bl|tipo` con la que la marcó la pantalla
//   dueno         quién la resuelve ('brandon' | 'empleado' | …, ver DUENOS)
//   vence         'YYYY-MM-DD' en que pasa a vencida (SLA), o ''
const EXTRA_COLS: [string, string][] = [
  ['operation_id', 'TEXT DEFAULT NULL'],
  ['tipo', `TEXT DEFAULT ''`],
  ['bl', `TEXT DEFAULT ''`],
  ['akey_bl', `TEXT DEFAULT ''`],
  ['dueno', `TEXT DEFAULT ''`],
  ['vence', `TEXT DEFAULT ''`],
]

async function ensure() {
  await d1Exec(
    `CREATE TABLE IF NOT EXISTS alertas_hechas (
      akey TEXT PRIMARY KEY, done INTEGER DEFAULT 1, done_by TEXT, done_at TEXT,
      operation_id TEXT DEFAULT NULL, tipo TEXT DEFAULT '', bl TEXT DEFAULT '', akey_bl TEXT DEFAULT '',
      dueno TEXT DEFAULT '', vence TEXT DEFAULT ''
    )`
  )
  return ensureCols()
}

// Sin migraciones versionadas: las columnas nuevas se garantizan on-the-fly
// (PRAGMA + ALTER dentro de try, mismo patrón que ensureCols en
// operations/[id]/detail). Si un ALTER falla se opera con la clave vieja sola.
let colsListas: Promise<Record<string, boolean>> | null = null
function ensureCols(): Promise<Record<string, boolean>> {
  if (colsListas) return colsListas
  const p = (async () => {
    const out: Record<string, boolean> = {}
    try {
      const leer = async () => new Set((await d1Query<{ name: string }>(`PRAGMA table_info(alertas_hechas)`)).map(c => c.name))
      let have = await leer()
      let alterado = false
      for (const [col, decl] of EXTRA_COLS) {
        if (have.has(col) || !have.size) continue // tabla inexistente: nada que alterar
        alterado = true
        // Puede fallar porque otra ruta lo corrió en el mismo momento: se verifica abajo.
        try { await d1Exec(`ALTER TABLE alertas_hechas ADD COLUMN ${col} ${decl}`) } catch {}
      }
      if (alterado) have = await leer()
      for (const [col] of EXTRA_COLS) out[col] = have.has(col)
      const faltan = EXTRA_COLS.filter(([c]) => !out[c]).map(([c]) => c)
      if (faltan.length && have.size) console.warn(`[alertas] alertas_hechas sin las columnas ${faltan.join(', ')}; se opera con la clave vieja`)
    } catch (e) {
      for (const [col] of EXTRA_COLS) out[col] = false
      console.warn('[alertas] no se pudieron verificar las columnas:', (e as Error)?.message)
    }
    return out
  })()
  colsListas = p
  // Solo se cachea el éxito completo: si faltó alguna, se reintenta en el próximo request.
  p.then(out => { if (EXTRA_COLS.some(([c]) => !out[c])) colsListas = null })
  return p
}
const todas = (cols: Record<string, boolean>) => EXTRA_COLS.every(([c]) => cols[c])

// Mismo blNorm que el cliente: mayúsculas, sin espacios ni guiones.
const blNorm = (s: unknown) => String(s || '').replace(/[\s-]/g, '').toUpperCase()

// Descompone una clave vieja `cabeza|tipo[|extra]`. La cabeza puede ser el B/L
// normalizado, `op:<id>` (alerta sin B/L), `ship:<id>` o `x` (sin nada).
function partirAkey(akey: string) {
  const i = akey.indexOf('|')
  const cabeza = i < 0 ? akey : akey.slice(0, i)
  const resto = i < 0 ? '' : akey.slice(i + 1)           // tipo[|extra]
  const tipo = resto.split('|')[0] || ''
  const opDeCabeza = cabeza.startsWith('op:') ? cabeza.slice(3) : ''
  const blDeCabeza = opDeCabeza || cabeza === 'x' || cabeza.startsWith('ship:') || !cabeza ? '' : cabeza
  return { cabeza, resto, tipo, opDeCabeza, blDeCabeza }
}

// Todas las claves con las que una fila puede ser buscada por una pantalla.
function variantes(r: any): string[] {
  const out = new Set<string>()
  const add = (k: unknown) => { const s = String(k || '').trim(); if (s) out.add(s) }
  add(r.akey)
  add(r.akey_bl)
  const p = partirAkey(String(r.akey || ''))
  const tipo = String(r.tipo || '') || p.tipo
  const resto = p.resto || tipo
  const opId = String(r.operation_id || '').trim()
  if (opId && resto) { add(`${opId}|${resto}`); add(`op:${opId}|${resto}`) }
  const blk = blNorm(r.bl)
  if (blk && resto) add(`${blk}|${resto}`)
  return [...out]
}

export async function GET(request: Request) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(request.url)
  const full = url.searchParams.get('full')
  const opId = url.searchParams.get('operation_id')
  let rows: any[] = []
  try {
    // SELECT * tolera la tabla vieja (sin las columnas nuevas): los campos que
    // falten salen undefined y las variantes se arman con lo que haya.
    rows = opId
      ? await d1Query<any>(`SELECT * FROM alertas_hechas WHERE done = 1 AND operation_id = ?`, [opId])
      : await d1Query<any>(`SELECT * FROM alertas_hechas WHERE done = 1`)
  } catch { rows = [] }

  // full=1 → objetos con quién y cuándo la tachó (para el desplegable "Hechas").
  // Cada fila sale UNA vez por variante de clave (`akey` = la variante) para que
  // la UI que hace `hechas.has(r.akey)` matchee sin importar qué clave use;
  // `akey_canon` es la guardada. Sin el flag se mantiene el contrato viejo:
  // array de akeys (con todas las variantes, sin repetir).
  if (full) {
    const out: any[] = []
    for (const r of rows) {
      const p = partirAkey(String(r.akey || ''))
      const opIdFila = String(r.operation_id || '').trim()
      const tipo = String(r.tipo || '') || p.tipo
      const resto = p.resto || tipo
      const base = {
        akey_canon: r.akey,
        akey_op: opIdFila && resto ? `${opIdFila}|${resto}` : '',
        akey_bl: String(r.akey_bl || '') || (blNorm(r.bl) && resto ? `${blNorm(r.bl)}|${resto}` : ''),
        operation_id: opIdFila || null,
        tipo,
        bl: String(r.bl || ''),
        dueno: String(r.dueno || ''),
        vence: String(r.vence || ''),
        done_by: r.done_by || '',
        done_at: r.done_at || '',
      }
      for (const k of variantes(r)) out.push({ akey: k, ...base })
    }
    return NextResponse.json(out)
  }
  const keys = new Set<string>()
  for (const r of rows) for (const k of variantes(r)) keys.add(k)
  return NextResponse.json([...keys])
}

export async function POST(request: Request) {
  // Las alertas cruzan las tres secciones (embarque, despacho, cobro): puede
  // tacharlas cualquiera que edite alguna de ellas.
  const g = await requireWrite(['tracking', 'operaciones', 'despachante'])
  if (!g.ok) return g.res
  const cols = await ensure()
  const body = await request.json()
  const akeyIn = String(body.akey || '').trim()
  const opIdIn = String(body.operation_id || '').trim()
  const p = partirAkey(akeyIn)
  const tipo = String(body.tipo || '').trim() || p.tipo
  // Si la pantalla no mandó akey pero sí operación y tipo, alcanza.
  if (!akeyIn && !(opIdIn && tipo)) return NextResponse.json({ error: 'akey requerido' }, { status: 400 })

  // Operación: la que vino en el body o la que traía la clave vieja (`op:<id>|tipo`).
  const opId = opIdIn || p.opDeCabeza
  const resto = p.resto || tipo                         // tipo[|extra]
  // Si la clave ya vino canónica (`<opId>|tipo`) la cabeza no es un B/L.
  const bl = String(body.bl || '').trim() || (opId && p.cabeza === opId ? '' : p.blDeCabeza)
  // Clave canónica: por operación si se puede (y las columnas están); si no, la vieja.
  const canon = todas(cols) && opId && resto ? `${opId}|${resto}` : (akeyIn || `${opId}|${resto}`)
  // La clave vieja se conserva para las pantallas que matchean por B/L. `x|tipo`
  // (sin B/L ni operación) no identifica nada: no se guarda como variante.
  const akeyBl = akeyIn && akeyIn !== canon && p.cabeza !== 'x' ? akeyIn : (blNorm(bl) && resto ? `${blNorm(bl)}|${resto}` : '')

  // Claves con las que esta misma alerta pudo haberse guardado antes.
  const claves = new Set<string>([canon])
  if (akeyIn) claves.add(akeyIn)
  if (akeyBl) claves.add(akeyBl)
  if (opId && resto) { claves.add(`${opId}|${resto}`); claves.add(`op:${opId}|${resto}`) }
  const lista = [...claves]
  const marcas = lista.map(() => '?').join(', ')

  if (body.undo) {
    // Deshacer: vuelve a la lista de pendientes, sin importar con qué clave se tachó.
    await d1Exec(
      todas(cols)
        ? `DELETE FROM alertas_hechas WHERE akey IN (${marcas}) OR akey_bl IN (${marcas})`
        : `DELETE FROM alertas_hechas WHERE akey IN (${marcas})`,
      todas(cols) ? [...lista, ...lista] : lista
    )
    return NextResponse.json({ ok: true, akey: canon, done: false })
  }

  const autor = g.s.name || g.s.username || ''
  if (!todas(cols)) {
    // Sin columnas nuevas: contrato viejo, clave tal cual vino.
    await d1Exec(
      `INSERT INTO alertas_hechas (akey, done, done_by, done_at) VALUES (?, 1, ?, datetime('now'))
       ON CONFLICT(akey) DO UPDATE SET done = 1, done_by = excluded.done_by, done_at = datetime('now')`,
      [canon, autor]
    )
    return NextResponse.json({ ok: true, akey: canon, done: true, done_by: autor })
  }

  // Una sola fila por alerta: si quedó una tachada con la clave vieja (sin
  // operación), se reemplaza por la canónica en vez de convivir las dos.
  if (lista.length > 1) {
    await d1Exec(
      `DELETE FROM alertas_hechas WHERE akey <> ? AND akey IN (${marcas}) AND COALESCE(operation_id, '') = ''`,
      [canon, ...lista]
    )
  }
  const dueno = String(body.dueno || '').trim()
  const vence = String(body.vence || '').trim()
  await d1Exec(
    `INSERT INTO alertas_hechas (akey, done, done_by, done_at, operation_id, tipo, bl, akey_bl, dueno, vence)
     VALUES (?, 1, ?, datetime('now'), ?, ?, ?, ?, ?, ?)
     ON CONFLICT(akey) DO UPDATE SET
       done = 1, done_by = excluded.done_by, done_at = datetime('now'),
       operation_id = COALESCE(excluded.operation_id, alertas_hechas.operation_id),
       tipo = CASE WHEN excluded.tipo <> '' THEN excluded.tipo ELSE alertas_hechas.tipo END,
       bl = CASE WHEN excluded.bl <> '' THEN excluded.bl ELSE alertas_hechas.bl END,
       akey_bl = CASE WHEN excluded.akey_bl <> '' THEN excluded.akey_bl ELSE alertas_hechas.akey_bl END,
       dueno = CASE WHEN excluded.dueno <> '' THEN excluded.dueno ELSE alertas_hechas.dueno END,
       vence = CASE WHEN excluded.vence <> '' THEN excluded.vence ELSE alertas_hechas.vence END`,
    [canon, autor, opId || null, tipo, bl, akeyBl, dueno, vence]
  )
  return NextResponse.json({
    ok: true, akey: canon, akey_op: opId && resto ? `${opId}|${resto}` : '', akey_bl: akeyBl,
    operation_id: opId || null, tipo, bl, dueno, vence, done: true, done_by: autor,
  })
}
