'use client';
import { useState, useMemo, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { gToast } from '../toast';

// ─── helpers ─────────────────────────────────────────────────────────────────
const n    = (v) => parseFloat(v) || 0;
const toTitle = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s;
const fmtP = (v) => v == null || isNaN(v) ? '—' : '$ ' + Math.round(v).toLocaleString('es-AR');
const fmtU = (v) => v == null || isNaN(v) ? '—' : 'USD ' + (Math.round(v * 100) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUcompact = (v) => v == null || isNaN(v) ? '—' : Math.round(v * 100) / 100 < 1000 ? (Math.round(v * 100) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 }) : Math.round(v).toLocaleString('es-AR');
const pct  = (v) => isNaN(v) ? '—' : (v * 100).toFixed(2) + '%';

// ─── styles ───────────────────────────────────────────────────────────────────
const CARD = { background: '#fff', borderRadius: '10px', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', border: '1px solid #e8ecf1' };
const LBL  = { display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' };
const INP  = { width: '100%', padding: '0.42rem 0.6rem', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '0.82rem', color: '#1e293b', background: '#fff', outline: 'none', transition: 'border-color 0.15s' };
const TH   = { fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.45rem 0.6rem', textAlign: 'left' };
const TD   = { fontSize: '0.82rem', color: '#374151', padding: '0.38rem 0.6rem', borderBottom: '1px solid #f8fafc' };

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
  { label: 'Consolidando',      icon: '📦', color: '#64748b', bg: '#f1f5f9',  desc: 'Carga en preparación en origen' },
  { label: 'En tránsito',       icon: '🚢', color: '#ea580c', bg: '#fff4ee',  desc: 'Contenedor en el mar' },
  { label: 'Arribado',          icon: '⚓', color: '#0891b2', bg: '#ecfeff',  desc: 'Llegó al puerto de destino' },
  { label: 'En aduana',         icon: '📋', color: '#d97706', bg: '#fffbeb',  desc: 'Proceso de desaduanización' },
  { label: 'Listo p/ retiro',   icon: '✅', color: '#ea580c', bg: '#fff7ed',  desc: 'Canal verde / libre para retirar' },
  { label: 'En tránsito local', icon: '🚛', color: '#7c3aed', bg: '#f5f3ff',  desc: 'Flete en camino al destino final' },
  { label: 'Entregado',         icon: '🏁', color: '#059669', bg: '#f0fdf4',  desc: 'Mercadería en destino final' },
  { label: 'Liquidado',         icon: '💰', color: '#065f46', bg: '#ecfdf5',  desc: 'Costos cerrados y cobrados' },
  { label: 'Cancelado',         icon: '✕',  color: '#94a3b8', bg: '#f8fafc',  desc: 'Operación cancelada' },
];
const estadoObj   = (e) => ESTADOS.find(s => s.label === e) || ESTADOS[0];
const estadoColor = (e) => estadoObj(e).color;
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
  if (/transit/.test(s)) return '#ea580c';
  return '#64748b';
};
const trackBalNum = (v) => { const x = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isNaN(x) ? 0 : x; };

// ─── InvoiceTable ─────────────────────────────────────────────────────────────
function InvoiceTable({ rows, onUpdate, onAdd, onRemove, accentColor = '#ea580c' }) {
  const tot = catTot(rows);
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ ...TH, width: '35%' }}>Descripción</th>
              <th style={{ ...TH, width: '15%' }}>N° Factura</th>
              <th style={{ ...TH, width: '12%', textAlign: 'right' }}>USD</th>
              <th style={{ ...TH, width: '10%', textAlign: 'right' }}>T.C.</th>
              <th style={{ ...TH, width: '20%', textAlign: 'right' }}>PESOS</th>
              <th style={{ ...TH, width: '8%' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const calcPesos = n(row.usd) > 0 && n(row.tc) > 0;
              return (
                <tr key={row.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                  <td style={TD}><input value={row.desc} onChange={e => onUpdate(i,'desc',e.target.value)} style={{ ...INP, fontSize: '0.8rem' }} placeholder="Descripción" /></td>
                  <td style={TD}><input value={row.factura} onChange={e => onUpdate(i,'factura',e.target.value)} style={{ ...INP, fontSize: '0.8rem' }} placeholder="—" /></td>
                  <td style={TD}>
                    <input type="number" inputMode="decimal" step="any" value={row.usd} onChange={e => onUpdate(i,'usd',e.target.value)}
                      style={{ ...INP, textAlign: 'right', color: '#1e293b', fontWeight: 500 }} placeholder="" />
                  </td>
                  <td style={TD}>
                    <input type="number" inputMode="decimal" step="any" value={row.tc} onChange={e => onUpdate(i,'tc',e.target.value)}
                      style={{ ...INP, textAlign: 'right', color: '#1e293b', fontWeight: 500 }} placeholder="—" />
                  </td>
                  <td style={TD}>
                    {calcPesos
                      ? <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#059669' }}>{fmtP(n(row.usd) * n(row.tc))}</span>
                      : <input type="number" inputMode="decimal" step="any" value={row.pesos} onChange={e => onUpdate(i,'pesos',e.target.value)}
                          style={{ ...INP, textAlign: 'right', color: '#1e293b', fontWeight: 500 }} placeholder="" />
                    }
                  </td>
                  <td style={TD}>
                    <button onClick={() => onRemove(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: '1rem', padding: '0 0.25rem' }}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
        <button onClick={onAdd} style={{ background: 'none', border: `1px dashed ${accentColor}`, borderRadius: '7px', padding: '0.3rem 0.8rem', fontSize: '0.75rem', fontWeight: 700, color: accentColor, cursor: 'pointer' }}>
          + Agregar línea
        </button>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          {tot.usd > 0 && <span style={{ fontSize: '0.78rem', color: '#64748b' }}>USD {fmtU(tot.usd)}</span>}
          <div style={{ background: '#f0f7ff', borderRadius: '8px', padding: '0.35rem 0.85rem' }}>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginRight: '0.5rem' }}>Subtotal</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: accentColor }}>{fmtP(tot.pesos)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── OperationsList ───────────────────────────────────────────────────────────
function OperationsList({ onSelect, deepLinkId }) {
  const [ops,       setOps]       = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(null); // null | 'new' | opObj
  const [form,      setForm]      = useState(emptyOp());
  const [confirm,   setConfirm]   = useState(null); // id to delete
  const [statusPop, setStatusPop] = useState(null); // op.id with open status picker
  const [deepLinkDone, setDeepLinkDone] = useState(false);

  const [loadError, setLoadError] = useState(false);

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

  return (
    <div>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.2rem' }}>Operaciones</h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>{ops.length} operaciones registradas</p>
        </div>
        <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1.1rem', borderRadius: '50px', border: 'none', cursor: 'pointer', background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: '0.82rem' }}>
          + Nueva operación
        </button>
      </div>

      {/* KPI summary */}
      {ops.length > 0 && (() => {
        const activas = ops.filter(o => !['Entregado','Liquidado','Cancelado'].includes(o.estado)).length;
        return (
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Total', value: ops.length, suffix: ops.length === 1 ? 'operación' : 'operaciones', color: '#1e293b', bg: '#f8fafc', border: '#e2e8f0' },
              { label: 'Activas', value: activas, suffix: activas === 1 ? 'en curso' : 'en curso', color: '#ea580c', bg: '#fff4ee', border: '#fed7aa' },
              { label: 'Completadas', value: ops.length - activas, suffix: 'finalizadas', color: '#059669', bg: '#f0fdf4', border: '#bbf7d0' },
            ].map(({ label, value, suffix, color, bg, border }) => (
              <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: '10px', padding: '0.65rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.35rem', fontWeight: 900, color }}>{value}</span>
                <div>
                  <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
                  <p style={{ fontSize: '0.72rem', color: '#64748b' }}>{suffix}</p>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* list */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.85rem' }}>
            Cargando operaciones...
          </div>
        ) : loadError ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <p style={{ fontWeight: 700, color: '#b91c1c', marginBottom: '0.4rem', fontSize: '0.95rem' }}>No se pudieron cargar las operaciones</p>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '1.25rem' }}>Puede ser un problema de conexión.</p>
            <button onClick={() => loadOps.current && loadOps.current()} style={{ padding: '0.55rem 1.25rem', borderRadius: '50px', border: 'none', cursor: 'pointer', background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: '0.82rem' }}>Reintentar</button>
          </div>
        ) : ops.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5"><polygon points="3 6 12 2 21 6 21 16 12 20 3 16 3 6"/><line x1="12" y1="22" x2="12" y2="12"/><line x1="21" y1="6" x2="12" y2="12"/><line x1="3" y1="6" x2="12" y2="12"/></svg>
            </div>
            <p style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.4rem', fontSize: '0.95rem' }}>No hay operaciones registradas</p>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '1.25rem' }}>Creá tu primera operación para empezar a gestionar importaciones.</p>
            <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1.25rem', borderRadius: '50px', border: 'none', cursor: 'pointer', background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: '0.82rem' }}>
              + Crear primera operación
            </button>
          </div>
        ) : (
        <>
        {/* column headers */}
        <div className="ops-list-headers" style={{ display: 'grid', gridTemplateColumns: '3fr 1.6fr 1.4fr 1fr auto', gap: '0.5rem', padding: '0 1.25rem 0.55rem 5.25rem', alignItems: 'center' }}>
          {['Operación', 'N° BL', 'Contenedor / M³', 'ETA', ''].map(h => (
            <span key={h} style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
          ))}
        </div>

        {ops.map(op => {
          const est = estadoObj(op.estado);
          const cap = CONTAINER_M3[op.contenedor];
          const ocup = getOcupado(op);
          const m3str = cap
            ? `${ocup != null ? ocup.toFixed(1) : '—'} / ${cap} m³`
            : ocup != null ? `${ocup.toFixed(1)} m³` : '—';
          const m3Over = cap && ocup != null && ocup > cap * 0.9;
          return (
            <div key={op.id}
              className="ops-list-row"
              onClick={() => { if (statusPop === op.id) return; onSelect(op); }}
              style={{
                display: 'grid', gridTemplateColumns: '3fr 1.6fr 1.4fr 1fr auto',
                gap: '0.5rem', alignItems: 'center',
                padding: '0.8rem 1.25rem',
                borderLeft: `4px solid ${est.color}`,
                background: '#fff',
                borderRadius: '10px',
                cursor: 'pointer',
                marginBottom: '5px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'background 0.1s, box-shadow 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; }}
            >
              {/* col 1: icon + name + date */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: est.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: est.color }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.nombre}</p>
                  <p style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '1px' }}>ETA: {op.eta || op.fecha || '—'}</p>
                </div>
              </div>

              {/* col 2: BL */}
              <p className="col-bl" style={{ fontSize: '0.8rem', fontWeight: 600, color: op.bl ? '#475569' : '#cbd5e1', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.bl || '—'}</p>

              {/* col 3: container + m³ */}
              <div className="col-container">
                <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>{op.contenedor || '—'}</p>
                <p style={{ fontSize: '0.7rem', color: m3Over ? '#dc2626' : '#94a3b8' }}>{m3str}</p>
              </div>

              {/* col 4: ETA */}
              <p className="col-eta" style={{ fontSize: '0.82rem', fontWeight: 600, color: op.eta ? '#059669' : '#cbd5e1' }}>{op.eta || '—'}</p>

              {/* col 5: actions */}
              <div className="col-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={e => e.stopPropagation()}>
                {/* status badge */}
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setStatusPop(statusPop === op.id ? null : op.id)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 600, background: est.bg, color: est.color, border: `1px solid ${est.color}30`, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {est.label} <span style={{ fontSize: '0.55rem', opacity: 0.6 }}>▾</span>
                  </button>
                  {statusPop === op.id && (
                    <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: '#fff', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.14)', border: '1px solid #e2e8f0', zIndex: 200, minWidth: '230px', overflow: 'hidden' }}>
                      <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.6rem 0.85rem 0.3rem' }}>Cambiar estado</p>
                      {ESTADOS.map((s, idx) => (
                        <button key={s.label} onClick={() => setEstado(op.id, s.label)}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.5rem 0.85rem', border: 'none', background: op.estado === s.label ? s.bg : 'transparent', cursor: 'pointer', borderBottom: idx < ESTADOS.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                          <span>{s.icon}</span>
                          <div style={{ textAlign: 'left' }}>
                            <p style={{ fontSize: '0.78rem', fontWeight: op.estado === s.label ? 700 : 500, color: op.estado === s.label ? s.color : '#374151' }}>{s.label}</p>
                            <p style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '1px' }}>{s.desc}</p>
                          </div>
                          {op.estado === s.label && <span style={{ marginLeft: 'auto', color: s.color, fontSize: '0.8rem' }}>✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* edit icon */}
                <button className="edit-btn" onClick={e => openEdit(op, e)} title="Editar" aria-label={`Editar operación ${op.nombre || ''}`}
                  style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✏</button>
                {/* delete icon */}
                <button className="del-btn" onClick={e => askDel(op.id, e)} title="Eliminar" aria-label={`Eliminar operación ${op.nombre || ''}`}
                  style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fff', color: '#dc2626', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
            </div>
          );
        })}
        </>
        )}
      </div>

      {/* click-away to close status popup */}
      {statusPop && <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setStatusPop(null)} />}

      {/* ── Modal nueva / editar operación ── */}
      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setModal(null)}>
          <div style={{ ...CARD, width: '100%', maxWidth: '520px', margin: '1rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>{modal === 'new' ? 'Nueva operación' : 'Editar operación'}</h3>
              <button onClick={() => setModal(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.3rem', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LBL}>Nombre de la operación</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} style={INP2} placeholder="Ej: Franco Modulos 2 + varios" />
              </div>
              <div>
                <label style={LBL}>N° BL</label>
                <input value={form.bl} onChange={e => setForm(f => ({ ...f, bl: e.target.value }))} style={INP2} placeholder="Ej: MAEU7546833339" />
              </div>
              <div>
                <label style={LBL}>Estado</label>
                <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} style={SEL}>
                  {ESTADOS.map(s => <option key={s.label} value={s.label}>{s.icon} {s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>Contenedor</label>
                <select value={form.contenedor} onChange={e => setForm(f => ({ ...f, contenedor: e.target.value }))} style={SEL}>
                  {CONTENEDORES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>M³ del contenedor</label>
                <div style={{ ...INP2, background: '#f8fafc', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'default' }}>
                  <span style={{ fontWeight: 700, color: '#1e293b' }}>{CONTAINER_M3[form.contenedor] ? `${CONTAINER_M3[form.contenedor]} m³` : 'Variable'}</span>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>capacidad total</span>
                </div>
              </div>
              <div>
                <label style={LBL}>Fecha de alta</label>
                <input type="date" value={form.fecha?.split('/').reverse().join('-') || ''} onChange={e => { const [y,m,d] = e.target.value.split('-'); setForm(f => ({ ...f, fecha: `${d}/${m}/${y}` })); }} style={INP2} />
              </div>
              <div>
                <label style={LBL}>ETA (Fecha estimada de llegada)</label>
                <input type="date" value={form.eta?.split('/').reverse().join('-') || ''} onChange={e => { const [y,m,d] = e.target.value.split('-'); setForm(f => ({ ...f, eta: `${d}/${m}/${y}` })); }} style={INP2} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button onClick={() => setModal(null)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={submit} style={{ padding: '0.5rem 1.2rem', borderRadius: '8px', border: 'none', background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                {modal === 'new' ? 'Crear operación' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm delete ── */}
      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setConfirm(null)}>
          <div style={{ ...CARD, width: '100%', maxWidth: '360px', margin: '1rem', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </div>
            <p style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.4rem' }}>¿Eliminar operación?</p>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1.25rem' }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button onClick={() => setConfirm(null)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => remove(confirm)} style={{ padding: '0.5rem 1.2rem', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Eliminar</button>
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

    let customBlanco = 0, customCash = 0;
    customGastos.forEach(cg => {
      const t = catTot(detail[cg.id] || []).pesos;
      if (cg.kind === 'cash') customCash += t; else customBlanco += t;
    });

    const enBlanco = tNav + tTerm + tAdu + tTra + tDes + tAdm + customBlanco;
    const cash     = tFlt + customCash;
    const prorBase = enBlanco - tAdu + cash;
    const totalGastos = enBlanco + cash;
    const totalM3 = proveedores.reduce((s, p) => s + n(p.m3), 0);

    const perProv = proveedores.map((p, i) => {
      const clienteNombre = p.clienteId ? clientes.find(c => c.id === p.clienteId)?.nombre || '' : '';
      const ratio = totalM3 > 0 ? n(p.m3) / totalM3 : 0;
      const prorBlancoPesos = Math.round(ratio * (enBlanco - tAdu));
      const prorCashPesos   = Math.round(ratio * cash);
      const prorPesos       = prorBlancoPesos + prorCashPesos;
      const vepPesos = Math.round(n(p.tributosUSD) * n(p.tributosTC));
      const costoFinal = prorPesos + vepPesos;
      const cb = cobrar[i] || { tc: 0, honorarios: false, despAdic: 0 };
      const tcUsed = n(cb.tc) > 0 ? n(cb.tc) : n(p.tributosTC);
      const gastosUSD = tcUsed > 0 ? Math.round((costoFinal / tcUsed) * 100) / 100 : 0;
      const cashUSD   = tcUsed > 0 ? Math.round((prorCashPesos / tcUsed) * 100) / 100 : 0;
      const origenUSD = n(p.gastosOrigenUSD);
      const honorarios = cb.honorarios ? Math.round((gastosUSD + origenUSD) * 0.04 * 100) / 100 : 0;
      const totalUSD = Math.round((gastosUSD + origenUSD + honorarios + n(cb.despAdic)) * 100) / 100;
      return { ...p, clienteNombre, ratio, prorPesos, prorBlancoPesos, prorCashPesos, cashUSD, vepPesos, costoFinal, tcUsed, gastosUSD, origenUSD, honorarios, totalUSD, cb, idx: i };
    });
    return {
      tNav, tTerm, tAdu, tTra, tDes, tAdm, tFlt, customBlanco, customCash,
      enBlanco, cash, prorBase, totalGastos, totalM3, perProv,
      totalACobrar:  perProv.reduce((s, p) => s + p.totalUSD, 0),
      totalCobrado:  perProv.reduce((s, p) => s + (p.cb.cobrado ? p.totalUSD : 0), 0),
      totalCashUSD:  perProv.reduce((s, p) => s + p.cashUSD, 0),
      cobrados:      perProv.filter(p => p.cb.cobrado).length,
    };
  }, [detail, clientes]);

  const totalTasks = CHECKLIST.length;
  const doneTasks  = CHECKLIST.filter(t => checked.has(t.id)).length;
  const progress   = Math.round((doneTasks / totalTasks) * 100);

  const estadoC = ESTADOS.find(s => s.label === op.estado) || ESTADOS[0];
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
      <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
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
  const ALL_GASTOS = [...BUILTIN, ...customGastosList];
  const GASTOS_BLANCO = ALL_GASTOS.filter(g => g.kind === 'blanco');
  const GASTOS_CASH   = ALL_GASTOS.filter(g => g.kind === 'cash');

  return (
    <div style={{ fontFamily: 'inherit', color: '#0f172a', paddingBottom: '5rem' }}>

      {/* Sticky header */}
      <div className="op-sticky-header" style={{ position: 'sticky', top: 0, zIndex: 30, background: '#f4f6f9', paddingTop: 4, paddingBottom: 12, marginBottom: '1rem' }}>
        <div style={{ ...CARD, padding: '0.85rem 1.1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <button onClick={handleBack} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.7rem', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Volver
          </button>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>{toTitle(op.nombre)}</h1>
              <span style={{ background: estadoC.bg, color: estadoC.color, border: `1px solid ${estadoC.color}30`, fontSize: '0.68rem', fontWeight: 700, padding: '0.18rem 0.6rem', borderRadius: 5 }}>{op.estado}</span>
              {isDirty && !saveFlash && <span style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 600 }}>● Sin guardar</span>}
              {saveFlash && <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700 }}>✓ Guardado</span>}
            </div>
            <div style={{ display: 'flex', gap: '0.85rem', marginTop: 4, fontSize: '0.72rem', color: '#64748b', flexWrap: 'wrap' }}>
              <span><strong style={{ color: '#475569', fontFamily: 'ui-monospace,monospace' }}>{op.bl || '—'}</strong> · BL</span>
              <span>{op.contenedor}</span>
              <span>ETA <strong style={{ color: '#059669' }}>{op.eta || '—'}</strong></span>
            </div>
          </div>
          <button onClick={saveAll} disabled={!isDirty || saving} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1.1rem', borderRadius: 8, border: isDirty ? 'none' : '1px solid #e2e8f0', background: saving ? '#94a3b8' : (isDirty ? '#059669' : '#fff'), color: isDirty || saving ? '#fff' : '#94a3b8', fontWeight: 700, fontSize: '0.78rem', cursor: (isDirty && !saving) ? 'pointer' : 'default' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            {saving ? 'Guardando…' : (isDirty ? 'Guardar' : 'Guardado')}
          </button>
        </div>

        {/* KPI strip */}
        <div className="gestion-kpi-strip" style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
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

      {/* MAIN LAYOUT */}
      <div className="gestion-main-split" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1rem', alignItems: 'start' }}>

        {/* LEFT: Master table */}
        <div style={CARD}>
          <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.85rem', fontWeight: 700 }}>Proveedores</p>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{calc.perProv.length} cargados · {calc.totalM3.toFixed(1)} m³</span>
            </div>
            <button onClick={addProveedor} style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.3rem 0.7rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '0.9rem' }}>+</span> Proveedor
            </button>
          </div>

          {showVepBanner && (
            <div style={{
              margin: '0.7rem 1rem 0',
              fontSize: '0.72rem',
              fontWeight: 600,
              padding: '0.5rem 0.75rem',
              borderRadius: 8,
              border: '1px solid',
              ...(vepMatch
                ? { background: '#f0fdf4', borderColor: '#bbf7d0', color: '#16a34a' }
                : { background: '#fffbeb', borderColor: '#fde68a', color: '#d97706' }),
            }}>
              {vepMatch
                ? `VEP asignado: ${fmtP(vepAsignado)} — coincide con el total ✓`
                : vepTotal === 0
                  ? 'Cargá el VEP Aduana total en Costos compartidos para validar el reparto.'
                  : `VEP asignado a proveedores: ${fmtP(vepAsignado)} de ${fmtP(vepTotal)} total · ${vepDiff > 0 ? `faltan ${fmtP(Math.abs(vepDiff))}` : `asignaste ${fmtP(Math.abs(vepDiff))} de más`}`}
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="master-providers-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {[
                    { l: 'Proveedor', a: 'left' }, { l: 'Tipo', a: 'left' }, { l: 'm³', a: 'right' },
                    { l: 'FOB USD', a: 'right' }, { l: 'Costo $', a: 'right' }, { l: 'TC', a: 'right' },
                    { l: 'A cobrar', a: 'right' }, { l: 'Estado', a: 'left' }, { l: '', a: 'right' },
                  ].map((c, idx) => (
                    <th key={idx} style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.6rem 0.7rem', textAlign: c.a, borderBottom: '1px solid #e8ecf1' }}>{c.l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calc.perProv.map((p, i) => {
                  const isExp = expanded === i;
                  const isCobrado = p.cb.cobrado;
                  return (
                    <FRow key={p.id || i}>
                      <tr onClick={() => setExpanded(isExp ? null : i)}
                        style={{ cursor: 'pointer', background: isExp ? '#f8fafc' : 'transparent', opacity: isCobrado && !isExp ? 0.65 : 1, borderBottom: isExp ? 'none' : '1px solid #f1f5f9', transition: 'background 0.1s' }}
                        onMouseEnter={e => !isExp && (e.currentTarget.style.background = '#fbfcfd')}
                        onMouseLeave={e => !isExp && (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '0.7rem', fontWeight: 600, color: '#1e293b' }}>{p.nombre || <span style={{ color: '#cbd5e1' }}>— sin nombre —</span>}</td>
                        <td style={{ padding: '0.7rem' }}>
                          <span style={{ background: '#f1f5f9', color: '#64748b', fontSize: '0.66rem', fontWeight: 600, padding: '0.15rem 0.55rem', borderRadius: 5, border: '1px solid #e2e8f0' }}>
                            {p.tipo === 'Propio' ? 'Propio' : (p.clienteNombre || 'Cliente s/asignar')}
                          </span>
                        </td>
                        <td style={{ padding: '0.7rem', textAlign: 'right', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{p.m3 || '—'}</td>
                        <td style={{ padding: '0.7rem', textAlign: 'right', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{n(p.fobUSD) > 0 ? fmtUcompact(n(p.fobUSD)) : '—'}</td>
                        <td style={{ padding: '0.7rem', textAlign: 'right', color: '#1e293b', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{p.costoFinal > 0 ? fmtP(p.costoFinal) : '—'}</td>
                        <td style={{ padding: '0.7rem', textAlign: 'right', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{p.tcUsed || '—'}</td>
                        <td style={{ padding: '0.7rem', textAlign: 'right', fontWeight: 700, color: '#1e293b', fontVariantNumeric: 'tabular-nums' }}>{p.totalUSD > 0 ? fmtUcompact(p.totalUSD) : '—'}</td>
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

                      {isExp && (
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e8ecf1' }}>
                          <td colSpan={9} style={{ padding: '0 1rem 1.1rem' }}>
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

        {/* RIGHT RAIL */}
        <div style={{ position: 'sticky', top: 220, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={CARD}>
            <button onClick={() => setCostosOpen(!costosOpen)} style={{ width: '100%', padding: '0.75rem 0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 700 }}>Costos compartidos</p>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" style={{ transform: costosOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {costosOpen && (
              <div style={{ padding: '0 0.5rem 0.6rem' }}>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.3rem 0.55rem 0.3rem' }}>
                  <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>En blanco</span>
                  <span style={{ fontSize: '0.62rem', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{fmtP(calc.enBlanco)}</span>
                </div>
                {GASTOS_BLANCO.map(g => (
                  <CategoryBtn key={g.id} g={g} onClick={() => setEditingCat(g)} />
                ))}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 0.55rem 0.3rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.58rem', fontWeight: 700, color: '#0891b2', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="6" x2="12" y2="18"/><line x1="6" y1="12" x2="18" y2="12"/></svg>
                    Cash propio
                  </span>
                  <span style={{ fontSize: '0.62rem', color: '#0891b2', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtP(calc.cash)}</span>
                </div>
                <div style={{ background: '#f0f9ff', borderRadius: 6, padding: 3, border: '1px solid #e0f2fe' }}>
                  {GASTOS_CASH.map(g => (
                    <CategoryBtn key={g.id} g={g} onClick={() => setEditingCat(g)} cash />
                  ))}
                </div>
                <p style={{ fontSize: '0.62rem', color: '#0c4a6e', padding: '0.4rem 0.55rem 0', lineHeight: 1.4 }}>
                  Lo pagaste vos de tu bolsillo · se recupera de cada cliente según su m³
                </p>

                <button onClick={() => setAddingCat(true)} style={{ width: '100%', marginTop: 10, padding: '0.45rem 0.55rem', borderRadius: 6, border: '1px dashed #cbd5e1', background: 'transparent', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.color = '#475569'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#94a3b8'; }}>
                  <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>+</span> Agregar categoría
                </button>

                <div style={{ marginTop: 10, padding: '0.65rem 0.7rem', background: '#0f172a', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>Total general</span>
                  <span style={{ fontSize: '0.82rem', color: '#fff', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtP(calc.totalGastos)}</span>
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
              <div style={CARD}>
                <div style={{ padding: '0.75rem 0.95rem', borderBottom: '1px solid #f1f5f9' }}>
                  <p style={{ fontSize: '0.82rem', fontWeight: 700 }}>Cotizado vs a cobrar</p>
                </div>
                <div style={{ padding: '0.7rem 0.95rem 0.9rem', display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.74rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#94a3b8' }}>Cotizado al cliente</span><span style={{ fontWeight: 700, color: '#475569' }}>{fmtU(cot)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#94a3b8' }}>A cobrar (calculado)</span><span style={{ fontWeight: 700, color: '#0f172a' }}>{fmtU(calc.totalACobrar)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#94a3b8' }}>Diferencia</span>
                    <span style={{ fontWeight: 800, color: up ? '#059669' : '#dc2626' }}>{up ? '+' : ''}{fmtU(dif)}</span>
                  </div>
                </div>
              </div>
            );
          })() : null}

          {/* Seguimiento del agente (tracking) */}
          <div style={CARD}>
            <div style={{ padding: '0.75rem 0.95rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 700 }}>Seguimiento del agente</p>
              <button onClick={() => router.push('/gestion/tracking')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0284c7', fontSize: '0.7rem', fontWeight: 700, padding: 0 }}>Ver en Tracking →</button>
            </div>
            <div style={{ padding: '0.7rem 0.95rem 0.9rem' }}>
              {!shipmentLoaded ? (
                <p style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Cargando…</p>
              ) : !shipment ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.4 }}>Sin embarque vinculado en Tracking (se vincula por N° BL).</p>
                  <button onClick={crearEmbarque} disabled={creatingShip} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.35rem 0.8rem', borderRadius: 7, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', fontWeight: 700, fontSize: '0.72rem', cursor: creatingShip ? 'default' : 'pointer' }}>
                    {creatingShip ? 'Creando…' : '+ Crear embarque en Tracking'}
                  </button>
                </div>
              ) : (() => {
                const stColor = trackingStatusColor(shipment.status);
                const bal = trackBalNum(shipment.balance_usd);
                const agente = shipment.agente || 'Bruce';
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0', fontSize: '0.64rem', fontWeight: 700, padding: '0.12rem 0.5rem', borderRadius: 5 }}>{agente}</span>
                      {shipment.carrier && <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>{shipment.carrier}</span>}
                      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, color: stColor, border: `1px solid ${stColor}40`, background: `${stColor}12`, fontSize: '0.64rem', fontWeight: 700, padding: '0.12rem 0.5rem', borderRadius: 5, whiteSpace: 'nowrap' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: stColor }} />{shipment.status || '—'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#1e293b', fontWeight: 600 }}>
                      {shipment.origen || '—'} <span style={{ color: '#cbd5e1' }}>→</span> {shipment.destino || '—'}
                    </div>
                    <div style={{ display: 'flex', gap: 14, fontSize: '0.72rem' }}>
                      <div><span style={{ color: '#94a3b8' }}>Zarpe (ETD): </span><span style={{ color: '#475569', fontWeight: 600 }}>{shipment.etd || '—'}</span></div>
                      <div><span style={{ color: '#94a3b8' }}>ETA: </span><span style={{ color: '#059669', fontWeight: 600 }}>{shipment.eta || '—'}</span></div>
                    </div>
                    {shipment.total_usd && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
                        <span style={{ color: '#94a3b8' }}>Total al agente</span>
                        <span style={{ color: '#475569', fontWeight: 700 }}>USD {shipment.total_usd}</span>
                      </div>
                    )}
                    {bal > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.55rem', background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
                        <span style={{ fontSize: '0.68rem', color: '#b91c1c', fontWeight: 600 }}>Saldo a pagar al agente</span>
                        <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 800 }}>USD {shipment.balance_usd}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

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
                ['Puerto origen',
                  <input key="po" value={detail.puertoOrigen || ''} onChange={e => updDetail({ puertoOrigen: e.target.value })}
                    placeholder="—"
                    style={{ width: 120, padding: '0.15rem 0.4rem', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: '0.72rem', color: '#475569', background: '#fff', outline: 'none', textAlign: 'right' }} />
                ],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94a3b8' }}>{l}</span>
                  <span style={{ color: '#475569', fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CATEGORY EDIT MODAL */}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }} onClick={() => setConfirmDelCat(null)}>
          <div style={{ ...CARD, maxWidth: 360, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </div>
            <p style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.4rem' }}>¿Eliminar esta categoría?</p>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1.25rem' }}>Se perderán las facturas cargadas. No se puede deshacer.</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button onClick={() => setConfirmDelCat(null)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => doRemoveCustomCategory(confirmDelCat)} style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Floating checklist FAB */}
      <button className="checklist-fab" onClick={() => setShowChecklist(!showChecklist)} style={{ position: 'fixed', bottom: 24, right: 24, padding: '0.7rem 1.1rem', borderRadius: 50, border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem', fontWeight: 700, boxShadow: '0 8px 24px rgba(15,23,42,0.18)', zIndex: 40 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        Checklist {doneTasks}/{totalTasks}
        <span style={{ marginLeft: 4, fontSize: '0.7rem', background: progress === 100 ? '#16a34a' : '#ea580c', padding: '0.1rem 0.5rem', borderRadius: 99 }}>{progress}%</span>
      </button>

      {/* Checklist drawer */}
      {showChecklist && (
        <>
          <div onClick={() => setShowChecklist(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.3)', zIndex: 50 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(400px, 92vw)', background: '#fff', zIndex: 60, boxShadow: '-8px 0 32px rgba(0,0,0,0.12)', overflowY: 'auto', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>Checklist de la operación</h3>
                <p style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{doneTasks} de {totalTasks} tareas completadas</p>
              </div>
              <button onClick={() => setShowChecklist(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1, padding: 0 }}>×</button>
            </div>
            <div style={{ height: 6, background: '#f1f5f9', borderRadius: 99, marginBottom: '1.5rem', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: progress === 100 ? '#059669' : '#ea580c', borderRadius: 99, transition: 'width 0.3s' }} />
            </div>
            {FASES.map(fase => {
              const items = CHECKLIST.filter(t => t.fase === fase.id);
              const doneInFase = items.filter(t => checked.has(t.id)).length;
              return (
                <div key={fase.id} style={{ marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: fase.color }} />
                      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e293b' }}>Fase {fase.id} — {fase.label}</p>
                    </div>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, background: fase.bg, color: fase.color, padding: '0.1rem 0.5rem', borderRadius: 99, border: `1px solid ${fase.badge}` }}>
                      {doneInFase}/{items.length}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    {items.map(task => {
                      const done = checked.has(task.id);
                      return (
                        <div key={task.id} onClick={() => toggleCheck(task.id)}
                          style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem', cursor: 'pointer', padding: '0.4rem 0.5rem', borderRadius: 6, transition: 'background 0.1s', background: done ? fase.bg : 'transparent' }}
                          onMouseEnter={e => !done && (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => !done && (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ width: 16, height: 16, borderRadius: 4, border: done ? `2px solid ${fase.color}` : '2px solid #cbd5e1', background: done ? fase.color : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, transition: 'all 0.15s' }}>
                            {done && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                          <span style={{ fontSize: '0.78rem', color: done ? '#94a3b8' : '#374151', textDecoration: done ? 'line-through' : 'none', lineHeight: 1.4, fontWeight: done ? 400 : 500 }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '400px', margin: '1rem', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '1.5rem' }}>⚠️</div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1e293b', textAlign: 'center', marginBottom: '0.5rem' }}>Cambios sin guardar</h3>
            <p style={{ fontSize: '0.82rem', color: '#64748b', textAlign: 'center', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Tenés cambios sin guardar en esta operación.<br/>¿Qué querés hacer antes de salir?
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={discardAndBack} style={{ flex: 1, padding: '0.6rem', borderRadius: '10px', border: '1px solid #fee2e2', background: '#fff', color: '#dc2626', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                Descartar cambios
              </button>
              <button onClick={saveAndBack} style={{ flex: 1, padding: '0.6rem', borderRadius: '10px', border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                Guardar y salir
              </button>
            </div>
            <button onClick={() => setShowDiscard(false)} style={{ display: 'block', width: '100%', marginTop: '0.6rem', padding: '0.45rem', borderRadius: '8px', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>
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

function CategoryBtn({ g, onClick, cash }) {
  return (
    <button onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 0.55rem', borderRadius: 5, cursor: 'pointer', transition: 'background 0.1s', width: '100%', border: 'none', background: 'transparent', textAlign: 'left' }}
      onMouseEnter={e => e.currentTarget.style.background = cash ? '#e0f2fe' : '#f8fafc'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: g.total > 0 ? g.color : '#e2e8f0', flexShrink: 0 }} />
        <span style={{ fontSize: '0.74rem', color: cash ? '#0c4a6e' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</span>
        {g.custom && <span style={{ fontSize: '0.55rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f1f5f9', padding: '0 4px', borderRadius: 3 }}>custom</span>}
      </div>
      <span style={{ fontSize: '0.73rem', fontWeight: 600, color: g.total > 0 ? (cash ? '#0891b2' : '#1e293b') : '#cbd5e1', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{g.total > 0 ? fmtP(g.total) : '—'}</span>
    </button>
  );
}

const PALETTE = ['#0284c7', '#7c3aed', '#dc2626', '#d97706', '#059669', '#64748b', '#0891b2', '#e11d48', '#9333ea', '#16a34a'];
function AddCategoryModal({ onAdd, onClose }) {
  const [label, setLabel] = useState('');
  const [kind,  setKind]  = useState('blanco');
  const [color, setColor] = useState(PALETTE[0]);
  const valid = label.trim().length > 0;
  const INP_MODAL = { width: '100%', padding: '0.4rem 0.55rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.78rem', color: '#1e293b', background: '#fff', outline: 'none', boxSizing: 'border-box' };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 100 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(420px, 92vw)', background: '#fff', borderRadius: 12, zIndex: 110, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', padding: '1.4rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>Nueva categoría de gasto</h3>

        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Nombre</p>
          <input autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="Ej: Seguro de carga" style={INP_MODAL} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Tipo de pago</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { v: 'blanco', t: 'En blanco', d: 'Pagado por banco · gasto normal' },
              { v: 'cash',   t: 'Cash propio', d: 'Pagado de tu bolsillo · a recuperar' },
            ].map(opt => {
              const sel = kind === opt.v;
              return (
                <button key={opt.v} onClick={() => setKind(opt.v)} style={{
                  padding: '0.65rem 0.7rem', borderRadius: 7, border: `1.5px solid ${sel ? (opt.v === 'cash' ? '#0891b2' : '#475569') : '#e2e8f0'}`,
                  background: sel ? (opt.v === 'cash' ? '#f0f9ff' : '#f8fafc') : '#fff', cursor: 'pointer', textAlign: 'left',
                }}>
                  <p style={{ fontSize: '0.78rem', fontWeight: 700, color: sel ? (opt.v === 'cash' ? '#0891b2' : '#1e293b') : '#475569' }}>{opt.t}</p>
                  <p style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 2, lineHeight: 1.3 }}>{opt.d}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Color</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PALETTE.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{
                width: 26, height: 26, borderRadius: '50%', background: c, border: `2px solid ${color === c ? '#0f172a' : 'transparent'}`,
                cursor: 'pointer', padding: 0, transition: 'transform 0.1s',
              }} title={c} />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.5rem 1rem', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={() => valid && onAdd({ label: label.trim(), kind, color })} disabled={!valid} style={{ padding: '0.5rem 1.25rem', borderRadius: 7, border: 'none', background: valid ? '#059669' : '#e2e8f0', color: valid ? '#fff' : '#94a3b8', fontWeight: 700, fontSize: '0.8rem', cursor: valid ? 'pointer' : 'default' }}>Crear categoría</button>
        </div>
      </div>
    </>
  );
}

function CategoryEditor({ cat, rows: initRows, onChange, onClose, onDelete }) {
  const [rows, setRows] = useState(initRows.length ? initRows : [newRow()]);
  const tot = catTot(rows).pesos;
  const INP_MODAL = { width: '100%', padding: '0.4rem 0.55rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.78rem', color: '#1e293b', background: '#fff', outline: 'none', boxSizing: 'border-box' };

  const updRow = (i, f, v) => setRows(rs => rs.map((r, j) => j === i ? { ...r, [f]: v } : r));
  const addRow = () => setRows(rs => [...rs, newRow()]);
  const remRow = (i) => setRows(rs => rs.filter((_, j) => j !== i));

  const save = () => { onChange(rows.filter(r => r.desc || r.usd || r.pesos)); onClose(); };

  return (
    <>
      <div onClick={save} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 100 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(820px, 94vw)', maxHeight: '88vh', background: '#fff', borderRadius: 12, zIndex: 110, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.1rem 1.4rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: cat.color }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>{cat.label}</h3>
            {cat.note && <span style={{ fontSize: '0.68rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', padding: '0.15rem 0.55rem', borderRadius: 5, fontWeight: 600 }}>{cat.note}</span>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.4rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Descripción', 'N° Factura', 'USD', 'T.C.', 'Pesos', ''].map(h => (
                  <th key={h} style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.5rem 0.6rem 0.6rem', textAlign: h === 'USD' || h === 'T.C.' || h === 'Pesos' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const calcPesos = n(row.usd) > 0 && n(row.tc) > 0;
                return (
                  <tr key={row.id}>
                    <td style={{ padding: '0.25rem 0.3rem' }}>
                      <input value={row.desc} onChange={e => updRow(i, 'desc', e.target.value)} style={INP_MODAL} placeholder="Descripción" />
                    </td>
                    <td style={{ padding: '0.25rem 0.3rem', width: 130 }}>
                      <input value={row.factura} onChange={e => updRow(i, 'factura', e.target.value)} style={INP_MODAL} placeholder="—" />
                    </td>
                    <td style={{ padding: '0.25rem 0.3rem', width: 110 }}>
                      <input type="number" inputMode="decimal" step="any" value={row.usd} onChange={e => updRow(i, 'usd', e.target.value)} style={{ ...INP_MODAL, textAlign: 'right' }} placeholder="" />
                    </td>
                    <td style={{ padding: '0.25rem 0.3rem', width: 90 }}>
                      <input type="number" inputMode="decimal" step="any" value={row.tc} onChange={e => updRow(i, 'tc', e.target.value)} style={{ ...INP_MODAL, textAlign: 'right' }} placeholder="" />
                    </td>
                    <td style={{ padding: '0.25rem 0.3rem', width: 140 }}>
                      {calcPesos ? (
                        <div style={{ ...INP_MODAL, background: '#f8fafc', color: '#059669', fontWeight: 600, textAlign: 'right' }}>{fmtP(n(row.usd) * n(row.tc))}</div>
                      ) : (
                        <input type="number" inputMode="decimal" step="any" value={row.pesos} onChange={e => updRow(i, 'pesos', e.target.value)} style={{ ...INP_MODAL, textAlign: 'right' }} placeholder="" />
                      )}
                    </td>
                    <td style={{ padding: '0.25rem 0.3rem', width: 30 }}>
                      <button onClick={() => remRow(i)} style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '1rem' }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button onClick={addRow} style={{ marginTop: '0.6rem', background: 'transparent', border: `1px dashed ${cat.color}`, borderRadius: 7, padding: '0.4rem 0.9rem', fontSize: '0.75rem', fontWeight: 700, color: cat.color, cursor: 'pointer' }}>
            + Agregar línea
          </button>
        </div>

        <div style={{ padding: '1rem 1.4rem', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', borderRadius: '0 0 12px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Subtotal {cat.label}</span>
              <p style={{ fontSize: '1.05rem', fontWeight: 800, color: cat.color, fontVariantNumeric: 'tabular-nums' }}>{fmtP(tot)}</p>
            </div>
            {onDelete && (
              <button onClick={onDelete} style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
                onMouseLeave={e => e.currentTarget.style.color = '#cbd5e1'}>
                Eliminar categoría
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '0.5rem 1rem', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={save} style={{ padding: '0.5rem 1.25rem', borderRadius: 7, border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>Guardar</button>
          </div>
        </div>
      </div>
    </>
  );
}

function ExpandedDetail({ p, clientes, onCreateCliente, onUpdProveedor, onUpdCobrar, onToggleCobrado, onRemove }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const LBL_E  = { fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 };
  const SEC  = { fontSize: '0.65rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 };
  const HINT = { fontSize: '0.65rem', color: '#94a3b8', fontStyle: 'italic', marginTop: 3 };
  const CALC = { fontSize: '0.7rem', color: '#059669', fontWeight: 600, marginTop: 3, fontVariantNumeric: 'tabular-nums' };
  const INP_E = { width: '100%', padding: '0.4rem 0.55rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.78rem', color: '#1e293b', background: '#fff', outline: 'none', boxSizing: 'border-box' };

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
    <div style={{ paddingTop: '0.6rem' }}>
      <div className="expanded-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '0.85rem', alignItems: 'start' }}>

        <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 8, padding: '1rem 1.1rem' }}>

          <div style={{ marginBottom: 18 }}>
            <p style={SEC}><span style={{ width: 4, height: 4, borderRadius: '50%', background: '#94a3b8' }} /> Identidad</p>
            <div className="expanded-detail-identidad" style={{ display: 'grid', gridTemplateColumns: '2fr 1.3fr 1.7fr', gap: 10 }}>
              <div>
                <p style={LBL_E}>Nombre</p>
                <input value={p.nombre || ''} onChange={e => onUpdProveedor('nombre', e.target.value)} style={INP_E} placeholder="Ej: Gimnasio Marce" />
              </div>
              <div>
                <p style={LBL_E}>Tipo</p>
                <div style={{ display: 'flex', gap: 0, background: '#f1f5f9', padding: 3, borderRadius: 6 }}>
                  {['Cliente', 'Propio'].map(t => {
                    const sel = (p.tipo || 'Cliente') === t;
                    return (
                      <button key={t} onClick={() => onUpdProveedor('tipo', t)}
                        style={{ flex: 1, padding: '0.35rem 0', borderRadius: 4, border: 'none', background: sel ? '#fff' : 'transparent', fontSize: '0.72rem', fontWeight: 600, color: sel ? '#1e293b' : '#94a3b8', cursor: 'pointer', boxShadow: sel ? '0 1px 2px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}>{t}</button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p style={LBL_E}>{(p.tipo || 'Cliente') === 'Cliente' ? 'Cliente final' : 'Categoría'}</p>
                {(p.tipo || 'Cliente') === 'Cliente' ? (
                  creating ? (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        autoFocus
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) { e.preventDefault(); handleCrear(); } }}
                        placeholder="Nombre del cliente"
                        style={{ ...INP_E, flex: 1 }}
                      />
                      <button
                        onClick={handleCrear}
                        disabled={!newName.trim()}
                        style={{ flexShrink: 0, padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #16a34a', background: newName.trim() ? '#16a34a' : '#cbd5e1', color: '#fff', fontSize: '0.72rem', fontWeight: 600, cursor: newName.trim() ? 'pointer' : 'not-allowed' }}>
                        Crear
                      </button>
                      <button
                        onClick={() => { setCreating(false); setNewName(''); }}
                        title="Cancelar"
                        style={{ flexShrink: 0, padding: '0.4rem 0.5rem', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                        ✕
                      </button>
                    </div>
                  ) : (
                    <select
                      value={p.clienteId || ''}
                      onChange={e => {
                        if (e.target.value === '__nuevo__') { setNewName(''); setCreating(true); }
                        else onUpdProveedor('clienteId', e.target.value);
                      }}
                      style={{ ...INP_E, cursor: 'pointer' }}>
                      <option value="">— Sin asignar —</option>
                      {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      <option value="__nuevo__">+ Crear cliente nuevo…</option>
                    </select>
                  )
                ) : (
                  <div style={{ ...INP_E, background: '#f8fafc', color: '#94a3b8', fontStyle: 'italic' }}>Mercadería propia</div>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <p style={SEC}><span style={{ width: 4, height: 4, borderRadius: '50%', background: '#0284c7' }} /> Carga en el contenedor</p>
            <div className="expanded-detail-carga" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <p style={LBL_E}>m³ (CBM) <Help title="Volumen en metros cúbicos. Define el % de prorrateo de los costos compartidos." /></p>
                <input type="number" inputMode="decimal" step="any" value={p.m3 || ''} onChange={e => onUpdProveedor('m3', e.target.value)} style={{ ...INP_E, textAlign: 'right' }} placeholder="0.00" />
                {n(p.m3) > 0 && <p style={CALC}>= {pct(p.ratio)} del contenedor</p>}
              </div>
              <div>
                <p style={LBL_E}>FOB USD <Help title="Valor declarado del producto al embarcar (Free On Board)." /></p>
                <input type="number" inputMode="decimal" step="any" value={p.fobUSD || ''} onChange={e => onUpdProveedor('fobUSD', e.target.value)} style={{ ...INP_E, textAlign: 'right' }} placeholder="0" />
              </div>
              <div>
                <p style={LBL_E}>Gs. Origen USD <span style={{ color: '#cbd5e1', fontWeight: 400, fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>opcional</span></p>
                <input type="number" inputMode="decimal" step="any" value={p.gastosOrigenUSD || ''} onChange={e => onUpdProveedor('gastosOrigenUSD', e.target.value)} style={{ ...INP_E, textAlign: 'right' }} placeholder="0" />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <p style={SEC}><span style={{ width: 4, height: 4, borderRadius: '50%', background: '#dc2626' }} /> VEP Aduana <Help title="Tributos aduaneros pagados por este proveedor. USD × T.C. = pesos asignados." /></p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <p style={LBL_E}>USD</p>
                <input type="number" inputMode="decimal" step="any" value={p.tributosUSD || ''} onChange={e => onUpdProveedor('tributosUSD', e.target.value)} style={{ ...INP_E, textAlign: 'right' }} placeholder="0" />
              </div>
              <div style={{ paddingBottom: 8, color: '#cbd5e1', fontWeight: 700, fontSize: '0.9rem' }}>×</div>
              <div style={{ flex: 1 }}>
                <p style={LBL_E}>T.C.</p>
                <input type="number" inputMode="decimal" step="any" value={p.tributosTC || ''} onChange={e => onUpdProveedor('tributosTC', e.target.value)} style={{ ...INP_E, textAlign: 'right' }} placeholder="—" />
              </div>
              <div style={{ paddingBottom: 8, color: '#cbd5e1', fontWeight: 700, fontSize: '0.9rem' }}>=</div>
              <div style={{ flex: 1.2 }}>
                <p style={LBL_E}>Pesos</p>
                <div style={{ ...INP_E, background: hasVepBoth ? '#f0fdf4' : '#f8fafc', color: hasVepBoth ? '#059669' : '#cbd5e1', fontWeight: 700, textAlign: 'right', borderColor: hasVepBoth ? '#bbf7d0' : '#e2e8f0' }}>
                  {hasVepBoth ? fmtP(vepPesos) : '—'}
                </div>
              </div>
            </div>
          </div>

          <button onClick={onRemove} style={{ marginTop: 4, background: 'none', border: 'none', color: '#cbd5e1', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', padding: '0.3rem 0', transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
            onMouseLeave={e => e.currentTarget.style.color = '#cbd5e1'}>
            Eliminar este proveedor
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          <div style={{ background: '#0f172a', borderRadius: 8, padding: '0.85rem 1.1rem', color: '#fff' }}>
            <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Total a cobrar</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{fmtU(p.totalUSD)}</p>
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.7rem' }}>
              <Mini label="Prorrateo blanco" val={fmtP(p.prorBlancoPesos)} />
              {p.prorCashPesos > 0 && <Mini label="Prorrateo cash" val={fmtP(p.prorCashPesos)} cash />}
              <Mini label="VEP Aduana" val={fmtP(p.vepPesos)} />
              <Mini label={`÷ TC ${p.tcUsed || '—'}`} val={fmtU(p.gastosUSD)} />
              {p.origenUSD > 0 && <Mini label="+ origen" val={fmtU(p.origenUSD)} />}
              {p.cb.honorarios && <Mini label="+ honor. 4%" val={fmtU(p.honorarios)} />}
              {n(p.cb.despAdic) > 0 && <Mini label="+ desp. adic." val={fmtU(n(p.cb.despAdic))} />}
            </div>
            {p.cashUSD > 0 && (
              <div style={{ marginTop: 8, padding: '0.5rem 0.65rem', background: '#0c4a6e', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="6" x2="12" y2="18"/><line x1="6" y1="12" x2="18" y2="12"/></svg>
                  <span style={{ fontSize: '0.66rem', color: '#7dd3fc', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>De los que recuperás cash</span>
                </div>
                <span style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtU(p.cashUSD)}</span>
              </div>
            )}
          </div>

          <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 8, padding: '0.9rem 1.1rem' }}>
            <p style={SEC}><span style={{ width: 4, height: 4, borderRadius: '50%', background: '#ea580c' }} /> Ajustes de cobro</p>

            <div className="expanded-detail-ajustes" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <p style={LBL_E}>T.C. cobro</p>
                <input type="number" inputMode="decimal" step="any" value={p.cb.tc || ''} onChange={e => onUpdCobrar('tc', e.target.value)} placeholder={p.tributosTC ? `${p.tributosTC} auto` : '—'} style={{ ...INP_E, textAlign: 'right' }} />
                <p style={HINT}>vacío = usa el del VEP</p>
              </div>
              <div>
                <p style={LBL_E}>Desp. adic. USD</p>
                <input type="number" inputMode="decimal" step="any" value={p.cb.despAdic || ''} onChange={e => onUpdCobrar('despAdic', e.target.value)} placeholder="0" style={{ ...INP_E, textAlign: 'right' }} />
                <p style={HINT}>extras del despachante</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.7rem', background: '#f8fafc', borderRadius: 6, border: '1px solid #e8ecf1' }}>
              <div>
                <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Honorarios 4%</p>
                <p style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 1 }}>sobre (gastos + origen)</p>
              </div>
              <button type="button" onClick={() => onUpdCobrar('honorarios', !p.cb.honorarios)} className={`g-toggle${p.cb.honorarios ? ' on' : ''}`} aria-pressed={!!p.cb.honorarios}>
                <span className="g-toggle-knob" />
              </button>
            </div>
          </div>

          <button onClick={onToggleCobrado}
            style={{ background: p.cb.cobrado ? '#f0fdf4' : '#fff', border: `1px solid ${p.cb.cobrado ? '#bbf7d0' : '#e8ecf1'}`, borderRadius: 8, padding: '0.7rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', transition: 'all 0.15s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: p.cb.cobrado ? '#dcfce7' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {p.cb.cobrado ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
                )}
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, color: p.cb.cobrado ? '#16a34a' : '#1e293b' }}>{p.cb.cobrado ? 'Cobrado' : 'Pendiente de cobro'}</p>
                <p style={{ fontSize: '0.65rem', color: p.cb.cobrado ? '#059669' : '#94a3b8', marginTop: 1 }}>
                  {p.cb.cobrado ? (p.cb.fechaCobro ? `el ${p.cb.fechaCobro}` : 'cobrado') : 'click para marcar'}
                </p>
              </div>
            </div>
            <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{p.cb.cobrado ? 'Desmarcar' : 'Marcar'}</span>
          </button>
        </div>

      </div>
    </div>
  );
}

function Mini({ label, val, cash }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', color: cash ? '#7dd3fc' : '#94a3b8' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {cash && <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#38bdf8' }} />}
        {label}
      </span>
      <span style={{ color: cash ? '#38bdf8' : '#cbd5e1', fontWeight: cash ? 600 : 500, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
    </div>
  );
}

function Help({ title }) {
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 12, height: 12, borderRadius: '50%', background: '#e2e8f0', color: '#64748b', fontSize: '0.55rem', fontWeight: 700, marginLeft: 4, cursor: 'help', verticalAlign: 'middle' }}>?</span>
  );
}


// ─── Main Export ──────────────────────────────────────────────────────────────
function OperationsInner() {
  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get('op');
  const [selected, setSelected] = useState(null);
  if (selected) return <OperationDetail op={selected} onBack={() => setSelected(null)} />;
  return <OperationsList onSelect={setSelected} deepLinkId={deepLinkId} />;
}

export default function Operations() {
  return (
    <Suspense fallback={<div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Cargando operaciones...</div>}>
      <OperationsInner />
    </Suspense>
  );
}
