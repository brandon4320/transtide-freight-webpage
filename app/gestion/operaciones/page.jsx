'use client';
import { useState, useMemo, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { gToast } from '../toast';
import { importFlowState, FlowTimeline, MiniFlow } from '../flujo-importacion';
import { EmbarqueModal } from '../embarque-form';

// ─── helpers ─────────────────────────────────────────────────────────────────
const n    = (v) => parseFloat(v) || 0;
// Montos del módulo Despachante: guardados como strings es-AR ("11.886" = 11886).
const numDesp = (v) => { const x = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isNaN(x) ? 0 : x; };
const toTitle = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s;
const fmtP = (v) => v == null || isNaN(v) ? '—' : '$ ' + Math.round(v).toLocaleString('es-AR');
const fmtU = (v) => v == null || isNaN(v) ? '—' : 'USD ' + (Math.round(v * 100) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUcompact = (v) => v == null || isNaN(v) ? '—' : Math.round(v * 100) / 100 < 1000 ? (Math.round(v * 100) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 }) : Math.round(v).toLocaleString('es-AR');
const pct  = (v) => isNaN(v) ? '—' : (v * 100).toFixed(2) + '%';

// ─── styles · Transtide Flat ──────────────────────────────────────────────────
const INK   = '#111827';
const BODY  = '#6b7280';
const MUTED = '#9ca3af';
const FAINT = '#c4c9d4';
const HAIR  = '#f1f5f9';
const LINE  = '#e5e7eb';
const RED   = '#dc2626';
const GREEN = '#059669';
const AMBER = '#d97706';
const LBL  = { display: 'block', fontSize: '0.68rem', fontWeight: 500, color: MUTED, marginBottom: '0.3rem' };
const INP  = { width: '100%', padding: '0.45rem 0.6rem', border: `1px solid ${LINE}`, borderRadius: 6, fontSize: '0.82rem', color: INK, background: '#fff', outline: 'none', boxSizing: 'border-box' };
const TH   = { fontSize: '0.62rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.45rem 0.6rem', textAlign: 'left' };
const BTN_DARK = { background: INK, color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 1rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' };
const GHOST    = { background: 'none', border: 'none', padding: 0, fontSize: '0.74rem', fontWeight: 500, color: BODY, cursor: 'pointer' };
const GROUP_H  = { fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED };
const TAB      = { fontVariantNumeric: 'tabular-nums' };
const OVERLAY  = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' };
const PANEL    = { background: '#fff', borderRadius: 12, padding: '1.5rem 1.75rem', width: '100%' };
const MODAL_T  = { fontSize: '1rem', fontWeight: 600, color: INK };
// Punto negro 5px — conceptos pagados "en negro" / de tu bolsillo
const DotNegro = () => <span aria-hidden style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: INK, marginRight: 6, verticalAlign: 'middle', flexShrink: 0 }} />;

const PAGE_CSS = `
  .tt-inp:focus { border-color: ${INK} !important; }
  .tt-uinp:focus { border-bottom-color: ${INK} !important; }
  .tt-row { transition: background 0.1s; }
  .tt-row:hover { background: #fafafa; }
  .tt-btnrow { background: transparent; border: none; transition: background 0.1s; }
  .tt-btnrow:hover { background: #fafafa; }
  .tt-ghost { transition: color 0.12s; }
  .tt-ghost:hover { color: ${INK} !important; }
  .tt-danger:hover { color: ${RED} !important; }
  .tt-icon { color: ${FAINT}; transition: color 0.12s; }
  .tt-icon:hover { color: ${INK}; }
`;

// ─── row calculations ─────────────────────────────────────────────────────────
const rowPesos = (r) => n(r.usd) > 0 && n(r.tc) > 0 ? n(r.usd) * n(r.tc) : n(r.pesos);
const rowUSD   = (r) => n(r.usd) > 0 && n(r.tc) === 0 ? n(r.usd) : 0;
const catTot   = (rows) => ({ pesos: rows.reduce((s, r) => s + rowPesos(r), 0), usd: rows.reduce((s, r) => s + rowUSD(r), 0) });
const newRow   = () => ({ id: Date.now() + Math.random(), desc: '', factura: '', usd: '', tc: '', pesos: '' });
const newProv  = () => ({ id: Date.now() + Math.random(), nombre: '', tipo: 'Cliente', clienteId: '', m3: '', fobUSD: '', gastosOrigenUSD: '', tributosUSD: '', tributosTC: '' });

// ─── checklist de tareas ──────────────────────────────────────────────────────
const CHECKLIST = [
  // Fase 1 — Pre-arribo
  { id: 'cg',    fase: 1, label: 'Carta de garantía naviera' },
  { id: 'ncm',   fase: 1, label: 'Revisión de posición arancelaria (NCM) vs. BL' },
  { id: 'afip',  fase: 1, label: 'Verificar registro del despachante en AFIP para la sociedad que importe' },
  { id: 'alta',  fase: 1, label: 'Alta del contenedor en terminal de arribo (TRP u otra)' },
  { id: 'bl',    fase: 1, label: 'Recepción del BL original / telex release confirmado' },
  { id: 'inv',   fase: 1, label: 'Solicitar invoice + packing list definitivos al proveedor' },
  { id: 'carpeta', fase: 1, label: 'Mandar carpeta al despachante (empezar a armar el despacho)' },
  // Fase 2 — Documentación y Aduana
  { id: 'legajo',fase: 2, label: 'Armado del legajo con despachante (invoice, BL, packing, etc.)' },
  { id: 'fnav',  fase: 2, label: 'Recepción, pago y aviso de factura naviera' },
  { id: 'lib',   fase: 2, label: 'Confirmación de liberación del contenedor por naviera (libre deuda)' },
  // Fase 3 — Logística y Cierre
  { id: 'flete', fase: 3, label: 'Coordinación de flete BsAs → Bahía Blanca' },
  { id: 'facts', fase: 3, label: 'Recopilación de todas las facturas (naviera, terminal, despachante, flete, admin)' },
  { id: 'costs', fase: 3, label: 'Carga de costos en sistema' },
  { id: 'devol', fase: 3, label: 'Devolución del contenedor vacío + confirmación' },
  { id: 'desp',  fase: 3, label: 'Carga de despacho aduanero final' },
  { id: 'drive', fase: 3, label: 'Archivo del legajo completo en Drive' },
];

const FASES = [
  { id: 1, label: 'Pre-arribo',           color: '#ea580c', bg: '#fff4ee', badge: 'rgba(234,88,12,0.25)' },
  { id: 2, label: 'Documentación y Aduana', color: '#d97706', bg: '#fffbeb', badge: '#fde68a' },
  { id: 3, label: 'Logística y Cierre',   color: '#059669', bg: '#f0fdf4', badge: '#bbf7d0' },
];

// ─── operations list data ─────────────────────────────────────────────────────
// Estados del flujo real de importación (en orden cronológico)
const ESTADOS = [
  { label: 'Consolidando',      color: '#64748b', bg: '#f1f5f9',  desc: 'Carga en preparación en origen' },
  { label: 'En tránsito',       color: '#ea580c', bg: '#fff4ee',  desc: 'Contenedor en el mar' },
  { label: 'Arribado',          color: '#0891b2', bg: '#ecfeff',  desc: 'Llegó al puerto de destino' },
  { label: 'En aduana',         color: '#d97706', bg: '#fffbeb',  desc: 'Proceso de desaduanización' },
  { label: 'Listo p/ retiro',   color: '#ea580c', bg: '#fff7ed',  desc: 'Canal verde / libre para retirar' },
  { label: 'En tránsito local', color: '#7c3aed', bg: '#f5f3ff',  desc: 'Flete en camino al destino final' },
  { label: 'Entregado',         color: '#059669', bg: '#f0fdf4',  desc: 'Mercadería en destino final' },
  { label: 'Liquidado',         color: '#065f46', bg: '#ecfdf5',  desc: 'Costos cerrados y cobrados' },
  { label: 'Cancelado',         color: '#94a3b8', bg: '#f8fafc',  desc: 'Operación cancelada' },
];
const estadoObj   = (e) => ESTADOS.find(s => s.label === e) || ESTADOS[0];
const estadoColor = (e) => estadoObj(e).color;
// Criterio de "cerrada": el mismo que ya usaba el KPI de Completadas.
const ESTADOS_CERRADOS = ['Entregado', 'Liquidado', 'Cancelado'];
const PRIMARY = '#111827';
const CONTENEDORES = ['20 Pies', '40 Pies', '40HQ', 'Flat Rack', 'LCL'];
const CONTAINER_M3 = { '20 Pies': 28, '40 Pies': 56, '40HQ': 76, 'Flat Rack': 76, 'LCL': null };

const emptyOp = () => ({ id: '', nombre: '', contenedor: '40HQ', bl: '', eta: '', estado: 'Consolidando', fecha: '' });

// ─── tracking link helpers ──────────────────────────────────────────────────────
const blNorm = (b) => (b || '').replace(/[\s-]/g, '').toUpperCase();
const trackingStatusColor = (raw) => {
  const s = (raw || '').toLowerCase();
  if (/cancel/.test(s))  return '#dc2626';
  if (/paid/.test(s))    return '#059669';
  if (/pending/.test(s)) return '#d97706';
  if (/deliver/.test(s)) return '#059669';
  if (/transit/.test(s)) return '#64748b';
  return '#64748b';
};
const trackBalNum = (v) => { const x = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isNaN(x) ? 0 : x; };

// ─── OperationsList ───────────────────────────────────────────────────────────
function OperationsList({ onSelect, deepLinkId }) {
  const [ops,       setOps]       = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(null); // null | 'new' | opObj
  const [form,      setForm]      = useState(emptyOp());
  const [confirm,   setConfirm]   = useState(null); // id to delete
  const [statusPop, setStatusPop] = useState(null); // op.id with open status picker
  const [showCerradas, setShowCerradas] = useState(false); // sección de cerradas: colapsada por defecto
  const [deepLinkDone, setDeepLinkDone] = useState(false);

  const [loadError, setLoadError] = useState(false);

  // Datos para el mini-pipeline de cada fila (no bloquean la lista).
  const [flowShips, setFlowShips] = useState([]);
  const [flowDesps, setFlowDesps] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/tracking').then(r => r.ok ? r.json() : null).then(j => { if (!cancelled && j) setFlowShips(j.shipments || []); }).catch(() => {});
    fetch('/api/db/despachante').then(r => r.ok ? r.json() : null).then(j => { if (!cancelled && Array.isArray(j)) setFlowDesps(j); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const flowShipByBL = useMemo(() => { const m = {}; flowShips.forEach(x => { if (x.bl) m[blNorm(x.bl)] = x; }); return m; }, [flowShips]);
  const flowDespByBL = useMemo(() => { const m = {}; flowDesps.forEach(x => { if (x.bl) m[blNorm(x.bl)] = x; }); return m; }, [flowDesps]);

  // Load from API
  const loadOps = useRef(null);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true); setLoadError(false);
      try {
        const r = await fetch('/api/db/operations');
        if (!r.ok) throw new Error('failed');
        const data = await r.json();
        if (!cancelled) setOps(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) { setLoadError(true); gToast.error('No se pudieron cargar las operaciones. Revisá tu conexión.'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadOps.current = run;
    run();
    return () => { cancelled = true; };
  }, []);

  // Deep-link: open a specific operation when ?op=<id> matches a loaded op
  useEffect(() => {
    if (deepLinkDone || !deepLinkId || loading) return;
    const match = ops.find(o => String(o.id) === String(deepLinkId));
    if (match) {
      setDeepLinkDone(true);
      onSelect(match);
    }
  }, [deepLinkId, ops, loading, deepLinkDone, onSelect]);

  // Occupied m³ comes from the operations GET (m3_total aggregated server-side)
  const getOcupado = (op) => {
    const t = parseFloat(op?.m3_total);
    return t > 0 ? t : null;
  };

  const openNew  = () => { setForm(emptyOp()); setModal('new'); };
  const openEdit = (op, e) => { e.stopPropagation(); setForm({ ...emptyOp(), ...op }); setModal(op); };
  const askDel   = (id, e) => { e.stopPropagation(); setConfirm(id); };

  const setEstado = async (id, estado) => {
    const op = ops.find(o => o.id === id);
    if (!op) return;
    const prev = op.estado;
    const next = { ...op, estado };
    setOps(ops.map(o => o.id === id ? next : o)); // optimista
    setStatusPop(null);
    try {
      const r = await fetch(`/api/db/operations/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      if (!r.ok) throw new Error('failed');
      gToast.success(`Estado: ${estado}`);
    } catch {
      // revertir el cambio optimista y avisar (antes se tragaba el error en silencio)
      setOps(curr => curr.map(o => o.id === id ? { ...o, estado: prev } : o));
      gToast.error('No se pudo cambiar el estado. Intentá de nuevo.');
    }
  };

  const submit = async () => {
    if (!form.nombre.trim()) { gToast.error('El nombre de la operación es obligatorio.'); return; }
    try {
      if (modal === 'new') {
        const id = 'op-' + Date.now();
        const newOp = { ...form, id };
        const r = await fetch('/api/db/operations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newOp) });
        if (!r.ok) { gToast.error('No se pudo crear la operación.'); return; }
        const created = await r.json();
        setOps([{ ...created, m3_total: 0 }, ...ops]);
        gToast.success('Operación creada.');
      } else {
        const id = modal.id;
        const updated = { ...form, id };
        const r = await fetch(`/api/db/operations/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
        if (!r.ok) { gToast.error('No se pudieron guardar los cambios.'); return; }
        setOps(ops.map(o => o.id === id ? { ...o, ...updated } : o));
        gToast.success('Operación actualizada.');
      }
      setModal(null);
    } catch {
      gToast.error('Error de conexión. Intentá de nuevo.');
    }
  };
  const remove = async (id) => {
    try {
      const r = await fetch(`/api/db/operations/${id}`, { method: 'DELETE' });
      if (!r.ok) { gToast.error('No se pudo eliminar la operación.'); return; }
      setOps(ops.filter(o => o.id !== id));
      gToast.success('Operación eliminada.');
    } catch {
      gToast.error('Error de conexión. Intentá de nuevo.');
    } finally {
      setConfirm(null);
    }
  };

  const INP2 = { ...INP, padding: '0.5rem 0.75rem', boxSizing: 'border-box' };
  const SEL  = { ...INP2, cursor: 'pointer', appearance: 'auto' };

  // Activas arriba, cerradas al fondo (colapsadas). Mismo orden que devuelve la API.
  const opsActivas  = ops.filter(o => !ESTADOS_CERRADOS.includes(o.estado));
  const opsCerradas = ops.filter(o => ESTADOS_CERRADOS.includes(o.estado));

  return (
    <div>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 350, letterSpacing: '-0.02em', color: INK, margin: 0 }}>Operaciones</h2>
          <p style={{ fontSize: '0.74rem', color: MUTED, marginTop: 3 }}>{opsActivas.length} activa{opsActivas.length === 1 ? '' : 's'}{opsCerradas.length > 0 ? ` · ${opsCerradas.length} cerrada${opsCerradas.length === 1 ? '' : 's'}` : ''}</p>
        </div>
        <button onClick={openNew} style={{ ...BTN_DARK, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nueva operación
        </button>
      </div>

      {/* list */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: MUTED, fontSize: '0.82rem' }}>
            Cargando operaciones...
          </div>
        ) : loadError ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <p style={{ fontWeight: 600, color: INK, marginBottom: '0.35rem', fontSize: '0.9rem' }}>No se pudieron cargar las operaciones</p>
            <p style={{ fontSize: '0.78rem', color: MUTED, marginBottom: '1.1rem' }}>Puede ser un problema de conexión.</p>
            <button onClick={() => loadOps.current && loadOps.current()} className="tt-ghost" style={{ ...GHOST, fontSize: '0.78rem', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>Reintentar</button>
          </div>
        ) : ops.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <p style={{ fontWeight: 600, color: INK, marginBottom: '0.35rem', fontSize: '0.9rem' }}>No hay operaciones registradas</p>
            <p style={{ fontSize: '0.78rem', color: MUTED, marginBottom: '1.1rem' }}>Creá tu primera operación para empezar a gestionar importaciones.</p>
            <button onClick={openNew} className="tt-ghost" style={{ ...GHOST, fontSize: '0.78rem', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Crear la primera operación
            </button>
          </div>
        ) : (
        <>
        {/* Alertas: entregadas hace 1+ semana que siguen sin liquidar */}
        {(() => {
          const today = new Date(); today.setHours(0, 0, 0, 0)
          const viejas = ops.filter(o => {
            if (o.estado !== 'Entregado') return false
            const d = o.eta ? new Date(o.eta + 'T00:00:00') : null
            return d && !isNaN(d.getTime()) && (today.getTime() - d.getTime()) / 86400000 >= 7
          })
          if (!viejas.length) return null
          return (
            <div style={{ borderLeft: `2px solid ${AMBER}`, paddingLeft: 12, marginBottom: '1.25rem' }}>
              <p style={{ ...GROUP_H, marginBottom: 4 }}>Cobranzas · {viejas.length}</p>
              {viejas.slice(0, 5).map(o => (
                <button key={o.id} onClick={() => onSelect(o)} className="tt-ghost" style={{ display: 'block', background: 'none', border: 'none', padding: '0.12rem 0', cursor: 'pointer', textAlign: 'left', fontSize: '0.78rem', color: BODY }}>
                  <b style={{ color: INK, fontWeight: 600 }}>{o.nombre}</b> entregada y sin liquidar — revisá cobros pendientes
                </button>
              ))}
            </div>
          )
        })()}

        {/* column headers */}
        <div className="ops-list-headers" style={{ display: 'grid', gridTemplateColumns: '3fr 1.6fr 1.4fr 1fr auto', gap: '0.5rem', padding: '0 0.25rem 0.45rem', alignItems: 'center', borderBottom: `1px solid ${LINE}` }}>
          {['Operación', 'N° BL', 'Contenedor / M³', 'ETA', ''].map(h => (
            <span key={h} style={{ fontSize: '0.62rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
          ))}
        </div>

        {(() => {
          // Una sola plantilla de fila: normal para activas, compacta/apagada para cerradas.
          const renderOpRow = (op, cerrada) => {
            const est = estadoObj(op.estado);
            const cap = CONTAINER_M3[op.contenedor];
            const ocup = getOcupado(op);
            const m3str = cap
              ? `${ocup != null ? ocup.toFixed(1) : '—'} / ${cap} m³`
              : ocup != null ? `${ocup.toFixed(1)} m³` : '—';
            const m3Over = cap && ocup != null && ocup > cap * 0.9;
            return (
              <div key={op.id}
                className="ops-list-row tt-row"
                onClick={() => { if (statusPop === op.id) return; onSelect(op); }}
                style={{
                  display: 'grid', gridTemplateColumns: '3fr 1.6fr 1.4fr 1fr auto',
                  gap: '0.5rem', alignItems: 'center',
                  padding: cerrada ? '0.6rem 0.25rem' : '0.8rem 0.25rem',
                  borderBottom: `1px solid ${HAIR}`,
                  cursor: 'pointer',
                  opacity: cerrada ? 0.55 : 1,
                }}
              >
                {/* col 1: nombre + meta */}
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 600, color: INK, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.nombre}</p>
                  <p style={{ fontSize: '0.68rem', color: MUTED, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    ETA {op.eta || op.fecha || '—'}
                    {(() => {
                      // Embarque en la fila: agente y estado como meta-texto; solo la deuda va en rojo
                      const sh = flowShipByBL[blNorm(op.bl)]
                      if (cerrada || !sh) return null
                      const shBal = trackBalNum(sh.balance_usd)
                      return (
                        <>
                          {' · '}{sh.agente || 'Bruce'}{' · '}{sh.status || '—'}
                          {shBal > 0 && <b style={{ color: RED, fontWeight: 700 }}> · Forwarder USD {sh.balance_usd}</b>}
                        </>
                      )
                    })()}
                  </p>
                  {!cerrada && (
                    <div style={{ marginTop: 5 }}>
                      <MiniFlow state={importFlowState({ op, ship: flowShipByBL[blNorm(op.bl)], desp: flowDespByBL[blNorm(op.bl)] })} />
                    </div>
                  )}
                </div>

                {/* col 2: BL */}
                <p className="col-bl" style={{ fontSize: '0.74rem', color: op.bl ? BODY : FAINT, fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...TAB }}>{op.bl || '—'}</p>

                {/* col 3: container + m³ */}
                <div className="col-container">
                  <p style={{ fontSize: '0.74rem', color: BODY }}>{op.contenedor || '—'}</p>
                  <p style={{ fontSize: '0.68rem', color: m3Over ? RED : MUTED, ...TAB }}>{m3str}</p>
                </div>

                {/* col 4: ETA */}
                <p className="col-eta" style={{ fontSize: '0.74rem', color: op.eta ? BODY : FAINT, ...TAB }}>{op.eta || '—'}</p>

                {/* col 5: actions */}
                <div className="col-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }} onClick={e => e.stopPropagation()}>
                  {/* estado: texto plano que abre el selector */}
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setStatusPop(statusPop === op.id ? null : op.id)} className="tt-ghost"
                      style={{ ...GHOST, display: 'inline-flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                      {est.label} <span style={{ fontSize: '0.55rem', color: MUTED }}>▾</span>
                    </button>
                    {statusPop === op.id && (
                      <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: '#fff', borderRadius: 8, border: `1px solid ${LINE}`, zIndex: 200, minWidth: '230px', overflow: 'hidden' }}>
                        <p style={{ ...GROUP_H, padding: '0.6rem 0.85rem 0.3rem' }}>Cambiar estado</p>
                        {ESTADOS.map((s, idx) => (
                          <button key={s.label} onClick={() => setEstado(op.id, s.label)} className="tt-btnrow"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.5rem 0.85rem', cursor: 'pointer', borderBottom: idx < ESTADOS.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                            <div style={{ textAlign: 'left' }}>
                              <p style={{ fontSize: '0.78rem', fontWeight: op.estado === s.label ? 600 : 400, color: op.estado === s.label ? INK : BODY }}>{s.label}</p>
                              <p style={{ fontSize: '0.65rem', color: MUTED, marginTop: '1px' }}>{s.desc}</p>
                            </div>
                            {op.estado === s.label && <span style={{ marginLeft: 'auto', color: INK, fontSize: '0.8rem' }}>✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* edit icon */}
                  <button className="edit-btn tt-icon" onClick={e => openEdit(op, e)} title="Editar" aria-label={`Editar operación ${op.nombre || ''}`}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  {/* delete icon */}
                  <button className="del-btn tt-icon" onClick={e => askDel(op.id, e)} title="Eliminar" aria-label={`Eliminar operación ${op.nombre || ''}`}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                  </button>
                </div>
              </div>
            );
          };

          return (
            <>
              {opsActivas.map(op => renderOpRow(op, false))}

              {/* Cerradas: todas al fondo, colapsadas por defecto */}
              {opsCerradas.length > 0 && (
                <div style={{ marginTop: opsActivas.length ? '1.5rem' : 0 }}>
                  <button onClick={() => setShowCerradas(v => !v)} className="tt-ghost"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0.55rem 0.25rem', marginBottom: showCerradas ? '0.35rem' : 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2.5" style={{ transform: showCerradas ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9"/></svg>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: MUTED }}>Cerradas · {opsCerradas.length}</span>
                    <span style={{ fontSize: '0.66rem', color: FAINT }}>entregadas, liquidadas y canceladas</span>
                  </button>
                  {showCerradas && opsCerradas.map(op => renderOpRow(op, true))}
                </div>
              )}
            </>
          );
        })()}
        </>
        )}
      </div>

      {/* click-away to close status popup */}
      {statusPop && <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setStatusPop(null)} />}

      {/* ── Modal nueva / editar operación ── */}
      {modal !== null && (
        <div style={OVERLAY} onClick={() => setModal(null)}>
          <div style={{ ...PANEL, maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={MODAL_T}>{modal === 'new' ? 'Nueva operación' : 'Editar operación'}</h3>
              <button onClick={() => setModal(null)} aria-label="Cerrar" className="tt-ghost" style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: '1.3rem', lineHeight: 1, padding: 0 }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LBL}>Nombre de la operación</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="tt-inp" style={INP2} placeholder="Ej: Franco Modulos 2 + varios" />
              </div>
              <div>
                <label style={LBL}>N° BL</label>
                <input value={form.bl} onChange={e => setForm(f => ({ ...f, bl: e.target.value }))} className="tt-inp" style={INP2} placeholder="Ej: MAEU7546833339" />
              </div>
              <div>
                <label style={LBL}>Estado</label>
                <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} className="tt-inp" style={SEL}>
                  {ESTADOS.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>Contenedor</label>
                <select value={form.contenedor} onChange={e => setForm(f => ({ ...f, contenedor: e.target.value }))} className="tt-inp" style={SEL}>
                  {CONTENEDORES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>M³ del contenedor</label>
                <p style={{ padding: '0.5rem 0', fontSize: '0.82rem', color: INK, fontWeight: 600 }}>
                  {CONTAINER_M3[form.contenedor] ? `${CONTAINER_M3[form.contenedor]} m³` : 'Variable'}
                  <span style={{ fontSize: '0.7rem', color: MUTED, fontWeight: 400 }}> · capacidad total</span>
                </p>
              </div>
              <div>
                <label style={LBL}>Fecha de alta</label>
                <input type="date" value={form.fecha?.split('/').reverse().join('-') || ''} onChange={e => { const [y,m,d] = e.target.value.split('-'); setForm(f => ({ ...f, fecha: `${d}/${m}/${y}` })); }} className="tt-inp" style={INP2} />
              </div>
              <div>
                <label style={LBL}>ETA (Fecha estimada de llegada)</label>
                <input type="date" value={form.eta?.split('/').reverse().join('-') || ''} onChange={e => { const [y,m,d] = e.target.value.split('-'); setForm(f => ({ ...f, eta: `${d}/${m}/${y}` })); }} className="tt-inp" style={INP2} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1.25rem', marginTop: '1.25rem' }}>
              <button onClick={() => setModal(null)} className="tt-ghost" style={GHOST}>Cancelar</button>
              <button onClick={submit} style={BTN_DARK}>
                {modal === 'new' ? 'Crear operación' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm delete ── */}
      {confirm && (
        <div style={OVERLAY} onClick={() => setConfirm(null)}>
          <div style={{ ...PANEL, maxWidth: '360px' }} onClick={e => e.stopPropagation()}>
            <p style={{ ...MODAL_T, marginBottom: '0.4rem' }}>¿Eliminar operación?</p>
            <p style={{ fontSize: '0.8rem', color: BODY, marginBottom: '1.5rem' }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'flex-end', alignItems: 'center' }}>
              <button onClick={() => setConfirm(null)} className="tt-ghost" style={GHOST}>Cancelar</button>
              <button onClick={() => remove(confirm)} style={{ ...GHOST, color: RED, fontWeight: 600 }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── OperationDetail ──────────────────────────────────────────────────────────
function OperationDetail({ op, onBack }) {
  const router = useRouter();

  const emptyDetail = () => ({
    naviera: [], terminal: [], aduana: [], transporte: [], despachante: [], admin: [], fleteIntl: [],
    proveedores: [], cobrar: [], puertoOrigen: '', customGastos: [],
  });

  const [detail,     setDetail]     = useState(emptyDetail);
  const [detailLoading, setDetailLoading] = useState(true);
  const [clientes,   setClientes]   = useState([]);
  const [expanded,   setExpanded]   = useState(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const [costosOpen, setCostosOpen] = useState(true);
  const [editingCat, setEditingCat] = useState(null);
  const [estadoCuenta, setEstadoCuenta] = useState(null); // grupo de cliente para el resumen imprimible
  const [addingCat,  setAddingCat]  = useState(false);
  const [isDirty,    setIsDirty]    = useState(false);
  const [saveFlash,  setSaveFlash]  = useState(false);
  const [saving,     setSaving]     = useState(false);
  const savingRef = useRef(false);
  const [showDiscard,setShowDiscard]= useState(false);
  const [pendingNav, setPendingNav] = useState(null);
  const [checked,    setChecked]    = useState(() => new Set());
  const [checklistLoaded, setChecklistLoaded] = useState(false);
  const [shipment,   setShipment]   = useState(null);
  const [shipmentLoaded, setShipmentLoaded] = useState(false);
  const [despacho, setDespacho] = useState(null);
  const [shipModal, setShipModal] = useState(false); // editor de embarque embebido en la operación
  // Despacho de aduana vinculado por B/L — alimenta el flujo del expediente.
  useEffect(() => {
    let cancelled = false;
    setDespacho(null);
    if (!op.bl) return;
    (async () => {
      try {
        const r = await fetch('/api/db/despachante');
        if (!r.ok) return;
        const list = await r.json();
        const m = (Array.isArray(list) ? list : []).find(d => blNorm(d.bl) === blNorm(op.bl));
        if (!cancelled) setDespacho(m || null);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [op.id, op.bl]);
  const [confirmDelCat, setConfirmDelCat] = useState(null); // catId pendiente de borrar
  const [creatingShip, setCreatingShip] = useState(false);

  // Load detail from API
  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/db/operations/${op.id}/detail`);
        if (!r.ok) throw new Error('failed');
        const d = await r.json();
        if (!cancelled) setDetail({ ...emptyDetail(), ...d });
      } catch {
        if (!cancelled) setDetail(emptyDetail());
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [op.id]);

  // Load checklist
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/db/operations/${op.id}/checklist`);
        if (!r.ok) throw new Error('failed');
        const data = await r.json();
        if (!cancelled) setChecked(new Set(Array.isArray(data) ? data : []));
      } catch {
        if (!cancelled) setChecked(new Set());
      } finally {
        if (!cancelled) setChecklistLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [op.id]);

  // Debounced checklist save
  useEffect(() => {
    if (!checklistLoaded) return;
    const t = setTimeout(() => {
      fetch(`/api/db/operations/${op.id}/checklist`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([...checked]),
      }).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [checked, checklistLoaded, op.id]);

  // load clientes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/db/clientes');
        if (!r.ok) throw new Error('failed');
        const data = await r.json();
        if (!cancelled) setClientes(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setClientes([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // create a cliente inline; returns new id or null
  const createCliente = async (nombre) => {
    const nm = (nombre || '').trim();
    if (!nm) { gToast.error('Ingresá un nombre para el cliente.'); return null; }
    try {
      const r = await fetch('/api/db/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nm }),
      });
      if (!r.ok) {
        if (r.status === 403) gToast.error('No tenés permisos para crear clientes.');
        else if (r.status === 409) gToast.error('Ya existe un cliente con ese nombre.');
        else gToast.error('No se pudo crear el cliente. Intentá de nuevo.');
        return null;
      }
      const nuevo = await r.json();
      if (!nuevo || !nuevo.id) { gToast.error('No se pudo crear el cliente.'); return null; }
      setClientes(prev => [...prev, nuevo]);
      gToast.success(`Cliente "${nuevo.nombre || nm}" creado.`);
      return nuevo.id;
    } catch {
      gToast.error('No se pudo crear el cliente. Revisá la conexión.');
      return null;
    }
  };

  // load matching tracking shipment (by BL) — filtra server-side, no baja toda la tabla
  useEffect(() => {
    let cancelled = false;
    setShipmentLoaded(false);
    setShipment(null);
    if (!op.bl) { setShipmentLoaded(true); return; }
    (async () => {
      try {
        const r = await fetch('/api/tracking?bl=' + encodeURIComponent(op.bl));
        if (!r.ok) throw new Error('failed');
        const data = await r.json();
        const list = Array.isArray(data?.shipments) ? data.shipments : [];
        const target = blNorm(op.bl);
        const match = target ? list.find(s => blNorm(s.bl) === target) : null;
        if (!cancelled) setShipment(match || null);
      } catch {
        if (!cancelled) setShipment(null);
      } finally {
        if (!cancelled) setShipmentLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [op.id, op.bl]);

  // warn before unload
  useEffect(() => {
    const handler = (e) => { if (!isDirty) return; e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // intercept sidebar nav
  useEffect(() => {
    const handler = (e) => {
      if (!isDirty) return;
      e.preventDefault();
      setPendingNav(e.detail.href);
      setShowDiscard(true);
    };
    window.addEventListener('gestion:navigate', handler);
    return () => window.removeEventListener('gestion:navigate', handler);
  }, [isDirty]);

  const D = () => setIsDirty(true);
  const updDetail = (patch) => { setDetail(d => ({ ...d, ...patch })); D(); };
  const updCategory = (catId, rows) => updDetail({ [catId]: rows });
  const updProveedor = (i, field, value) => {
    setDetail(d => ({ ...d, proveedores: d.proveedores.map((p, j) => j === i ? { ...p, [field]: value } : p) }));
    D();
  };
  const updCobrar = (i, field, value) => {
    setDetail(d => {
      const cobrar = [...(d.cobrar || [])];
      while (cobrar.length <= i) cobrar.push({ tc: '', honorarios: false, despAdic: '' });
      cobrar[i] = { ...cobrar[i], [field]: value };
      return { ...d, cobrar };
    });
    D();
  };
  const addProveedor = () => {
    setDetail(d => ({
      ...d,
      proveedores: [...(d.proveedores || []), newProv()],
      cobrar:      [...(d.cobrar || []),      { tc: '', honorarios: false, despAdic: '', cobrado: false, fechaCobro: '' }],
    }));
    D();
  };
  const removeProveedor = (i) => {
    setDetail(d => ({
      ...d,
      proveedores: d.proveedores.filter((_, j) => j !== i),
      cobrar: (d.cobrar || []).filter((_, j) => j !== i),
    }));
    setExpanded(null);
    D();
  };
  const toggleCobrado = (i, isCobrado) => {
    const ahora = new Date().toLocaleDateString('es-AR');
    setDetail(d => {
      const cobrar = [...(d.cobrar || [])];
      while (cobrar.length <= i) cobrar.push({ tc: '', honorarios: false, despAdic: '' });
      cobrar[i] = { ...cobrar[i], cobrado: !isCobrado, fechaCobro: !isCobrado ? ahora : '' };
      return { ...d, cobrar };
    });
    D();
  };
  const toggleCheck = (id) => setChecked(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const saveAll = async () => {
    if (savingRef.current) return; // evita guardados concurrentes (duplicaba datos)
    savingRef.current = true;
    setSaving(true);
    try {
      const r = await fetch(`/api/db/operations/${op.id}/detail`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(detail),
      });
      if (!r.ok) throw new Error('failed');
      setIsDirty(false);
      setSaveFlash(true);
      gToast.success('Operación guardada.');
      setTimeout(() => setSaveFlash(false), 2200);
    } catch (e) {
      gToast.error('Error al guardar. Reintentá — no se perdió lo que cargaste.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const doNavigate     = () => { if (pendingNav) { router.push(pendingNav); setPendingNav(null); } else { onBack(); } };
  const handleBack     = () => { if (isDirty) { setPendingNav(null); setShowDiscard(true); } else onBack(); };
  const discardAndBack = () => { setIsDirty(false); setShowDiscard(false); doNavigate(); };
  const saveAndBack    = async () => { await saveAll(); setShowDiscard(false); doNavigate(); };

  const addCustomCategory = ({ label, color, kind }) => {
    const id = `custom-${Date.now()}`;
    setDetail(d => ({
      ...d,
      customGastos: [...(d.customGastos || []), { id, label, color, kind }],
      [id]: [],
    }));
    D();
  };
  // Abre el modal de confirmación (reemplaza el confirm() del navegador).
  const removeCustomCategory = (catId) => setConfirmDelCat(catId);
  const doRemoveCustomCategory = (catId) => {
    setDetail(d => {
      const next = { ...d };
      delete next[catId];
      next.customGastos = (d.customGastos || []).filter(c => c.id !== catId);
      return next;
    });
    D();
    setEditingCat(null);
    setConfirmDelCat(null);
    gToast.success('Categoría eliminada.');
  };

  // Crear un embarque en Tracking ya vinculado a esta operación (prefill desde la op).
  const crearEmbarque = async () => {
    if (creatingShip) return;
    setCreatingShip(true);
    try {
      const body = { bl: op.bl || '', contenedores: op.contenedor || '', eta: op.eta || '', agente: 'Bruce', status: 'In Transit', operation_id: op.id };
      const r = await fetch('/api/tracking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { gToast.error('No se pudo crear el embarque.'); return; }
      const created = await r.json();
      setShipment(created);
      gToast.success('Embarque creado en Tracking.');
    } catch {
      gToast.error('Error de conexión. Intentá de nuevo.');
    } finally {
      setCreatingShip(false);
    }
  };

  const calc = useMemo(() => {
    const { naviera = [], terminal = [], aduana = [], transporte = [], despachante = [], admin = [], fleteIntl = [], proveedores = [], cobrar = [], customGastos = [] } = detail;
    const tNav = catTot(naviera).pesos, tTerm = catTot(terminal).pesos, tAdu = catTot(aduana).pesos;
    const tTra = catTot(transporte).pesos, tDes = catTot(despachante).pesos, tAdm = catTot(admin).pesos;
    const tFlt = catTot(fleteIntl).pesos;

    // Split por LÍNEA: cada gasto puede marcarse "sociedad" (blanco/facturado) o
    // "vos" (cash de tu bolsillo). Sin marca, hereda el default de su categoría
    // (flete intl → cash, el resto → sociedad). VEP Aduana es siempre sociedad.
    // Reclasificar una línea NO cambia el costo total ni el "a cobrar" por
    // proveedor (la suma prorrateada es la misma); solo cambia el split y lo
    // que recuperás en cash.
    const splitRows = (rows, defKind) => rows.reduce((a, r) => {
      const kind = r.pagadoPor === 'cash' || r.pagadoPor === 'blanco' ? r.pagadoPor : defKind;
      if (kind === 'cash') a.cash += rowPesos(r); else a.blanco += rowPesos(r);
      return a;
    }, { blanco: 0, cash: 0 });

    let enBlanco = tAdu, cash = 0; // VEP siempre sociedad
    // catsBlanco: desglose de lo que paga la SOCIEDAD IMPORTADORA (tributos,
    // naviera, terminal…) para la banda "Reparto de la plata". El DESPACHANTE
    // va aparte (despBlanco): es SU factura, no de la sociedad — si estuviera
    // acá y en su propia tarjeta se sumaría dos veces.
    const catsBlanco = tAdu > 0 ? [{ label: 'VEP Aduana (tributos)', monto: tAdu }] : [];
    let despBlanco = 0;
    [[naviera, 'blanco', 'Naviera'], [terminal, 'blanco', 'Terminal'], [transporte, 'blanco', 'Transporte'], [despachante, 'blanco', null], [admin, 'blanco', 'Admin'], [fleteIntl, 'cash', 'Flete Internacional']].forEach(([rows, def, label]) => {
      const s = splitRows(rows, def); enBlanco += s.blanco; cash += s.cash;
      if (label === null) { despBlanco = s.blanco; return; }
      if (s.blanco > 0) catsBlanco.push({ label, monto: s.blanco });
    });
    customGastos.forEach(cg => {
      const s = splitRows(detail[cg.id] || [], cg.kind === 'cash' ? 'cash' : 'blanco');
      enBlanco += s.blanco; cash += s.cash;
      if (s.blanco > 0) catsBlanco.push({ label: cg.label || 'Otro', monto: s.blanco });
    });

    // Líneas cargadas en USD sin T.C.: no entran al total en pesos ni al
    // prorrateo — se avisa en el panel en vez de perderse en silencio.
    const usdSinTC = [naviera, terminal, aduana, transporte, despachante, admin, fleteIntl, ...customGastos.map(cg => detail[cg.id] || [])]
      .reduce((s, rows) => s + catTot(rows).usd, 0);
    const prorBase = enBlanco - tAdu + cash;
    const totalGastos = enBlanco + cash;
    const totalM3 = proveedores.reduce((s, p) => s + n(p.m3), 0);

    // TC de la operación: primer TC disponible entre todos los proveedores (cobro o VEP).
    // Permite calcular "a cobrar" de proveedores SIN VEP propio (cuando el VEP se
    // agrupa en uno solo), sin obligar a cargar TC en cada fila.
    const fallbackTC = proveedores.reduce((tc, p, i) => {
      if (tc > 0) return tc;
      const cb = cobrar[i] || {};
      return n(cb.tc) > 0 ? n(cb.tc) : (n(p.tributosTC) > 0 ? n(p.tributosTC) : 0);
    }, 0);

    const perProv = proveedores.map((p, i) => {
      const clienteNombre = p.clienteId ? clientes.find(c => c.id === p.clienteId)?.nombre || '' : '';
      const ratio = totalM3 > 0 ? n(p.m3) / totalM3 : 0;
      const prorBlancoPesos = Math.round(ratio * (enBlanco - tAdu));
      const prorCashPesos   = Math.round(ratio * cash);
      const prorPesos       = prorBlancoPesos + prorCashPesos;
      const vepPesos = Math.round(n(p.tributosUSD) * n(p.tributosTC));
      const costoFinal = prorPesos + vepPesos;
      const cb = cobrar[i] || { tc: 0, honorarios: false, despAdic: 0 };
      const tcOwn = n(cb.tc) > 0 ? n(cb.tc) : n(p.tributosTC);
      const tcUsed = tcOwn > 0 ? tcOwn : fallbackTC;
      const tcInherited = tcOwn <= 0 && fallbackTC > 0;
      const gastosUSD = tcUsed > 0 ? Math.round((costoFinal / tcUsed) * 100) / 100 : 0;
      const cashUSD   = tcUsed > 0 ? Math.round((prorCashPesos / tcUsed) * 100) / 100 : 0;
      const origenUSD = n(p.gastosOrigenUSD);
      // Honorarios = máx(4%, mínimo USD si está cargado). Vacío = solo 4% (compat
      // con operaciones viejas).
      const honPct4 = Math.round((gastosUSD + origenUSD) * 0.04 * 100) / 100;
      const honorarios = cb.honorarios ? Math.max(honPct4, n(cb.honMin)) : 0;
      // Giro de divisas al exterior: servicio cobrado al cliente cuando Brandon
      // hace el pago al proveedor. % sobre lo girado + gasto fijo (ej. USD 45 de
      // transferencia); un total manual pisa el cálculo. Todas las opciones.
      const giroBase = n(cb.giroMonto) * (n(cb.giroPct) / 100) + n(cb.giroFijo);
      const giroUSD = n(cb.giroTotal) > 0 ? n(cb.giroTotal) : Math.round(giroBase * 100) / 100;
      // Ganancia: monto interno que se suma al total a cobrar SIN desglosarse
      // en la vista general ni en el estado de cuenta del cliente.
      const totalUSD = Math.round((gastosUSD + origenUSD + honorarios + n(cb.despAdic) + n(cb.ganancia) + giroUSD) * 100) / 100;
      return { ...p, clienteNombre, ratio, prorPesos, prorBlancoPesos, prorCashPesos, cashUSD, vepPesos, costoFinal, tcUsed, tcInherited, gastosUSD, origenUSD, honorarios, giroUSD, totalUSD, cb, idx: i };
    });
    return {
      tNav, tTerm, tAdu, tTra, tDes, tAdm, tFlt, usdSinTC, fallbackTC,
      enBlanco, cash, prorBase, totalGastos, totalM3, perProv, catsBlanco, despBlanco,
      totalACobrar:  perProv.reduce((s, p) => s + p.totalUSD, 0),
      totalCobrado:  perProv.reduce((s, p) => s + (p.cb.cobrado ? p.totalUSD : 0), 0),
      totalCashUSD:  perProv.reduce((s, p) => s + p.cashUSD, 0),
      cobrados:      perProv.filter(p => p.cb.cobrado).length,
    };
  }, [detail, clientes]);

  // Flujo macro derivado de datos reales (estado op + tracking + despacho + cobranzas).
  const flowState = useMemo(() => importFlowState({
    op, ship: shipment, desp: despacho,
    cobranza: { cobrados: calc.cobrados, total: calc.perProv.length },
    giro: calc.perProv.some(pp => pp.giroUSD > 0) ? 'hecho' : undefined,
    lockEntrega: calc.perProv.some(x => x.cb.exigirPago && !x.cb.cobrado),
  }), [op, shipment, despacho, calc]);

  const totalTasks = CHECKLIST.length;
  const doneTasks  = CHECKLIST.filter(t => checked.has(t.id)).length;
  const progress   = Math.round((doneTasks / totalTasks) * 100);

  const cap = CONTAINER_M3[op.contenedor];
  const fillPct = cap ? (calc.totalM3 / cap) * 100 : 0;

  // VEP reconciliation
  const vepAsignado = calc.perProv.reduce((s, p) => s + (p.vepPesos || 0), 0);
  const vepTotal = calc.tAdu || 0;
  const vepDiff = Math.round(vepTotal - vepAsignado);
  const vepMatch = Math.abs(vepDiff) <= 1 && vepTotal > 0;
  const showVepBanner = vepTotal > 0 || vepAsignado > 0;

  if (detailLoading) {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center', color: MUTED, fontSize: '0.82rem' }}>
        Cargando operación...
      </div>
    );
  }

  const BUILTIN = [
    { id: 'naviera',     label: 'Naviera',     color: '#0284c7', kind: 'blanco', total: calc.tNav,  rows: detail.naviera },
    { id: 'terminal',    label: 'Terminal',    color: '#7c3aed', kind: 'blanco', total: calc.tTerm, rows: detail.terminal },
    { id: 'aduana',      label: 'VEP Aduana',  color: '#dc2626', kind: 'blanco', total: calc.tAdu,  rows: detail.aduana, note: 'No se proratea — se asigna manualmente por proveedor' },
    { id: 'transporte',  label: 'Transporte',  color: '#d97706', kind: 'blanco', total: calc.tTra,  rows: detail.transporte },
    { id: 'despachante', label: 'Despachante', color: '#059669', kind: 'blanco', total: calc.tDes,  rows: detail.despachante },
    { id: 'admin',       label: 'Admin',       color: '#64748b', kind: 'blanco', total: calc.tAdm,  rows: detail.admin },
    { id: 'fleteIntl',   label: 'Flete Internacional', color: '#0891b2', kind: 'cash', builtin: true, total: calc.tFlt, rows: detail.fleteIntl, note: 'CASH propio — se proratea por m³ y se recupera de cada cliente' },
  ];
  const customGastosList = (detail.customGastos || []).map(cg => ({
    ...cg, total: catTot(detail[cg.id] || []).pesos, rows: detail[cg.id] || [], custom: true,
  }));
  const ALL_GASTOS = [...BUILTIN, ...customGastosList].map(g => ({ ...g, usdPend: catTot(g.rows || []).usd }));
  const GASTOS_BLANCO = ALL_GASTOS.filter(g => g.kind === 'blanco');
  const GASTOS_CASH   = ALL_GASTOS.filter(g => g.kind === 'cash');

  return (
    <div style={{ fontFamily: 'inherit', color: INK, paddingBottom: '5rem', background: '#fff' }}>

      {/* Sticky header */}
      <div className="op-sticky-header" style={{ position: 'sticky', top: 0, zIndex: 30, background: '#fff', paddingTop: 4, paddingBottom: 0, marginBottom: '1.25rem', borderBottom: `1px solid ${HAIR}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <button onClick={handleBack} className="tt-ghost" style={{ ...GHOST, display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginBottom: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Volver
            </button>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 350, letterSpacing: '-0.02em', color: INK, margin: 0, lineHeight: 1.2 }}>{toTitle(op.nombre)}</h1>
            <p style={{ display: 'flex', gap: '0.7rem', marginTop: 4, fontSize: '0.74rem', color: MUTED, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'ui-monospace,monospace', ...TAB }}>{op.bl || '—'}</span>
              <span>{op.contenedor}</span>
              <span>ETA {op.eta || '—'}</span>
              <span>{op.estado}</span>
              {isDirty && !saveFlash && <span style={{ color: AMBER, fontWeight: 600 }}>Sin guardar</span>}
              {saveFlash && <span style={{ color: GREEN, fontWeight: 600 }}>Guardado</span>}
            </p>
          </div>
          <button onClick={saveAll} disabled={!isDirty || saving}
            style={isDirty || saving
              ? { ...BTN_DARK, background: saving ? BODY : INK, cursor: saving ? 'default' : 'pointer', marginTop: 4 }
              : { background: 'none', border: 'none', color: FAINT, fontSize: '0.78rem', fontWeight: 600, padding: '0.5rem 0', cursor: 'default', marginTop: 4 }}>
            {saving ? 'Guardando…' : (isDirty ? 'Guardar' : 'Guardado')}
          </button>
        </div>

        {/* Métricas en línea (sin cajas) */}
        <div className="gestion-kpi-strip" style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap', alignItems: 'flex-start', margin: '1.1rem 0 0.9rem' }}>
          {[
            { lbl: 'Costos totales', val: fmtP(calc.totalGastos), sub: `${fmtP(calc.enBlanco)} blanco + ${fmtP(calc.cash)} cash` },
            { lbl: 'Por cobrar', val: fmtU(calc.totalACobrar - calc.totalCobrado), sub: `de ${fmtU(calc.totalACobrar)} total`, accent: calc.totalACobrar - calc.totalCobrado > 0 ? AMBER : INK },
            { lbl: 'Cobrado', val: fmtU(calc.totalCobrado), sub: `${calc.cobrados}/${calc.perProv.length} proveedores`, accent: GREEN },
            { lbl: 'Ocupación', val: cap ? `${calc.totalM3.toFixed(1)} / ${cap} m³` : `${calc.totalM3.toFixed(1)} m³`, sub: cap ? `${fillPct.toFixed(0)}% del contenedor` : '—', bar: cap ? fillPct : null, barColor: fillPct > 90 ? AMBER : INK },
            { lbl: 'Checklist', val: `${doneTasks}/${totalTasks}`, sub: `${progress}% completado`, accent: progress === 100 ? GREEN : INK, bar: progress, barColor: GREEN },
          ].map(({ lbl, val, sub, accent = INK, bar, barColor }) => (
            <div key={lbl} style={{ minWidth: 0 }}>
              <p style={{ fontSize: '1.15rem', fontWeight: 700, color: accent, lineHeight: 1.15, whiteSpace: 'nowrap', ...TAB }}>{val}</p>
              <p style={{ fontSize: '0.62rem', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{lbl}</p>
              <p style={{ fontSize: '0.62rem', color: MUTED, marginTop: 1, ...TAB }}>{sub}</p>
              {/* Barra solo con progreso parcial en curso (ni 0% ni 100%) */}
              {bar != null && bar > 0 && bar < 100 && (
                <div style={{ marginTop: 5, height: 3, background: HAIR, maxWidth: 130 }}>
                  <div style={{ width: `${Math.min(bar, 100)}%`, height: '100%', background: barColor || INK }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Línea de vida de la importación — derivada, no editable */}
      <div style={{ marginBottom: '1rem' }}>
        <FlowTimeline state={flowState} />
        {flowState.lockEntrega && ['Listo p/ retiro', 'En tránsito local'].includes(op.estado) && (
          <div style={{ marginTop: 10, borderLeft: `2px solid ${RED}`, paddingLeft: 12 }}>
            <p style={{ fontSize: '0.78rem', color: BODY }}><b style={{ color: RED, fontWeight: 700 }}>NO ENTREGAR</b> — hay clientes con pago exigido antes de la entrega y saldo pendiente.</p>
          </div>
        )}
      </div>

      {/* Editor de embarque embebido — misma fuente que Tracking (/api/tracking) */}
      {shipModal && (
        <EmbarqueModal
          initial={shipment}
          defaults={{ bl: op.bl || '', contenedores: op.contenedor || '', eta: op.eta || '', agente: 'Bruce', operation_id: op.id, suppliers: '' }}
          onClose={() => setShipModal(false)}
          onSaved={(sv) => { setShipModal(false); setShipment(sv); }}
        />
      )}

      {/* MAIN LAYOUT */}
      <div className="gestion-main-split" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1rem', alignItems: 'start' }}>

        {/* LEFT: tabla + reparto de la plata (debajo, para no estirar el carril derecho) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.25rem', minWidth: 0 }}>
        <div>
          <div style={{ padding: '0 0 0.5rem', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
              <p style={{ fontSize: '0.88rem', fontWeight: 600, color: INK }}>Proveedores</p>
              <span style={{ fontSize: '0.68rem', color: MUTED }}>{calc.perProv.length} cargados · {calc.totalM3.toFixed(1)} m³</span>
            </div>
            <button onClick={addProveedor} className="tt-ghost" style={{ ...GHOST, fontWeight: 600, whiteSpace: 'nowrap' }}>
              + Proveedor
            </button>
          </div>

          {showVepBanner && (
            <div style={{ margin: '0.8rem 0 0.2rem', borderLeft: `2px solid ${vepMatch ? GREEN : AMBER}`, paddingLeft: 12 }}>
              <p style={{ fontSize: '0.78rem', color: BODY, ...TAB }}>
                {vepMatch
                  ? <>VEP asignado: <b style={{ color: GREEN, fontWeight: 600 }}>{fmtP(vepAsignado)}</b> — coincide con el total</>
                  : vepTotal === 0
                    ? <>Cargá el <b style={{ color: INK, fontWeight: 600 }}>VEP Aduana total</b> en Costos compartidos para validar el reparto.</>
                    : <>VEP asignado a proveedores: <b style={{ color: AMBER, fontWeight: 600 }}>{fmtP(vepAsignado)}</b> de {fmtP(vepTotal)} total · {vepDiff > 0 ? <>faltan <b style={{ color: AMBER, fontWeight: 600 }}>{fmtP(Math.abs(vepDiff))}</b></> : <>asignaste <b style={{ color: AMBER, fontWeight: 600 }}>{fmtP(Math.abs(vepDiff))}</b> de más</>}</>}
              </p>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="master-providers-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr>
                  {[
                    { l: 'Proveedor', a: 'left' }, { l: 'Tipo', a: 'left' }, { l: 'm³', a: 'right' },
                    { l: 'FOB USD', a: 'right' }, { l: 'Costo (AR$)', a: 'right' }, { l: 'TC', a: 'right' },
                    { l: 'A cobrar (USD)', a: 'right' }, { l: 'Estado', a: 'left' }, { l: '', a: 'right' },
                  ].map((c, idx) => (
                    <th key={idx} style={{ fontSize: '0.6rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.6rem 0.6rem', textAlign: c.a, borderBottom: `1px solid ${HAIR}` }}>{c.l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Agrupar por cliente (mismo criterio que el chip "Tipo"), en orden de aparición.
                  const groups = [];
                  calc.perProv.forEach(p => {
                    const key = p.tipo === 'Propio' ? 'Propio' : (p.clienteNombre || 'Cliente s/asignar');
                    let g = groups.find(x => x.key === key);
                    if (!g) { g = { key, items: [] }; groups.push(g); }
                    g.items.push(p);
                  });
                  return groups.map(g => (
                    <FRow key={'grp-' + g.key}>
                      {(
                        <tr style={{ borderBottom: `1px solid ${HAIR}` }}>
                          <td colSpan={2} style={{ padding: '1.1rem 0.6rem 0.35rem' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                              <span style={GROUP_H}>{g.key}</span>
                              <span style={{ fontSize: '0.64rem', color: FAINT }}>{g.items.length} proveedor{g.items.length === 1 ? '' : 'es'}</span>
                              {g.key !== 'Propio' && (
                                <button onClick={() => setEstadoCuenta(g)} className="tt-ghost" title="Hoja SIN ganancia, TC ni pesos internos — segura para captura o PDF" style={{ ...GHOST, fontSize: '0.64rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  Resumen p/ cliente
                                </button>
                              )}
                            </span>
                          </td>
                          <td style={{ padding: '1.1rem 0.6rem 0.35rem', textAlign: 'right', fontSize: '0.7rem', fontWeight: 600, color: MUTED, ...TAB }}>{g.items.reduce((s, x) => s + n(x.m3), 0).toFixed(2)}</td>
                          <td style={{ padding: '1.1rem 0.6rem 0.35rem', textAlign: 'right', fontSize: '0.7rem', fontWeight: 600, color: MUTED, ...TAB }}>{fmtUcompact(g.items.reduce((s, x) => s + n(x.fobUSD), 0))}</td>
                          <td style={{ padding: '1.1rem 0.6rem 0.35rem', textAlign: 'right', fontSize: '0.7rem', fontWeight: 600, color: MUTED, ...TAB }}>{fmtP(g.items.reduce((s, x) => s + x.costoFinal, 0))}</td>
                          <td />
                          <td style={{ padding: '1.1rem 0.6rem 0.35rem', textAlign: 'right', fontSize: '0.76rem', fontWeight: 700, color: INK, whiteSpace: 'nowrap', ...TAB }}><span style={{ fontSize: '0.58rem', fontWeight: 600, color: MUTED }}>USD </span>{fmtUcompact(g.items.reduce((s, x) => s + x.totalUSD, 0))}</td>
                          <td colSpan={2} style={{ padding: '1.1rem 0.6rem 0.35rem', fontSize: '0.64rem', color: MUTED, whiteSpace: 'nowrap', ...TAB }}>{g.items.filter(x => x.cb.cobrado).length}/{g.items.length} cobrados</td>
                        </tr>
                      )}
                      {g.items.map(p => {
                        const i = p.idx;
                        const isExp = expanded === i;
                  const isCobrado = p.cb.cobrado;
                  return (
                    <FRow key={p.id || i}>
                      <tr onClick={() => setExpanded(isExp ? null : i)} className="tt-row"
                        style={{ cursor: 'pointer', opacity: isCobrado && !isExp ? 0.55 : 1, borderBottom: isExp ? 'none' : `1px solid ${HAIR}` }}
                      >
                        <td style={{ padding: '0.8rem 0.6rem', fontWeight: 600, fontSize: '0.8rem', color: INK }}>{p.nombre || <span style={{ color: FAINT, fontWeight: 400 }}>— sin nombre —</span>}</td>
                        <td style={{ padding: '0.8rem 0.6rem' }}>
                          <span style={{ color: MUTED, fontSize: '0.7rem' }}>
                            {p.tipo === 'Propio' ? 'Propio' : (p.clienteNombre || 'Cliente s/asignar')}
                          </span>
                        </td>
                        <td style={{ padding: '0.8rem 0.6rem', textAlign: 'right', fontSize: '0.74rem', color: BODY, ...TAB }}>{p.m3 || '—'}</td>
                        <td style={{ padding: '0.8rem 0.6rem', textAlign: 'right', fontSize: '0.74rem', color: BODY, ...TAB }}>{n(p.fobUSD) > 0 ? fmtUcompact(n(p.fobUSD)) : '—'}</td>
                        <td style={{ padding: '0.8rem 0.6rem', textAlign: 'right', fontSize: '0.74rem', color: BODY, ...TAB }}>{p.costoFinal > 0 ? fmtP(p.costoFinal) : '—'}</td>
                        <td style={{ padding: '0.8rem 0.6rem', textAlign: 'right', fontSize: '0.74rem', color: MUTED, ...TAB }}>
                          {p.tcUsed
                            ? <span title={p.tcInherited ? 'TC heredado de la operación (este proveedor no tiene VEP/TC propio)' : undefined} style={p.tcInherited ? { fontStyle: 'italic', color: FAINT } : undefined}>{p.tcUsed}{p.tcInherited ? '*' : ''}</span>
                            : '—'}
                        </td>
                        <td style={{ padding: '0.8rem 0.6rem', textAlign: 'right', fontWeight: 700, fontSize: '0.95rem', color: INK, whiteSpace: 'nowrap', ...TAB }}>
                          {p.totalUSD > 0 ? fmtUcompact(p.totalUSD) : '—'}
                          {(() => {
                            // Puente AR$→USD: gastos convertidos + servicios (honorarios, adic., giro, ganancia).
                            const gastos = Math.round((p.gastosUSD + p.origenUSD) * 100) / 100;
                            const serv = Math.round((p.totalUSD - gastos) * 100) / 100;
                            return p.totalUSD > 0 && serv > 0 ? (
                              <span style={{ display: 'block', fontSize: '0.6rem', fontWeight: 400, color: MUTED, marginTop: 2 }}>{fmtUcompact(gastos)} gastos + {fmtUcompact(serv)} serv.</span>
                            ) : null;
                          })()}
                        </td>
                        <td style={{ padding: '0.8rem 0.6rem' }}>
                          {isCobrado ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: GREEN, fontSize: '0.72rem', fontWeight: 600 }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                              Cobrado
                            </span>
                          ) : (
                            <span style={{ color: AMBER, fontSize: '0.72rem', fontWeight: 600 }}>Pendiente</span>
                          )}
                          {!isCobrado && p.cb.exigirPago && (
                            <span title="No entregar la mercadería hasta cancelar el saldo" style={{ display: 'block', marginTop: 3, fontSize: '0.58rem', fontWeight: 700, color: RED, whiteSpace: 'nowrap' }}>ENTREGA CONTRA PAGO</span>
                          )}
                        </td>
                        <td style={{ padding: '0.8rem 0.6rem', textAlign: 'right' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2" style={{ transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9"/></svg>
                        </td>
                      </tr>

                      {isExp && (
                        <tr style={{ borderBottom: `1px solid ${HAIR}` }}>
                          <td colSpan={9} style={{ padding: '0 0.6rem 1.25rem', borderTop: '1px solid #f8fafc' }}>
                            <ExpandedDetail
                              p={p}
                              clientes={clientes}
                              onCreateCliente={createCliente}
                              onUpdProveedor={(f, v) => updProveedor(i, f, v)}
                              onUpdCobrar={(f, v) => updCobrar(i, f, v)}
                              onToggleCobrado={() => toggleCobrado(i, p.cb.cobrado)}
                              onRemove={() => removeProveedor(i)}
                            />
                          </td>
                        </tr>
                      )}
                    </FRow>
                  );
                      })}
                    </FRow>
                  ));
                })()}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `1px solid ${LINE}` }}>
                  <td style={{ padding: '0.7rem 0.6rem', ...GROUP_H }}>Total</td>
                  <td />
                  <td style={{ padding: '0.7rem 0.6rem', textAlign: 'right', fontWeight: 600, fontSize: '0.74rem', color: BODY, ...TAB }}>{calc.totalM3.toFixed(2)}</td>
                  <td style={{ padding: '0.7rem 0.6rem', textAlign: 'right', fontWeight: 600, fontSize: '0.74rem', color: BODY, ...TAB }}>{fmtUcompact(calc.perProv.reduce((s, p) => s + n(p.fobUSD), 0))}</td>
                  <td style={{ padding: '0.7rem 0.6rem', textAlign: 'right', fontWeight: 600, fontSize: '0.74rem', color: BODY, ...TAB }}>{fmtP(calc.perProv.reduce((s, p) => s + p.costoFinal, 0))}</td>
                  <td />
                  <td style={{ padding: '0.7rem 0.6rem', textAlign: 'right', fontWeight: 700, fontSize: '0.95rem', color: INK, whiteSpace: 'nowrap', ...TAB }}>{fmtU(calc.totalACobrar)}</td>
                  <td colSpan={2} style={{ padding: '0.7rem 0.6rem', fontSize: '0.7rem', color: MUTED, ...TAB }}>{calc.cobrados}/{calc.perProv.length} cobrados</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ══ REPARTO DE LA PLATA — a quién le pagás y qué cobrás, en 4 números ══ */}
        <div>
          <div style={{ padding: '0 0 0.5rem', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <p style={{ fontSize: '0.88rem', fontWeight: 600, color: INK }}>Reparto de la plata</p>
            <span style={{ fontSize: '0.66rem', color: MUTED }}>a quién le pagás y qué cobrás en esta operación</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(225px, 1fr))', gap: '2rem', padding: '1.1rem 0 0.4rem' }}>

            {/* 1 · Sociedad importadora: todo lo facturado (tributos, naviera, terminal…)
                Moneda estandarizada: USD primero (al T.C. de la operación), pesos como
                referencia — igual que el resto de la banda. Sin T.C. cae a pesos. */}
            {(() => {
              const tcOp = calc.fallbackTC;
              const uOf = (p) => tcOp > 0 ? p / tcOp : null;
              // Sin el despachante: su factura tiene tarjeta propia (no sumar dos veces).
              const socPesos = calc.enBlanco - calc.despBlanco;
              const uB = uOf(socPesos);
              return (
                <div style={{ minWidth: 0 }}>
                  <p style={{ ...GROUP_H, marginBottom: 6 }}>A la sociedad importadora</p>
                  <p style={{ fontSize: '1.15rem', fontWeight: 700, color: INK, lineHeight: 1.1, ...TAB }}>{uB != null ? fmtU(uB) : fmtP(socPesos)}</p>
                  <p style={{ fontSize: '0.62rem', color: MUTED, marginTop: 3, marginBottom: 8, ...TAB }}>{uB != null ? `${fmtP(socPesos)} facturado · al T.C. ${tcOp}` : 'facturado · cargá un T.C. para verlo en USD'}</p>
                  {calc.catsBlanco.map(cb => (
                    <div key={cb.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.68rem', padding: '0.22rem 0', color: BODY, borderTop: '1px solid #f8fafc' }}>
                      <span>{cb.label}</span><span style={{ fontWeight: 600, color: '#374151', ...TAB }}>{uOf(cb.monto) != null ? fmtU(uOf(cb.monto)) : fmtP(cb.monto)}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* 2 · Despachante: lo que le pagás sale de los costos YA cargados en la
                operación (categoría "Despachante" + adicionales por proveedor). La
                cuenta corriente del módulo Despachante es complemento, no requisito.
                OJO concepto: "despacho" = trámite aduanero (tributos, tile 1) — esto
                es la factura del DESPACHANTE. */}
            {(() => {
              const d = despacho;
              const pag   = d ? numDesp(d.total_pagado) : 0;
              const saldo = d ? numDesp(d.saldo) : 0;
              const adicCobrados = calc.perProv.reduce((s, p) => s + n(p.cb.despAdic), 0);
              return (
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <p style={GROUP_H}><DotNegro />Al despachante</p>
                    <a href="/gestion/despachante" className="tt-ghost" style={{ fontSize: '0.62rem', fontWeight: 600, color: BODY, textDecoration: 'none', whiteSpace: 'nowrap' }}>Ver cuenta →</a>
                  </div>
                  <p style={{ fontSize: '1.15rem', fontWeight: 700, color: INK, lineHeight: 1.1, ...TAB }}>{calc.fallbackTC > 0 ? fmtU(calc.despBlanco / calc.fallbackTC) : fmtP(calc.despBlanco)}</p>
                  <p style={{ fontSize: '0.62rem', color: MUTED, marginTop: 3, marginBottom: 8, ...TAB }}>{calc.fallbackTC > 0 ? `${fmtP(calc.despBlanco)} en gastos de la operación · al T.C. ${calc.fallbackTC}` : 'sus gastos cargados en la operación'}</p>
                  {adicCobrados > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.68rem', padding: '0.22rem 0', color: BODY, borderTop: '1px solid #f8fafc' }}>
                      <span>+ Adicionales (los cobrás a clientes)</span><span style={{ fontWeight: 600, color: '#374151', ...TAB }}>{fmtU(adicCobrados)}</span>
                    </div>
                  )}
                  {d ? (<>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.68rem', padding: '0.22rem 0', color: BODY, borderTop: '1px solid #f8fafc' }}>
                      <span>Cuenta corriente · le pagaste</span><span style={{ fontWeight: 600, color: GREEN, ...TAB }}>{fmtU(pag)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.68rem', padding: '0.22rem 0', color: BODY, borderTop: '1px solid #f8fafc' }}>
                      <span>Saldo</span><span style={{ fontWeight: 700, color: saldo > 0 ? RED : GREEN, ...TAB }}>{saldo > 0 ? `Le debés ${fmtU(saldo)}` : saldo < 0 ? `A tu favor ${fmtU(-saldo)}` : 'Saldado'}</span>
                    </div>
                  </>) : (
                    <p style={{ fontSize: '0.6rem', color: FAINT, marginTop: 6 }}>Su cuenta corriente (pagos y saldo) vive en Despachante — sin registro para este B/L todavía.</p>
                  )}
                </div>
              );
            })()}

            {/* 3 · Tu bolsillo: cash puesto y cuánto ya volvió vía cobranzas */}
            {(() => {
              const conCash = calc.perProv.filter(p => p.cashUSD > 0);
              const puse   = conCash.reduce((s, p) => s + p.cashUSD, 0);
              const vuelto = conCash.reduce((s, p) => s + (p.cb.cobrado ? p.cashUSD : 0), 0);
              const falta  = Math.round((puse - vuelto) * 100) / 100;
              const pctRec = puse > 0 ? (vuelto / puse) * 100 : 0;
              return (
                <div style={{ minWidth: 0 }}>
                  <p style={{ ...GROUP_H, marginBottom: 6 }}><DotNegro />De tu bolsillo · cash</p>
                  {calc.cash > 0 || puse > 0 ? (<>
                    <p style={{ fontSize: '1.15rem', fontWeight: 700, color: INK, lineHeight: 1.1, ...TAB }}>{fmtU(puse)}</p>
                    <p style={{ fontSize: '0.62rem', color: MUTED, marginTop: 3, marginBottom: 8, ...TAB }}>{fmtP(calc.cash)} en gastos cash · vuelve cuando los clientes pagan</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.68rem', padding: '0.22rem 0', color: BODY, borderTop: '1px solid #f8fafc' }}>
                      <span>Recuperado</span><span style={{ fontWeight: 600, color: GREEN, ...TAB }}>{fmtU(vuelto)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.68rem', padding: '0.22rem 0', color: BODY, borderTop: '1px solid #f8fafc' }}>
                      <span>Te falta</span><span style={{ fontWeight: 700, color: falta > 0 ? AMBER : GREEN, ...TAB }}>{falta > 0 ? fmtU(falta) : 'Todo'}</span>
                    </div>
                    {/* Barra solo con recupero parcial en curso */}
                    {pctRec > 0 && pctRec < 100 && (
                      <div style={{ height: 3, background: HAIR, marginTop: 6 }}>
                        <div style={{ width: `${Math.min(pctRec, 100)}%`, height: '100%', background: GREEN }} />
                      </div>
                    )}
                  </>) : (
                    <p style={{ fontSize: '0.7rem', color: MUTED, lineHeight: 1.5 }}>No pusiste cash en esta operación.</p>
                  )}
                </div>
              );
            })()}

            {/* 4 · Cobrás vos: total a clientes, cobrado y pendiente */}
            <div style={{ minWidth: 0 }}>
              <p style={{ ...GROUP_H, marginBottom: 6 }}>Cobrás a clientes</p>
              <p style={{ fontSize: '1.15rem', fontWeight: 700, color: INK, lineHeight: 1.1, ...TAB }}>{fmtU(calc.totalACobrar)}</p>
              <p style={{ fontSize: '0.62rem', color: MUTED, marginTop: 3, marginBottom: 8 }}>incluye gastos + servicios (con tu ganancia camuflada)</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.68rem', padding: '0.22rem 0', color: BODY, borderTop: '1px solid #f8fafc' }}>
                <span>Cobrado</span><span style={{ fontWeight: 600, color: GREEN, ...TAB }}>{fmtU(calc.totalCobrado)} · {calc.cobrados}/{calc.perProv.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.68rem', padding: '0.22rem 0', color: BODY, borderTop: '1px solid #f8fafc' }}>
                <span>Pendiente</span><span style={{ fontWeight: 700, color: calc.totalACobrar - calc.totalCobrado > 0 ? AMBER : GREEN, ...TAB }}>{fmtU(calc.totalACobrar - calc.totalCobrado)}</span>
              </div>
              {/* Barra solo con cobranza parcial en curso */}
              {calc.totalACobrar > 0 && calc.totalCobrado > 0 && calc.totalCobrado < calc.totalACobrar && (
                <div style={{ height: 3, background: HAIR, marginTop: 6 }}>
                  <div style={{ width: `${Math.min((calc.totalCobrado / calc.totalACobrar) * 100, 100)}%`, height: '100%', background: GREEN }} />
                </div>
              )}
            </div>

          </div>

          {/* El mismo reparto, POR CLIENTE: cada fila suma exacto su "A cobrar"
              (sociedad + despachante + bolsillo + servicios). Necesita T.C. */}
          {calc.fallbackTC > 0 && calc.perProv.length > 0 && (() => {
            const tc = calc.fallbackTC;
            const socBase = calc.enBlanco - calc.tAdu - calc.despBlanco; // prorrateable sin VEP ni despachante
            const groups = [];
            calc.perProv.forEach(p => {
              const key = p.tipo === 'Propio' ? 'Propio' : (p.clienteNombre || 'Cliente s/asignar');
              let g = groups.find(x => x.key === key);
              if (!g) { g = { key, soc: 0, desp: 0, bols: 0, serv: 0, cobrar: 0, cobrados: 0, n: 0 }; groups.push(g); }
              const soc  = (p.vepPesos + p.ratio * socBase) / tc;
              const desp = (p.ratio * calc.despBlanco) / tc + n(p.cb.despAdic);
              const bols = p.cashUSD;
              const serv = p.totalUSD - soc - desp - bols; // honorarios+ganancia+giro+origen (cierra la fila)
              g.soc += soc; g.desp += desp; g.bols += bols; g.serv += serv;
              g.cobrar += p.totalUSD; g.n++; if (p.cb.cobrado) g.cobrados++;
            });
            const TH2 = { fontSize: '0.58rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.4rem 0.6rem', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: `1px solid ${HAIR}` };
            const TD2 = { fontSize: '0.74rem', padding: '0.5rem 0.6rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: BODY, borderBottom: `1px solid ${HAIR}`, whiteSpace: 'nowrap' };
            return (
              <div style={{ marginTop: '0.9rem', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH2, textAlign: 'left' }}>Por cliente · USD</th>
                      <th style={TH2}>Sociedad</th>
                      <th style={TH2}>Despachante</th>
                      <th style={TH2}>Tu bolsillo</th>
                      <th style={TH2}>Servicios (tuyos)</th>
                      <th style={TH2}>= A cobrar</th>
                      <th style={TH2}>Cobrado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(g => (
                      <tr key={g.key} className="tt-row">
                        <td style={{ ...TD2, textAlign: 'left', fontWeight: 600, color: INK }}>{g.key}</td>
                        <td style={TD2}>{fmtUcompact(g.soc)}</td>
                        <td style={TD2}>{fmtUcompact(g.desp)}</td>
                        <td style={TD2}>{fmtUcompact(g.bols)}</td>
                        <td style={TD2}>{fmtUcompact(g.serv)}</td>
                        <td style={{ ...TD2, fontWeight: 700, color: INK }}>{fmtUcompact(g.cobrar)}</td>
                        <td style={{ ...TD2, color: g.cobrados === g.n ? GREEN : MUTED }}>{g.cobrados}/{g.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
        </div>

        {/* RIGHT RAIL */}
        <div style={{ position: 'sticky', top: 180, display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          <div>
            <button onClick={() => setCostosOpen(!costosOpen)} style={{ width: '100%', padding: '0 0 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', borderBottom: `1px solid ${LINE}`, cursor: 'pointer' }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: INK }}>Costos compartidos</p>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2.5" style={{ transform: costosOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {costosOpen && (
              <div style={{ paddingTop: '0.6rem' }}>

                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: '0.2rem 0.25rem 0.2rem' }}>
                  <span style={GROUP_H}>Sociedad · facturado</span>
                  <span style={{ fontSize: '0.62rem', color: MUTED, ...TAB }}>{fmtP(calc.enBlanco)}{calc.fallbackTC > 0 && calc.enBlanco > 0 ? ` · U$ ${Math.round(calc.enBlanco / calc.fallbackTC).toLocaleString('es-AR')}` : ''}</span>
                </div>
                {GASTOS_BLANCO.map(g => (
                  <CategoryBtn key={g.id} g={g} onClick={() => setEditingCat(g)} />
                ))}

                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: '1rem 0.25rem 0.2rem' }}>
                  <span style={GROUP_H}><DotNegro />Pagado por vos · cash</span>
                  <span style={{ fontSize: '0.62rem', color: BODY, fontWeight: 600, ...TAB }}>{fmtP(calc.cash)}{calc.fallbackTC > 0 && calc.cash > 0 ? ` · U$ ${Math.round(calc.cash / calc.fallbackTC).toLocaleString('es-AR')}` : ''}</span>
                </div>
                {GASTOS_CASH.map(g => (
                  <CategoryBtn key={g.id} g={g} onClick={() => setEditingCat(g)} cash />
                ))}
                <p style={{ fontSize: '0.62rem', color: MUTED, padding: '0.4rem 0.25rem 0', lineHeight: 1.4 }}>
                  Lo pagaste vos de tu bolsillo · se recupera de cada cliente según su m³
                </p>

                <button onClick={() => setAddingCat(true)} className="tt-ghost" style={{ ...GHOST, marginTop: 12, padding: '0.2rem 0.25rem', fontSize: '0.7rem', fontWeight: 600 }}>
                  + Agregar categoría
                </button>

                {calc.usdSinTC > 0 && (
                  <div style={{ marginTop: 12, borderLeft: `2px solid ${AMBER}`, paddingLeft: 12, fontSize: '0.64rem', color: BODY, lineHeight: 1.45 }}>
                    <b style={{ color: AMBER, fontVariantNumeric: 'tabular-nums' }}>USD {calc.usdSinTC.toLocaleString('es-AR')}</b> cargados sin T.C. — no entran al total ni al prorrateo. Cargales el T.C. en su categoría.
                  </div>
                )}
                <div style={{ marginTop: 12, paddingTop: 8, borderTop: `1px solid ${LINE}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 0.25rem' }}>
                    <span style={{ fontSize: '0.7rem', color: BODY, fontWeight: 600 }}>Total general</span>
                    <span style={{ fontSize: '0.85rem', color: INK, fontWeight: 700, ...TAB }}>{fmtP(calc.totalGastos)}</span>
                  </div>
                  {calc.fallbackTC > 0 && calc.totalGastos > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 3, padding: '0 0.25rem' }}>
                      <span style={{ fontSize: '0.6rem', color: MUTED }}>≈ al T.C. {calc.fallbackTC}</span>
                      <span style={{ fontSize: '0.72rem', color: BODY, fontWeight: 600, ...TAB }}>USD {Math.round(calc.totalGastos / calc.fallbackTC).toLocaleString('es-AR')}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Cotizado vs a cobrar (si la operación vino de una cotización) */}
          {detail.totalCotizadoUsd ? (() => {
            const cot = n(detail.totalCotizadoUsd);
            const dif = calc.totalACobrar - cot;
            const up = dif >= 0;
            return (
              <div>
                <div style={{ padding: '0 0 0.5rem', borderBottom: `1px solid ${LINE}` }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, color: INK }}>Cotizado vs a cobrar</p>
                </div>
                <div style={{ padding: '0.7rem 0 0', display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.74rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: MUTED }}>Cotizado al cliente</span><span style={{ fontWeight: 600, color: BODY, ...TAB }}>{fmtU(cot)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: MUTED }}>A cobrar (calculado)</span><span style={{ fontWeight: 600, color: INK, ...TAB }}>{fmtU(calc.totalACobrar)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: `1px solid ${HAIR}` }}>
                    <span style={{ color: MUTED }}>Diferencia</span>
                    <span style={{ fontWeight: 700, color: up ? GREEN : RED, ...TAB }}>{up ? '+' : ''}{fmtU(dif)}</span>
                  </div>
                </div>
              </div>
            );
          })() : null}

          {/* Seguimiento del agente (tracking) */}
          <div>
            <div style={{ padding: '0 0 0.5rem', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: INK }}>Embarque · agente</p>
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                {shipment && <button onClick={() => setShipModal(true)} className="tt-ghost" style={{ ...GHOST, fontSize: '0.7rem', fontWeight: 600 }}>Editar</button>}
                <button onClick={() => router.push('/gestion/tracking')} className="tt-ghost" style={{ ...GHOST, fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Forwarding →</button>
              </div>
            </div>
            <div style={{ padding: '0.7rem 0 0' }}>
              {!shipmentLoaded ? (
                <p style={{ fontSize: '0.72rem', color: MUTED }}>Cargando…</p>
              ) : !shipment ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                  <p style={{ fontSize: '0.72rem', color: MUTED, lineHeight: 1.4 }}>Sin embarque cargado (se vincula por N° BL).</p>
                  <button onClick={() => setShipModal(true)} className="tt-ghost" style={{ ...GHOST, fontSize: '0.72rem', fontWeight: 600 }}>
                    + Cargar embarque
                  </button>
                </div>
              ) : (() => {
                const stColor = trackingStatusColor(shipment.status);
                const bal = trackBalNum(shipment.balance_usd);
                const agente = shipment.agente || 'Bruce';
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.72rem', color: BODY, fontWeight: 600 }}>{agente}{shipment.carrier ? ` · ${shipment.carrier}` : ''}</span>
                      <span style={{ marginLeft: 'auto', color: stColor, fontSize: '0.68rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{shipment.status || '—'}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: INK, fontWeight: 600 }}>
                      {shipment.origen || '—'} <span style={{ color: FAINT }}>→</span> {shipment.destino || '—'}
                    </div>
                    <div style={{ display: 'flex', gap: 14, fontSize: '0.72rem' }}>
                      <div><span style={{ color: MUTED }}>Zarpe (ETD): </span><span style={{ color: BODY, fontWeight: 600, ...TAB }}>{shipment.etd || '—'}</span></div>
                      <div><span style={{ color: MUTED }}>ETA: </span><span style={{ color: BODY, fontWeight: 600, ...TAB }}>{shipment.eta || '—'}</span></div>
                    </div>
                    {shipment.total_usd && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
                        <span style={{ color: MUTED }}>Total al agente</span>
                        <span style={{ color: BODY, fontWeight: 600, ...TAB }}>USD {shipment.total_usd}</span>
                      </div>
                    )}
                    {bal > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.68rem', color: RED, fontWeight: 600 }}>Saldo a pagar al agente</span>
                        <span style={{ fontSize: '0.78rem', color: RED, fontWeight: 700, ...TAB }}>USD {shipment.balance_usd}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          <div>
            <div style={{ padding: '0 0 0.5rem', borderBottom: `1px solid ${LINE}` }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: INK }}>Información</p>
            </div>
            <div style={{ padding: '0.7rem 0 0', display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.74rem' }}>
              {[
                ['Contenedor', op.contenedor],
                ['BL', op.bl || '—'],
                ['Fecha alta', op.fecha || '—'],
                ['ETA', op.eta || '—'],
                ['Puerto origen',
                  <input key="po" value={detail.puertoOrigen || ''} onChange={e => updDetail({ puertoOrigen: e.target.value })}
                    placeholder="—" className="tt-uinp"
                    style={{ width: 120, padding: '0.15rem 0', border: 'none', borderBottom: `1px solid ${LINE}`, borderRadius: 0, fontSize: '0.72rem', color: INK, background: 'transparent', outline: 'none', textAlign: 'right' }} />
                ],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: MUTED }}>{l}</span>
                  <span style={{ color: '#374151', fontWeight: 500, ...TAB }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CATEGORY EDIT MODAL */}
      {estadoCuenta && (
        <EstadoCuentaModal group={estadoCuenta} op={op} onClose={() => setEstadoCuenta(null)} />
      )}

      {editingCat && (
        <CategoryEditor
          cat={editingCat}
          rows={detail[editingCat.id] || []}
          onChange={(rows) => updCategory(editingCat.id, rows)}
          onClose={() => setEditingCat(null)}
          onDelete={editingCat.custom ? () => removeCustomCategory(editingCat.id) : null}
        />
      )}

      {/* ADD CUSTOM CATEGORY MODAL */}
      {addingCat && (
        <AddCategoryModal
          onAdd={(data) => { addCustomCategory(data); setAddingCat(false); }}
          onClose={() => setAddingCat(false)}
        />
      )}

      {/* CONFIRM DELETE CATEGORY (reemplaza confirm() del navegador) */}
      {confirmDelCat && (
        <div style={{ ...OVERLAY, zIndex: 1200 }} onClick={() => setConfirmDelCat(null)}>
          <div style={{ ...PANEL, maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <p style={{ ...MODAL_T, marginBottom: '0.4rem' }}>¿Eliminar esta categoría?</p>
            <p style={{ fontSize: '0.8rem', color: BODY, marginBottom: '1.5rem' }}>Se perderán las facturas cargadas. No se puede deshacer.</p>
            <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'flex-end', alignItems: 'center' }}>
              <button onClick={() => setConfirmDelCat(null)} className="tt-ghost" style={GHOST}>Cancelar</button>
              <button onClick={() => doRemoveCustomCategory(confirmDelCat)} style={{ ...GHOST, color: RED, fontWeight: 600 }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Floating checklist FAB */}
      <button className="checklist-fab" onClick={() => setShowChecklist(!showChecklist)} style={{ position: 'fixed', bottom: 24, right: 24, padding: '0.55rem 1rem', borderRadius: 999, border: `1px solid ${LINE}`, background: '#fff', color: INK, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', fontWeight: 600, zIndex: 40, ...TAB }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        Checklist {doneTasks}/{totalTasks}
      </button>

      {/* Checklist drawer */}
      {showChecklist && (
        <>
          <div onClick={() => setShowChecklist(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 50 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(400px, 92vw)', background: '#fff', zIndex: 60, borderLeft: `1px solid ${LINE}`, overflowY: 'auto', padding: '1.5rem 1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ ...MODAL_T, marginBottom: 2 }}>Checklist de la operación</h3>
                <p style={{ fontSize: '0.7rem', color: MUTED, ...TAB }}>{doneTasks} de {totalTasks} tareas completadas</p>
              </div>
              <button onClick={() => setShowChecklist(false)} className="tt-ghost" style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1, padding: 0 }}>×</button>
            </div>
            {/* Barra solo con avance parcial */}
            {progress > 0 && progress < 100 && (
              <div style={{ height: 3, background: HAIR, marginBottom: '1.5rem' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: GREEN, transition: 'width 0.3s' }} />
              </div>
            )}
            {FASES.map(fase => {
              const items = CHECKLIST.filter(t => t.fase === fase.id);
              const doneInFase = items.filter(t => checked.has(t.id)).length;
              return (
                <div key={fase.id} style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.35rem', paddingBottom: '0.3rem', borderBottom: `1px solid ${HAIR}` }}>
                    <p style={GROUP_H}>Fase {fase.id} — {fase.label}</p>
                    <span style={{ fontSize: '0.68rem', fontWeight: 600, color: doneInFase === items.length ? GREEN : MUTED, ...TAB }}>
                      {doneInFase}/{items.length}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {items.map(task => {
                      const done = checked.has(task.id);
                      return (
                        <div key={task.id} onClick={() => toggleCheck(task.id)} className="tt-row"
                          style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem', cursor: 'pointer', padding: '0.45rem 0.25rem', borderBottom: '1px solid #f8fafc' }}
                        >
                          <div style={{ width: 15, height: 15, borderRadius: 4, border: done ? `2px solid ${INK}` : `2px solid ${FAINT}`, background: done ? INK : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, transition: 'all 0.15s' }}>
                            {done && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                          <span style={{ fontSize: '0.78rem', color: done ? MUTED : '#374151', textDecoration: done ? 'line-through' : 'none', lineHeight: 1.4, fontWeight: done ? 400 : 500 }}>
                            {task.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Discard modal */}
      {showDiscard && (
        <div style={{ ...OVERLAY, zIndex: 2000 }}>
          <div style={{ ...PANEL, maxWidth: '400px' }}>
            <h3 style={{ ...MODAL_T, marginBottom: '0.5rem' }}>Cambios sin guardar</h3>
            <p style={{ fontSize: '0.8rem', color: BODY, marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Tenés cambios sin guardar en esta operación. ¿Qué querés hacer antes de salir?
            </p>
            <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'flex-end', alignItems: 'center' }}>
              <button onClick={discardAndBack} style={{ ...GHOST, color: RED, fontWeight: 600 }}>
                Descartar cambios
              </button>
              <button onClick={saveAndBack} style={BTN_DARK}>
                Guardar y salir
              </button>
            </div>
            <button onClick={() => setShowDiscard(false)} className="tt-ghost" style={{ ...GHOST, display: 'block', width: '100%', marginTop: '1rem', textAlign: 'center', fontSize: '0.76rem' }}>
              Cancelar (seguir editando)
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Helper sub-components ────────────────────────────────────────────────────
function FRow({ children }) { return <>{children}</>; }

// ─── estado de cuenta por cliente (vista limpia para captura / imprimir) ────────
function EstadoCuentaModal({ group, op, onClose }) {
  // Mientras está abierto, imprimir la página imprime SOLO esta hoja (ver gestion.css).
  useEffect(() => {
    document.body.classList.add('estado-print');
    return () => document.body.classList.remove('estado-print');
  }, []);

  const items = group.items;
  const total   = items.reduce((s, p) => s + p.totalUSD, 0);
  const cobrado = items.reduce((s, p) => s + (p.cb.cobrado ? p.totalUSD : 0), 0);
  const saldo   = Math.round((total - cobrado) * 100) / 100;
  const fobT    = items.reduce((s, p) => s + n(p.fobUSD), 0);
  const m3T     = items.reduce((s, p) => s + n(p.m3), 0);
  const usdF = (v) => 'USD ' + (Math.round(v * 100) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
  const TD = { padding: '0.5rem 0.65rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '1.25rem' }}>
      {/* Pill FUERA de la hoja blanca: no sale en la impresión ni en una captura recortada de la hoja. */}
      <div className="no-print" onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#e2e8f0', fontSize: '0.72rem', fontWeight: 600, textAlign: 'center', padding: '0 0.5rem' }}>
        <span style={{ color: '#4ade80' }}>✓</span> Vista segura para el cliente — sin tu ganancia, TC ni pesos internos. Capturá la hoja blanca o tocá Imprimir / PDF.
      </div>
      <div className="estado-cuenta-sheet" onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: 700, borderRadius: 14, boxShadow: '0 30px 80px rgba(0,0,0,0.3)', maxHeight: '88vh', overflowY: 'auto' }}>

        {/* encabezado con marca — mismo branding que la cotización imprimible */}
        <div style={{ background: '#fff', padding: '1rem 1.6rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderBottom: '3px solid #ea580c', borderRadius: '14px 14px 0 0' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/transtide-logo-full.png" alt="Transtide Freight" style={{ height: 30, width: 'auto' }} />
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Estado de cuenta</p>
            <p style={{ fontSize: '0.62rem', color: '#94a3b8' }}>{hoy}</p>
          </div>
        </div>

        <div style={{ padding: '1.25rem 1.6rem' }}>
          {/* cliente + operación */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div>
              <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Cliente</p>
              <p style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{group.key === 'Cliente s/asignar' ? '—' : group.key}</p>
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.68rem', color: '#64748b', lineHeight: 1.5 }}>
              <p><b>Operación:</b> {op.nombre || '—'}</p>
              <p>{op.contenedor ? `Contenedor ${op.contenedor}` : ''}{op.bl ? ` · B/L ${op.bl}` : ''}</p>
            </div>
          </div>

          {/* detalle por proveedor */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {[['Proveedor', 'left'], ['m³', 'right'], ['FOB USD', 'right'], ['Gastos USD', 'right'], ['Estado', 'right']].map(([h, a]) => (
                  <th key={h} style={{ fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.45rem 0.65rem', textAlign: a, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(p => (
                <tr key={p.id || p.idx}>
                  <td style={{ ...TD, fontWeight: 600, color: '#1e293b' }}>{p.nombre || '—'}</td>
                  <td style={{ ...TD, textAlign: 'right', color: '#64748b' }}>{p.m3 || '—'}</td>
                  <td style={{ ...TD, textAlign: 'right', color: '#64748b' }}>{n(p.fobUSD) > 0 ? n(p.fobUSD).toLocaleString('es-AR') : '—'}</td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{p.totalUSD > 0 ? p.totalUSD.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                  <td style={{ ...TD, textAlign: 'right' }}>
                    {p.cb.cobrado
                      ? <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#16a34a' }}>Pagado ✓</span>
                      : <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#d97706' }}>Pendiente</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ padding: '0.55rem 0.65rem', fontSize: '0.64rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</td>
                <td style={{ padding: '0.55rem 0.65rem', textAlign: 'right', fontSize: '0.78rem', fontWeight: 700, color: '#334155', fontVariantNumeric: 'tabular-nums' }}>{m3T.toFixed(2)}</td>
                <td style={{ padding: '0.55rem 0.65rem', textAlign: 'right', fontSize: '0.78rem', fontWeight: 700, color: '#334155', fontVariantNumeric: 'tabular-nums' }}>{fobT.toLocaleString('es-AR')}</td>
                <td style={{ padding: '0.55rem 0.65rem', textAlign: 'right', fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td />
              </tr>
            </tfoot>
          </table>

          {/* resumen de cobro */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: '1rem' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e8ecf1', borderRadius: 10, padding: '0.65rem 0.85rem' }}>
              <p style={{ fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Total gastos</p>
              <p style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{usdF(total)}</p>
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '0.65rem 0.85rem' }}>
              <p style={{ fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Pagado</p>
              <p style={{ fontSize: '0.98rem', fontWeight: 800, color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>{usdF(cobrado)}</p>
            </div>
            <div style={{ background: saldo > 0 ? '#fef2f2' : '#f0fdf4', border: `1px solid ${saldo > 0 ? '#fecaca' : '#bbf7d0'}`, borderRadius: 10, padding: '0.65rem 0.85rem' }}>
              <p style={{ fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Saldo pendiente</p>
              <p style={{ fontSize: '0.98rem', fontWeight: 800, color: saldo > 0 ? '#dc2626' : '#16a34a', fontVariantNumeric: 'tabular-nums' }}>{saldo > 0 ? usdF(saldo) : 'Saldado ✓'}</p>
            </div>
          </div>

          {/* condición de entrega: visible para el cliente cuando hay candado activo */}
          {group.items.some(x => x.cb.exigirPago && !x.cb.cobrado) && (
            <div style={{ marginTop: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '0.6rem 0.85rem' }}>
              <p style={{ fontSize: '0.76rem', fontWeight: 700, color: '#dc2626' }}>Condición de entrega: la mercadería se entrega contra la cancelación del saldo pendiente.</p>
            </div>
          )}

          <p style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '0.9rem', lineHeight: 1.5 }}>
            Gastos de importación expresados en USD, convertidos al tipo de cambio de la operación. FOB de la mercadería informado a título de referencia.
          </p>
        </div>

        {/* acciones (no salen en la impresión/captura) */}
        <div className="no-print" style={{ padding: '0.9rem 1.6rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8, background: '#f8fafc', borderRadius: '0 0 14px 14px' }}>
          <button onClick={onClose} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>Cerrar</button>
          <button onClick={() => window.print()} style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Imprimir / PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryBtn({ g, onClick, cash }) {
  return (
    <button onClick={onClick} className="tt-btnrow"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0.42rem 0.25rem', cursor: 'pointer', width: '100%', textAlign: 'left', borderBottom: '1px solid #f8fafc' }}>
      <span style={{ fontSize: '0.74rem', color: BODY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {cash && <DotNegro />}
        {g.label}
        {g.custom && <span style={{ fontSize: '0.58rem', color: FAINT }}> · custom</span>}
        {g.usdPend > 0 && <span title={`USD ${g.usdPend.toLocaleString('es-AR')} cargados sin T.C. — no entran al total en pesos ni al prorrateo`} style={{ fontSize: '0.58rem', fontWeight: 700, color: AMBER }}> · USD s/TC</span>}
      </span>
      <span style={{ fontSize: '0.73rem', fontWeight: 600, color: g.total > 0 ? INK : FAINT, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{g.total > 0 ? fmtP(g.total) : '—'}</span>
    </button>
  );
}

const PALETTE = ['#0284c7', '#7c3aed', '#dc2626', '#d97706', '#059669', '#64748b', '#0891b2', '#e11d48', '#9333ea', '#16a34a'];
function AddCategoryModal({ onAdd, onClose }) {
  const [label, setLabel] = useState('');
  const [kind,  setKind]  = useState('blanco');
  const [color, setColor] = useState(PALETTE[0]);
  const valid = label.trim().length > 0;
  const INP_MODAL = { ...INP, padding: '0.4rem 0.55rem', fontSize: '0.78rem' };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 100 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(420px, 92vw)', background: '#fff', borderRadius: 12, zIndex: 110, padding: '1.5rem 1.75rem' }}>
        <h3 style={{ ...MODAL_T, marginBottom: 18 }}>Nueva categoría de gasto</h3>

        <div style={{ marginBottom: '1.25rem' }}>
          <p style={LBL}>Nombre</p>
          <input autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="Ej: Seguro de carga" className="tt-inp" style={INP_MODAL} />
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <p style={LBL}>Tipo de pago</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { v: 'blanco', t: 'En blanco', d: 'Pagado por banco · gasto normal' },
              { v: 'cash',   t: 'Cash propio', d: 'Pagado de tu bolsillo · a recuperar' },
            ].map(opt => {
              const sel = kind === opt.v;
              return (
                <button key={opt.v} onClick={() => setKind(opt.v)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                  <p style={{ display: 'inline-block', fontSize: '0.78rem', fontWeight: sel ? 600 : 400, color: sel ? INK : MUTED, borderBottom: sel ? `2px solid ${INK}` : '2px solid transparent', paddingBottom: 3 }}>
                    {opt.v === 'cash' && <DotNegro />}{opt.t}
                  </p>
                  <p style={{ fontSize: '0.65rem', color: MUTED, marginTop: 3, lineHeight: 1.3 }}>{opt.d}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <p style={LBL}>Color (para identificarla)</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PALETTE.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{
                width: 24, height: 24, borderRadius: '50%', background: c, border: `2px solid ${color === c ? INK : 'transparent'}`,
                cursor: 'pointer', padding: 0, transition: 'transform 0.1s',
              }} title={c} />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'flex-end', alignItems: 'center' }}>
          <button onClick={onClose} className="tt-ghost" style={GHOST}>Cancelar</button>
          <button onClick={() => valid && onAdd({ label: label.trim(), kind, color })} disabled={!valid} style={{ ...BTN_DARK, background: valid ? INK : LINE, color: valid ? '#fff' : MUTED, cursor: valid ? 'pointer' : 'default' }}>Crear categoría</button>
        </div>
      </div>
    </>
  );
}

function CategoryEditor({ cat, rows: initRows, onChange, onClose, onDelete }) {
  const [rows, setRows] = useState(initRows.length ? initRows : [newRow()]);
  const tot = catTot(rows).pesos;
  const INP_MODAL = { ...INP, padding: '0.4rem 0.55rem', fontSize: '0.78rem' };
  // Quién pagó cada línea: sociedad (facturado) o vos (cash). VEP siempre sociedad.
  const showPagadoPor = cat.id !== 'aduana';
  const defKind = cat.kind === 'cash' ? 'cash' : 'blanco';

  const updRow = (i, f, v) => setRows(rs => rs.map((r, j) => j === i ? { ...r, [f]: v } : r));
  const addRow = () => setRows(rs => [...rs, newRow()]);
  const remRow = (i) => setRows(rs => rs.filter((_, j) => j !== i));

  const save = () => { onChange(rows.filter(r => r.desc || r.usd || r.pesos)); onClose(); };

  return (
    <>
      <div onClick={save} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 100 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(820px, 94vw)', maxHeight: '88vh', background: '#fff', borderRadius: 12, zIndex: 110, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.5rem 1.75rem 0.9rem', borderBottom: `1px solid ${HAIR}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.7rem', flexWrap: 'wrap' }}>
            <h3 style={MODAL_T}>{cat.label}</h3>
            {cat.note && <span style={{ fontSize: '0.68rem', color: AMBER, fontWeight: 500 }}>{cat.note}</span>}
          </div>
          <button onClick={onClose} className="tt-ghost" style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.75rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Descripción', 'N° Factura', 'USD', 'T.C.', 'Pesos', ...(showPagadoPor ? ['Pagó'] : []), ''].map(h => (
                  <th key={h} style={{ fontSize: '0.6rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.5rem 0.6rem 0.6rem', textAlign: h === 'USD' || h === 'T.C.' || h === 'Pesos' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const calcPesos = n(row.usd) > 0 && n(row.tc) > 0;
                return (
                  <tr key={row.id}>
                    <td style={{ padding: '0.25rem 0.3rem' }}>
                      <input value={row.desc} onChange={e => updRow(i, 'desc', e.target.value)} className="tt-inp" style={INP_MODAL} placeholder="Descripción" />
                    </td>
                    <td style={{ padding: '0.25rem 0.3rem', width: 130 }}>
                      <input value={row.factura} onChange={e => updRow(i, 'factura', e.target.value)} className="tt-inp" style={INP_MODAL} placeholder="—" />
                    </td>
                    <td style={{ padding: '0.25rem 0.3rem', width: 110 }}>
                      <input type="number" inputMode="decimal" step="any" value={row.usd} onChange={e => updRow(i, 'usd', e.target.value)} className="tt-inp" style={{ ...INP_MODAL, textAlign: 'right' }} placeholder="" />
                    </td>
                    <td style={{ padding: '0.25rem 0.3rem', width: 90 }}>
                      <input type="number" inputMode="decimal" step="any" value={row.tc} onChange={e => updRow(i, 'tc', e.target.value)} className="tt-inp" style={{ ...INP_MODAL, textAlign: 'right' }} placeholder="" />
                    </td>
                    <td style={{ padding: '0.25rem 0.3rem', width: 140 }}>
                      {calcPesos ? (
                        <div style={{ padding: '0.4rem 0.55rem', fontSize: '0.78rem', color: INK, fontWeight: 600, textAlign: 'right', ...TAB }}>{fmtP(n(row.usd) * n(row.tc))}</div>
                      ) : (
                        <input type="number" inputMode="decimal" step="any" value={row.pesos} onChange={e => updRow(i, 'pesos', e.target.value)} className="tt-inp" style={{ ...INP_MODAL, textAlign: 'right' }} placeholder="" />
                      )}
                    </td>
                    {showPagadoPor && (
                      <td style={{ padding: '0.25rem 0.3rem', width: 128 }}>
                        {(() => {
                          const kind = row.pagadoPor === 'cash' || row.pagadoPor === 'blanco' ? row.pagadoPor : defKind;
                          return (
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-start' }} title="¿Quién pagó esta línea? Sociedad (facturado) o vos en efectivo. No cambia el total a cobrar, solo el split y lo que recuperás cash.">
                              {[['blanco', 'Sociedad'], ['cash', 'Vos']].map(([v, l]) => {
                                const on = kind === v;
                                return (
                                  <button key={v} onClick={() => updRow(i, 'pagadoPor', v)} style={{ padding: '0 0 3px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.64rem', fontWeight: on ? 600 : 400, color: on ? INK : MUTED, borderBottom: on ? `2px solid ${INK}` : '2px solid transparent' }}>
                                    {l}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </td>
                    )}
                    <td style={{ padding: '0.25rem 0.3rem', width: 30 }}>
                      <button onClick={() => remRow(i)} className="tt-icon" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: 0 }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button onClick={addRow} className="tt-ghost" style={{ ...GHOST, marginTop: '0.6rem', fontSize: '0.75rem', fontWeight: 600 }}>
            + Agregar línea
          </button>
        </div>

        <div style={{ padding: '1rem 1.75rem 1.5rem', borderTop: `1px solid ${HAIR}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div>
              <span style={{ fontSize: '0.62rem', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Subtotal {cat.label}</span>
              <p style={{ fontSize: '1.05rem', fontWeight: 700, color: INK, ...TAB }}>{fmtP(tot)}</p>
            </div>
            {onDelete && (
              <button onClick={onDelete} className="tt-danger" style={{ background: 'none', border: 'none', color: FAINT, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                Eliminar categoría
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
            <button onClick={onClose} className="tt-ghost" style={GHOST}>Cancelar</button>
            <button onClick={save} style={BTN_DARK}>Guardar</button>
          </div>
        </div>
      </div>
    </>
  );
}

function ExpandedDetail({ p, clientes, onCreateCliente, onUpdProveedor, onUpdCobrar, onToggleCobrado, onRemove }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const LBL_E  = { fontSize: '0.62rem', fontWeight: 500, color: MUTED, marginBottom: 4 };
  const SEC  = { ...GROUP_H, marginBottom: 10 };
  const HINT = { fontSize: '0.65rem', color: MUTED, marginTop: 3 };
  const CALC = { fontSize: '0.7rem', color: BODY, fontWeight: 600, marginTop: 3, fontVariantNumeric: 'tabular-nums' };
  const INP_E = { ...INP, padding: '0.4rem 0.55rem', fontSize: '0.78rem' };

  const handleCrear = async () => {
    const nm = newName.trim();
    if (!nm) return;
    const newId = await onCreateCliente(nm);
    if (newId) {
      onUpdProveedor('clienteId', newId);
      setCreating(false);
      setNewName('');
    }
  };

  const vepPesos = n(p.tributosUSD) * n(p.tributosTC);
  const hasVepBoth = n(p.tributosUSD) > 0 && n(p.tributosTC) > 0;

  return (
    <div style={{ paddingTop: '0.9rem' }}>
      <div className="expanded-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '2rem', alignItems: 'start' }}>

        <div style={{ minWidth: 0 }}>

          <div style={{ marginBottom: 20 }}>
            <p style={SEC}>Identidad</p>
            <div className="expanded-detail-identidad" style={{ display: 'grid', gridTemplateColumns: '2fr 1.3fr 1.7fr', gap: 10 }}>
              <div>
                <p style={LBL_E}>Nombre</p>
                <input value={p.nombre || ''} onChange={e => onUpdProveedor('nombre', e.target.value)} className="tt-inp" style={INP_E} placeholder="Ej: Gimnasio Marce" />
              </div>
              <div>
                <p style={LBL_E}>Tipo</p>
                <div style={{ display: 'flex', gap: 14, paddingTop: 6 }}>
                  {['Cliente', 'Propio'].map(t => {
                    const sel = (p.tipo || 'Cliente') === t;
                    return (
                      <button key={t} onClick={() => onUpdProveedor('tipo', t)}
                        style={{ padding: '0 0 4px', border: 'none', background: 'none', fontSize: '0.74rem', fontWeight: sel ? 600 : 400, color: sel ? INK : MUTED, cursor: 'pointer', borderBottom: sel ? `2px solid ${INK}` : '2px solid transparent', transition: 'color 0.12s' }}>{t}</button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p style={LBL_E}>{(p.tipo || 'Cliente') === 'Cliente' ? 'Cliente final' : 'Categoría'}</p>
                {(p.tipo || 'Cliente') === 'Cliente' ? (
                  creating ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        autoFocus
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) { e.preventDefault(); handleCrear(); } }}
                        placeholder="Nombre del cliente"
                        className="tt-inp"
                        style={{ ...INP_E, flex: 1 }}
                      />
                      <button
                        onClick={handleCrear}
                        disabled={!newName.trim()}
                        style={{ flexShrink: 0, padding: '0.4rem 0.6rem', borderRadius: 6, border: 'none', background: newName.trim() ? INK : LINE, color: newName.trim() ? '#fff' : MUTED, fontSize: '0.72rem', fontWeight: 600, cursor: newName.trim() ? 'pointer' : 'not-allowed' }}>
                        Crear
                      </button>
                      <button
                        onClick={() => { setCreating(false); setNewName(''); }}
                        title="Cancelar"
                        className="tt-ghost"
                        style={{ flexShrink: 0, padding: '0.2rem 0.3rem', border: 'none', background: 'none', color: MUTED, fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}>
                        ×
                      </button>
                    </div>
                  ) : (
                    <select
                      value={p.clienteId || ''}
                      onChange={e => {
                        if (e.target.value === '__nuevo__') { setNewName(''); setCreating(true); }
                        else onUpdProveedor('clienteId', e.target.value);
                      }}
                      className="tt-inp"
                      style={{ ...INP_E, cursor: 'pointer' }}>
                      <option value="">— Sin asignar —</option>
                      {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      <option value="__nuevo__">+ Crear cliente nuevo…</option>
                    </select>
                  )
                ) : (
                  <p style={{ padding: '0.4rem 0', fontSize: '0.78rem', color: MUTED, fontStyle: 'italic' }}>Mercadería propia</p>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <p style={SEC}>Carga en el contenedor</p>
            <div className="expanded-detail-carga" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <p style={LBL_E}>m³ (CBM) <Help title="Volumen en metros cúbicos. Define el % de prorrateo de los costos compartidos." /></p>
                <input type="number" inputMode="decimal" step="any" value={p.m3 || ''} onChange={e => onUpdProveedor('m3', e.target.value)} className="tt-inp" style={{ ...INP_E, textAlign: 'right' }} placeholder="0.00" />
                {n(p.m3) > 0 && <p style={CALC}>= {pct(p.ratio)} del contenedor</p>}
              </div>
              <div>
                <p style={LBL_E}>FOB USD <Help title="Valor declarado del producto al embarcar (Free On Board)." /></p>
                <input type="number" inputMode="decimal" step="any" value={p.fobUSD || ''} onChange={e => onUpdProveedor('fobUSD', e.target.value)} className="tt-inp" style={{ ...INP_E, textAlign: 'right' }} placeholder="0" />
              </div>
              <div>
                <p style={LBL_E}>Gs. Origen USD <span style={{ color: FAINT, fontStyle: 'italic' }}>opcional</span></p>
                <input type="number" inputMode="decimal" step="any" value={p.gastosOrigenUSD || ''} onChange={e => onUpdProveedor('gastosOrigenUSD', e.target.value)} className="tt-inp" style={{ ...INP_E, textAlign: 'right' }} placeholder="0" />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <p style={SEC}>VEP Aduana <Help title="Tributos aduaneros pagados por este proveedor. USD × T.C. = pesos asignados." /></p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <p style={LBL_E}>USD</p>
                <input type="number" inputMode="decimal" step="any" value={p.tributosUSD || ''} onChange={e => onUpdProveedor('tributosUSD', e.target.value)} className="tt-inp" style={{ ...INP_E, textAlign: 'right' }} placeholder="0" />
              </div>
              <div style={{ paddingBottom: 8, color: FAINT, fontWeight: 700, fontSize: '0.9rem' }}>×</div>
              <div style={{ flex: 1 }}>
                <p style={LBL_E}>T.C.</p>
                <input type="number" inputMode="decimal" step="any" value={p.tributosTC || ''} onChange={e => onUpdProveedor('tributosTC', e.target.value)} className="tt-inp" style={{ ...INP_E, textAlign: 'right' }} placeholder="—" />
              </div>
              <div style={{ paddingBottom: 8, color: FAINT, fontWeight: 700, fontSize: '0.9rem' }}>=</div>
              <div style={{ flex: 1.2 }}>
                <p style={LBL_E}>Pesos</p>
                <p style={{ padding: '0.4rem 0', fontSize: '0.82rem', color: hasVepBoth ? INK : FAINT, fontWeight: 700, textAlign: 'right', borderBottom: `1px solid ${HAIR}`, ...TAB }}>
                  {hasVepBoth ? fmtP(vepPesos) : '—'}
                </p>
              </div>
            </div>
          </div>

          <button onClick={onRemove} className="tt-danger" style={{ marginTop: 4, background: 'none', border: 'none', color: FAINT, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', padding: '0.3rem 0' }}>
            Eliminar este proveedor
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

          <div>
            <p style={{ ...GROUP_H, marginBottom: 4 }}>Total a cobrar</p>
            <p style={{ fontSize: '1.3rem', fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{fmtU(p.totalUSD)}</p>
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${HAIR}`, display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.7rem' }}>
              <Mini label="Prorrateo blanco" val={fmtP(p.prorBlancoPesos)} />
              {p.prorCashPesos > 0 && <Mini label="Prorrateo cash" val={fmtP(p.prorCashPesos)} cash />}
              <Mini label="VEP Aduana" val={fmtP(p.vepPesos)} />
              <Mini label={`÷ TC ${p.tcUsed || '—'}`} val={fmtU(p.gastosUSD)} />
              {p.origenUSD > 0 && <Mini label="+ origen" val={fmtU(p.origenUSD)} />}
              {p.cb.honorarios && <Mini label={n(p.cb.honMin) > 0 && p.honorarios === n(p.cb.honMin) ? '+ honor. mín.' : '+ honor. 4%'} val={fmtU(p.honorarios)} />}
              {n(p.cb.despAdic) > 0 && <Mini label="+ desp. adic." val={fmtU(n(p.cb.despAdic))} />}
              {p.giroUSD > 0 && <Mini label="+ giro de divisas" val={fmtU(p.giroUSD)} />}
              {n(p.cb.ganancia) > 0 && <Mini label="+ tu ganancia (no se desglosa al cliente)" val={fmtU(n(p.cb.ganancia))} />}
            </div>
            {p.cashUSD > 0 && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${HAIR}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: '0.64rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}><DotNegro />De los que recuperás cash</span>
                <span style={{ fontSize: '0.85rem', color: INK, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtU(p.cashUSD)}</span>
              </div>
            )}
          </div>

          <div>
            <p style={SEC}>Ajustes de cobro</p>

            <div className="expanded-detail-ajustes" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <p style={LBL_E}>T.C. cobro</p>
                <input type="number" inputMode="decimal" step="any" value={p.cb.tc || ''} onChange={e => onUpdCobrar('tc', e.target.value)} placeholder={p.tributosTC ? `${p.tributosTC} auto` : '—'} className="tt-inp" style={{ ...INP_E, textAlign: 'right' }} />
                <p style={HINT}>vacío = usa el del VEP o el TC de la operación</p>
              </div>
              <div>
                <p style={LBL_E}>Desp. adic. USD</p>
                <input type="number" inputMode="decimal" step="any" value={p.cb.despAdic || ''} onChange={e => onUpdCobrar('despAdic', e.target.value)} placeholder="0" className="tt-inp" style={{ ...INP_E, textAlign: 'right' }} />
                <p style={HINT}>extras del despachante que LE COBRÁS a este cliente · lo que vos le pagás está en Al despachante →</p>
              </div>
            </div>

            {/* Giro de divisas al exterior: % sobre lo girado + fijo, o total manual */}
            <div style={{ marginBottom: 14 }}>
              <p style={{ ...LBL_E, marginBottom: 6 }}>Giro de divisas al exterior</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <input type="number" inputMode="decimal" step="any" value={p.cb.giroMonto || ''} onChange={e => onUpdCobrar('giroMonto', e.target.value)} placeholder="0" className="tt-inp" style={{ ...INP_E, textAlign: 'right' }} />
                  <p style={HINT}>monto girado USD</p>
                </div>
                <div>
                  <input type="number" inputMode="decimal" step="any" value={p.cb.giroPct || ''} onChange={e => onUpdCobrar('giroPct', e.target.value)} placeholder="1.5" className="tt-inp" style={{ ...INP_E, textAlign: 'right' }} />
                  <p style={HINT}>comisión % (1.5–2)</p>
                </div>
                <div>
                  <input type="number" inputMode="decimal" step="any" value={p.cb.giroFijo || ''} onChange={e => onUpdCobrar('giroFijo', e.target.value)} placeholder="45" className="tt-inp" style={{ ...INP_E, textAlign: 'right' }} />
                  <p style={HINT}>gasto fijo USD (transferencia)</p>
                </div>
                <div>
                  <input type="number" inputMode="decimal" step="any" value={p.cb.giroTotal || ''} onChange={e => onUpdCobrar('giroTotal', e.target.value)} placeholder="—" className="tt-inp" style={{ ...INP_E, textAlign: 'right' }} />
                  <p style={HINT}>total manual (pisa el cálculo)</p>
                </div>
              </div>
              {p.giroUSD > 0 && <p style={{ fontSize: '0.72rem', fontWeight: 700, color: INK, marginTop: 6, textAlign: 'right', ...TAB }}>= {fmtU(p.giroUSD)} al cliente</p>}
            </div>

            <div style={{ marginBottom: 14 }}>
              <p style={LBL_E}>Tu ganancia (USD)</p>
              <input type="number" inputMode="decimal" step="any" value={p.cb.ganancia || ''} onChange={e => onUpdCobrar('ganancia', e.target.value)} placeholder="0" className="tt-inp" style={{ ...INP_E, textAlign: 'right', fontWeight: 700, color: INK }} />
              <p style={HINT}>se suma al total a cobrar sin desglosarse — el cliente ve un solo monto de gastos</p>
            </div>

            <div style={{ paddingTop: 10, borderTop: '1px solid #f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Honorarios 4%</p>
                  <p style={{ fontSize: '0.65rem', color: MUTED, marginTop: 1 }}>sobre (gastos + origen)</p>
                </div>
                <button type="button" onClick={() => onUpdCobrar('honorarios', !p.cb.honorarios)} className={`g-toggle${p.cb.honorarios ? ' on' : ''}`} aria-pressed={!!p.cb.honorarios}>
                  <span className="g-toggle-knob" />
                </button>
              </div>
              {p.cb.honorarios && (
                <div style={{ marginTop: 8 }}>
                  <p style={LBL_E}>Mínimo (USD) — vacío = solo 4%</p>
                  <input type="number" inputMode="decimal" step="any" min="0" value={p.cb.honMin || ''} onChange={e => onUpdCobrar('honMin', e.target.value)} placeholder="ej. 500" className="tt-inp" style={{ ...INP_E, textAlign: 'right' }} />
                  {n(p.cb.honMin) > 0 && p.honorarios === n(p.cb.honMin) && (
                    <p style={{ ...HINT, color: AMBER }}>aplica el mínimo: 4% = {fmtU(Math.round((p.gastosUSD + p.origenUSD) * 0.04 * 100) / 100)}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <button onClick={onToggleCobrado} className="tt-btnrow"
            style={{ padding: '0.7rem 0.25rem', borderTop: `1px solid ${HAIR}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
            <div>
              <p style={{ fontSize: '0.78rem', fontWeight: 600, color: p.cb.cobrado ? GREEN : INK }}>{p.cb.cobrado ? 'Cobrado' : 'Pendiente de cobro'}</p>
              <p style={{ fontSize: '0.65rem', color: MUTED, marginTop: 1 }}>
                {p.cb.cobrado ? (p.cb.fechaCobro ? `el ${p.cb.fechaCobro}` : 'cobrado') : 'tocá para marcar'}
              </p>
            </div>
            <span style={{ fontSize: '0.64rem', color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{p.cb.cobrado ? 'Desmarcar' : 'Marcar cobrado'}</span>
          </button>

          {/* Cobro antes de la entrega: candado para clientes con historial de pagos flojos */}
          {!p.cb.cobrado && (
            <button onClick={() => onUpdCobrar('exigirPago', !p.cb.exigirPago)} className="tt-btnrow"
              style={{ width: '100%', marginTop: -12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0.55rem 0.25rem', borderTop: '1px solid #f8fafc', cursor: 'pointer', textAlign: 'left' }}>
              <div>
                <p style={{ fontSize: '0.75rem', fontWeight: 600, color: p.cb.exigirPago ? RED : '#374151' }}>Exigir pago antes de entregar</p>
                <p style={{ fontSize: '0.64rem', color: p.cb.exigirPago ? RED : MUTED, marginTop: 1 }}>
                  {p.cb.exigirPago ? 'la mercadería NO se entrega hasta cancelar el saldo' : 'activalo si el cliente suele demorar pagos'}
                </p>
              </div>
              <span style={{ fontSize: '0.62rem', fontWeight: 700, color: p.cb.exigirPago ? RED : MUTED, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{p.cb.exigirPago ? 'Activo' : 'Off'}</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

function Mini({ label, val, cash }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: MUTED }}>
      <span>{cash && <DotNegro />}{label}</span>
      <span style={{ color: BODY, fontWeight: cash ? 600 : 500, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
    </div>
  );
}

function Help({ title }) {
  return (
    <span title={title} style={{ display: 'inline-block', color: FAINT, fontSize: '0.6rem', fontWeight: 700, marginLeft: 3, cursor: 'help', verticalAlign: 'middle' }}>?</span>
  );
}


// ─── Main Export ──────────────────────────────────────────────────────────────
function OperationsInner() {
  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get('op');
  const [selected, setSelected] = useState(null);
  return (
    <>
      <style>{PAGE_CSS}</style>
      {selected
        ? <OperationDetail op={selected} onBack={() => setSelected(null)} />
        : <OperationsList onSelect={setSelected} deepLinkId={deepLinkId} />}
    </>
  );
}

export default function Operations() {
  return (
    <Suspense fallback={<div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Cargando operaciones...</div>}>
      <OperationsInner />
    </Suspense>
  );
}
