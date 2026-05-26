'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'

// ─── helpers ──────────────────────────────────────────────────────────────
const n = (v) => parseFloat(v) || 0
const fmtP = (v) => v == null || isNaN(v) ? '—' : '$ ' + Math.round(v).toLocaleString('es-AR')
const fmtU = (v) => v == null || isNaN(v) ? '—' : 'USD ' + (Math.round(v * 100) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUcompact = (v) => v == null || isNaN(v) ? '—' : Math.round(v * 100) / 100 < 1000 ? (Math.round(v * 100) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 }) : Math.round(v).toLocaleString('es-AR')
const pct = (v) => isNaN(v) ? '—' : (v * 100).toFixed(1) + '%'
const titleCase = (s) => s ? s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s

const rowPesos = (r) => n(r.usd) > 0 && n(r.tc) > 0 ? n(r.usd) * n(r.tc) : n(r.pesos)
const catTot = (rows) => rows.reduce((s, r) => s + rowPesos(r), 0)

const CONTAINER_M3 = { '20 Pies': 28, '40 Pies': 56, '40HQ': 76, 'Flat Rack': 76, 'LCL': null }
const ESTADO_COLORS = {
  'Entregado':         { c: '#059669', bg: '#f0fdf4', border: '#bbf7d0' },
  'Liquidado':         { c: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' },
  'En tránsito':       { c: '#ea580c', bg: '#fff4ee', border: '#fed7aa' },
  'Arribado':          { c: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
  'En aduana':         { c: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  'Listo p/ retiro':   { c: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
  'En tránsito local': { c: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  'Consolidando':      { c: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  'Cancelado':         { c: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
}

const CHECKLIST = [
  { id: 'cg',    fase: 1, label: 'Carta de garantía naviera' },
  { id: 'ncm',   fase: 1, label: 'Revisión NCM vs. BL' },
  { id: 'afip',  fase: 1, label: 'Despachante en AFIP' },
  { id: 'alta',  fase: 1, label: 'Alta del contenedor en terminal' },
  { id: 'bl',    fase: 1, label: 'BL original / telex release' },
  { id: 'inv',   fase: 1, label: 'Invoice + packing list definitivos' },
  { id: 'legajo',fase: 2, label: 'Armado del legajo con despachante' },
  { id: 'fnav',  fase: 2, label: 'Pago factura naviera' },
  { id: 'lib',   fase: 2, label: 'Liberación del contenedor' },
  { id: 'flete', fase: 3, label: 'Coordinación flete BsAs → Bahía' },
  { id: 'facts', fase: 3, label: 'Recopilación de facturas' },
  { id: 'costs', fase: 3, label: 'Carga de costos en sistema' },
  { id: 'devol', fase: 3, label: 'Devolución contenedor vacío' },
  { id: 'desp',  fase: 3, label: 'Despacho aduanero final' },
  { id: 'drive', fase: 3, label: 'Archivo legajo en Drive' },
]
const FASES = [
  { id: 1, label: 'Pre-arribo',             color: '#ea580c' },
  { id: 2, label: 'Documentación y Aduana', color: '#d97706' },
  { id: 3, label: 'Logística y Cierre',     color: '#059669' },
]

// ─── styles ───────────────────────────────────────────────────────────────
const CARD = { background: '#fff', borderRadius: '10px', border: '1px solid #e8ecf1', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }

export default function TestPage() {
  const [op, setOp]         = useState(null)
  const [detail, setDetail] = useState(null)
  const [clientes, setClientes] = useState([])
  const [checked, setChecked]   = useState(new Set())
  const [expanded, setExpanded] = useState(null) // index of expanded row
  const [showChecklist, setShowChecklist] = useState(false)
  const [costosOpen, setCostosOpen] = useState(true)

  // load data
  useEffect(() => {
    try {
      const ops = JSON.parse(localStorage.getItem('transtide-operaciones') || '[]')
      const target = ops[0]
      if (!target) return
      setOp(target)
      const d = JSON.parse(localStorage.getItem(`transtide-opdetail-${target.id}`) || '{}')
      setDetail(d)
      const cl = JSON.parse(localStorage.getItem('transtide-clientes') || '[]')
      setClientes(cl)
      const ch = JSON.parse(localStorage.getItem(`transtide-checklist-${target.id}`) || '[]')
      setChecked(new Set(ch))
    } catch (e) { console.error(e) }
  }, [])

  // calculations
  const calc = useMemo(() => {
    if (!detail || !op) return null
    const { naviera = [], terminal = [], aduana = [], transporte = [], despachante = [], admin = [], fleteIntl = [], proveedores = [], cobrar = [] } = detail

    const tNav = catTot(naviera), tTerm = catTot(terminal), tAdu = catTot(aduana), tTra = catTot(transporte), tDes = catTot(despachante), tAdm = catTot(admin), tFlt = catTot(fleteIntl)
    const enBlanco = tNav + tTerm + tAdu + tTra + tDes + tAdm
    const cash = tFlt
    const prorBase = enBlanco - tAdu + cash
    const totalGastos = enBlanco + cash
    const totalM3 = proveedores.reduce((s, p) => s + n(p.m3), 0)

    const perProv = proveedores.map((p, i) => {
      const clienteNombre = p.clienteId ? clientes.find(c => c.id === p.clienteId)?.nombre || '' : ''
      const ratio = totalM3 > 0 ? n(p.m3) / totalM3 : 0
      const prorPesos = Math.round(ratio * prorBase)
      const vepPesos = Math.round(n(p.tributosUSD) * n(p.tributosTC))
      const costoFinal = prorPesos + vepPesos
      const cb = cobrar[i] || { tc: 0, honorarios: false, despAdic: 0 }
      const tcUsed = n(cb.tc) > 0 ? n(cb.tc) : n(p.tributosTC)
      const gastosUSD = tcUsed > 0 ? Math.round((costoFinal / tcUsed) * 100) / 100 : 0
      const origenUSD = n(p.gastosOrigenUSD)
      const honorarios = cb.honorarios ? Math.round((gastosUSD + origenUSD) * 0.04 * 100) / 100 : 0
      const totalUSD = Math.round((gastosUSD + origenUSD + honorarios + n(cb.despAdic)) * 100) / 100
      return { ...p, clienteNombre, ratio, prorPesos, vepPesos, costoFinal, tcUsed, gastosUSD, origenUSD, honorarios, totalUSD, cb, idx: i }
    })

    const totalACobrar = perProv.reduce((s, p) => s + p.totalUSD, 0)
    const totalCobrado = perProv.reduce((s, p) => s + (p.cb.cobrado ? p.totalUSD : 0), 0)
    const cobrados = perProv.filter(p => p.cb.cobrado).length
    return { tNav, tTerm, tAdu, tTra, tDes, tAdm, tFlt, enBlanco, cash, prorBase, totalGastos, totalM3, perProv, totalACobrar, totalCobrado, cobrados }
  }, [detail, op, clientes])

  const totalTasks = CHECKLIST.length
  const doneTasks = CHECKLIST.filter(t => checked.has(t.id)).length
  const progress = Math.round((doneTasks / totalTasks) * 100)

  if (!op || !detail || !calc) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: '#64748b' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Cargando datos del sistema…</p>
          <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Si no aparece nada, andá primero a <Link href="/gestion/operaciones" style={{ color: '#ea580c' }}>Operaciones</Link>.</p>
        </div>
      </div>
    )
  }

  const estado = ESTADO_COLORS[op.estado] || ESTADO_COLORS['Consolidando']
  const cap = CONTAINER_M3[op.contenedor]
  const fillPct = cap ? (calc.totalM3 / cap) * 100 : 0

  const GASTOS = [
    { id: 'naviera',     label: 'Naviera',         color: '#0284c7', total: calc.tNav },
    { id: 'terminal',    label: 'Terminal',        color: '#7c3aed', total: calc.tTerm },
    { id: 'aduana',      label: 'VEP Aduana',      color: '#dc2626', total: calc.tAdu },
    { id: 'transporte',  label: 'Transporte',      color: '#d97706', total: calc.tTra },
    { id: 'despachante', label: 'Despachante',     color: '#059669', total: calc.tDes },
    { id: 'admin',       label: 'Admin',           color: '#64748b', total: calc.tAdm },
    { id: 'fleteIntl',   label: 'Flete Intl (Cash)', color: '#0891b2', total: calc.tFlt },
  ]

  return (
    <div style={{ fontFamily: 'inherit', color: '#0f172a', paddingBottom: '5rem' }}>

      {/* Banner: this is a test page */}
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.55rem 0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.78rem' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706' }} />
        <span style={{ color: '#92400e', fontWeight: 600 }}>Mockup de nuevo layout</span>
        <span style={{ color: '#a16207' }}>· Lee los datos reales pero los cambios no se guardan</span>
        <Link href="/gestion/operaciones" style={{ marginLeft: 'auto', color: '#92400e', fontWeight: 600, textDecoration: 'none' }}>Volver al sistema actual →</Link>
      </div>

      {/* ── COMPACT HEADER (sticky) ─────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 30, background: '#f4f6f9', paddingTop: 4, paddingBottom: 12, marginBottom: '1rem' }}>
        <div style={{ ...CARD, padding: '0.85rem 1.1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <Link href="/gestion/operaciones" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.7rem', borderRadius: 7, border: '1px solid #e2e8f0', color: '#475569', fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Volver
          </Link>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>{titleCase(op.nombre)}</h1>
              <span style={{ background: estado.bg, color: estado.c, border: `1px solid ${estado.border}`, fontSize: '0.68rem', fontWeight: 700, padding: '0.18rem 0.6rem', borderRadius: 5 }}>{op.estado}</span>
            </div>
            <div style={{ display: 'flex', gap: '0.85rem', marginTop: 4, fontSize: '0.72rem', color: '#64748b', flexWrap: 'wrap' }}>
              <span><strong style={{ color: '#475569', fontFamily: 'ui-monospace,monospace' }}>{op.bl || '—'}</strong> · BL</span>
              <span>{op.contenedor}</span>
              <span>ETA <strong style={{ color: '#059669' }}>{op.eta || '—'}</strong></span>
            </div>
          </div>
          <button style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1.1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#94a3b8', fontWeight: 700, fontSize: '0.78rem', cursor: 'default' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Guardado
          </button>
        </div>

        {/* KPI STRIP (inline, compact) */}
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
          {[
            { lbl: 'Costos totales', val: fmtP(calc.totalGastos), sub: `${fmtP(calc.enBlanco)} blanco + ${fmtP(calc.cash)} cash` },
            { lbl: 'Por cobrar', val: fmtU(calc.totalACobrar - calc.totalCobrado), sub: `de ${fmtU(calc.totalACobrar)} total`, accent: '#ea580c' },
            { lbl: 'Cobrado', val: fmtU(calc.totalCobrado), sub: `${calc.cobrados}/${calc.perProv.length} proveedores`, accent: '#059669' },
            { lbl: 'Ocupación', val: cap ? `${calc.totalM3.toFixed(1)} / ${cap} m³` : `${calc.totalM3.toFixed(1)} m³`, sub: cap ? `${fillPct.toFixed(0)}% del contenedor` : '—', bar: cap ? fillPct : null },
            { lbl: 'Checklist', val: `${doneTasks}/${totalTasks}`, sub: `${progress}% completado`, accent: progress === 100 ? '#059669' : '#ea580c', bar: progress },
          ].map(({ lbl, val, sub, accent = '#0f172a', bar }) => (
            <div key={lbl} style={{ ...CARD, padding: '0.65rem 0.85rem' }}>
              <p style={{ fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{lbl}</p>
              <p style={{ fontSize: '0.95rem', fontWeight: 800, color: accent, lineHeight: 1.1 }}>{val}</p>
              <p style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: 3 }}>{sub}</p>
              {bar != null && (
                <div style={{ marginTop: 5, height: 3, background: '#e8ecf1', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(bar, 100)}%`, height: '100%', background: accent, borderRadius: 99 }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── MAIN LAYOUT: master table + right rail ────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1rem', alignItems: 'start' }}>

        {/* ============ LEFT: Master proveedor table ============ */}
        <div style={CARD}>
          <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.85rem', fontWeight: 700 }}>Proveedores</p>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{calc.perProv.length} cargados · {calc.totalM3.toFixed(1)} m³</span>
            </div>
            <button style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.3rem 0.7rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '0.9rem' }}>+</span> Proveedor
            </button>
          </div>

          {/* table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {[
                    { l: 'Proveedor', w: '20%', a: 'left' },
                    { l: 'Tipo',     w: '14%', a: 'left' },
                    { l: 'm³',       w: '8%',  a: 'right' },
                    { l: 'FOB USD',  w: '10%', a: 'right' },
                    { l: 'Costo $',  w: '13%', a: 'right' },
                    { l: 'TC',       w: '8%',  a: 'right' },
                    { l: 'A cobrar', w: '13%', a: 'right' },
                    { l: 'Estado',   w: '10%', a: 'left' },
                    { l: '',         w: '4%',  a: 'right' },
                  ].map(c => (
                    <th key={c.l + c.w} style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.6rem 0.7rem', textAlign: c.a, width: c.w, borderBottom: '1px solid #e8ecf1' }}>{c.l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calc.perProv.map((p, i) => {
                  const isExp = expanded === i
                  const isCobrado = p.cb.cobrado
                  return (
                    <Fragment key={i}>
                      <tr
                        onClick={() => setExpanded(isExp ? null : i)}
                        style={{
                          cursor: 'pointer',
                          background: isExp ? '#f8fafc' : 'transparent',
                          opacity: isCobrado && !isExp ? 0.65 : 1,
                          borderBottom: isExp ? 'none' : '1px solid #f1f5f9',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => !isExp && (e.currentTarget.style.background = '#fbfcfd')}
                        onMouseLeave={e => !isExp && (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '0.7rem', fontWeight: 600, color: '#1e293b' }}>{p.nombre || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                        <td style={{ padding: '0.7rem' }}>
                          <span style={{ background: '#f1f5f9', color: '#64748b', fontSize: '0.66rem', fontWeight: 600, padding: '0.15rem 0.55rem', borderRadius: 5, border: '1px solid #e2e8f0' }}>
                            {p.tipo === 'Propio' ? 'Propio' : (p.clienteNombre || 'Cliente s/asignar')}
                          </span>
                        </td>
                        <td style={{ padding: '0.7rem', textAlign: 'right', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{p.m3}</td>
                        <td style={{ padding: '0.7rem', textAlign: 'right', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{fmtUcompact(n(p.fobUSD))}</td>
                        <td style={{ padding: '0.7rem', textAlign: 'right', color: '#1e293b', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmtP(p.costoFinal)}</td>
                        <td style={{ padding: '0.7rem', textAlign: 'right', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{p.tcUsed || '—'}</td>
                        <td style={{ padding: '0.7rem', textAlign: 'right', fontWeight: 700, color: '#1e293b', fontVariantNumeric: 'tabular-nums' }}>{fmtUcompact(p.totalUSD)}</td>
                        <td style={{ padding: '0.7rem' }}>
                          {isCobrado ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#16a34a', fontSize: '0.72rem', fontWeight: 600 }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                              Cobrado
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#d97706', fontSize: '0.72rem', fontWeight: 600 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706' }} />
                              Pendiente
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.7rem', textAlign: 'right' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9"/></svg>
                        </td>
                      </tr>

                      {/* Expanded inline detail row */}
                      {isExp && (
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e8ecf1' }}>
                          <td colSpan={9} style={{ padding: '0 1rem 1.1rem' }}>
                            <ExpandedDetail p={p} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e8ecf1' }}>
                  <td style={{ padding: '0.7rem', fontWeight: 700, color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</td>
                  <td />
                  <td style={{ padding: '0.7rem', textAlign: 'right', fontWeight: 700, color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{calc.totalM3.toFixed(2)}</td>
                  <td style={{ padding: '0.7rem', textAlign: 'right', fontWeight: 700, color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{fmtUcompact(calc.perProv.reduce((s, p) => s + n(p.fobUSD), 0))}</td>
                  <td style={{ padding: '0.7rem', textAlign: 'right', fontWeight: 700, color: '#1e293b', fontVariantNumeric: 'tabular-nums' }}>{fmtP(calc.perProv.reduce((s, p) => s + p.costoFinal, 0))}</td>
                  <td />
                  <td style={{ padding: '0.7rem', textAlign: 'right', fontWeight: 800, color: '#1e293b', fontVariantNumeric: 'tabular-nums' }}>{fmtU(calc.totalACobrar)}</td>
                  <td colSpan={2} style={{ padding: '0.7rem', fontSize: '0.7rem', color: '#94a3b8' }}>{calc.cobrados}/{calc.perProv.length} cobrados</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ============ RIGHT: Sticky rail (costos compartidos) ============ */}
        <div style={{ position: 'sticky', top: 220, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Costos compartidos */}
          <div style={CARD}>
            <button onClick={() => setCostosOpen(!costosOpen)} style={{ width: '100%', padding: '0.75rem 0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '10px 10px 0 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <p style={{ fontSize: '0.82rem', fontWeight: 700 }}>Costos compartidos</p>
              </div>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" style={{ transform: costosOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {costosOpen && (
              <div style={{ padding: '0 0.5rem 0.6rem' }}>
                {GASTOS.map(g => (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.55rem', borderRadius: 6, cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: g.total > 0 ? g.color : '#e2e8f0' }} />
                      <span style={{ fontSize: '0.75rem', color: '#475569' }}>{g.label}</span>
                    </div>
                    <span style={{ fontSize: '0.74rem', fontWeight: 600, color: g.total > 0 ? '#1e293b' : '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{g.total > 0 ? fmtP(g.total) : '—'}</span>
                  </div>
                ))}
                <div style={{ marginTop: 6, padding: '0.6rem 0.55rem', background: '#0f172a', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>Total general</span>
                  <span style={{ fontSize: '0.82rem', color: '#fff', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtP(calc.totalGastos)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Info de la operación (collapsible) */}
          <div style={CARD}>
            <div style={{ padding: '0.75rem 0.95rem', borderBottom: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 700 }}>Información</p>
            </div>
            <div style={{ padding: '0.6rem 0.95rem 0.9rem', display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.74rem' }}>
              {[
                ['Contenedor', op.contenedor],
                ['BL', op.bl || '—'],
                ['Fecha alta', op.fecha || '—'],
                ['ETA', op.eta || '—'],
                ['Puerto origen', detail.puertoOrigen || '—'],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>{l}</span>
                  <span style={{ color: '#475569', fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── FLOATING CHECKLIST FAB ───────────────────────────────────── */}
      <button onClick={() => setShowChecklist(!showChecklist)} style={{ position: 'fixed', bottom: 24, right: 24, padding: '0.7rem 1.1rem', borderRadius: 50, border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem', fontWeight: 700, boxShadow: '0 8px 24px rgba(15,23,42,0.18)', zIndex: 40 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        Checklist {doneTasks}/{totalTasks}
        <span style={{ marginLeft: 4, fontSize: '0.7rem', background: progress === 100 ? '#16a34a' : '#ea580c', padding: '0.1rem 0.5rem', borderRadius: 99 }}>{progress}%</span>
      </button>

      {/* ── CHECKLIST DRAWER ────────────────────────────────────────── */}
      {showChecklist && (
        <>
          <div onClick={() => setShowChecklist(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.3)', zIndex: 50 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, background: '#fff', zIndex: 60, boxShadow: '-8px 0 32px rgba(0,0,0,0.12)', overflowY: 'auto', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: 2 }}>Checklist de la operación</h3>
                <p style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{doneTasks} de {totalTasks} tareas completadas</p>
              </div>
              <button onClick={() => setShowChecklist(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
            </div>
            <div style={{ height: 5, background: '#f1f5f9', borderRadius: 99, marginBottom: '1.5rem', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: progress === 100 ? '#059669' : '#ea580c', borderRadius: 99 }} />
            </div>
            {FASES.map(fase => {
              const items = CHECKLIST.filter(t => t.fase === fase.id)
              const done = items.filter(t => checked.has(t.id)).length
              return (
                <div key={fase.id} style={{ marginBottom: '1.2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: fase.color }} />
                      <p style={{ fontSize: '0.74rem', fontWeight: 700, color: '#1e293b' }}>Fase {fase.id} — {fase.label}</p>
                    </div>
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600 }}>{done}/{items.length}</span>
                  </div>
                  {items.map(t => {
                    const isDone = checked.has(t.id)
                    return (
                      <div key={t.id} onClick={() => { const next = new Set(checked); isDone ? next.delete(t.id) : next.add(t.id); setChecked(next) }}
                        style={{ display: 'flex', gap: 8, padding: '0.4rem 0.5rem', borderRadius: 6, cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ width: 15, height: 15, borderRadius: 4, border: `2px solid ${isDone ? fase.color : '#cbd5e1'}`, background: isDone ? fase.color : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                          {isDone && <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <span style={{ fontSize: '0.74rem', color: isDone ? '#94a3b8' : '#374151', textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.4 }}>{t.label}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </>
      )}

    </div>
  )
}

// fake Fragment (no need to import)
function Fragment({ children }) { return <>{children}</> }

// ─── Expanded row detail ─────────────────────────────────────────────────
function ExpandedDetail({ p }) {
  const STAT = { display: 'flex', flexDirection: 'column', gap: 2 }
  const LBL = { fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const VAL = { fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', fontVariantNumeric: 'tabular-nums' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem', paddingTop: '0.5rem' }}>

      {/* Breakdown del costo */}
      <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 8, padding: '0.85rem 1rem' }}>
        <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Desglose del costo</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: '0.78rem' }}>
          <Row label="Prorrateo (por m³)" val={fmtP(p.prorPesos)} muted />
          <Row label="VEP Aduana" val={fmtP(p.vepPesos)} muted />
          <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />
          <Row label="Costo final (pesos)" val={fmtP(p.costoFinal)} bold />
          <Row label={`÷ TC ${p.tcUsed || '—'}`} val={fmtU(p.gastosUSD)} muted />
          {p.origenUSD > 0 && <Row label="+ Gastos de origen" val={fmtU(p.origenUSD)} muted />}
          {p.cb.honorarios && <Row label="+ Honorarios (4%)" val={fmtU(p.honorarios)} muted />}
          {n(p.cb.despAdic) > 0 && <Row label="+ Desp. adicional" val={fmtU(n(p.cb.despAdic))} muted />}
          <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />
          <Row label="TOTAL a cobrar" val={fmtU(p.totalUSD)} accent />
        </div>
      </div>

      {/* Edit controls + estado de cobro */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 8, padding: '0.85rem 1rem' }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Ajustes</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="T.C. conversión" value={p.cb.tc || ''} placeholder={p.tcUsed ? `${p.tcUsed} auto` : '—'} />
            <Field label="Gs. origen (USD)" value={p.origenUSD || ''} placeholder="0" />
            <Field label="Desp. adicional (USD)" value={p.cb.despAdic || ''} placeholder="0" />
            <div>
              <p style={LBL}>Honorarios 4%</p>
              <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
                {['Sí', 'No'].map(opt => {
                  const sel = (opt === 'Sí') === !!p.cb.honorarios
                  return (
                    <button key={opt} style={{ flex: 1, padding: '0.32rem', borderRadius: 5, border: `1px solid ${sel ? '#cbd5e1' : 'transparent'}`, background: sel ? '#fff' : 'transparent', fontSize: '0.7rem', fontWeight: 600, color: sel ? '#374151' : '#94a3b8', cursor: 'pointer' }}>
                      {opt}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 8, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={LBL}>Estado de cobro</p>
            {p.cb.cobrado && p.cb.fechaCobro && <p style={{ fontSize: '0.7rem', color: '#16a34a', marginTop: 3 }}>Cobrado el {p.cb.fechaCobro}</p>}
            {!p.cb.cobrado && <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 3 }}>Sin cobrar</p>}
          </div>
          <button style={{ padding: '0.4rem 0.85rem', borderRadius: 7, border: 'none', background: p.cb.cobrado ? '#f0fdf4' : '#1e293b', color: p.cb.cobrado ? '#16a34a' : '#fff', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>
            {p.cb.cobrado ? '✓ Cobrado' : 'Marcar como cobrado'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, val, muted, bold, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ color: muted ? '#64748b' : '#374151', fontSize: '0.76rem' }}>{label}</span>
      <span style={{ color: accent ? '#1e293b' : bold ? '#1e293b' : '#475569', fontWeight: accent ? 800 : bold ? 700 : 500, fontSize: accent ? '0.95rem' : '0.78rem', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
    </div>
  )
}

function Field({ label, value, placeholder }) {
  return (
    <div>
      <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</p>
      <input defaultValue={value} placeholder={placeholder} style={{ width: '100%', padding: '0.35rem 0.55rem', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.78rem', color: '#1e293b', background: '#fff', outline: 'none', boxSizing: 'border-box' }} />
    </div>
  )
}
