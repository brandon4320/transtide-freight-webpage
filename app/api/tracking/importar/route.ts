import { NextResponse } from 'next/server'
import { d1Query } from '@/lib/d1'
import { requireWrite } from '@/lib/perms'
import { ensureSoftDelete, filtroVivos } from '@/lib/soft-delete'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── Importador de la planilla de Bruce · paso 1: DIFF ───────────────────────
// El cliente (app/gestion/importar-planilla.jsx) ya parseó el .xlsx en el
// navegador y convirtió los importes al formato es-AR del sistema. Acá solo se
// compara contra los embarques vivos, matcheando por B/L normalizado, y se
// devuelve qué habría que crear y qué habría que cambiar. NO escribe nada:
// aplicar es otra ruta (./aplicar) y pasa por un Confirmar explícito.
//
// Respuesta:
//   { nuevos: [{ bl, fila }], cambios: [{ id, bl, num, campos: [{ campo, antes, despues }] }],
//     iguales: n, sinBl: n, duplicadosPlanilla: n, ambiguos: [{ bl, ids }] }
//
// Reglas del diff (las mismas que usa la UI para contar "iguales"):
//   · un valor vacío en la planilla nunca propone borrar lo que hay en el sistema
//   · números se comparan como números (6.580 == 6580 == 6.580,00)
//   · fechas se comparan normalizadas a YYYY-MM-DD
//   · el B/L nunca se propone como cambio: es la llave del match
//   · si el mismo B/L aparece dos veces en la planilla, vale la primera fila
//   · si el mismo B/L tiene dos embarques vivos en el sistema, no se toca ninguno

const CAMPOS = [
  'num', 'origen', 'destino', 'contenedores', 'modo', 'bl', 'carrier', 'etd', 'eta', 'status',
  'sea_freight_usd', 'other_fees_rmb', 'other_fees_usd', 'discount_usd', 'total_usd', 'suppliers',
  'amount_due_usd', 'amount_rec_usd', 'balance_usd', 'payment_date', 'notes', 'agente',
] as const
type Campo = typeof CAMPOS[number]
type Fila = Record<Campo, string>

const NUMERICOS = new Set<string>(['sea_freight_usd', 'other_fees_rmb', 'other_fees_usd', 'discount_usd', 'total_usd', 'amount_due_usd', 'amount_rec_usd', 'balance_usd'])
const FECHAS = new Set<string>(['etd', 'eta', 'payment_date'])

const MAX_FILAS = 3000

const blNorm = (s: any) => String(s ?? '').replace(/[\s-]/g, '').toUpperCase()
const txt = (s: any) => String(s ?? '').replace(/\s+/g, ' ').trim()

// Lee un string es-AR ("6.580" / "2.182,97") como número. Igual que numUSD del
// cliente, pero devuelve null si no hay nada numérico.
function numAR(v: any): number | null {
  const t = txt(v)
  if (!t) return null
  const n = parseFloat(t.replace(/[^\d,.\-]/g, '').replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}

function fechaNorm(v: any): string {
  const t = txt(v)
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return t
}

const statusKey = (v: any) => txt(v).toLowerCase().replace(/[^a-z]/g, '')
const numKey = (v: any) => txt(v).replace(/^#/, '').replace(/^0+(?=\d)/, '')

function sonIguales(campo: string, a: any, b: any): boolean {
  if (NUMERICOS.has(campo)) return Math.abs((numAR(a) ?? 0) - (numAR(b) ?? 0)) < 0.005
  if (FECHAS.has(campo)) return fechaNorm(a) === fechaNorm(b)
  if (campo === 'bl') return blNorm(a) === blNorm(b)
  if (campo === 'status') return statusKey(a) === statusKey(b)
  if (campo === 'num') return numKey(a) === numKey(b)
  return txt(a) === txt(b)
}

// Se queda solo con los campos importables, todo como texto recortado.
function sanear(raw: any): Fila {
  const f = {} as Fila
  for (const c of CAMPOS) f[c] = raw && raw[c] != null ? String(raw[c]).trim() : ''
  return f
}

export async function POST(request: Request) {
  const g = await requireWrite('tracking')
  if (!g.ok) return g.res

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 }) }
  const filasRaw = Array.isArray(body?.filas) ? body.filas : null
  if (!filasRaw) return NextResponse.json({ error: 'Faltan las filas de la planilla.' }, { status: 400 })
  if (filasRaw.length > MAX_FILAS) return NextResponse.json({ error: `La planilla tiene más de ${MAX_FILAS} filas.` }, { status: 400 })

  // Embarques vivos, indexados por B/L normalizado. Si la papelera no está
  // disponible en shipments, filtroVivos devuelve '1=1' y se compara contra todo.
  const vivos = await ensureSoftDelete('shipments')
  const rows = await d1Query<any>(`SELECT id, ${CAMPOS.join(', ')} FROM shipments WHERE ${filtroVivos(vivos)}`)
  const porBL = new Map<string, any[]>()
  for (const r of rows) {
    const k = blNorm(r.bl)
    if (!k) continue
    const arr = porBL.get(k)
    if (arr) arr.push(r); else porBL.set(k, [r])
  }

  const nuevos: { bl: string; fila: Fila }[] = []
  const cambios: { id: number; bl: string; num: string; campos: { campo: string; antes: string; despues: string }[] }[] = []
  const ambiguos: { bl: string; ids: number[] }[] = []
  let iguales = 0
  let sinBl = 0
  let duplicadosPlanilla = 0
  const vistos = new Set<string>()

  for (const raw of filasRaw) {
    const fila = sanear(raw)
    const k = blNorm(fila.bl)
    if (!k) { sinBl++; continue }
    if (vistos.has(k)) { duplicadosPlanilla++; continue }
    vistos.add(k)

    const match = porBL.get(k)
    if (!match || match.length === 0) {
      // El agente por defecto es Bruce (la planilla es suya). Se explicita acá
      // para que la UI lo muestre y aplicar lo reciba tal cual.
      if (!fila.agente) fila.agente = 'Bruce'
      nuevos.push({ bl: fila.bl, fila })
      continue
    }
    if (match.length > 1) {
      ambiguos.push({ bl: fila.bl, ids: match.map(r => Number(r.id)) })
      continue
    }

    const row = match[0]
    const campos: { campo: string; antes: string; despues: string }[] = []
    for (const campo of CAMPOS) {
      if (campo === 'bl') continue
      const despues = fila[campo]
      if (despues === '') continue // vacío en la planilla: no pisa nada
      const antes = row[campo] == null ? '' : String(row[campo])
      if (sonIguales(campo, antes, despues)) continue
      campos.push({ campo, antes, despues })
    }
    if (campos.length) cambios.push({ id: Number(row.id), bl: String(row.bl ?? ''), num: String(row.num ?? ''), campos })
    else iguales++
  }

  return NextResponse.json({ nuevos, cambios, iguales, sinBl, duplicadosPlanilla, ambiguos })
}
