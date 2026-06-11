import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

// CSV parser que respeta comillas y comas internas
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else field += c
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

const norm = (s: string) => (s || '').trim().toLowerCase()

// Mapeo de encabezados de la planilla del agente → claves internas
function detectColumns(header: string[]) {
  const idx: Record<string, number> = {}
  header.forEach((h, i) => {
    const n = norm(h)
    if (/^#$|^n[°º]?$|^nro/.test(n)) idx.num = i
    else if (/origin|origen|puerto.*origen|pol/.test(n)) idx.origen = i
    else if (/destination|destino|pod/.test(n)) idx.destino = i
    else if (/container|contenedor/.test(n)) idx.contenedores = i
    else if (/mode|modo|via/.test(n)) idx.modo = i
    else if (/b\/?l|bill of lading|mbl|hbl/.test(n)) idx.bl = i
    else if (/carrier|naviera|linea/.test(n)) idx.carrier = i
    else if (/shipped|on board|etd|zarpe|embarq/.test(n)) idx.etd = i
    else if (/\beta\b|arribo|llegada/.test(n)) idx.eta = i
    else if (/status|estado/.test(n)) idx.status = i
    else if (/total.*usd|total \(usd\)/.test(n)) idx.totalUsd = i
    else if (/balance/.test(n)) idx.balance = i
    else if (/supplier|proveedor/.test(n)) idx.proveedor = i
    else if (/notes|notas|observ/.test(n)) idx.notas = i
  })
  return idx
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = process.env.TRACKING_SHEET_URL
  if (!url) return NextResponse.json({ error: 'TRACKING_SHEET_URL no configurada' }, { status: 500 })

  let csv: string
  try {
    const res = await fetch(url, { redirect: 'follow', cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    csv = await res.text()
  } catch (e: any) {
    return NextResponse.json({ error: `No se pudo leer la planilla: ${e.message}` }, { status: 502 })
  }

  const rows = parseCSV(csv).filter(r => r.some(c => c.trim() !== ''))
  if (rows.length === 0) return NextResponse.json({ shipments: [], updatedAt: null })

  // Buscar la fila de encabezado: la que tenga "B/L" o "Status" o "Origin"
  let headerIdx = 0
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const joined = norm(rows[i].join('|'))
    if (/(b\/?l|bill of lading)/.test(joined) || (/origin|origen/.test(joined) && /status|estado|destination|destino/.test(joined))) {
      headerIdx = i
      break
    }
  }
  const header = rows[headerIdx]
  const col = detectColumns(header)

  const get = (r: string[], k: string) => (col[k] != null ? (r[col[k]] || '').trim() : '')

  const shipments = rows.slice(headerIdx + 1).map((r, i) => {
    const bl = get(r, 'bl')
    return {
      id: get(r, 'num') || String(i + 1),
      origen: get(r, 'origen'),
      destino: get(r, 'destino'),
      contenedores: get(r, 'contenedores'),
      modo: get(r, 'modo'),
      bl,
      blNorm: bl.replace(/[\s-]/g, '').toUpperCase(),
      carrier: get(r, 'carrier'),
      etd: get(r, 'etd'),
      eta: get(r, 'eta'),
      status: get(r, 'status'),
      totalUsd: get(r, 'totalUsd'),
      balance: get(r, 'balance'),
      proveedor: get(r, 'proveedor'),
      notas: get(r, 'notas'),
    }
  }).filter(s => s.bl || s.origen || s.destino || s.status) // descartar filas vacías/totales

  return NextResponse.json({ shipments, count: shipments.length })
}
