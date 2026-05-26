'use client';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const CLIENTES_KEY = 'transtide-clientes';
const MOCK_CLIENTES = [
  { id: 'c1', nombre: 'Franco Modulos SRL', cuit: '30-71234567-8' },
  { id: 'c2', nombre: 'Gym Equipment SA',   cuit: '30-67890123-4' },
];

// ─── helpers ─────────────────────────────────────────────────────────────────
const n    = (v) => parseFloat(v) || 0;
const fmtP = (v) => v == null || isNaN(v) ? '—' : '$ ' + Math.round(v).toLocaleString('es-AR');
const fmtU = (v) => v == null || isNaN(v) ? '—' : 'USD ' + (Math.round(v * 100) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct  = (v) => isNaN(v) ? '—' : (v * 100).toFixed(2) + '%';

// ─── styles ───────────────────────────────────────────────────────────────────
const CARD = { background: '#fff', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.04)' };
const LBL  = { display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' };
const INP  = { width: '100%', padding: '0.42rem 0.6rem', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '0.82rem', color: '#1e293b', background: '#fff', outline: 'none' };
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
const OPS_KEY = 'transtide-operaciones';

const INIT_OPS = [
  { id: 'franco-modulos', nombre: 'Franco Modulos 2 + varios',      contenedor: '40HQ',    bl: 'MAEU7546833339', eta: '22/03/2024', proveedores: 3, estado: 'Liquidado',    fecha: '15/03/2024' },
  { id: 'agro-export',    nombre: 'Agro Export — Fertilizantes',    contenedor: '20 Pies', bl: 'HLCU4012981002', eta: '10/04/2024', proveedores: 1, estado: 'En aduana',    fecha: '02/04/2024' },
  { id: 'med-supply',     nombre: 'Med Supply — Insumos Médicos',   contenedor: '40HQ',    bl: '',               eta: '28/04/2024', proveedores: 2, estado: 'Consolidando', fecha: '20/04/2024' },
];
const emptyOp = () => ({ id: '', nombre: '', contenedor: '40HQ', bl: '', eta: '', proveedores: '', estado: 'Consolidando', fecha: '' });

// ─── initial data (Franco Modulos) ───────────────────────────────────────────
const FRANCO = {
  naviera:    [
    { id: 1, desc: 'MAERSK', factura: '7546833339', usd: 791, tc: 1479, pesos: '' },
    { id: 2, desc: 'MAERSK', factura: '7547097709', usd: 57,  tc: 1478, pesos: '' },
  ],
  terminal:   [{ id: 1, desc: 'TERMINAL 4', factura: '747512', usd: '', tc: '', pesos: 2278971.82 }],
  aduana:     [{ id: 1, desc: 'VEP / Tributos Aduaneros', factura: '', usd: '', tc: '', pesos: 12500000 }],
  transporte: [{ id: 1, desc: 'Flete BsAs → Bahía Blanca', factura: '4149', usd: '', tc: '', pesos: 4235000 }],
  despachante:[],
  admin:      [],
  fleteIntl:  [],
  proveedores:[
    { id: 1, nombre: 'karting',     tipo: 'Cliente', clienteId: 'c1', m3: 20.34, fobUSD: 25314, gastosOrigenUSD: '',  tributosUSD: 3991.87, tributosTC: 1390 },
    { id: 2, nombre: 'gimnasio',    tipo: 'Cliente', clienteId: 'c1', m3: 13,    fobUSD: 5500,  gastosOrigenUSD: '',  tributosUSD: 2746.04, tributosTC: 1390 },
    { id: 3, nombre: 'generadores', tipo: 'Propio',  clienteId: '',   m3: 4.8,   fobUSD: 16000, gastosOrigenUSD: 350, tributosUSD: 1176.05, tributosTC: 1390 },
  ],
  cobrar:[
    { tc: 1425, honorarios: false, despAdic: 8000, cobrado: false, fechaCobro: '' },
    { tc: 1425, honorarios: false, despAdic: 1670, cobrado: false, fechaCobro: '' },
    { tc: 1425, honorarios: false, despAdic: 920,  cobrado: false, fechaCobro: '' },
  ],
  checked: ['cg', 'ncm', 'bl', 'inv', 'legajo', 'fnav', 'lib', 'flete', 'facts', 'costs'],
};

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
                    <input type="number" step="any" value={row.usd} onChange={e => onUpdate(i,'usd',e.target.value)}
                      style={{ ...INP, textAlign: 'right', color: '#ea580c', fontWeight: 600 }} placeholder="0" />
                  </td>
                  <td style={TD}>
                    <input type="number" step="any" value={row.tc} onChange={e => onUpdate(i,'tc',e.target.value)}
                      style={{ ...INP, textAlign: 'right', color: '#ea580c', fontWeight: 600 }} placeholder="—" />
                  </td>
                  <td style={TD}>
                    {calcPesos
                      ? <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#059669' }}>{fmtP(n(row.usd) * n(row.tc))}</span>
                      : <input type="number" step="any" value={row.pesos} onChange={e => onUpdate(i,'pesos',e.target.value)}
                          style={{ ...INP, textAlign: 'right', color: '#ea580c', fontWeight: 600 }} placeholder="0" />
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
function OperationsList({ onSelect }) {
  const [ops,     setOps]     = useState(() => {
    try { const s = typeof window !== 'undefined' && localStorage.getItem(OPS_KEY); return s ? JSON.parse(s) : INIT_OPS; } catch { return INIT_OPS; }
  });
  const [modal,     setModal]     = useState(null); // null | 'new' | opObj
  const [form,      setForm]      = useState(emptyOp());
  const [confirm,   setConfirm]   = useState(null); // id to delete
  const [statusPop, setStatusPop] = useState(null); // op.id with open status picker

  const saveOps = (list) => { setOps(list); localStorage.setItem(OPS_KEY, JSON.stringify(list)); };

  // Get occupied m³ from saved operation detail (sum of providers' m³)
  const getOcupado = (opId) => {
    try {
      const d = typeof window !== 'undefined' && localStorage.getItem(`transtide-opdetail-${opId}`);
      if (!d) return null;
      const parsed = JSON.parse(d);
      const provs = parsed?.proveedores || [];
      const total = provs.reduce((s, p) => s + (parseFloat(p.m3) || 0), 0);
      return total > 0 ? total : null;
    } catch { return null; }
  };
  const openNew  = () => { setForm(emptyOp()); setModal('new'); };
  const openEdit = (op, e) => { e.stopPropagation(); setForm({ ...op }); setModal(op); };
  const askDel   = (id, e) => { e.stopPropagation(); setConfirm(id); };
  const setEstado = (id, estado) => { saveOps(ops.map(o => o.id === id ? { ...o, estado } : o)); setStatusPop(null); };

  const submit = () => {
    if (!form.nombre.trim()) return;
    if (modal === 'new') {
      saveOps([...ops, { ...form, id: 'op-' + Date.now() }]);
    } else {
      saveOps(ops.map(o => o.id === modal.id ? { ...form, id: modal.id } : o));
    }
    setModal(null);
  };
  const remove = (id) => { saveOps(ops.filter(o => o.id !== id)); setConfirm(null); };

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

      {/* list */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 1.6fr 1.4fr 1fr auto', gap: '0.5rem', padding: '0 1.25rem 0.55rem 5.25rem', alignItems: 'center' }}>
          {['Operación', 'N° BL', 'Contenedor / M³', 'ETA', ''].map(h => (
            <span key={h} style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
          ))}
        </div>

        {ops.map(op => {
          const est = estadoObj(op.estado);
          const cap = CONTAINER_M3[op.contenedor];
          const ocup = getOcupado(op.id);
          const m3str = cap
            ? `${ocup != null ? ocup.toFixed(1) : '—'} / ${cap} m³`
            : ocup != null ? `${ocup.toFixed(1)} m³` : '—';
          const m3Over = cap && ocup != null && ocup > cap * 0.9;
          return (
            <div key={op.id}
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
                <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: est.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.05rem', flexShrink: 0 }}>
                  {est.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.nombre}</p>
                  <p style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '1px' }}>Alta: {op.fecha || '—'}</p>
                </div>
              </div>

              {/* col 2: BL */}
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: op.bl ? '#475569' : '#cbd5e1', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.bl || '—'}</p>

              {/* col 3: container + m³ */}
              <div>
                <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>{op.contenedor || '—'}</p>
                <p style={{ fontSize: '0.7rem', color: m3Over ? '#dc2626' : '#94a3b8' }}>{m3str}</p>
              </div>

              {/* col 4: ETA */}
              <p style={{ fontSize: '0.82rem', fontWeight: 600, color: op.eta ? '#059669' : '#cbd5e1' }}>{op.eta || '—'}</p>

              {/* col 5: actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={e => e.stopPropagation()}>
                {/* status badge */}
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setStatusPop(statusPop === op.id ? null : op.id)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.65rem', borderRadius: '50px', fontSize: '0.68rem', fontWeight: 700, background: est.bg, color: est.color, border: `1.5px solid ${est.color}40`, cursor: 'pointer', whiteSpace: 'nowrap' }}>
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
                <button onClick={e => openEdit(op, e)} title="Editar"
                  style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✏</button>
                {/* delete icon */}
                <button onClick={e => askDel(op.id, e)} title="Eliminar"
                  style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fff', color: '#dc2626', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* click-away to close status popup */}
      {statusPop && <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setStatusPop(null)} />}

      {/* ── Modal nueva / editar operación ── */}
      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setModal(null)}>
          <div style={{ ...CARD, width: '100%', maxWidth: '520px', margin: '1rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>{modal === 'new' ? 'Nueva operación' : 'Editar operación'}</h3>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.3rem', lineHeight: 1 }}>×</button>
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
  const [mainTab,     setMainTab]     = useState('proveedores');
  const [gastoTab,    setGastoTab]    = useState('naviera');
  const [isDirty,     setIsDirty]     = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [pendingNav,  setPendingNav]  = useState(null);
  const [saveFlash,   setSaveFlash]   = useState(false);

  const init = (arr) => arr.length ? arr.map((r, i) => ({ ...r, id: i + 1 })) : [newRow()];
  const DKEY = `transtide-opdetail-${op.id}`;
  const loadD = () => {
    try { const s = typeof window !== 'undefined' && localStorage.getItem(DKEY); return s ? JSON.parse(s) : null; }
    catch { return null; }
  };

  const isFranco = op.id === 'franco-modulos';
  const fallback = (key, francoVal, emptyVal) => {
    const d = loadD();
    if (d?.[key]?.length) return d[key];
    return isFranco ? francoVal : emptyVal;
  };

  const [naviera,    setNaviera]    = useState(() => fallback('naviera',    init(FRANCO.naviera),    [newRow()]));
  const [terminal,   setTerminal]   = useState(() => fallback('terminal',   init(FRANCO.terminal),   [newRow()]));
  const [aduana,     setAduana]     = useState(() => fallback('aduana',     init(FRANCO.aduana),     [newRow()]));
  const [transporte, setTransporte] = useState(() => fallback('transporte', init(FRANCO.transporte), [newRow()]));
  const [despachante,setDespachante]= useState(() => fallback('despachante',init(FRANCO.despachante),[newRow()]));
  const [admin,      setAdmin]      = useState(() => fallback('admin',      init(FRANCO.admin),      [newRow()]));
  const [fleteIntl,  setFleteIntl]  = useState(() => fallback('fleteIntl',  init(FRANCO.fleteIntl),  [newRow()]));

  const [proveedores,  setProveedores]  = useState(() => { const d=loadD(); return d?.proveedores?.length ? d.proveedores : isFranco ? [...FRANCO.proveedores, newProv()] : [newProv()]; });
  const [cobrar,       setCobrar]       = useState(() => { const d=loadD(); return d?.cobrar?.length      ? d.cobrar      : isFranco ? [...FRANCO.cobrar, { tc:'', honorarios:true, despAdic:'' }] : [{ tc:'', honorarios:false, despAdic:'' }]; });
  const [puertoOrigen, setPuertoOrigen] = useState(() => { const d=loadD(); return d?.puertoOrigen ?? ''; });
  const [clientes,     setClientes]     = useState(MOCK_CLIENTES);

  // ── checklist: persist per operation in localStorage ──
  const CHECKLIST_KEY = `transtide-checklist-${op.id}`;
  const [checked, setChecked] = useState(() => {
    try {
      const saved = typeof window !== 'undefined' && localStorage.getItem(CHECKLIST_KEY);
      if (saved) return new Set(JSON.parse(saved));
      return isFranco ? new Set(FRANCO.checked) : new Set();
    } catch { return isFranco ? new Set(FRANCO.checked) : new Set(); }
  });
  useEffect(() => {
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify([...checked]));
  }, [checked]);

  // ── load clientes from localStorage ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CLIENTES_KEY);
      if (saved) setClientes(JSON.parse(saved));
    } catch { /* keep mock */ }
  }, []);

  // ── warn on browser close / refresh while dirty ──
  useEffect(() => {
    const handler = (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ── intercept sidebar navigation while dirty ──
  useEffect(() => {
    const handler = (e) => {
      if (!isDirty) return;
      e.preventDefault(); // cancels the Link navigation
      setPendingNav(e.detail.href);
      setShowDiscard(true);
    };
    window.addEventListener('gestion:navigate', handler);
    return () => window.removeEventListener('gestion:navigate', handler);
  }, [isDirty]);

  const toggleCheck = (id) => setChecked(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // ── dirty-aware setters ──
  const D = () => setIsDirty(true);
  const upd  = (setter) => (i, f, v) => { setter(p => p.map((r, j) => j === i ? { ...r, [f]: v } : r)); D(); };
  const add  = (setter) => () => { setter(p => [...p, newRow()]); D(); };
  const rem  = (setter) => (i) => { setter(p => p.filter((_, j) => j !== i)); D(); };
  const updP = (i, f, v) => { setProveedores(p => p.map((r, j) => j === i ? { ...r, [f]: v } : r)); D(); };
  const updC = (i, f, v) => { setCobrar(p => p.map((r, j) => j === i ? { ...r, [f]: v } : r)); D(); };

  // ── save / navigate ──
  const saveAll = () => {
    localStorage.setItem(DKEY, JSON.stringify({ naviera, terminal, aduana, transporte, despachante, admin, fleteIntl, proveedores, cobrar, puertoOrigen }));
    setIsDirty(false);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 2200);
  };
  const doNavigate     = () => { if (pendingNav) { router.push(pendingNav); setPendingNav(null); } else { onBack(); } };
  const handleBack     = () => { if (isDirty) { setPendingNav(null); setShowDiscard(true); } else onBack(); };
  const discardAndBack = () => { setIsDirty(false); setShowDiscard(false); doNavigate(); };
  const saveAndBack    = () => { saveAll(); setShowDiscard(false); setTimeout(doNavigate, 50); };

  const calc = useMemo(() => {
    const tNav  = catTot(naviera);
    const tTerm = catTot(terminal);
    const tAdu  = catTot(aduana);
    const tTra  = catTot(transporte);
    const tDes  = catTot(despachante);
    const tAdm  = catTot(admin);
    const tFlt  = catTot(fleteIntl);

    const enBlancoPesos = tNav.pesos + tTerm.pesos + tAdu.pesos + tTra.pesos + tDes.pesos + tAdm.pesos;
    const cashPesos     = tFlt.pesos;
    const prorBase      = enBlancoPesos - tAdu.pesos + cashPesos;

    const totalM3 = proveedores.reduce((s, p) => s + n(p.m3), 0);

    const perProv = proveedores
      .filter(p => p.nombre !== '')
      .map((p, i) => {
        const clienteNombre = p.clienteId ? (clientes.find(c => c.id === p.clienteId)?.nombre || '') : '';
        const ratio        = totalM3 > 0 ? n(p.m3) / totalM3 : 0;
        const prorPesos    = Math.round(ratio * prorBase);
        const tributoPesos = Math.round(n(p.tributosUSD) * n(p.tributosTC));
        const costoFinal   = prorPesos + tributoPesos;
        const cb             = cobrar[i] || { tc: 0, honorarios: false, despAdic: 0 };
        const tcUsed         = n(cb.tc) > 0 ? n(cb.tc) : n(p.tributosTC);
        const gastosUSD      = tcUsed > 0 ? Math.round((costoFinal / tcUsed) * 100) / 100 : 0;
        const origenUSD      = n(p.gastosOrigenUSD);
        const honorarios     = cb.honorarios ? Math.round((gastosUSD + origenUSD) * 0.04 * 100) / 100 : 0;
        const totalUSD       = Math.round((gastosUSD + origenUSD + honorarios + n(cb.despAdic)) * 100) / 100;
        // Flete marítimo (cash) — desembolso propio de Brandon, diferenciado
        const fleteIntlPesos = Math.round(ratio * cashPesos);
        const fleteIntlUSD   = tcUsed > 0 ? Math.round((fleteIntlPesos / tcUsed) * 100) / 100 : 0;
        return { nombre: p.nombre, tipo: p.tipo || 'Cliente', clienteNombre, m3: n(p.m3), fobUSD: n(p.fobUSD), origenUSD, ratio, prorPesos, tributoPesos, costoFinal, gastosUSD, honorarios, totalUSD, tcUsed, cb, fleteIntlPesos, fleteIntlUSD };
      });

    return {
      tNav, tTerm, tAdu, tTra, tDes, tAdm, tFlt,
      enBlancoPesos, cashPesos,
      totalGeneral: enBlancoPesos + cashPesos,
      prorBase, totalM3, perProv,
      totalCostoFinal:    perProv.reduce((s, p) => s + p.costoFinal, 0),
      totalACobrar:       perProv.reduce((s, p) => s + p.totalUSD, 0),
      totalFleteIntlUSD:  perProv.reduce((s, p) => s + p.fleteIntlUSD, 0),
    };
  }, [naviera, terminal, aduana, transporte, despachante, admin, fleteIntl, proveedores, cobrar, clientes]);

  const GASTOS = [
    { id: 'naviera',    label: 'Naviera',                    color: '#ea580c', rows: naviera,    setter: setNaviera    },
    { id: 'terminal',   label: 'Terminal',                   color: '#7c3aed', rows: terminal,   setter: setTerminal   },
    { id: 'aduana',     label: 'VEP Aduana',                 color: '#dc2626', rows: aduana,     setter: setAduana     },
    { id: 'transporte', label: 'Transporte',                 color: '#d97706', rows: transporte, setter: setTransporte },
    { id: 'despachante',label: 'Despachante',                color: '#059669', rows: despachante,setter: setDespachante},
    { id: 'admin',      label: 'Gastos Admin',               color: '#64748b', rows: admin,      setter: setAdmin      },
    { id: 'fleteIntl',  label: 'Flete Internacional (Cash)', color: '#374151', rows: fleteIntl,  setter: setFleteIntl  },
  ];
  const catTotMap = { naviera: calc.tNav, terminal: calc.tTerm, aduana: calc.tAdu, transporte: calc.tTra, despachante: calc.tDes, admin: calc.tAdm, fleteIntl: calc.tFlt };
  const activeCat = GASTOS.find(g => g.id === gastoTab);
  const provActivos = proveedores.filter(p => p.nombre !== '');

  const tipoStyle = (tipo) => tipo === 'Propio'
    ? { background: '#f0fdf4', color: '#059669', border: '1.5px solid #bbf7d0' }
    : { background: '#fff4ee', color: '#ea580c', border: '1.5px solid #bfdbfe' };

  // checklist progress
  const totalTasks = CHECKLIST.length;
  const doneTasks  = CHECKLIST.filter(t => checked.has(t.id)).length;
  const progress   = Math.round((doneTasks / totalTasks) * 100);

  return (
    <div style={{ paddingBottom: '3rem' }}>

      {/* HEADER — row 1: navigation + title + save */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={handleBack} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', borderRadius: '50px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
            ← Operaciones
          </button>
          <div style={{ height: '20px', width: '1px', background: '#e2e8f0' }} />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e293b' }}>{op.nombre}</h2>
          {isDirty && !saveFlash && (
            <span style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
              Sin guardar
            </span>
          )}
          {saveFlash && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669' }}>✓ Guardado</span>}
        </div>
        <button onClick={saveAll} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1.2rem', borderRadius: '50px', border: 'none', background: isDirty ? '#059669' : '#e2e8f0', color: isDirty ? '#fff' : '#94a3b8', fontWeight: 700, fontSize: '0.82rem', cursor: isDirty ? 'pointer' : 'default', transition: 'all 0.2s' }}>
          {saveFlash ? '✓ Guardado' : '↑ Guardar'}
        </button>
      </div>

      {/* HEADER — row 2: stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.85rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Gastos', value: fmtP(calc.totalGeneral), color: '#1e293b', bg: '#f8fafc', border: '#e2e8f0' },
          { label: 'A Cobrar', value: fmtU(calc.totalACobrar), color: '#ea580c', bg: '#fff4ee', border: '#fed7aa' },
          { label: 'M³ Ocupados', value: `${calc.totalM3.toFixed(1)} / ${CONTAINER_M3[op.contenedor] || '?'} m³`, color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
          { label: `Tareas ${doneTasks}/${totalTasks}`, value: `${progress}% completado`, color: progress === 100 ? '#059669' : '#ea580c', bg: progress === 100 ? '#f0fdf4' : '#fff7ed', border: progress === 100 ? '#bbf7d0' : '#fed7aa', progress: true },
        ].map(({ label, value, color, bg, border, progress: showBar }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: '12px', padding: '0.85rem 1rem' }}>
            <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.35rem' }}>{label}</p>
            <p style={{ fontSize: '1rem', fontWeight: 800, color, lineHeight: 1.2 }}>{value}</p>
            {showBar && (
              <div style={{ marginTop: '0.45rem', width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: color, borderRadius: '99px', transition: 'width 0.3s' }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* MAIN TABS */}
      <div style={{ display: 'flex', background: '#fff', borderRadius: '12px', padding: '4px', border: '1px solid #e2e8f0', gap: '3px', marginBottom: '1.25rem', width: 'fit-content' }}>
        {[['proveedores','📦','Proveedores & Carga'],['gastos','💰','Gastos'],['acobrar','📬','A Cobrar']].map(([id, icon, lbl]) => (
          <button key={id} onClick={() => setMainTab(id)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.35rem', borderRadius: '9px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, background: mainTab === id ? '#ea580c' : 'transparent', color: mainTab === id ? '#fff' : '#64748b', transition: 'all 0.15s' }}>
            <span style={{ fontSize: '0.95rem' }}>{icon}</span> {lbl}
          </button>
        ))}
      </div>

      {/* ══ TAB: PROVEEDORES ════════════════════════════════════════════════ */}
      {mainTab === 'proveedores' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.25rem', alignItems: 'start' }}>

          {/* LEFT: provider table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            <div style={CARD}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                  <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>Proveedores y carga</p>
                  <span style={{ fontSize: '0.65rem', background: '#fff7ed', color: '#d97706', padding: '0.15rem 0.6rem', borderRadius: '50px', fontWeight: 700, border: '1px solid #fde68a' }}>Paso 1</span>
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8' }}>{provActivos.length} activos · {calc.totalM3.toFixed(1)} m³</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#fff7ed' }}>
                      <th style={{ ...TH, color: '#92400e', background: 'none', width: '25%' }}>Proveedor</th>
                      <th style={{ ...TH, color: '#92400e', background: 'none', width: '12%' }}>Tipo</th>
                      <th style={{ ...TH, color: '#92400e', background: 'none', width: '12%' }}>m³ (CBM)</th>
                      <th style={{ ...TH, color: '#92400e', background: 'none', width: '15%' }}>FOB USD</th>
                      <th style={{ ...TH, color: '#92400e', background: 'none', width: '15%' }}>Gs. Origen USD</th>
                      <th style={{ ...TH, color: '#92400e', background: 'none', width: '11%' }}>% Ocup.</th>
                      <th style={{ width: '5%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {proveedores.map((p, i) => {
                      const ratioVal = calc.totalM3 > 0 ? n(p.m3) / calc.totalM3 : 0;
                      return (
                        <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                          <td style={TD}><input value={p.nombre} onChange={e => updP(i,'nombre',e.target.value)} style={{ ...INP, fontWeight: 600, color: '#ea580c' }} placeholder="Nombre" /></td>
                          <td style={{ ...TD, minWidth: '180px' }}>
                            {p.nombre ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                {/* Propio / Cliente toggle */}
                                <div style={{ display: 'flex', gap: '0.3rem' }}>
                                  {['Cliente','Propio'].map(t => (
                                    <button key={t} onClick={() => updP(i,'tipo',t)}
                                      style={{ padding: '0.15rem 0.55rem', borderRadius: '50px', border: 'none', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700,
                                        background: (p.tipo||'Cliente') === t ? (t==='Propio' ? '#f0fdf4' : '#fff4ee') : '#f1f5f9',
                                        color:      (p.tipo||'Cliente') === t ? (t==='Propio' ? '#059669' : '#ea580c') : '#94a3b8',
                                      }}>
                                      {t === 'Propio' ? '📦' : '🤝'} {t}
                                    </button>
                                  ))}
                                </div>
                                {/* Client selector — only when tipo is Cliente */}
                                {(p.tipo || 'Cliente') === 'Cliente' && (
                                  <select value={p.clienteId || ''} onChange={e => updP(i,'clienteId',e.target.value)}
                                    style={{ fontSize: '0.75rem', padding: '0.22rem 0.45rem', border: '1px solid #bfdbfe', borderRadius: '6px', background: '#fff4ee', color: '#1e40af', fontWeight: 600, outline: 'none', cursor: 'pointer', maxWidth: '170px' }}>
                                    <option value="">— Seleccionar cliente —</option>
                                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                  </select>
                                )}
                              </div>
                            ) : <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>—</span>}
                          </td>
                          <td style={TD}><input type="number" step="any" value={p.m3} onChange={e => updP(i,'m3',e.target.value)} style={{ ...INP, color: '#ea580c', fontWeight: 600, textAlign: 'right' }} placeholder="0" /></td>
                          <td style={TD}><input type="number" step="any" value={p.fobUSD} onChange={e => updP(i,'fobUSD',e.target.value)} style={{ ...INP, color: '#ea580c', fontWeight: 600, textAlign: 'right' }} placeholder="0" /></td>
                          <td style={TD}><input type="number" step="any" value={p.gastosOrigenUSD} onChange={e => updP(i,'gastosOrigenUSD',e.target.value)} style={{ ...INP, color: n(p.gastosOrigenUSD) > 0 ? '#d97706' : '#94a3b8', fontWeight: n(p.gastosOrigenUSD) > 0 ? 700 : 400, textAlign: 'right' }} placeholder="0" /></td>
                          <td style={TD}>
                            {p.nombre ? (
                              <div style={{ background: '#fff7ed', borderRadius: '6px', padding: '0.28rem 0.5rem', textAlign: 'right' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#d97706' }}>{pct(ratioVal)}</span>
                              </div>
                            ) : <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>—</span>}
                          </td>
                          <td style={TD}>
                            {p.nombre && <button onClick={() => { setProveedores(pr => pr.filter((_, j) => j !== i)); setCobrar(c => c.filter((_, j) => j !== i)); D(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1' }}>×</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f1f5f9' }}>
                      <td colSpan={2} style={{ ...TD, fontWeight: 700 }}>TOTAL</td>
                      <td style={{ ...TD, fontWeight: 700, textAlign: 'right' }}>{calc.totalM3.toFixed(2)} m³</td>
                      <td style={{ ...TD, fontWeight: 700, textAlign: 'right' }}>{fmtU(proveedores.reduce((s, p) => s + n(p.fobUSD), 0))}</td>
                      <td style={{ ...TD, fontWeight: 700, textAlign: 'right', color: '#d97706' }}>{fmtU(proveedores.reduce((s, p) => s + n(p.gastosOrigenUSD), 0))}</td>
                      <td style={{ ...TD, fontWeight: 700 }}>100%</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <button onClick={() => { setProveedores(p => [...p, newProv()]); setCobrar(c => [...c, { tc: '', honorarios: true, despAdic: '', cobrado: false, fechaCobro: '' }]); D(); }}
                style={{ marginTop: '0.6rem', background: 'none', border: '1px dashed #d97706', borderRadius: '7px', padding: '0.3rem 0.8rem', fontSize: '0.75rem', fontWeight: 700, color: '#d97706', cursor: 'pointer' }}>
                + Agregar proveedor
              </button>
            </div>

            {/* resumen ocupación contenedor */}
            <div style={{ ...CARD, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <div>
                  <p style={LBL}>m³ cargados</p>
                  <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>{calc.totalM3.toFixed(2)} m³</p>
                </div>
                <div>
                  <p style={LBL}>FOB total</p>
                  <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ea580c' }}>{fmtU(proveedores.reduce((s,p)=>s+n(p.fobUSD),0))}</p>
                </div>
                <div>
                  <p style={LBL}>Puerto de Origen</p>
                  <input value={puertoOrigen} onChange={e => { setPuertoOrigen(e.target.value); D(); }} style={{ ...INP, width: '160px', fontSize: '0.85rem', fontWeight: 600 }} placeholder="Ej: Shanghai" />
                </div>
              </div>
              <button onClick={() => setMainTab('gastos')} style={{ padding: '0.55rem 1.1rem', borderRadius: '50px', border: '1px solid #e2e8f0', background: '#fff', color: '#ea580c', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                Cargar gastos →
              </button>
            </div>
          </div>

          {/* RIGHT: checklist sticky */}
          <div style={{ position: 'sticky', top: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

            {/* progress header */}
            <div style={{ ...CARD, padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>Avance de la operación</p>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: progress === 100 ? '#059669' : '#ea580c' }}>{progress}%</span>
              </div>
              <div style={{ width: '100%', height: '7px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: progress === 100 ? '#059669' : '#ea580c', borderRadius: '99px', transition: 'width 0.3s' }} />
              </div>
              <p style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.4rem' }}>{doneTasks} de {totalTasks} tareas completadas</p>
            </div>

            {/* checklist by phase */}
            {FASES.map(fase => {
              const items = CHECKLIST.filter(t => t.fase === fase.id);
              const doneInFase = items.filter(t => checked.has(t.id)).length;
              return (
                <div key={fase.id} style={{ ...CARD, padding: '0.9rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: fase.color }} />
                      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e293b' }}>Fase {fase.id} — {fase.label}</p>
                    </div>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, background: fase.bg, color: fase.color, padding: '0.1rem 0.5rem', borderRadius: '50px', border: `1px solid ${fase.badge}` }}>
                      {doneInFase}/{items.length}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {items.map(task => {
                      const done = checked.has(task.id);
                      return (
                        <div key={task.id} onClick={() => toggleCheck(task.id)}
                          style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem', cursor: 'pointer', padding: '0.3rem 0.4rem', borderRadius: '7px', transition: 'background 0.1s', background: done ? fase.bg : 'transparent' }}
                          onMouseEnter={e => !done && (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => !done && (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: done ? `2px solid ${fase.color}` : '2px solid #cbd5e1', background: done ? fase.color : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px', transition: 'all 0.15s' }}>
                            {done && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                          <span style={{ fontSize: '0.75rem', color: done ? '#64748b' : '#374151', textDecoration: done ? 'line-through' : 'none', lineHeight: '1.4', fontWeight: done ? 400 : 500 }}>
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
        </div>
      )}

      {/* ══ TAB: GASTOS ══════════════════════════════════════════════════════ */}
      {mainTab === 'gastos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: '1.25rem', alignItems: 'start' }}>

            {/* LEFT: vertical category sidebar */}
            <div style={{ position: 'sticky', top: '1rem' }}>
              <div style={{ ...CARD, padding: '0.5rem' }}>
                <p style={{ ...LBL, padding: '0.4rem 0.75rem 0.6rem' }}>Categorías de gasto</p>
                {GASTOS.map(g => {
                  const tot = catTotMap[g.id];
                  const active = gastoTab === g.id;
                  return (
                    <button key={g.id} onClick={() => setGastoTab(g.id)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0.6rem 0.75rem', borderRadius: '9px', border: 'none', cursor: 'pointer', background: active ? g.color + '14' : 'transparent', marginBottom: '2px', transition: 'background 0.1s', borderLeft: active ? `3px solid ${g.color}` : '3px solid transparent' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: tot.pesos > 0 ? g.color : '#e2e8f0', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.8rem', fontWeight: active ? 700 : 500, color: active ? g.color : '#475569', textAlign: 'left' }}>{g.label}</span>
                      </div>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: active ? g.color : (tot.pesos > 0 ? '#1e293b' : '#cbd5e1'), flexShrink: 0, marginLeft: '0.5rem' }}>
                        {tot.pesos > 0 ? fmtP(tot.pesos) : '—'}
                      </span>
                    </button>
                  );
                })}
                {/* total footer */}
                <div style={{ marginTop: '0.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#1e293b', borderRadius: '9px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8' }}>Total General</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fff' }}>{fmtP(calc.totalGeneral)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.75rem', marginTop: '4px' }}>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Banco</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>{fmtP(calc.enBlancoPesos)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.75rem' }}>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Cash (flete)</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: calc.cashPesos > 0 ? '#0891b2' : '#cbd5e1' }}>{fmtP(calc.cashPesos)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT: invoice table + prorrateo note */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {activeCat && (
                <div style={CARD}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: activeCat.color, flexShrink: 0 }} />
                    <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>{activeCat.label}</p>
                    {activeCat.id === 'aduana' && (
                      <span style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#dc2626', padding: '0.15rem 0.5rem', borderRadius: '50px', fontWeight: 700 }}>No se proratea — se asigna por proveedor</span>
                    )}
                    {activeCat.id === 'fleteIntl' && (
                      <span style={{ fontSize: '0.65rem', background: '#f0f9ff', color: '#0284c7', padding: '0.15rem 0.5rem', borderRadius: '50px', fontWeight: 700, border: '1px solid #bae6fd' }}>CASH — se proratea por m³</span>
                    )}
                  </div>
                  <InvoiceTable rows={activeCat.rows} accentColor={activeCat.color} onUpdate={upd(activeCat.setter)} onAdd={add(activeCat.setter)} onRemove={rem(activeCat.setter)} />
                </div>
              )}

              <div style={{ ...CARD, background: '#fffbeb', border: '1px solid #fde68a', padding: '0.85rem 1rem' }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#92400e', marginBottom: '0.4rem' }}>Base de prorrateo por m³</p>
                <p style={{ fontSize: '0.78rem', color: '#78350f' }}>
                  Total en Blanco <strong>{fmtP(calc.enBlancoPesos)}</strong>
                  &nbsp;− VEP Aduana <strong>{fmtP(calc.tAdu.pesos)}</strong>
                  &nbsp;+ Cash <strong>{fmtP(calc.cashPesos)}</strong>
                  &nbsp;= <strong>{fmtP(calc.prorBase)}</strong>
                </p>
              </div>
            </div>
          </div>

          {/* VEP + Costo final — aparecen después de cargar los gastos */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

            <div style={CARD}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#dc2626' }} />
                <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>VEP Aduana por proveedor</p>
                <span style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#dc2626', padding: '0.15rem 0.5rem', borderRadius: '50px', fontWeight: 700 }}>Asignación manual</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fff5f5' }}>
                    {['Proveedor', 'USD Tributos', 'T.C.', 'PESOS'].map(h => <th key={h} style={{ ...TH, color: '#dc2626' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {proveedores.filter(p => p.nombre !== '').map((p, i) => (
                    <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ ...TD, fontWeight: 600, color: '#374151' }}>{p.nombre}</td>
                      <td style={TD}><input type="number" step="any" value={p.tributosUSD} onChange={e => updP(proveedores.indexOf(p),'tributosUSD',e.target.value)} style={{ ...INP, color: '#ea580c', fontWeight: 600, textAlign: 'right' }} placeholder="0" /></td>
                      <td style={TD}><input type="number" step="any" value={p.tributosTC} onChange={e => updP(proveedores.indexOf(p),'tributosTC',e.target.value)} style={{ ...INP, color: '#ea580c', fontWeight: 600, textAlign: 'right' }} placeholder="—" /></td>
                      <td style={{ ...TD, fontWeight: 700, color: '#dc2626', textAlign: 'right' }}>
                        {n(p.tributosUSD) > 0 && n(p.tributosTC) > 0 ? fmtP(n(p.tributosUSD) * n(p.tributosTC)) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#fee2e2' }}>
                    <td style={{ ...TD, fontWeight: 700 }}>TOTAL</td>
                    <td style={{ ...TD, fontWeight: 700, textAlign: 'right' }}>{fmtU(proveedores.filter(p=>p.nombre!=='').reduce((s,p)=>s+n(p.tributosUSD),0))}</td>
                    <td />
                    <td style={{ ...TD, fontWeight: 700, textAlign: 'right', color: '#dc2626' }}>{fmtP(calc.perProv.reduce((s,p)=>s+p.tributoPesos,0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div style={CARD}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#059669' }} />
                <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>Costo final asignado por proveedor</p>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f0fdf4' }}>
                    {['Proveedor', 'Sin VEP (prorr.)', 'VEP', 'TOTAL PESOS'].map(h => <th key={h} style={{ ...TH, color: '#059669' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {calc.perProv.map((p, i) => (
                    <tr key={p.nombre} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ ...TD, fontWeight: 600 }}>{p.nombre}</td>
                      <td style={{ ...TD, textAlign: 'right', color: '#64748b' }}>{fmtP(p.prorPesos)}</td>
                      <td style={{ ...TD, textAlign: 'right', color: '#dc2626' }}>{fmtP(p.tributoPesos)}</td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#059669' }}>{fmtP(p.costoFinal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#dcfce7' }}>
                    <td style={{ ...TD, fontWeight: 700 }}>TOTAL</td>
                    <td style={{ ...TD, fontWeight: 700, textAlign: 'right' }}>{fmtP(calc.perProv.reduce((s,p)=>s+p.prorPesos,0))}</td>
                    <td style={{ ...TD, fontWeight: 700, textAlign: 'right', color: '#dc2626' }}>{fmtP(calc.perProv.reduce((s,p)=>s+p.tributoPesos,0))}</td>
                    <td style={{ ...TD, fontWeight: 800, textAlign: 'right', color: '#059669' }}>{fmtP(calc.totalCostoFinal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB: A COBRAR ════════════════════════════════════════════════════ */}
      {mainTab === 'acobrar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* ── Barra resumen superior ── */}
          {(() => {
            const cobrados     = cobrar.filter(c => c?.cobrado).length;
            const pendientes   = calc.perProv.length - cobrados;
            const totalCobrado = calc.perProv.reduce((s,p,i) => s + (cobrar[i]?.cobrado ? p.totalUSD : 0), 0);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* fila 1: stats principales */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                  {[
                    ['Total a Cobrar', fmtU(calc.totalACobrar), '#7c3aed', '#f5f3ff'],
                    ['Ya Cobrado', fmtU(totalCobrado), '#059669', '#f0fdf4'],
                    [`Cobrados (${cobrados}/${calc.perProv.length})`, pendientes === 0 ? 'Todos ✓' : `${pendientes} pendiente${pendientes !== 1 ? 's' : ''}`, pendientes === 0 ? '#059669' : '#ea580c', pendientes === 0 ? '#f0fdf4' : '#fff4ee'],
                    ['Honorarios', fmtU(calc.perProv.reduce((s,p)=>s+p.honorarios,0)), '#7c3aed', '#f5f3ff'],
                  ].map(([lbl, val, color, bg]) => (
                    <div key={lbl} style={{ ...CARD, background: bg, border: `1px solid ${color}20`, padding: '1rem' }}>
                      <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.35rem' }}>{lbl}</p>
                      <p style={{ fontSize: '1.15rem', fontWeight: 800, color, lineHeight: 1 }}>{val}</p>
                    </div>
                  ))}
                </div>
                {/* fila 2: flete marítimo destacado */}
                {calc.cashPesos > 0 && (
                  <div style={{ background: '#0f172a', borderRadius: '14px', padding: '0.85rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>🚢</div>
                      <div>
                        <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Flete Marítimo — tu desembolso propio (cash)</p>
                        <p style={{ fontSize: '0.72rem', color: '#475569', marginTop: '1px' }}>Pagado por vos · a recuperar de cada cliente según su % de carga</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'center' }}>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '0.62rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Total en pesos</p>
                        <p style={{ fontSize: '1rem', fontWeight: 700, color: '#94a3b8' }}>{fmtP(calc.cashPesos)}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '0.62rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Total a recuperar (USD)</p>
                        <p style={{ fontSize: '1.4rem', fontWeight: 900, color: '#38bdf8' }}>{fmtU(calc.totalFleteIntlUSD)}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Aviso si falta TC ── */}
          {calc.perProv.some(p => p.tcUsed === 0) && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span>⚠️</span>
              <p style={{ fontSize: '0.8rem', color: '#92400e', fontWeight: 600 }}>
                Algunos proveedores no tienen T.C. — cargalo en VEP/Tributos o directamente en cada tarjeta.
              </p>
            </div>
          )}

          {/* ── Tarjetas por proveedor ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            {calc.perProv.map((p, i) => {
              const isCobrado = cobrar[i]?.cobrado ?? false;
              const accentColor = p.tipo === 'Propio' ? '#059669' : '#7c3aed';
              const accentBg    = p.tipo === 'Propio' ? '#f0fdf4' : '#f5f3ff';
              const tcOk        = p.tcUsed > 0;
              return (
                <div key={p.nombre} style={{ ...CARD, borderLeft: `4px solid ${isCobrado ? '#059669' : accentColor}`, padding: '1.25rem', opacity: isCobrado ? 0.85 : 1, position: 'relative' }}>

                  {/* Cobrado badge overlay */}
                  {isCobrado && (
                    <div style={{ position: 'absolute', top: '1rem', right: '1rem', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: '50px', padding: '0.2rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#059669' }}>✓ COBRADO</span>
                    </div>
                  )}

                  {/* ── Header ── */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingRight: isCobrado ? '6rem' : 0 }}>
                    <div>
                      <p style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1e293b' }}>{p.nombre}</p>
                      <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '1px' }}>{p.m3} m³ · {pct(p.ratio)} del contenedor</p>
                    </div>
                    <span style={{ background: accentBg, color: accentColor, border: `1px solid ${accentColor}30`, fontSize: '0.68rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '50px' }}>
                      {p.tipo === 'Propio' ? '📦 Propio' : `🤝 ${p.clienteNombre || 'Cliente'}`}
                    </span>
                  </div>

                  {/* ── Costo asignado en pesos ── */}
                  <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '0.65rem 0.85rem', marginBottom: '0.85rem' }}>
                    <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.2rem' }}>Costo asignado (pesos)</p>
                    <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{fmtP(p.costoFinal)}</p>
                    <p style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '1px' }}>{fmtP(p.prorPesos)} prorrateo + {fmtP(p.tributoPesos)} VEP</p>
                  </div>

                  {/* ── T.C. → Gastos USD ── */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem', background: tcOk ? '#fff4ee' : '#fff5f5', borderRadius: '10px', padding: '0.65rem 0.85rem', border: `1px solid ${tcOk ? '#fed7aa' : '#fecaca'}` }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '0.6rem', fontWeight: 700, color: tcOk ? '#d97706' : '#dc2626', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.2rem' }}>
                        T.C. conversión {!tcOk && '⚠ falta'}
                      </p>
                      <input type="number" step="any" value={cobrar[i]?.tc ?? ''} onChange={e => updC(i,'tc',e.target.value)}
                        placeholder={p.tcUsed > 0 ? `${p.tcUsed} (auto)` : 'Ingresá T.C.'}
                        style={{ ...INP, background: 'transparent', border: 'none', padding: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', width: '130px' }} />
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '0.6rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.2rem' }}>Gastos en USD</p>
                      <p style={{ fontSize: '1.1rem', fontWeight: 800, color: tcOk ? '#ea580c' : '#cbd5e1' }}>{fmtU(p.gastosUSD)}</p>
                    </div>
                  </div>

                  {/* ── Flete marítimo (desembolso propio) ── */}
                  {p.fleteIntlUSD > 0 && (
                    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '0.6rem 0.85rem', marginBottom: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.85rem' }}>🚢</span>
                        <div>
                          <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Flete marítimo (tu parte)</p>
                          <p style={{ fontSize: '0.65rem', color: '#7dd3fc' }}>{fmtP(p.fleteIntlPesos)} ÷ TC {p.tcUsed > 0 ? p.tcUsed : '—'}</p>
                        </div>
                      </div>
                      <p style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0284c7', lineHeight: 1 }}>{fmtU(p.fleteIntlUSD)}</p>
                    </div>
                  )}

                  {/* ── Conceptos adicionales ── */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '0.85rem', padding: '0 0.15rem' }}>

                    {/* Gs. Origen */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                      <span style={{ color: '#64748b' }}>+ Gastos de Origen</span>
                      <span style={{ fontWeight: 600, color: p.origenUSD > 0 ? '#d97706' : '#cbd5e1' }}>{p.origenUSD > 0 ? fmtU(p.origenUSD) : '—'}</span>
                    </div>

                    {/* Honorarios 4% */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', background: cobrar[i]?.honorarios ? '#faf5ff' : 'transparent', borderRadius: '8px', padding: cobrar[i]?.honorarios ? '0.4rem 0.6rem' : '0', margin: cobrar[i]?.honorarios ? '0 -0.15rem' : '0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: '#64748b' }}>+ Honorarios (4%)</span>
                        <button onClick={() => updC(i,'honorarios',!cobrar[i]?.honorarios)}
                          style={{ padding: '0.12rem 0.55rem', borderRadius: '50px', border: 'none', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700,
                            background: cobrar[i]?.honorarios ? '#ede9fe' : '#f1f5f9',
                            color: cobrar[i]?.honorarios ? '#7c3aed' : '#94a3b8' }}>
                          {cobrar[i]?.honorarios ? 'SÍ' : 'NO'}
                        </button>
                      </div>
                      <span style={{ fontWeight: 700, color: cobrar[i]?.honorarios ? '#7c3aed' : '#cbd5e1' }}>
                        {cobrar[i]?.honorarios ? fmtU(p.honorarios) : '—'}
                      </span>
                    </div>

                    {/* Desp. Adicional */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                      <span style={{ color: '#64748b' }}>+ Desp. adicional (USD)</span>
                      <input type="number" step="any" value={cobrar[i]?.despAdic ?? ''} onChange={e => updC(i,'despAdic',e.target.value)} placeholder="0"
                        style={{ ...INP, width: '90px', textAlign: 'right', fontWeight: 600, color: n(cobrar[i]?.despAdic) > 0 ? '#059669' : '#94a3b8', padding: '0.25rem 0.5rem', fontSize: '0.82rem' }} />
                    </div>
                  </div>

                  {/* ── Total a Cobrar ── */}
                  <div style={{ background: accentColor + '12', borderRadius: '10px', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <p style={{ fontSize: '0.78rem', fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total a Cobrar</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 900, color: accentColor, lineHeight: 1 }}>{fmtU(p.totalUSD)}</p>
                  </div>

                  {/* ── Estado de cobro ── */}
                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <div>
                      <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.2rem' }}>Estado de cobro</p>
                      {isCobrado && cobrar[i]?.fechaCobro && (
                        <p style={{ fontSize: '0.7rem', color: '#059669' }}>Cobrado el {cobrar[i].fechaCobro}</p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        const ahora = new Date().toLocaleDateString('es-AR');
                        updC(i, 'cobrado', !isCobrado);
                        updC(i, 'fechaCobro', !isCobrado ? ahora : '');
                      }}
                      style={{
                        padding: '0.4rem 1rem', borderRadius: '50px', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, transition: 'all 0.15s',
                        background: isCobrado ? '#dcfce7' : '#ea580c',
                        color:      isCobrado ? '#059669' : '#fff',
                      }}>
                      {isCobrado ? '✓ Cobrado — desmarcar' : 'Marcar como cobrado'}
                    </button>
                  </div>

                </div>
              );
            })}
          </div>

          {/* ── Fila resumen final ── */}
          <div style={{ ...CARD, background: '#1e293b', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8' }}>TOTAL GENERAL A COBRAR — {calc.perProv.length} PROVEEDORES</p>
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
              {calc.totalFleteIntlUSD > 0 && (
                <div style={{ textAlign: 'right', borderRight: '1px solid #334155', paddingRight: '2rem' }}>
                  <p style={{ fontSize: '0.65rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>🚢 Flete marítimo</p>
                  <p style={{ fontSize: '1rem', fontWeight: 700, color: '#38bdf8' }}>{fmtU(calc.totalFleteIntlUSD)}</p>
                </div>
              )}
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Honorarios + Desp.</p>
                <p style={{ fontSize: '1rem', fontWeight: 700, color: '#c4b5fd' }}>{fmtU(calc.perProv.reduce((s,p,i)=>s+p.honorarios+n(cobrar[i]?.despAdic),0))}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Total USD</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff' }}>{fmtU(calc.totalACobrar)}</p>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ── Discard modal ── */}
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

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function Operations() {
  const [selected, setSelected] = useState(null);
  if (selected) return <OperationDetail op={selected} onBack={() => setSelected(null)} />;
  return <OperationsList onSelect={setSelected} />;
}
