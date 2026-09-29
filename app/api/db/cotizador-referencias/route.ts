// Costos de referencia del cotizador marítimo, por tipo de contenedor.
//
// Son el punto de partida de cada cotización nueva: m³ del contenedor, flete,
// despachante, terminal, naviera y logística. Los fletes y el resto cambian con
// el tiempo, así que cuando se guarda una cotización en la que se ajustaron a
// mano, esos valores pasan a ser el estándar para las próximas.
//
// Se guardan en el servidor (no en el navegador) para que todo el equipo arranque
// con los mismos números.
//
// GET  /api/db/cotizador-referencias          { [tipo]: { m3, flete, ..., updated_by, updated_at } }
// PUT  /api/db/cotizador-referencias          { tipos: { [tipo]: { m3, flete, ... } } }
import { NextResponse } from 'next/server'
import { d1Query, d1Exec } from '@/lib/d1'
import { getSessionInfo, requireWrite } from '@/lib/perms'
import { auditar } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Los tipos que existen en el cotizador (PRESETS de cotizador/page.jsx).
const TIPOS = ['20', '40hq', 'fr', 'roro', 'bulk'] as const
const CAMPOS = ['m3', 'flete', 'despachante', 'terminal', 'naviera', 'logistica'] as const

let tablaLista: Promise<boolean> | null = null
function ensureTabla(): Promise<boolean> {
  if (!tablaLista) {
    tablaLista = (async () => {
      try {
        await d1Exec(
          `CREATE TABLE IF NOT EXISTS cotizador_referencias (
            tipo TEXT PRIMARY KEY,
            m3 TEXT DEFAULT '',
            flete TEXT DEFAULT '',
            despachante TEXT DEFAULT '',
            terminal TEXT DEFAULT '',
            naviera TEXT DEFAULT '',
            logistica TEXT DEFAULT '',
            updated_by TEXT DEFAULT '',
            updated_at TEXT DEFAULT (datetime('now'))
          )`
        )
        return true
      } catch (e) {
        tablaLista = null // que lo reintente el próximo request
        console.warn('[cotizador-referencias] no se pudo crear la tabla:', (e as Error)?.message)
        return false
      }
    })()
  }
  return tablaLista
}

// Un costo válido es un número no negativo. Se guarda como texto canónico.
function numero(v: unknown): string | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').trim())
  return Number.isFinite(n) && n >= 0 ? String(n) : null
}

export async function GET() {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await ensureTabla())) return NextResponse.json({})
  const rows = await d1Query<any>(`SELECT * FROM cotizador_referencias`)
  const salida: Record<string, any> = {}
  for (const r of rows) {
    if (!(TIPOS as readonly string[]).includes(r.tipo)) continue
    salida[r.tipo] = {
      m3: r.m3, flete: r.flete, despachante: r.despachante, terminal: r.terminal,
      naviera: r.naviera, logistica: r.logistica, updated_by: r.updated_by, updated_at: r.updated_at,
    }
  }
  return NextResponse.json(salida)
}

export async function PUT(request: Request) {
  const g = await requireWrite('cotizador')
  if (!g.ok) return g.res
  if (!(await ensureTabla())) {
    return NextResponse.json({ error: 'No se pudo preparar la tabla de costos de referencia.' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const tipos = body && typeof body.tipos === 'object' ? body.tipos : null
  if (!tipos) return NextResponse.json({ error: 'Faltan los costos a guardar.' }, { status: 400 })

  const usuario = g.s.name || g.s.username || ''
  const guardados: string[] = []
  for (const [tipo, valores] of Object.entries(tipos as Record<string, any>)) {
    if (!(TIPOS as readonly string[]).includes(tipo) || !valores || typeof valores !== 'object') continue
    const fila: Record<string, string> = {}
    let invalido = false
    for (const campo of CAMPOS) {
      const v = numero(valores[campo])
      if (v === null) { invalido = true; break }
      fila[campo] = v
    }
    // Un m³ de contenedor en cero rompería el prorrateo: se rechaza el tipo entero.
    if (invalido || parseFloat(fila.m3) <= 0) continue

    const antes = (await d1Query<any>(`SELECT * FROM cotizador_referencias WHERE tipo = ?`, [tipo]))[0] || null
    await d1Exec(
      `INSERT INTO cotizador_referencias (tipo, m3, flete, despachante, terminal, naviera, logistica, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(tipo) DO UPDATE SET
         m3 = excluded.m3, flete = excluded.flete, despachante = excluded.despachante,
         terminal = excluded.terminal, naviera = excluded.naviera, logistica = excluded.logistica,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      [tipo, fila.m3, fila.flete, fila.despachante, fila.terminal, fila.naviera, fila.logistica, usuario]
    )
    await auditar({ entidad: 'cotizador_referencias', id: tipo, accion: 'editar', antes, despues: fila, usuario })
    guardados.push(tipo)
  }

  if (!guardados.length) return NextResponse.json({ error: 'Ningún costo válido para guardar.' }, { status: 400 })
  return NextResponse.json({ ok: true, guardados })
}
