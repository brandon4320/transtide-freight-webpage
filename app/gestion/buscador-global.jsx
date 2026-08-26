'use client'

// ─── Buscador global (⌘K / Ctrl+K) ────────────────────────────────────────────
// Hasta acá cada módulo buscaba sobre su propia tabla: con un B/L en la mano no
// había un solo lugar donde tipearlo y llegar. Esto busca de una vez B/L,
// nombre de operación, cliente, proveedor y N° de embarque, y al elegir abre la
// operación o la ficha del B/L — sin recargar la app.
// Escape cierra. Las flechas mueven, Enter abre.

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'

// La ficha es pesada y no se necesita hasta que elegís un B/L.
const FichaImportacion = dynamic(() => import('./ficha-importacion'), { ssr: false })

const TINTA = '#111827', GRIS = '#9ca3af', SUAVE = '#c4c9d4'

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
const blNorm = (s) => String(s || '').replace(/[\s-]/g, '').toUpperCase()

const TIPO_LABEL = {
  operacion: 'Operación',
  embarque: 'Embarque',
  despacho: 'Despacho',
  cliente: 'Cliente',
  ir: 'Ir a',
}
// Desempate cuando dos resultados matchean igual de bien.
const TIPO_BONUS = { operacion: 3, embarque: 2, cliente: 2, despacho: 1, ir: 0 }

// Puntaje de un texto contra la consulta: exacto > empieza > contiene.
function scoreTexto(campo, q) {
  const c = norm(campo)
  if (!c || !q) return 0
  if (c === q) return 100
  if (c.startsWith(q)) return 70
  if (c.includes(q)) return 45
  return 0
}

const CACHE_MS = 60000

// props.destinos = [{ href, label }] — los mismos ítems que ve el menú lateral
// (ya filtrados por permisos). Se lee de `props` para no fijarle un tipo desde
// un archivo JS al layout, que es TS.
export default function BuscadorGlobal(props) {
  const destinos = props && Array.isArray(props.destinos) ? props.destinos : []
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const [data, setData] = useState(null)      // { ops, ships, desps, clientes }
  const [cargando, setCargando] = useState(false)
  const [ficha, setFicha] = useState(null)
  const inputRef = useRef(null)
  const lastLoad = useRef(0)

  // Atajo global: ⌘K / Ctrl+K abre (y vuelve a cerrar).
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // Cargar el índice al abrir (con caché corta: abrir y cerrar no re-consulta).
  useEffect(() => {
    if (!open) return
    setIdx(0)
    setTimeout(() => inputRef.current && inputRef.current.focus(), 30)
    if (data && Date.now() - lastLoad.current < CACHE_MS) return
    let cancelado = false
    setCargando(true)
    Promise.all([
      fetch('/api/db/operations').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/tracking').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/db/despachante').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/db/clientes').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([o, t, d, c]) => {
      if (cancelado) return
      lastLoad.current = Date.now()
      setData({
        ops: Array.isArray(o) ? o : [],
        ships: (t && t.shipments) || [],
        desps: Array.isArray(d) ? d : [],
        clientes: Array.isArray(c) ? c : [],
      })
    }).finally(() => { if (!cancelado) setCargando(false) })
    return () => { cancelado = true }
  }, [open])

  // Bloquear el scroll de fondo mientras está abierto (mobile).
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Índice plano: cada ítem con los campos por los que se lo puede encontrar.
  const items = useMemo(() => {
    const out = []
    if (data) {
      data.ops.forEach(o => out.push({
        key: 'op:' + o.id, tipo: 'operacion', titulo: o.nombre || 'Operación sin nombre',
        sub: [o.bl, o.estado, o.contenedor].filter(Boolean).join(' · '),
        campos: [o.nombre, o.bl, o.id], bls: [o.bl], opId: o.id,
      }))
      data.ships.forEach(s => out.push({
        key: 'sh:' + s.id, tipo: 'embarque',
        titulo: `Embarque #${s.num || s.id}${s.origen || s.destino ? ` · ${s.origen || '—'} → ${s.destino || '—'}` : ''}`,
        sub: [s.bl, s.agente, s.carrier, s.suppliers].filter(Boolean).join(' · '),
        campos: [s.num, s.bl, s.suppliers, s.origen, s.destino, s.carrier, s.agente],
        bls: [s.bl], ship: s,
      }))
      data.desps.forEach(d => out.push({
        key: 'de:' + d.id, tipo: 'despacho', titulo: d.descripcion || 'Despacho',
        sub: [d.bl, d.estado, d.factura_nro].filter(Boolean).join(' · '),
        campos: [d.descripcion, d.bl, d.factura_nro], bls: [d.bl],
      }))
      data.clientes.forEach(c => out.push({
        key: 'cl:' + c.id, tipo: 'cliente', titulo: c.nombre || 'Cliente',
        sub: [c.cuit, c.email].filter(Boolean).join(' · '),
        campos: [c.nombre, c.cuit, c.email, c.telefono],
      }))
    }
    destinos.forEach(d => out.push({
      key: 'nav:' + d.href, tipo: 'ir', titulo: d.label, sub: d.href, campos: [d.label], href: d.href,
    }))
    return out
  }, [data, destinos])

  const resultados = useMemo(() => {
    const query = norm(q)
    if (!query) {
      // Sin texto: el buscador funciona como paleta de navegación.
      return items.filter(i => i.tipo === 'ir').slice(0, 8)
    }
    const qbl = blNorm(q)
    const scored = []
    items.forEach(i => {
      let best = 0
      i.campos.forEach(c => { const s = scoreTexto(c, query); if (s > best) best = s })
      // Un B/L se tipea con o sin guiones y espacios: se compara normalizado.
      if (qbl.length >= 3 && i.bls) {
        i.bls.forEach(b => {
          const nb = blNorm(b)
          if (!nb) return
          if (nb === qbl) best = Math.max(best, 100)
          else if (nb.startsWith(qbl)) best = Math.max(best, 80)
          else if (nb.includes(qbl)) best = Math.max(best, 55)
        })
      }
      if (best > 0) scored.push({ ...i, score: best + (TIPO_BONUS[i.tipo] || 0) })
    })
    return scored.sort((a, b) => b.score - a.score || String(a.titulo).localeCompare(String(b.titulo))).slice(0, 12)
  }, [items, q])

  useEffect(() => { setIdx(0) }, [q])

  const cerrar = () => { setOpen(false); setQ('') }

  // Navegación interna que respeta el aviso de cambios sin guardar de la
  // pantalla actual (mismo contrato que el menú lateral).
  const irA = (href) => {
    const ev = new CustomEvent('gestion:navigate', { detail: { href }, cancelable: true })
    cerrar()
    if (!window.dispatchEvent(ev)) return
    // Saltar de una operación a otra sin cambiar de ruta no remonta la lista y
    // el deep-link ?op= no se vuelve a aplicar: ahí sí conviene navegar de
    // verdad. Entre módulos distintos, navegación interna sin recargar.
    if (pathname && pathname.startsWith('/gestion/operaciones') && href.startsWith('/gestion/operaciones')) {
      window.location.href = href
      return
    }
    router.push(href)
  }

  const elegir = (it) => {
    if (!it) return
    if (it.tipo === 'ir') return irA(it.href)
    if (it.tipo === 'operacion') return irA('/gestion/operaciones?op=' + encodeURIComponent(it.opId))
    const bl = (it.bls || []).find(Boolean)
    if (bl) { cerrar(); setFicha({ bl, ship: it.ship || null }); return }
    if (it.tipo === 'embarque') return irA('/gestion/tracking')
    if (it.tipo === 'despacho') return irA('/gestion/despachante')
    if (it.tipo === 'cliente') return irA('/gestion/clientes')
  }

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cerrar(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(resultados.length - 1, i + 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); return }
    if (e.key === 'Enter') { e.preventDefault(); elegir(resultados[idx]); return }
  }

  const lupa = (size = 14, color = SUAVE) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )

  return (
    <>
      {/* Disparador en el header: caja fina en desktop, lupa sola en el celular */}
      <button type="button" className="gsearch-box" onClick={() => setOpen(true)} aria-label="Buscar (Cmd+K)">
        {lupa(14)}
        <span className="gsearch-ph">Buscar B/L, operación, cliente…</span>
        <span className="gsearch-kbd">⌘K</span>
      </button>
      <button type="button" className="gsearch-ico" onClick={() => setOpen(true)} aria-label="Buscar">
        {lupa(19, '#111827')}
      </button>

      {open && (
        <div className="gsearch-overlay" onClick={e => { if (e.target === e.currentTarget) cerrar() }} onKeyDown={onKey} role="presentation">
          <div className="gsearch-panel" role="dialog" aria-modal="true" aria-label="Buscador global">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.85rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
              {lupa(16)}
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="B/L, operación, cliente, proveedor o N° de embarque"
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: '16px', color: TINTA, fontFamily: 'inherit' }}
              />
              <button onClick={cerrar} aria-label="Cerrar" className="gsearch-esc"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: GRIS, fontSize: '0.66rem', fontWeight: 600, fontFamily: 'inherit', padding: 0 }}>
                ESC
              </button>
            </div>

            <div style={{ maxHeight: '58vh', overflowY: 'auto' }}>
              {cargando && !data ? (
                <p style={{ padding: '1.5rem 1rem', fontSize: '0.78rem', color: GRIS }}>Buscando…</p>
              ) : resultados.length === 0 ? (
                <p style={{ padding: '1.5rem 1rem', fontSize: '0.78rem', color: GRIS }}>
                  {q.trim() ? `Nada coincide con “${q.trim()}”.` : 'Escribí un B/L, el nombre de una operación o un cliente.'}
                </p>
              ) : resultados.map((it, i) => (
                <button
                  key={it.key}
                  className="gsearch-item"
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => elegir(it)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                    padding: '0.6rem 1rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    background: i === idx ? '#fafafa' : 'transparent', borderBottom: '1px solid #f8fafc',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: TINTA, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.titulo}</span>
                    {it.sub && <span style={{ display: 'block', fontSize: '0.68rem', color: GRIS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.sub}</span>}
                  </span>
                  <span style={{ flex: '0 0 auto', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: SUAVE }}>
                    {TIPO_LABEL[it.tipo]}
                  </span>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0.5rem 1rem', borderTop: '1px solid #f1f5f9', fontSize: '0.62rem', color: SUAVE }}>
              <span>↑↓ moverse</span><span>Enter abrir</span><span>Esc cerrar</span>
            </div>
          </div>
        </div>
      )}

      {ficha && (
        <FichaImportacion
          bl={ficha.bl}
          seed={ficha.ship ? { ship: ficha.ship } : {}}
          onClose={() => setFicha(null)}
          onChanged={() => { lastLoad.current = 0 }}
        />
      )}
    </>
  )
}
