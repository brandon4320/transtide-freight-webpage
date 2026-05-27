'use client';
import { useState, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

// ─── helpers ──────────────────────────────────────────────────────────────────
const usd = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return '$ ' + (Math.round(n * 100) / 100).toLocaleString('es-AR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
};
const n = (v) => parseFloat(v) || 0;

// ─── container presets ────────────────────────────────────────────────────────
const PRESETS = {
  '20': { label: '20 Pies', m3: 30, flete: 3500, despachante: 2000, terminal: 2300, naviera: 800, logistica: 2150 },
  '40hq': { label: '40 Pies / HQ', m3: 60, flete: 4500, despachante: 2000, terminal: 2300, naviera: 800, logistica: 2150 },
  'fr': { label: 'Flat Rack', m3: null, flete: 6000, despachante: 2200, terminal: 2500, naviera: 900, logistica: 2150 },
};

// ─── small UI primitives ──────────────────────────────────────────────────────
const LBL = { display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.28rem', textTransform: 'uppercase', letterSpacing: '0.05em' };
const INP = { width: '100%', padding: '0.5rem 0.7rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', color: '#1e293b', background: '#fff', outline: 'none' };
const SECL = { fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#cbd5e1', margin: '1rem 0 0.5rem', paddingBottom: '0.35rem', borderBottom: '1px solid #f1f5f9' };

function F({ label, children, half }) {
  return (
    <div style={{ marginBottom: '0.75rem', ...(half ? {} : {}) }}>
      {label && <label style={LBL}>{label}</label>}
      {children}
    </div>
  );
}
function NI({ value, onChange, placeholder = '0' }) {
  return <input type="number" inputMode="decimal" step="any" min="0" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} style={INP} />;
}
function TI({ value, onChange, placeholder = '' }) {
  return <input type="text" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} style={INP} />;
}
function PagaToggle({ label, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid #f8fafc' }}>
      <span style={{ fontSize: '0.83rem', color: '#475569' }}>{label}</span>
      <button onClick={() => onChange(!checked)} style={{ padding: '0.18rem 0.75rem', borderRadius: '50px', border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, minWidth: '42px', background: checked ? '#d1fae5' : '#fee2e2', color: checked ? '#059669' : '#dc2626' }}>
        {checked ? 'SÍ' : 'NO'}
      </button>
    </div>
  );
}
function Pill({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding: '0.45rem 1rem', borderRadius: '50px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, transition: 'all 0.15s', background: active ? '#2563eb' : 'transparent', color: active ? '#fff' : '#94a3b8' }}>
      {children}
    </button>
  );
}
function Tab({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ flex: 1, padding: '0.42rem 0.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, transition: 'all 0.15s', background: active ? '#f0f7ff' : 'transparent', color: active ? '#2563eb' : '#94a3b8' }}>
      {children}
    </button>
  );
}
function Card({ children, style = {} }) {
  return <div style={{ background: '#fff', borderRadius: '16px', padding: '1.2rem', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.03)', ...style }}>{children}</div>;
}
function RRow({ label, val, val2, diff, dimmed, bold }) {
  const s = { fontSize: bold ? '0.88rem' : '0.82rem', fontWeight: bold ? 700 : 400 };
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.38rem 0', borderBottom: '1px solid #f8fafc' }}>
      <span style={{ ...s, color: dimmed ? '#cbd5e1' : '#475569' }}>{label}</span>
      <div style={{ display: 'flex', gap: '1rem' }}>
        {val2 !== undefined && <span style={{ ...s, color: '#64748b' }}>{usd(val2)}</span>}
        <span style={{ ...s, color: bold ? '#1e293b' : dimmed ? '#cbd5e1' : '#1e293b' }}>{usd(val)}</span>
        {diff !== undefined && (
          <span style={{ fontSize: '0.75rem', fontWeight: 700, minWidth: '70px', textAlign: 'right', color: diff > 0 ? '#10b981' : diff < 0 ? '#ef4444' : '#94a3b8' }}>
            {diff > 0 ? '+' : ''}{usd(diff)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── aéreo presets ────────────────────────────────────────────────────────────
const AEREO_PRESETS = {
  'standard': { label: 'Standard',  tarifaKg: 4.5,  awb: 50, handling: 80,  terminal: 120, despachante: 350, transporte: 100, transit: '5-7 días' },
  'express':  { label: 'Express',   tarifaKg: 7.0,  awb: 60, handling: 100, terminal: 120, despachante: 350, transporte: 100, transit: '2-3 días' },
  'charter':  { label: 'Charter',   tarifaKg: null, awb: 80, handling: 150, terminal: 150, despachante: 400, transporte: 120, transit: 'a coordinar' },
};

// ─── tab switcher icons ───────────────────────────────────────────────────────
const ShipIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
    <path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/>
    <path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/>
    <path d="M12 10v-5"/><path d="M12 5h3"/>
  </svg>
);
const PlaneIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
  </svg>
);

// ─── maritime component (existing logic) ──────────────────────────────────────
function CotizadorMaritimo() {

  // mode & tab
  const [mode, setMode] = useState('cliente');   // 'cliente' | 'personal'
  const [tab, setTab] = useState('cliente_fob'); // varies per mode

  // ── container config ──
  const [contType, setContType] = useState('40hq');
  const [contM3, setContM3] = useState({ '20': 30, '40hq': 60, 'fr': 60 });
  const [contCosts, setContCosts] = useState({
    '20':  { flete: 3500, despachante: 2000, terminal: 2300, naviera: 800, logistica: 2150 },
    '40hq':{ flete: 4500, despachante: 2000, terminal: 2300, naviera: 800, logistica: 2150 },
    'fr':  { flete: 6000, despachante: 2200, terminal: 2500, naviera: 900, logistica: 2150 },
  });

  const setCost = (type, field, val) =>
    setContCosts(prev => ({ ...prev, [type]: { ...prev[type], [field]: parseFloat(val) || 0 } }));
  const setM3 = (type, val) =>
    setContM3(prev => ({ ...prev, [type]: parseFloat(val) || 0 }));

  const curM3 = contM3[contType];
  const curCosts = contCosts[contType];

  // ── identification ──
  const [cliente, setCliente] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [clasificacion, setClasificacion] = useState('');

  // ── LADO CLIENTE ──
  const [fobCliente, setFobCliente] = useState('');       // lo que cobro por la mercadería
  const [fobDecCli, setFobDecCli] = useState('');         // lo que le digo que voy a declarar
  const [fleteCli, setFleteCli] = useState('');           // flete cobrado
  const [gDes, setGDes] = useState('');                   // gastos locales cobrados
  const [gTer, setGTer] = useState('');
  const [gNav, setGNav] = useState('');
  const [gLog, setGLog] = useState('');

  // ── LADO REAL ──
  const [fobReal, setFobReal] = useState('');             // lo que me costó a mí
  const [fobDecReal, setFobDecReal] = useState('');       // lo que realmente declaro
  const [fleteRealInput, setFleteRealInput] = useState(''); // si está vacío, se calcula del prorrateo
  const [m3Merch, setM3Merch] = useState('');             // m³ de mi mercadería en el contenedor

  // ── ARANCELES ──
  const [pDer, setPDer] = useState(35);
  const [pTas, setPTas] = useState(0);
  const [pIva, setPIva] = useState(21);    const [pagaIva, setPagaIva] = useState(true);
  const [pIvaA, setPIvaA] = useState(20);  const [pagaIvaA, setPagaIvaA] = useState(false);
  const [pGan, setPGan] = useState(6);     const [pagaGan, setPagaGan] = useState(false);
  const [pIIBB, setPIIBB] = useState(2.5); const [pagaIIBB, setPagaIIBB] = useState(false);

  // ── CIERRE ──
  const [pHon, setPHon] = useState(4);
  const [pFac, setPFac] = useState(8);
  const [pMrg, setPMrg] = useState(20); // solo modo personal

  // ── SOCIEDAD ──
  const [usaSociedadPropia, setUsaSociedadPropia] = useState(false); // true = cliente usa su propia sociedad

  // ── UI ──
  const [showClienteView, setShowClienteView] = useState(false);

  // ─── calculations ─────────────────────────────────────────────────────────
  const c = useMemo(() => {
    const der = pDer / 100, tas = pTas / 100, iva = pIva / 100,
          ivaA = pIvaA / 100, gan = pGan / 100, iibb = pIIBB / 100,
          hon = pHon / 100, fac = pFac / 100, mrg = pMrg / 100;

    const fobC  = n(fobCliente);
    const fobDC = n(fobDecCli) || fobC;       // FOB declarado al cliente (base aranceles cliente)
    const fobR  = n(fobReal);
    const fobDR = n(fobDecReal) || fobR;      // FOB declarado real (base aranceles reales)

    const m3val = n(m3Merch);
    const ratio = m3val > 0 && curM3 > 0 ? m3val / curM3 : 0;
    const fleteR = n(fleteRealInput) || (curCosts.flete * ratio);

    // ── LADO CLIENTE ──
    const segC   = fobDC * 0.01;
    const cifC   = fobDC + n(fleteCli) + segC;
    const derC   = cifC * der;
    const tasC   = cifC * tas;
    const bivC   = cifC + derC + tasC;
    const ivaC   = bivC * iva;
    const ivaAC  = bivC * ivaA;
    const ganC   = bivC * gan;
    const iibbC  = bivC * iibb;
    const arcC   = n(fleteCli) + segC + derC + tasC + ivaC + ivaAC + ganC + iibbC;
    const desC   = n(gDes), terC = n(gTer), navC = n(gNav), logC = n(gLog);
    const gasC   = desC + terC + navC + logC;
    const totConC = fobC + arcC + gasC;
    const totSinC = totConC - ivaC - ivaAC;

    // ── LADO REAL ──
    const segR   = fobDR * 0.01;
    const cifR   = fobDR + fleteR + segR;
    const derR   = cifR * der;
    const tasR   = cifR * tas;
    const bivR   = cifR + derR + tasR;
    const ivaR   = pagaIva  ? bivR * iva  : 0;
    const ivaAR  = pagaIvaA ? bivR * ivaA : 0;
    const ganR   = pagaGan  ? bivR * gan  : 0;
    const iibbR  = pagaIIBB ? bivR * iibb : 0;
    const desR   = curCosts.despachante * ratio;
    const terR   = curCosts.terminal    * ratio;
    const navR   = curCosts.naviera     * ratio;
    const logR   = curCosts.logistica   * ratio;
    const gasR   = desR + terR + navR + logR;
    const totConR = fobR + fleteR + segR + derR + tasR + ivaR + ivaAR + ganR + iibbR + gasR;
    const totSinR = totConR - ivaR - ivaAR;

    // ── ESCENARIOS (solo cliente) ──
    const honorarios = totConC * hon;
    const gastFac    = usaSociedadPropia ? 0 : totConC * fac;
    const precioConF = totConC + honorarios + gastFac;
    const precioSinF = totConC + honorarios; // sin gastos de facturación (cuando sociedad propia)

    // ── RENTABILIDAD ──
    const mFOB  = fobC - fobR;
    const mFlet = n(fleteCli) - fleteR;
    const mDer  = derC - derR;
    const mTas  = tasC - tasR;
    const mIva  = ivaC - ivaR;
    const mIvaA = ivaAC - ivaAR;
    const mGan  = ganC - ganR;
    const mIIBB = iibbC - iibbR;
    const mAranc = mDer + mTas + mIva + mIvaA + mGan + mIIBB;
    const mGas  = gasC - gasR;
    const ganTotal = mFOB + mFlet + mAranc + mGas + honorarios;

    // ── modo personal ──
    const precioVenta = totConR * (1 + mrg);

    return {
      fobC, fobDC, fobR, fobDR,
      segC, cifC, derC, tasC, bivC, ivaC, ivaAC, ganC, iibbC, arcC,
      desC, terC, navC, logC, gasC, totConC, totSinC,
      fleteR, segR, cifR, derR, tasR, bivR, ivaR, ivaAR, ganR, iibbR,
      desR, terR, navR, logR, gasR, totConR, totSinR,
      honorarios, gastFac, precioConF, precioSinF,
      mFOB, mFlet, mDer, mTas, mIva, mIvaA, mGan, mIIBB, mAranc, mGas, ganTotal,
      precioVenta,
      ratio, curM3,
    };
  }, [
    fobCliente, fobDecCli, fleteCli, gDes, gTer, gNav, gLog,
    fobReal, fobDecReal, fleteRealInput, m3Merch,
    pDer, pTas, pIva, pagaIva, pIvaA, pagaIvaA, pGan, pagaGan, pIIBB, pagaIIBB,
    pHon, pFac, pMrg, usaSociedadPropia, curM3, curCosts,
  ]);

  // ─── tabs per mode ────────────────────────────────────────────────────────
  const tabs = mode === 'cliente'
    ? [['cliente_fob','Cotización cliente'],['real_fob','Mis costos reales'],['aranceles','Aranceles'],['cierre','Cierre']]
    : [['real_fob','Mis costos'],['aranceles','Aranceles'],['venta','Precio de venta']];

  // reset tab when switching mode
  const switchMode = (m) => { setMode(m); setTab(m === 'cliente' ? 'cliente_fob' : 'real_fob'); };

  // ─── print client quote ───────────────────────────────────────────────────
  const printClienteQuote = () => {
    const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const fmt = (v) => '$ ' + (Math.round(v * 100) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pct = (v) => v.toFixed(1) + '%';
    const row = (label, val, opts = {}) => {
      const color = opts.bold ? '#1e293b' : opts.sub ? '#475569' : '#374151';
      const bg = opts.highlight ? '#eff6ff' : opts.total ? '#1e3a5f' : 'transparent';
      const txtColor = opts.total ? '#ffffff' : color;
      return `<tr style="background:${bg};">
        <td style="padding:7px 12px;font-size:${opts.bold||opts.total?'0.9':'0.84'}rem;font-weight:${opts.bold||opts.total?700:400};color:${opts.sub?'#64748b':txtColor};border-bottom:1px solid #f1f5f9;">${label}</td>
        <td style="padding:7px 12px;text-align:right;font-size:${opts.bold||opts.total?'0.9':'0.84'}rem;font-weight:${opts.bold||opts.total?700:opts.semibold?600:400};color:${opts.total?'#ffffff':opts.bold?'#1e293b':'#374151'};border-bottom:1px solid #f1f5f9;">${val}</td>
      </tr>`;
    };
    const divider = (label) => `<tr><td colspan="2" style="padding:10px 12px 4px;font-size:0.65rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #e2e8f0;">${label}</td></tr>`;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Cotización - ${cliente || 'Cliente'}</title>
    <style>
      @page { margin: 18mm 15mm; size: A4; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; }
      .page { max-width: 720px; margin: 0 auto; padding: 0; }
      table { width: 100%; border-collapse: collapse; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
    <div class="page">
      <!-- HEADER -->
      <table style="margin-bottom:24px;">
        <tr>
          <td>
            <div style="font-size:1.4rem;font-weight:800;color:#2563eb;letter-spacing:-0.02em;">TRANSTIDE FREIGHT</div>
            <div style="font-size:0.78rem;color:#94a3b8;margin-top:2px;">Gestión Logística & Importaciones</div>
          </td>
          <td style="text-align:right;vertical-align:top;">
            <div style="font-size:0.72rem;color:#94a3b8;">Fecha de cotización</div>
            <div style="font-size:0.88rem;font-weight:600;color:#475569;">${today}</div>
          </td>
        </tr>
      </table>

      <!-- TITLE BAND -->
      <div style="background:#2563eb;border-radius:10px;padding:14px 20px;margin-bottom:20px;">
        <div style="font-size:1.05rem;font-weight:800;color:#fff;letter-spacing:0.01em;">COTIZACIÓN DE IMPORTACIÓN</div>
        ${cliente ? `<div style="font-size:0.82rem;color:#bfdbfe;margin-top:4px;">Cliente: <strong style="color:#fff;">${cliente}</strong></div>` : ''}
      </div>

      <!-- CLIENT INFO -->
      ${(descripcion || clasificacion) ? `
      <table style="margin-bottom:20px;background:#f8fafc;border-radius:8px;overflow:hidden;">
        ${descripcion ? `<tr><td style="padding:8px 14px;font-size:0.75rem;color:#64748b;font-weight:600;width:200px;">Descripción</td><td style="padding:8px 14px;font-size:0.82rem;color:#1e293b;">${descripcion}</td></tr>` : ''}
        ${clasificacion ? `<tr style="border-top:1px solid #e2e8f0;"><td style="padding:8px 14px;font-size:0.75rem;color:#64748b;font-weight:600;">Posición Arancelaria</td><td style="padding:8px 14px;font-size:0.82rem;color:#1e293b;">${clasificacion}</td></tr>` : ''}
      </table>` : ''}

      <!-- DESGLOSE -->
      <table style="margin-bottom:16px;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
        ${divider('Base de la Importación')}
        ${row('Valor de Mercadería (FOB Declarado)', fmt(c.fobDC))}
        ${row('Flete Internacional', fmt(n(fleteCli)))}
        ${row('Seguro Marítimo (1% FOB)', fmt(c.segC))}
        ${row('CIF — Base Arancelaria', fmt(c.cifC), { bold: true, highlight: true })}

        ${divider('Aranceles Aduaneros')}
        ${row(`Derechos de Importación (${pct(pDer)})`, fmt(c.derC))}
        ${pTas > 0 ? row(`Tasa Estadística (${pct(pTas)})`, fmt(c.tasC)) : ''}
        ${row('Base IVA', fmt(c.bivC), { sub: true })}
        ${row(`IVA (${pct(pIva)})`, fmt(c.ivaC))}
        ${c.ivaAC > 0 ? row(`IVA Adicional (${pct(pIvaA)})`, fmt(c.ivaAC)) : ''}
        ${c.ganC > 0 ? row(`Percepción Ganancias (${pct(pGan)})`, fmt(c.ganC)) : ''}
        ${c.iibbC > 0 ? row(`Percepción IIBB (${pct(pIIBB)})`, fmt(c.iibbC)) : ''}

        ${(c.desC > 0 || c.terC > 0 || c.navC > 0 || c.logC > 0) ? divider('Gastos Locales') : ''}
        ${c.desC > 0 ? row('Despachante de Aduana', fmt(c.desC)) : ''}
        ${c.terC > 0 ? row('Terminal Portuaria', fmt(c.terC)) : ''}
        ${c.navC > 0 ? row('Naviera', fmt(c.navC)) : ''}
        ${c.logC > 0 ? row('Logística Interna', fmt(c.logC)) : ''}

        ${divider('Totales')}
        ${row('Costo Total CON IVA', fmt(c.totConC), { bold: true })}
        ${row('Costo Total SIN IVA', fmt(c.totSinC), { sub: true })}
        ${row(`Honorarios del Servicio (${pct(pHon)})`, fmt(c.honorarios))}
        ${c.gastFac > 0 ? row(`Gastos de Facturación (${pct(pFac)})`, fmt(c.gastFac), { sub: true }) : ''}
      </table>

      <!-- FINAL PRICES -->
      <table style="margin-bottom:24px;border-radius:10px;overflow:hidden;">
        <tr>
          <td style="padding:18px 20px;background:#065f46;border-radius:10px 0 0 10px;width:50%;">
            <div style="font-size:0.65rem;font-weight:700;color:#6ee7b7;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Precio Final CON Factura</div>
            <div style="font-size:1.6rem;font-weight:800;color:#ffffff;line-height:1;">${fmt(c.precioConF)}</div>
            <div style="font-size:0.7rem;color:#6ee7b7;margin-top:4px;">Hon. ${fmt(c.honorarios)} + Gs.Fac. ${fmt(c.gastFac)}</div>
          </td>
          <td style="width:8px;"></td>
          <td style="padding:18px 20px;background:#78350f;border-radius:0 10px 10px 0;width:50%;">
            <div style="font-size:0.65rem;font-weight:700;color:#fcd34d;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Precio Final SIN Factura</div>
            <div style="font-size:1.6rem;font-weight:800;color:#ffffff;line-height:1;">${fmt(c.precioSinF)}</div>
            <div style="font-size:0.7rem;color:#fcd34d;margin-top:4px;">Ahorro para el cliente: ${fmt(c.gastFac)}</div>
          </td>
        </tr>
      </table>

      <!-- FOOTER -->
      <div style="border-top:1px solid #e2e8f0;padding-top:12px;">
        <p style="font-size:0.7rem;color:#94a3b8;line-height:1.5;">
          * Cotización expresada en dólares estadounidenses (USD). Los valores son estimados y están sujetos a variación según el tipo de cambio oficial vigente al momento del despacho, actualizaciones arancelarias y condiciones del proveedor. La presente cotización tiene validez de 7 días hábiles desde su emisión.
        </p>
      </div>
    </div>
    </body></html>`;

    const w = window.open('', '_blank', 'width=820,height=950,scrollbars=yes');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={{ paddingBottom: '3rem' }}>

      {/* ══ HEADER ════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.2rem' }}>Cotizador de Importación</h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
            {mode === 'cliente' ? 'Calculá el costo real, lo que cobrás y tu rentabilidad' : 'Calculá el costo real de tu importación personal'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {mode === 'cliente' && (
            <button onClick={() => setShowClienteView(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 1.1rem', borderRadius: '50px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, background: '#2563eb', color: '#fff', boxShadow: '0 2px 10px rgba(37,99,235,0.3)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Ver cotización al cliente
            </button>
          )}
          <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: '50px', padding: '4px', gap: '2px' }}>
            <Pill active={mode === 'cliente'} onClick={() => switchMode('cliente')}>Para Cliente</Pill>
            <Pill active={mode === 'personal'} onClick={() => switchMode('personal')}>Importación Personal</Pill>
          </div>
        </div>
      </div>

      {/* ══ SETUP CARD ════════════════════════════════════════════════════════ */}
      <Card style={{ marginBottom: '1.25rem', padding: '1.5rem' }}>
        <div className="cot-setup-grid" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '2rem' }}>

          {/* LEFT: contenedor */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>
              </div>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>Contenedor</p>
            </div>

            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '10px', padding: '3px', gap: '2px', marginBottom: '0.85rem' }}>
              {Object.entries(PRESETS).map(([key, p]) => (
                <button key={key} onClick={() => setContType(key)} style={{ flex: 1, padding: '0.42rem 0.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 700, transition: 'all 0.15s', background: contType === key ? '#2563eb' : 'transparent', color: contType === key ? '#fff' : '#64748b' }}>
                  {p.label}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={LBL}>M³ del contenedor</label>
              <input type="number" inputMode="decimal" step="any" min="1" value={contM3[contType]} onChange={e => setM3(contType, e.target.value)} style={{ ...INP, width: '110px' }} />
            </div>

            <div>
              <label style={{ ...LBL, marginBottom: '0.5rem' }}>Costos de referencia (USD)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                {[['Flete marítimo','flete'],['Despachante','despachante'],['Terminal','terminal'],['Naviera','naviera'],['Logística','logistica']].map(([label, key]) => (
                  <div key={key}>
                    <label style={{ ...LBL, fontSize: '0.62rem' }}>{label}</label>
                    <input type="number" inputMode="decimal" step="any" min="0" value={contCosts[contType][key]} onChange={e => setCost(contType, key, e.target.value)} style={INP} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: M³ mercadería + charges table */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              </div>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>Mi carga & prorrateo de costos</p>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={LBL}>M³ de mi mercadería</label>
                <input type="number" inputMode="decimal" step="any" min="0" placeholder="0" value={m3Merch} onChange={e => setM3Merch(e.target.value)} style={{ ...INP, width: '130px' }} />
              </div>
              <div style={{ background: c.ratio > 0 ? '#eff6ff' : '#f8fafc', border: `1px solid ${c.ratio > 0 ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: '10px', padding: '0.45rem 0.9rem', marginBottom: '0.12rem' }}>
                <p style={{ fontSize: '0.62rem', color: '#94a3b8', marginBottom: '1px' }}>Ratio de prorrateo</p>
                <p style={{ fontSize: '0.95rem', fontWeight: 800, color: c.ratio > 0 ? '#2563eb' : '#94a3b8', lineHeight: 1 }}>{c.ratio.toFixed(3)}</p>
                <p style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '1px' }}>{n(m3Merch)} / {c.curM3} m³</p>
              </div>
            </div>

            {/* charges table */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
              <div className="cot-charges-header" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', background: '#f8fafc', padding: '0.45rem 0.85rem', borderBottom: '1px solid #e2e8f0', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Concepto</span>
                <span className="cot-charges-prorated" style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'right' }}>Tu costo prorrateado</span>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'right' }}>Lo que cobrás al cliente</span>
              </div>
              {[
                ['Flete', c.fleteR, fleteCli, setFleteCli],
                ['Despachante', c.desR, gDes, setGDes],
                ['Terminal', c.terR, gTer, setGTer],
                ['Naviera', c.navR, gNav, setGNav],
                ['Logística', c.logR, gLog, setGLog],
              ].map(([label, prorated, val, setVal], i, arr) => (
                <div key={label} className="cot-charges-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', alignItems: 'center', padding: '0.48rem 0.85rem', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.83rem', fontWeight: 600, color: '#475569' }}>{label}</span>
                  <span className="cot-charges-prorated" style={{ fontSize: '0.83rem', color: c.ratio > 0 ? '#1e293b' : '#cbd5e1', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(prorated)}</span>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <input type="number" inputMode="decimal" step="any" min="0" placeholder="0" value={val} onChange={e => setVal(e.target.value)} style={{ ...INP, width: '130px', textAlign: 'right' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </Card>

      {/* ══ MAIN GRID ═════════════════════════════════════════════════════════ */}
      <div className="cot-main-grid" style={{ display: 'grid', gridTemplateColumns: '460px 1fr', gap: '1.25rem', alignItems: 'start' }}>

        {/* ── LEFT: identification + tabs ──────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          {/* identification */}
          <Card style={{ padding: '1rem 1.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.85rem' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Identificación del embarque</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
              <F label="Cliente"><TI value={cliente} onChange={setCliente} placeholder="Nombre del cliente" /></F>
              <F label="Posición arancelaria"><TI value={clasificacion} onChange={setClasificacion} placeholder="8456.11.00" /></F>
            </div>
            <F label="Descripción de la mercadería"><TI value={descripcion} onChange={setDescripcion} placeholder="Ej: Máquinas cortadoras láser 1000W" /></F>
          </Card>

          {/* tab bar */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tabs.length}, 1fr)`, background: '#fff', borderRadius: '12px', padding: '4px', border: '1px solid #e2e8f0', gap: '3px' }}>
            {tabs.map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: '0.6rem 0.25rem', borderRadius: '9px', border: 'none', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 700, transition: 'all 0.15s', background: tab === id ? '#2563eb' : 'transparent', color: tab === id ? '#fff' : '#94a3b8', lineHeight: 1.2 }}>
                {label}
              </button>
            ))}
          </div>

          {/* tab content */}
          <Card style={{ padding: '1.25rem' }}>

            {/* ── TAB: COTIZACIÓN CLIENTE ── */}
            {tab === 'cliente_fob' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '1rem' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>FOB — Lado cliente</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '0.75rem' }}>
                    <label style={{ ...LBL, color: '#b45309' }}>FOB Cliente</label>
                    <p style={{ fontSize: '0.68rem', color: '#d97706', marginBottom: '0.5rem' }}>Lo que cobrás por la mercadería</p>
                    <NI value={fobCliente} onChange={setFobCliente} />
                  </div>
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '0.75rem' }}>
                    <label style={{ ...LBL, color: '#b45309' }}>FOB Declarado al cliente</label>
                    <p style={{ fontSize: '0.68rem', color: '#d97706', marginBottom: '0.5rem' }}>Base para sus aranceles y CIF</p>
                    <NI value={fobDecCli} onChange={setFobDecCli} placeholder="= FOB cliente si no difiere" />
                  </div>
                </div>

                <div style={{ background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '0.72rem', color: '#3b82f6', fontWeight: 600 }}>CIF base aranceles cliente</p>
                    <p style={{ fontSize: '0.65rem', color: '#93c5fd' }}>FOB dec. {usd(c.fobDC)} + Flete {usd(n(fleteCli))} + Seguro {usd(c.segC)}</p>
                  </div>
                  <p style={{ fontSize: '1.2rem', fontWeight: 800, color: '#2563eb' }}>{usd(c.cifC)}</p>
                </div>
              </div>
            )}

            {/* ── TAB: MIS COSTOS REALES ── */}
            {tab === 'real_fob' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '1rem' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.05em' }}>FOB — Lado real</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '0.75rem' }}>
                    <label style={{ ...LBL, color: '#065f46' }}>FOB Real</label>
                    <p style={{ fontSize: '0.68rem', color: '#10b981', marginBottom: '0.5rem' }}>Lo que pagaste al proveedor</p>
                    <NI value={fobReal} onChange={setFobReal} />
                  </div>
                  <div style={{ background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '0.75rem' }}>
                    <label style={{ ...LBL, color: '#065f46' }}>FOB Declarado real</label>
                    <p style={{ fontSize: '0.68rem', color: '#10b981', marginBottom: '0.5rem' }}>Lo que declarás en aduana</p>
                    <NI value={fobDecReal} onChange={setFobDecReal} placeholder="= FOB real si no difiere" />
                  </div>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <F label={`Flete real (vacío = prorrateado automático: ${usd(curCosts.flete * c.ratio)})`}>
                    <NI value={fleteRealInput} onChange={setFleteRealInput} placeholder={`${(curCosts.flete * c.ratio).toFixed(2)}`} />
                  </F>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div>
                    <p style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>CIF declarado real</p>
                    <p style={{ fontSize: '0.65rem', color: '#6ee7b7' }}>FOB dec. {usd(c.fobDR)} + Flete {usd(c.fleteR)} + Seguro {usd(c.segR)}</p>
                  </div>
                  <p style={{ fontSize: '1.2rem', fontWeight: 800, color: '#059669' }}>{usd(c.cifR)}</p>
                </div>

                <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '0.75rem', border: '1px solid #f1f5f9' }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>Gastos locales reales prorrateados</p>
                  {[['Despachante', c.desR, curCosts.despachante], ['Terminal', c.terR, curCosts.terminal], ['Naviera', c.navR, curCosts.naviera], ['Logística', c.logR, curCosts.logistica]].map(([l, v, ref]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '0.22rem 0', color: '#475569', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ color: '#94a3b8' }}>{l} <span style={{ fontSize: '0.72rem' }}>({usd(ref)} × {c.ratio.toFixed(3)})</span></span>
                      <strong style={{ color: '#1e293b' }}>{usd(v)}</strong>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.85rem', color: '#1e293b', paddingTop: '0.5rem', marginTop: '0.2rem' }}>
                    <span>Total gastos reales</span><span>{usd(c.gasR)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB: ARANCELES ── */}
            {tab === 'aranceles' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '1rem' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Configuración arancelaria</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
                  <F label="Derechos de Importación %">
                    <input type="number" inputMode="decimal" step="any" min="0" value={pDer} onChange={e => setPDer(parseFloat(e.target.value) || 0)} style={INP} />
                  </F>
                  <F label="Tasa Estadística %">
                    <input type="number" inputMode="decimal" step="any" min="0" value={pTas} onChange={e => setPTas(parseFloat(e.target.value) || 0)} style={INP} />
                  </F>
                </div>

                <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.65rem' }}>¿Cuáles de estos impuestos pagás realmente vos? Afecta solo el cálculo de tus costos reales.</p>

                <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '0.75rem 1rem', border: '1px solid #f1f5f9' }}>
                  {[
                    ['IVA %', pIva, setPIva, pagaIva, setPagaIva],
                    ['IVA Adicional %', pIvaA, setPIvaA, pagaIvaA, setPagaIvaA],
                    ['Perc. Ganancias %', pGan, setPGan, pagaGan, setPagaGan],
                    ['Perc. IIBB %', pIIBB, setPIIBB, pagaIIBB, setPagaIIBB],
                  ].map(([lbl, val, setVal, paga, setPaga]) => (
                    <div key={lbl} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'end', marginBottom: '0.6rem' }}>
                      <F label={lbl}>
                        <input type="number" inputMode="decimal" step="any" min="0" value={val} onChange={e => setVal(parseFloat(e.target.value) || 0)} style={INP} />
                      </F>
                      <div style={{ paddingBottom: '0.75rem' }}>
                        <PagaToggle label="¿Lo pagás?" checked={paga} onChange={setPaga} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.75rem' }}>
                  {[['Base IVA cliente', c.bivC, '#eff6ff', '#2563eb'], ['Base IVA real', c.bivR, '#f0fdf4', '#059669']].map(([l, v, bg, color]) => (
                    <div key={l} style={{ background: bg, borderRadius: '8px', padding: '0.6rem 0.8rem' }}>
                      <p style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.15rem' }}>{l}</p>
                      <p style={{ fontSize: '0.95rem', fontWeight: 700, color }}>{usd(v)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TAB: CIERRE ── */}
            {tab === 'cierre' && mode === 'cliente' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '1rem' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5"><path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5b21b6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Honorarios & cierre</p>
                </div>

                {/* ── Toggle: Sociedad ── */}
                <div style={{ marginBottom: '1rem', background: usaSociedadPropia ? '#f0fdf4' : '#eff6ff', borderRadius: '12px', padding: '0.85rem 1rem', border: `1px solid ${usaSociedadPropia ? '#bbf7d0' : '#bfdbfe'}` }}>
                  <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>¿Qué sociedad usa el cliente para importar?</p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setUsaSociedadPropia(true)}
                      style={{ flex: 1, padding: '0.6rem 0.75rem', borderRadius: '10px', border: `2px solid ${usaSociedadPropia ? '#059669' : '#e2e8f0'}`, cursor: 'pointer', background: usaSociedadPropia ? '#dcfce7' : '#fff', textAlign: 'left', transition: 'all 0.15s' }}>
                      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: usaSociedadPropia ? '#059669' : '#64748b', marginBottom: '0.15rem' }}>
                        {usaSociedadPropia ? '✓ ' : ''}Sociedad propia del cliente
                      </p>
                      <p style={{ fontSize: '0.65rem', color: usaSociedadPropia ? '#059669' : '#94a3b8' }}>
                        Sin gastos de facturación
                      </p>
                    </button>
                    <button
                      onClick={() => setUsaSociedadPropia(false)}
                      style={{ flex: 1, padding: '0.6rem 0.75rem', borderRadius: '10px', border: `2px solid ${!usaSociedadPropia ? '#2563eb' : '#e2e8f0'}`, cursor: 'pointer', background: !usaSociedadPropia ? '#eff6ff' : '#fff', textAlign: 'left', transition: 'all 0.15s' }}>
                      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: !usaSociedadPropia ? '#2563eb' : '#64748b', marginBottom: '0.15rem' }}>
                        {!usaSociedadPropia ? '✓ ' : ''}Sociedad de Transtide
                      </p>
                      <p style={{ fontSize: '0.65rem', color: !usaSociedadPropia ? '#2563eb' : '#94a3b8' }}>
                        Se suman gastos de facturación
                      </p>
                    </button>
                  </div>
                </div>

                <F label={`Honorarios % (s/ costo CON IVA)`}>
                  <input type="number" inputMode="decimal" step="any" min="0" value={pHon} onChange={e => setPHon(parseFloat(e.target.value) || 0)} style={INP} />
                </F>

                {!usaSociedadPropia && (
                  <F label={`Gastos de Facturación % — sociedad Transtide`}>
                    <input type="number" inputMode="decimal" step="any" min="0" value={pFac} onChange={e => setPFac(parseFloat(e.target.value) || 0)} style={INP} />
                  </F>
                )}

                <div style={{ background: '#faf5ff', borderRadius: '10px', padding: '1rem', border: '1px solid #e9d5ff', marginTop: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '0.38rem 0', borderBottom: '1px solid #f3e8ff', color: '#475569' }}>
                    <span>Costo Total CON IVA</span><span>{usd(c.totConC)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '0.38rem 0', borderBottom: '1px solid #f3e8ff', color: '#475569' }}>
                    <span>+ Honorarios ({pHon}%)</span><span>{usd(c.honorarios)}</span>
                  </div>
                  {!usaSociedadPropia && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '0.38rem 0', borderBottom: '1px solid #f3e8ff', color: '#7c3aed' }}>
                      <span>+ Gastos de Facturación ({pFac}%)</span><span>{usd(c.gastFac)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.55rem 0', fontWeight: 700, color: '#7c3aed' }}>
                    <span>= Precio final</span><span>{usd(c.precioConF)}</span>
                  </div>
                  {usaSociedadPropia && (
                    <p style={{ fontSize: '0.68rem', color: '#059669', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      ✓ Sin gastos de facturación — sociedad propia del cliente
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB: PRECIO DE VENTA (personal) ── */}
            {tab === 'venta' && mode === 'personal' && (
              <div>
                <p style={SECL}>Precio de venta estimado</p>
                <F label="Margen de ganancia deseado %">
                  <input type="number" inputMode="decimal" step="any" min="0" value={pMrg} onChange={e => setPMrg(parseFloat(e.target.value) || 0)} style={INP} />
                </F>
                <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '1rem', marginTop: '0.5rem' }}>
                  {[
                    ['Costo real CON IVA', c.totConR],
                    [`+ Margen (${pMrg}%)`, c.totConR * (pMrg / 100)],
                    ['= Precio de venta estimado', c.precioVenta],
                  ].map(([lbl, val], i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.35rem 0', borderBottom: i < 2 ? '1px solid #d1fae5' : 'none', fontWeight: i === 2 ? 700 : 400, color: i === 2 ? '#059669' : '#374151' }}>
                      <span>{lbl}</span><span>{usd(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </Card>
        </div>

        {/* ── RIGHT: sticky results ────────────────────────────────────────── */}
        <div className="cot-right-rail" style={{ position: 'sticky', top: '1rem', maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* ══ MODO CLIENTE ════════════════════════════════════════════════ */}
          {mode === 'cliente' && (<>

            <Card>
              <p style={{ ...SECL, margin: '0 0 0.7rem' }}>Precio final al cliente</p>
              {/* Sociedad badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', padding: '0.4rem 0.7rem', background: usaSociedadPropia ? '#f0fdf4' : '#eff6ff', borderRadius: '8px', border: `1px solid ${usaSociedadPropia ? '#bbf7d0' : '#bfdbfe'}` }}>
                <span style={{ fontSize: '0.75rem' }}>{usaSociedadPropia ? '🏢' : '🔵'}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: usaSociedadPropia ? '#059669' : '#2563eb' }}>
                  {usaSociedadPropia ? 'Sociedad propia — sin gastos de facturación' : 'Sociedad Transtide — incluye gastos de facturación'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: usaSociedadPropia ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '1rem' }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
                    {usaSociedadPropia ? 'Precio final' : 'CON Factura'}
                  </p>
                  <p style={{ fontSize: '1.45rem', fontWeight: 800, color: '#10b981', lineHeight: 1 }}>{usd(c.precioConF)}</p>
                  <p style={{ fontSize: '0.7rem', color: '#6ee7b7', marginTop: '0.2rem' }}>
                    Hon. {usd(c.honorarios)}{!usaSociedadPropia ? ` + Fac. ${usd(c.gastFac)}` : ''}
                  </p>
                </div>
                {!usaSociedadPropia && (
                  <div style={{ background: '#fefce8', borderRadius: '12px', padding: '1rem' }}>
                    <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>SIN Factura</p>
                    <p style={{ fontSize: '1.45rem', fontWeight: 800, color: '#d97706', lineHeight: 1 }}>{usd(c.precioSinF)}</p>
                    <p style={{ fontSize: '0.7rem', color: '#fcd34d', marginTop: '0.2rem' }}>Ahorro del cliente: {usd(c.gastFac)}</p>
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.6rem' }}>
                <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '0.6rem 0.75rem' }}>
                  <p style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Costo total CON IVA</p>
                  <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{usd(c.totConC)}</p>
                </div>
                <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '0.6rem 0.75rem' }}>
                  <p style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Costo total SIN IVA</p>
                  <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#64748b' }}>{usd(c.totSinC)}</p>
                </div>
              </div>
              <div style={{ background: '#fff7ed', borderRadius: '8px', padding: '0.45rem 0.75rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: '#92400e' }}>FOB dec. cliente · CIF aranceles</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#d97706' }}>{usd(c.fobDC)} · {usd(c.cifC)}</span>
              </div>
            </Card>

            <Card>
              <p style={{ ...SECL, margin: '0 0 0.7rem' }}>Rentabilidad</p>
              {[
                ['Margen FOB', c.mFOB],
                ['Margen Flete', c.mFlet],
                ['Margen Aranceles', c.mAranc],
                ['Margen Gastos Locales', c.mGas],
                ['Honorarios', c.honorarios],
              ].map(([lbl, val]) => {
                const pctFob = c.fobR > 0 ? ((val / c.fobR) * 100).toFixed(1) + '%' : '';
                const barW = c.ganTotal > 0 ? Math.max(0, Math.min(100, (val / c.ganTotal) * 100)) : 0;
                return (
                  <div key={lbl} style={{ marginBottom: '0.55rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.18rem' }}>
                      <span style={{ fontSize: '0.82rem', color: '#475569' }}>{lbl}</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: val >= 0 ? '#10b981' : '#ef4444' }}>
                        {usd(val)} {pctFob && <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 400 }}>({pctFob})</span>}
                      </span>
                    </div>
                    <div style={{ height: '3px', background: '#f1f5f9', borderRadius: '99px' }}>
                      <div style={{ height: '100%', width: `${barW}%`, background: val >= 0 ? '#10b981' : '#ef4444', borderRadius: '99px', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ borderTop: '2px solid #1e293b', marginTop: '0.75rem', paddingTop: '0.7rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700 }}>Ganancia total</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: c.ganTotal >= 0 ? '#10b981' : '#ef4444' }}>{usd(c.ganTotal)}</div>
                  {c.fobR > 0 && <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{((c.ganTotal / c.fobR) * 100).toFixed(1)}% s/ FOB real</div>}
                </div>
              </div>
            </Card>

            <Card>
              <p style={{ ...SECL, margin: '0 0 0.5rem' }}>Detalle: Real vs Cobrado al cliente</p>
              <div className="cot-detalle-header" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', fontSize: '0.68rem', fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                <span>Concepto</span><span style={{ textAlign: 'right' }}>Costo real</span><span style={{ textAlign: 'right' }}>Cobro</span><span className="cot-detalle-margen" style={{ textAlign: 'right' }}>Margen</span>
              </div>
              {[
                ['FOB Mercadería', c.fobR, c.fobC, c.mFOB],
                ['FOB Declarado', c.fobDR, c.fobDC, null],
                ['Flete', c.fleteR, n(fleteCli), c.mFlet],
                ['Seguro', c.segR, c.segC, c.segC - c.segR],
                ['Derechos', c.derR, c.derC, c.mDer],
                ['Tasa Estadística', c.tasR, c.tasC, c.mTas],
                ['IVA', c.ivaR, c.ivaC, c.mIva],
                ['IVA Adicional', c.ivaAR, c.ivaAC, c.mIvaA],
                ['Perc. Ganancias', c.ganR, c.ganC, c.mGan],
                ['Perc. IIBB', c.iibbR, c.iibbC, c.mIIBB],
                ['Despachante', c.desR, c.desC, c.desC - c.desR],
                ['Terminal', c.terR, c.terC, c.terC - c.terR],
                ['Naviera', c.navR, c.navC, c.navC - c.navR],
                ['Logística', c.logR, c.logC, c.logC - c.logR],
              ].map(([lbl, real, cobro, diff]) => (
                <div key={lbl} className="cot-detalle-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '0.3rem 0', borderBottom: '1px solid #f8fafc', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#475569' }}>{lbl}</span>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'right' }}>{usd(real)}</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#1e293b', textAlign: 'right' }}>{usd(cobro)}</span>
                  <span className="cot-detalle-margen" style={{ fontSize: '0.75rem', fontWeight: 700, textAlign: 'right', color: diff === null ? '#cbd5e1' : diff > 0 ? '#10b981' : diff < 0 ? '#ef4444' : '#94a3b8' }}>
                    {diff === null ? '—' : (diff > 0 ? '+' : '') + (usd(diff))}
                  </span>
                </div>
              ))}
              <div className="cot-detalle-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '0.5rem 0.25rem', background: '#f0f7ff', borderRadius: '8px', marginTop: '0.4rem', fontWeight: 700, fontSize: '0.85rem' }}>
                <span style={{ color: '#1e293b' }}>TOTAL</span>
                <span style={{ textAlign: 'right', color: '#64748b' }}>{usd(c.totConR)}</span>
                <span style={{ textAlign: 'right', color: '#2563eb' }}>{usd(c.totConC)}</span>
                <span className="cot-detalle-margen" style={{ textAlign: 'right', color: c.ganTotal >= 0 ? '#10b981' : '#ef4444' }}>{c.ganTotal >= 0 ? '+' : ''}{usd(c.ganTotal)}</span>
              </div>
            </Card>

          </>)}

          {/* ══ MODO PERSONAL ═══════════════════════════════════════════════ */}
          {mode === 'personal' && (<>

            <Card>
              <p style={{ ...SECL, margin: '0 0 0.7rem' }}>Costo total de importación</p>
              <p style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>{usd(c.totConR)}</p>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.3rem' }}>SIN IVA: {usd(c.totSinR)}</p>
              {c.precioVenta > 0 && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
                    Precio de venta estimado ({pMrg}% margen)
                  </p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>{usd(c.precioVenta)}</p>
                </div>
              )}
              <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '0.45rem 0.75rem', marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.72rem', color: '#065f46' }}>FOB declarado · CIF declarado</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#059669' }}>{usd(c.fobDR)} · {usd(c.cifR)}</span>
              </div>
            </Card>

            <Card>
              <p style={{ ...SECL, margin: '0 0 0.5rem' }}>Desglose de costos reales</p>
              <RRow label="FOB Real" val={c.fobR} />
              <RRow label="Flete prorrateado" val={c.fleteR} />
              <RRow label="Seguro (1%)" val={c.segR} />
              <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', margin: '0.6rem 0 0.3rem' }}>Aranceles pagados</p>
              <RRow label={`Derechos (${pDer}%)`} val={c.derR} />
              <RRow label={`Tasa Estadística (${pTas}%)`} val={c.tasR} />
              <RRow label={`IVA (${pIva}%)`} val={c.ivaR} dimmed={!pagaIva} />
              <RRow label={`IVA Adicional (${pIvaA}%)`} val={c.ivaAR} dimmed={!pagaIvaA} />
              <RRow label={`Perc. Ganancias (${pGan}%)`} val={c.ganR} dimmed={!pagaGan} />
              <RRow label={`Perc. IIBB (${pIIBB}%)`} val={c.iibbR} dimmed={!pagaIIBB} />
              <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', margin: '0.6rem 0 0.3rem' }}>Gastos locales</p>
              <RRow label="Despachante" val={c.desR} />
              <RRow label="Terminal" val={c.terR} />
              <RRow label="Naviera" val={c.navR} />
              <RRow label="Logística Interna" val={c.logR} />
              <div style={{ borderTop: '2px solid #1e293b', marginTop: '0.6rem', paddingTop: '0.6rem', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700 }}>Total CON IVA</span>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: '#1e293b' }}>{usd(c.totConR)}</span>
              </div>
            </Card>

          </>)}

        </div>
      </div>


      {/* ══ MODAL: VISTA COTIZACIÓN CLIENTE ═════════════════════════════════ */}
      {showClienteView && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowClienteView(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>

            {/* modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.2rem 1.5rem', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: '#fff', borderRadius: '20px 20px 0 0', zIndex: 10 }}>
              <div>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.1rem' }}>Vista previa</p>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Cotización al Cliente</h3>
              </div>
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button onClick={printClienteQuote} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: '50px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, background: '#2563eb', color: '#fff', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Imprimir / PDF
                </button>
                <button onClick={() => setShowClienteView(false)} style={{ width: '36px', height: '36px', borderRadius: '50%', border: 'none', cursor: 'pointer', background: '#f1f5f9', color: '#64748b', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            </div>

            {/* modal body — quote preview */}
            <div style={{ padding: '1.5rem' }}>

              {/* brand + date */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.2rem' }}>
                <div>
                  <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#2563eb', letterSpacing: '-0.02em' }}>TRANSTIDE FREIGHT</p>
                  <p style={{ fontSize: '0.73rem', color: '#94a3b8' }}>Gestión Logística & Importaciones</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Fecha de cotización</p>
                  <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>{new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                </div>
              </div>

              {/* title band */}
              <div style={{ background: '#2563eb', borderRadius: '12px', padding: '1rem 1.2rem', marginBottom: '1.2rem' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fff', letterSpacing: '0.01em' }}>COTIZACIÓN DE IMPORTACIÓN</p>
                {cliente && <p style={{ fontSize: '0.8rem', color: '#bfdbfe', marginTop: '3px' }}>Cliente: <strong style={{ color: '#fff' }}>{cliente}</strong></p>}
              </div>

              {/* client info */}
              {(descripcion || clasificacion) && (
                <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.2rem', display: 'grid', gap: '0.4rem' }}>
                  {descripcion && <div style={{ display: 'flex', gap: '1rem' }}><span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', minWidth: '130px' }}>Descripción</span><span style={{ fontSize: '0.82rem', color: '#1e293b' }}>{descripcion}</span></div>}
                  {clasificacion && <div style={{ display: 'flex', gap: '1rem', borderTop: descripcion ? '1px solid #e2e8f0' : 'none', paddingTop: descripcion ? '0.4rem' : 0 }}><span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', minWidth: '130px' }}>Pos. Arancelaria</span><span style={{ fontSize: '0.82rem', color: '#1e293b' }}>{clasificacion}</span></div>}
                </div>
              )}

              {/* desglose table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '1rem' }}>

                {/* base importación */}
                <div style={{ padding: '6px 12px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Base de la Importación</span>
                </div>
                {[
                  ['Valor de Mercadería (FOB Declarado)', usd(c.fobDC)],
                  ['Flete Internacional', usd(n(fleteCli))],
                  ['Seguro Marítimo (1% FOB)', usd(c.segC)],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid #f8fafc', fontSize: '0.83rem', color: '#374151' }}>
                    <span>{l}</span><span>{v}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #e2e8f0', fontSize: '0.88rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff' }}>
                  <span>CIF — Base Arancelaria</span><span>{usd(c.cifC)}</span>
                </div>

                {/* aranceles */}
                <div style={{ padding: '6px 12px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Aranceles Aduaneros</span>
                </div>
                {[
                  [`Derechos de Importación (${pDer}%)`, usd(c.derC)],
                  ...(pTas > 0 ? [[`Tasa Estadística (${pTas}%)`, usd(c.tasC)]] : []),
                  ['Base IVA', usd(c.bivC), true],
                  [`IVA (${pIva}%)`, usd(c.ivaC)],
                  ...(c.ivaAC > 0 ? [[`IVA Adicional (${pIvaA}%)`, usd(c.ivaAC)]] : []),
                  ...(c.ganC > 0 ? [[`Percepción Ganancias (${pGan}%)`, usd(c.ganC)]] : []),
                  ...(c.iibbC > 0 ? [[`Percepción IIBB (${pIIBB}%)`, usd(c.iibbC)]] : []),
                ].map(([l, v, sub]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid #f8fafc', fontSize: '0.83rem', color: sub ? '#94a3b8' : '#374151' }}>
                    <span>{l}</span><span>{v}</span>
                  </div>
                ))}

                {/* gastos locales */}
                {(c.desC > 0 || c.terC > 0 || c.navC > 0 || c.logC > 0) && (<>
                  <div style={{ padding: '6px 12px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Gastos Locales</span>
                  </div>
                  {[
                    ['Despachante de Aduana', c.desC],
                    ['Terminal Portuaria', c.terC],
                    ['Naviera', c.navC],
                    ['Logística Interna', c.logC],
                  ].filter(([, v]) => v > 0).map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid #f8fafc', fontSize: '0.83rem', color: '#374151' }}>
                      <span>{l}</span><span>{usd(v)}</span>
                    </div>
                  ))}
                </>)}

                {/* totales */}
                <div style={{ padding: '6px 12px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Resumen</span>
                </div>
                {[
                  ['Costo Total CON IVA', usd(c.totConC), false, true],
                  ['Costo Total SIN IVA', usd(c.totSinC), true, false],
                  [`Honorarios del Servicio (${pHon}%)`, usd(c.honorarios), false, false],
                  ...(c.gastFac > 0 ? [[`Gastos de Facturación (${pFac}%)`, usd(c.gastFac), true, false]] : []),
                ].map(([l, v, sub, bold]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid #f8fafc', fontSize: sub ? '0.8rem' : bold ? '0.88rem' : '0.83rem', fontWeight: bold ? 700 : 400, color: sub ? '#94a3b8' : bold ? '#1e293b' : '#374151' }}>
                    <span>{l}</span><span>{v}</span>
                  </div>
                ))}
              </div>

              {/* final prices */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.2rem' }}>
                <div style={{ background: '#065f46', borderRadius: '12px', padding: '1.1rem 1.2rem' }}>
                  <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Precio Final CON Factura</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{usd(c.precioConF)}</p>
                  <p style={{ fontSize: '0.68rem', color: '#6ee7b7', marginTop: '5px' }}>Hon. {usd(c.honorarios)} + Gs.Fac. {usd(c.gastFac)}</p>
                </div>
                <div style={{ background: '#78350f', borderRadius: '12px', padding: '1.1rem 1.2rem' }}>
                  <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#fcd34d', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Precio Final SIN Factura</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{usd(c.precioSinF)}</p>
                  <p style={{ fontSize: '0.68rem', color: '#fcd34d', marginTop: '5px' }}>Ahorro del cliente: {usd(c.gastFac)}</p>
                </div>
              </div>

              {/* disclaimer */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
                <p style={{ fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.6 }}>
                  * Cotización expresada en USD. Los valores son estimados y están sujetos a variación según el tipo de cambio oficial vigente al momento del despacho, actualizaciones arancelarias y condiciones del proveedor. Validez: 7 días hábiles.
                </p>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── aéreo component ──────────────────────────────────────────────────────────
function CotizadorAereo() {
  // setup
  const [preset, setPreset] = useState('standard');
  const p = AEREO_PRESETS[preset];

  // identification
  const [cliente, setCliente] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [clasificacion, setClasificacion] = useState('');

  // carga
  const [pesoReal, setPesoReal] = useState('');
  const [largo, setLargo] = useState('');
  const [ancho, setAncho] = useState('');
  const [alto, setAlto] = useState('');

  const pesoVol = (n(largo) * n(ancho) * n(alto)) / 6000;
  const chargeable = Math.max(n(pesoReal), pesoVol);
  const usaVolumetrico = pesoVol > n(pesoReal) && pesoVol > 0;

  // lado cliente
  const [fobCliente, setFobCliente] = useState('');
  const [fobDecCli, setFobDecCli] = useState('');
  const [tarifaCli, setTarifaCli] = useState('');
  const [awbCli, setAwbCli] = useState('');
  const [handCli, setHandCli] = useState('');
  const [terCli, setTerCli] = useState('');
  const [desCli, setDesCli] = useState('');
  const [traCli, setTraCli] = useState('');

  // lado real
  const [fobReal, setFobReal] = useState('');
  const [fobDecReal, setFobDecReal] = useState('');
  const [tarifaReal, setTarifaReal] = useState('');
  const [awbReal, setAwbReal] = useState('');
  const [handReal, setHandReal] = useState('');
  const [terReal, setTerReal] = useState('');
  const [desReal, setDesReal] = useState('');
  const [traReal, setTraReal] = useState('');

  // aranceles
  const [pDer, setPDer] = useState(35);
  const [pTas, setPTas] = useState(0);
  const [pIva, setPIva] = useState(21);    const [pagaIva, setPagaIva] = useState(true);
  const [pIvaA, setPIvaA] = useState(20);  const [pagaIvaA, setPagaIvaA] = useState(false);
  const [pGan, setPGan] = useState(6);     const [pagaGan, setPagaGan] = useState(false);
  const [pIIBB, setPIIBB] = useState(2.5); const [pagaIIBB, setPagaIIBB] = useState(false);

  // cierre
  const [pHon, setPHon] = useState(4);
  const [pFac, setPFac] = useState(8);
  const [pMrg, setPMrg] = useState(20);
  const [usaSociedadPropia, setUsaSociedadPropia] = useState(false);

  // ui
  const [tab, setTab] = useState('cliente_fob');
  const [showClienteView, setShowClienteView] = useState(false);

  // helper: fill real with preset values
  const usarPreset = () => {
    if (p.tarifaKg !== null) setTarifaReal(String(p.tarifaKg));
    setAwbReal(String(p.awb));
    setHandReal(String(p.handling));
    setTerReal(String(p.terminal));
    setDesReal(String(p.despachante));
    setTraReal(String(p.transporte));
  };

  // calc
  const c = useMemo(() => {
    const der = pDer / 100, tas = pTas / 100, iva = pIva / 100,
          ivaA = pIvaA / 100, gan = pGan / 100, iibb = pIIBB / 100,
          hon = pHon / 100, fac = pFac / 100, mrg = pMrg / 100;

    const fobC  = n(fobCliente);
    const fobDC = n(fobDecCli) || fobC;
    const fobR  = n(fobReal);
    const fobDR = n(fobDecReal) || fobR;

    // flete = chargeable kg × tarifa
    const fleteC = chargeable * n(tarifaCli);
    const fleteR = chargeable * n(tarifaReal);

    // ── LADO CLIENTE ──
    const segC   = fobDC * 0.01;
    const cifC   = fobDC + fleteC + segC;
    const derC   = cifC * der;
    const tasC   = cifC * tas;
    const bivC   = cifC + derC + tasC;
    const ivaC   = bivC * iva;
    const ivaAC  = bivC * ivaA;
    const ganC   = bivC * gan;
    const iibbC  = bivC * iibb;
    const arcC   = fleteC + segC + derC + tasC + ivaC + ivaAC + ganC + iibbC;
    const awbCv  = n(awbCli), handCv = n(handCli), terCv = n(terCli), desCv = n(desCli), traCv = n(traCli);
    const gasC   = awbCv + handCv + terCv + desCv + traCv;
    const totConC = fobC + arcC + gasC;
    const totSinC = totConC - ivaC - ivaAC;

    // ── LADO REAL ──
    const segR   = fobDR * 0.01;
    const cifR   = fobDR + fleteR + segR;
    const derR   = cifR * der;
    const tasR   = cifR * tas;
    const bivR   = cifR + derR + tasR;
    const ivaR   = pagaIva  ? bivR * iva  : 0;
    const ivaAR  = pagaIvaA ? bivR * ivaA : 0;
    const ganR   = pagaGan  ? bivR * gan  : 0;
    const iibbR  = pagaIIBB ? bivR * iibb : 0;
    const awbRv  = n(awbReal), handRv = n(handReal), terRv = n(terReal), desRv = n(desReal), traRv = n(traReal);
    const gasR   = awbRv + handRv + terRv + desRv + traRv;
    const totConR = fobR + fleteR + segR + derR + tasR + ivaR + ivaAR + ganR + iibbR + gasR;
    const totSinR = totConR - ivaR - ivaAR;

    // cierre
    const honorarios = totConC * hon;
    const gastFac    = usaSociedadPropia ? 0 : totConC * fac;
    const precioConF = totConC + honorarios + gastFac;
    const precioSinF = totConC + honorarios;

    // rentabilidad
    const mFOB  = fobC - fobR;
    const mFlet = fleteC - fleteR;
    const mDer  = derC - derR;
    const mTas  = tasC - tasR;
    const mIva  = ivaC - ivaR;
    const mIvaA = ivaAC - ivaAR;
    const mGan  = ganC - ganR;
    const mIIBB = iibbC - iibbR;
    const mAranc = mDer + mTas + mIva + mIvaA + mGan + mIIBB;
    const mAwb  = awbCv - awbRv;
    const mHand = handCv - handRv;
    const mTer  = terCv - terRv;
    const mDes  = desCv - desRv;
    const mTra  = traCv - traRv;
    const mGas  = gasC - gasR;
    const ganTotal = mFOB + mFlet + mAranc + mGas + honorarios;

    const precioVenta = totConR * (1 + mrg);

    return {
      fobC, fobDC, fobR, fobDR,
      fleteC, fleteR,
      segC, cifC, derC, tasC, bivC, ivaC, ivaAC, ganC, iibbC, arcC,
      awbCv, handCv, terCv, desCv, traCv, gasC, totConC, totSinC,
      segR, cifR, derR, tasR, bivR, ivaR, ivaAR, ganR, iibbR,
      awbRv, handRv, terRv, desRv, traRv, gasR, totConR, totSinR,
      honorarios, gastFac, precioConF, precioSinF,
      mFOB, mFlet, mDer, mTas, mIva, mIvaA, mGan, mIIBB, mAranc,
      mAwb, mHand, mTer, mDes, mTra, mGas, ganTotal,
      precioVenta,
    };
  }, [
    fobCliente, fobDecCli, fobReal, fobDecReal,
    tarifaCli, tarifaReal, chargeable,
    awbCli, handCli, terCli, desCli, traCli,
    awbReal, handReal, terReal, desReal, traReal,
    pDer, pTas, pIva, pagaIva, pIvaA, pagaIvaA, pGan, pagaGan, pIIBB, pagaIIBB,
    pHon, pFac, pMrg, usaSociedadPropia,
  ]);

  const tabs = [['cliente_fob','Cotización cliente'],['real_fob','Mis costos reales'],['aranceles','Aranceles'],['cierre','Cierre']];

  return (
    <div style={{ paddingBottom: '3rem' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.2rem' }}>Cotizador Aéreo</h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Calculá el costo real, lo que cobrás y tu rentabilidad — importación aérea</p>
        </div>
        <button onClick={() => setShowClienteView(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 1.1rem', borderRadius: '50px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, background: '#2563eb', color: '#fff', boxShadow: '0 2px 10px rgba(37,99,235,0.3)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Ver cotización al cliente
        </button>
      </div>

      {/* SETUP */}
      <Card style={{ marginBottom: '1.25rem', padding: '1.5rem' }}>
        <div className="cot-setup-grid" style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '2rem' }}>

          {/* LEFT: preset + carga */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                <PlaneIcon size={13} />
              </div>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>Servicio aéreo</p>
            </div>

            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '10px', padding: '3px', gap: '2px', marginBottom: '0.85rem' }}>
              {Object.entries(AEREO_PRESETS).map(([key, pr]) => (
                <button key={key} onClick={() => setPreset(key)} style={{ flex: 1, padding: '0.42rem 0.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 700, transition: 'all 0.15s', background: preset === key ? '#2563eb' : 'transparent', color: preset === key ? '#fff' : '#64748b' }}>
                  {pr.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.65rem', background: '#eff6ff', color: '#2563eb', borderRadius: '50px', fontSize: '0.7rem', fontWeight: 700 }}>
                Tránsito: {p.transit}
              </span>
              {p.tarifaKg !== null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.65rem', background: '#f0fdf4', color: '#059669', borderRadius: '50px', fontSize: '0.7rem', fontWeight: 700 }}>
                  ${p.tarifaKg}/kg ref.
                </span>
              )}
            </div>

            <label style={{ ...LBL, marginBottom: '0.5rem' }}>Costos de referencia (USD)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.72rem' }}>
              {[['AWB', p.awb],['Handling', p.handling],['Terminal', p.terminal],['Despachante', p.despachante],['Transporte', p.transporte]].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0.5rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#94a3b8' }}>{l}</span>
                  <strong style={{ color: '#1e293b' }}>{usd(v)}</strong>
                </div>
              ))}
            </div>
            <button onClick={usarPreset} style={{ marginTop: '0.6rem', padding: '0.45rem 0.85rem', borderRadius: '8px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', width: '100%' }}>
              Usar estos valores como costos reales
            </button>
          </div>

          {/* RIGHT: carga */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              </div>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>Carga a transportar</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
              <F label="Peso real (kg)"><NI value={pesoReal} onChange={setPesoReal} /></F>
              <F label="Largo (cm)"><NI value={largo} onChange={setLargo} /></F>
              <F label="Ancho (cm)"><NI value={ancho} onChange={setAncho} /></F>
              <F label="Alto (cm)"><NI value={alto} onChange={setAlto} /></F>
            </div>

            {/* chargeable weight box */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '0.5rem' }}>
              <div style={{ background: !usaVolumetrico && chargeable > 0 ? '#fff7ed' : '#f8fafc', border: `1px solid ${!usaVolumetrico && chargeable > 0 ? '#fed7aa' : '#f1f5f9'}`, borderRadius: '10px', padding: '0.7rem 0.8rem' }}>
                <p style={{ fontSize: '0.62rem', color: '#94a3b8', marginBottom: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Peso real</p>
                <p style={{ fontSize: '1.05rem', fontWeight: 800, color: !usaVolumetrico && chargeable > 0 ? '#d97706' : '#1e293b', lineHeight: 1 }}>{n(pesoReal).toFixed(2)} kg</p>
              </div>
              <div style={{ background: usaVolumetrico ? '#fff7ed' : '#f8fafc', border: `1px solid ${usaVolumetrico ? '#fed7aa' : '#f1f5f9'}`, borderRadius: '10px', padding: '0.7rem 0.8rem' }}>
                <p style={{ fontSize: '0.62rem', color: '#94a3b8', marginBottom: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Peso volumétrico</p>
                <p style={{ fontSize: '1.05rem', fontWeight: 800, color: usaVolumetrico ? '#d97706' : '#1e293b', lineHeight: 1 }}>{pesoVol.toFixed(2)} kg</p>
                <p style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '0.1rem' }}>(L×A×H)/6000</p>
              </div>
              <div style={{ background: chargeable > 0 ? 'linear-gradient(135deg, #f97316, #ea580c)' : '#f8fafc', borderRadius: '10px', padding: '0.7rem 0.9rem', color: chargeable > 0 ? '#fff' : '#cbd5e1', boxShadow: chargeable > 0 ? '0 2px 12px rgba(249,115,22,0.25)' : 'none' }}>
                <p style={{ fontSize: '0.62rem', marginBottom: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, opacity: chargeable > 0 ? 0.9 : 1 }}>Chargeable weight</p>
                <p style={{ fontSize: '1.35rem', fontWeight: 800, lineHeight: 1 }}>{chargeable.toFixed(2)} kg</p>
                <p style={{ fontSize: '0.62rem', marginTop: '0.15rem', opacity: chargeable > 0 ? 0.9 : 1 }}>
                  {chargeable > 0 ? (usaVolumetrico ? 'aplica peso volumétrico' : 'aplica peso real') : '—'}
                </p>
              </div>
            </div>
          </div>

        </div>
      </Card>

      {/* MAIN GRID */}
      <div className="cot-main-grid" style={{ display: 'grid', gridTemplateColumns: '460px 1fr', gap: '1.25rem', alignItems: 'start' }}>

        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          {/* identification */}
          <Card style={{ padding: '1rem 1.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.85rem' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Identificación del embarque</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
              <F label="Cliente"><TI value={cliente} onChange={setCliente} placeholder="Nombre del cliente" /></F>
              <F label="Posición arancelaria"><TI value={clasificacion} onChange={setClasificacion} placeholder="8456.11.00" /></F>
            </div>
            <F label="Descripción de la mercadería"><TI value={descripcion} onChange={setDescripcion} placeholder="Ej: Componentes electrónicos" /></F>
          </Card>

          {/* tab bar */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tabs.length}, 1fr)`, background: '#fff', borderRadius: '12px', padding: '4px', border: '1px solid #e2e8f0', gap: '3px' }}>
            {tabs.map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: '0.6rem 0.25rem', borderRadius: '9px', border: 'none', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 700, transition: 'all 0.15s', background: tab === id ? '#2563eb' : 'transparent', color: tab === id ? '#fff' : '#94a3b8', lineHeight: 1.2 }}>
                {label}
              </button>
            ))}
          </div>

          {/* tab content */}
          <Card style={{ padding: '1.25rem' }}>

            {/* COTIZACIÓN CLIENTE */}
            {tab === 'cliente_fob' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '1rem' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>FOB & costos cobrados al cliente</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '0.75rem' }}>
                    <label style={{ ...LBL, color: '#b45309' }}>FOB Cliente</label>
                    <NI value={fobCliente} onChange={setFobCliente} />
                  </div>
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '0.75rem' }}>
                    <label style={{ ...LBL, color: '#b45309' }}>FOB Declarado al cliente</label>
                    <NI value={fobDecCli} onChange={setFobDecCli} placeholder="= FOB cliente si no difiere" />
                  </div>
                </div>

                <p style={SECL}>Línea aérea destino (cobrado al cliente)</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <F label="Tarifa USD/kg (cobrada)"><NI value={tarifaCli} onChange={setTarifaCli} placeholder={p.tarifaKg !== null ? String(p.tarifaKg) : '0'} /></F>
                  <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '0.5rem 0.7rem', alignSelf: 'end' }}>
                    <p style={{ fontSize: '0.62rem', color: '#94a3b8' }}>Flete cobrado</p>
                    <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{usd(c.fleteC)}</p>
                  </div>
                  <F label="AWB"><NI value={awbCli} onChange={setAwbCli} /></F>
                  <F label="Handling"><NI value={handCli} onChange={setHandCli} /></F>
                  <F label="Terminal aérea"><NI value={terCli} onChange={setTerCli} /></F>
                  <F label="Despachante"><NI value={desCli} onChange={setDesCli} /></F>
                  <F label="Transporte interno"><NI value={traCli} onChange={setTraCli} /></F>
                </div>

                <div style={{ background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
                  <div>
                    <p style={{ fontSize: '0.72rem', color: '#3b82f6', fontWeight: 600 }}>CIF base aranceles cliente</p>
                    <p style={{ fontSize: '0.65rem', color: '#93c5fd' }}>FOB dec. {usd(c.fobDC)} + Flete {usd(c.fleteC)} + Seguro {usd(c.segC)}</p>
                  </div>
                  <p style={{ fontSize: '1.2rem', fontWeight: 800, color: '#2563eb' }}>{usd(c.cifC)}</p>
                </div>
              </div>
            )}

            {/* MIS COSTOS REALES */}
            {tab === 'real_fob' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '1rem', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.05em' }}>FOB & costos reales</p>
                  </div>
                  <button onClick={usarPreset} style={{ padding: '0.32rem 0.7rem', borderRadius: '50px', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#059669', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}>Usar valores del preset</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '0.75rem' }}>
                    <label style={{ ...LBL, color: '#065f46' }}>FOB Real</label>
                    <NI value={fobReal} onChange={setFobReal} />
                  </div>
                  <div style={{ background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '0.75rem' }}>
                    <label style={{ ...LBL, color: '#065f46' }}>FOB Declarado real</label>
                    <NI value={fobDecReal} onChange={setFobDecReal} placeholder="= FOB real si no difiere" />
                  </div>
                </div>

                <p style={SECL}>Línea aérea destino & gastos aeroportuarios (real)</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <F label="Tarifa USD/kg (real)"><NI value={tarifaReal} onChange={setTarifaReal} placeholder={p.tarifaKg !== null ? String(p.tarifaKg) : '0'} /></F>
                  <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '0.5rem 0.7rem', alignSelf: 'end' }}>
                    <p style={{ fontSize: '0.62rem', color: '#94a3b8' }}>Flete real</p>
                    <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#059669' }}>{usd(c.fleteR)}</p>
                  </div>
                  <F label="AWB real"><NI value={awbReal} onChange={setAwbReal} /></F>
                  <F label="Handling real"><NI value={handReal} onChange={setHandReal} /></F>
                  <F label="Terminal aérea real"><NI value={terReal} onChange={setTerReal} /></F>
                  <F label="Despachante real"><NI value={desReal} onChange={setDesReal} /></F>
                  <F label="Transporte real"><NI value={traReal} onChange={setTraReal} /></F>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
                  <div>
                    <p style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>CIF declarado real</p>
                    <p style={{ fontSize: '0.65rem', color: '#6ee7b7' }}>FOB dec. {usd(c.fobDR)} + Flete {usd(c.fleteR)} + Seguro {usd(c.segR)}</p>
                  </div>
                  <p style={{ fontSize: '1.2rem', fontWeight: 800, color: '#059669' }}>{usd(c.cifR)}</p>
                </div>
              </div>
            )}

            {/* ARANCELES — same logic as maritimo */}
            {tab === 'aranceles' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.5rem' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Configuración arancelaria</p>
                </div>
                <p style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.85rem', fontStyle: 'italic' }}>Misma lógica que importación marítima — CIF = FOB declarado + Flete + Seguro 1%.</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
                  <F label="Derechos de Importación %">
                    <input type="number" inputMode="decimal" step="any" min="0" value={pDer} onChange={e => setPDer(parseFloat(e.target.value) || 0)} style={INP} />
                  </F>
                  <F label="Tasa Estadística %">
                    <input type="number" inputMode="decimal" step="any" min="0" value={pTas} onChange={e => setPTas(parseFloat(e.target.value) || 0)} style={INP} />
                  </F>
                </div>

                <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.65rem' }}>¿Cuáles de estos impuestos pagás realmente vos? Afecta solo el cálculo de tus costos reales.</p>

                <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '0.75rem 1rem', border: '1px solid #f1f5f9' }}>
                  {[
                    ['IVA %', pIva, setPIva, pagaIva, setPagaIva],
                    ['IVA Adicional %', pIvaA, setPIvaA, pagaIvaA, setPagaIvaA],
                    ['Perc. Ganancias %', pGan, setPGan, pagaGan, setPagaGan],
                    ['Perc. IIBB %', pIIBB, setPIIBB, pagaIIBB, setPagaIIBB],
                  ].map(([lbl, val, setVal, paga, setPaga]) => (
                    <div key={lbl} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'end', marginBottom: '0.6rem' }}>
                      <F label={lbl}>
                        <input type="number" inputMode="decimal" step="any" min="0" value={val} onChange={e => setVal(parseFloat(e.target.value) || 0)} style={INP} />
                      </F>
                      <div style={{ paddingBottom: '0.75rem' }}>
                        <PagaToggle label="¿Lo pagás?" checked={paga} onChange={setPaga} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.75rem' }}>
                  {[['Base IVA cliente', c.bivC, '#eff6ff', '#2563eb'], ['Base IVA real', c.bivR, '#f0fdf4', '#059669']].map(([l, v, bg, color]) => (
                    <div key={l} style={{ background: bg, borderRadius: '8px', padding: '0.6rem 0.8rem' }}>
                      <p style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.15rem' }}>{l}</p>
                      <p style={{ fontSize: '0.95rem', fontWeight: 700, color }}>{usd(v)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CIERRE */}
            {tab === 'cierre' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '1rem' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5"><path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/></svg>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5b21b6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Honorarios & cierre</p>
                </div>

                <div style={{ marginBottom: '1rem', background: usaSociedadPropia ? '#f0fdf4' : '#eff6ff', borderRadius: '12px', padding: '0.85rem 1rem', border: `1px solid ${usaSociedadPropia ? '#bbf7d0' : '#bfdbfe'}` }}>
                  <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>¿Qué sociedad usa el cliente para importar?</p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => setUsaSociedadPropia(true)} style={{ flex: 1, padding: '0.6rem 0.75rem', borderRadius: '10px', border: `2px solid ${usaSociedadPropia ? '#059669' : '#e2e8f0'}`, cursor: 'pointer', background: usaSociedadPropia ? '#dcfce7' : '#fff', textAlign: 'left' }}>
                      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: usaSociedadPropia ? '#059669' : '#64748b', marginBottom: '0.15rem' }}>{usaSociedadPropia ? '✓ ' : ''}Sociedad propia del cliente</p>
                      <p style={{ fontSize: '0.65rem', color: usaSociedadPropia ? '#059669' : '#94a3b8' }}>Sin gastos de facturación</p>
                    </button>
                    <button onClick={() => setUsaSociedadPropia(false)} style={{ flex: 1, padding: '0.6rem 0.75rem', borderRadius: '10px', border: `2px solid ${!usaSociedadPropia ? '#2563eb' : '#e2e8f0'}`, cursor: 'pointer', background: !usaSociedadPropia ? '#eff6ff' : '#fff', textAlign: 'left' }}>
                      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: !usaSociedadPropia ? '#2563eb' : '#64748b', marginBottom: '0.15rem' }}>{!usaSociedadPropia ? '✓ ' : ''}Sociedad de Transtide</p>
                      <p style={{ fontSize: '0.65rem', color: !usaSociedadPropia ? '#2563eb' : '#94a3b8' }}>Se suman gastos de facturación</p>
                    </button>
                  </div>
                </div>

                <F label={`Honorarios % (s/ costo CON IVA)`}>
                  <input type="number" inputMode="decimal" step="any" min="0" value={pHon} onChange={e => setPHon(parseFloat(e.target.value) || 0)} style={INP} />
                </F>
                {!usaSociedadPropia && (
                  <F label={`Gastos de Facturación % — sociedad Transtide`}>
                    <input type="number" inputMode="decimal" step="any" min="0" value={pFac} onChange={e => setPFac(parseFloat(e.target.value) || 0)} style={INP} />
                  </F>
                )}

                <div style={{ background: '#faf5ff', borderRadius: '10px', padding: '1rem', border: '1px solid #e9d5ff', marginTop: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '0.38rem 0', borderBottom: '1px solid #f3e8ff', color: '#475569' }}><span>Costo Total CON IVA</span><span>{usd(c.totConC)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '0.38rem 0', borderBottom: '1px solid #f3e8ff', color: '#475569' }}><span>+ Honorarios ({pHon}%)</span><span>{usd(c.honorarios)}</span></div>
                  {!usaSociedadPropia && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '0.38rem 0', borderBottom: '1px solid #f3e8ff', color: '#7c3aed' }}><span>+ Gastos de Facturación ({pFac}%)</span><span>{usd(c.gastFac)}</span></div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.55rem 0', fontWeight: 700, color: '#7c3aed' }}><span>= Precio final</span><span>{usd(c.precioConF)}</span></div>
                </div>
              </div>
            )}

          </Card>
        </div>

        {/* RIGHT: results */}
        <div className="cot-right-rail" style={{ position: 'sticky', top: '1rem', maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          <Card>
            <p style={{ ...SECL, margin: '0 0 0.7rem' }}>Precio final al cliente</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', padding: '0.4rem 0.7rem', background: usaSociedadPropia ? '#f0fdf4' : '#eff6ff', borderRadius: '8px', border: `1px solid ${usaSociedadPropia ? '#bbf7d0' : '#bfdbfe'}` }}>
              <span style={{ fontSize: '0.75rem' }}>{usaSociedadPropia ? '🏢' : '🔵'}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: usaSociedadPropia ? '#059669' : '#2563eb' }}>
                {usaSociedadPropia ? 'Sociedad propia — sin gastos de facturación' : 'Sociedad Transtide — incluye gastos de facturación'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: usaSociedadPropia ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '1rem' }}>
                <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>{usaSociedadPropia ? 'Precio final' : 'CON Factura'}</p>
                <p style={{ fontSize: '1.45rem', fontWeight: 800, color: '#10b981', lineHeight: 1 }}>{usd(c.precioConF)}</p>
                <p style={{ fontSize: '0.7rem', color: '#6ee7b7', marginTop: '0.2rem' }}>Hon. {usd(c.honorarios)}{!usaSociedadPropia ? ` + Fac. ${usd(c.gastFac)}` : ''}</p>
              </div>
              {!usaSociedadPropia && (
                <div style={{ background: '#fefce8', borderRadius: '12px', padding: '1rem' }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>SIN Factura</p>
                  <p style={{ fontSize: '1.45rem', fontWeight: 800, color: '#d97706', lineHeight: 1 }}>{usd(c.precioSinF)}</p>
                  <p style={{ fontSize: '0.7rem', color: '#fcd34d', marginTop: '0.2rem' }}>Ahorro del cliente: {usd(c.gastFac)}</p>
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.6rem' }}>
              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '0.6rem 0.75rem' }}>
                <p style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Costo total CON IVA</p>
                <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{usd(c.totConC)}</p>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '0.6rem 0.75rem' }}>
                <p style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Costo total SIN IVA</p>
                <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#64748b' }}>{usd(c.totSinC)}</p>
              </div>
            </div>
            <div style={{ background: '#fff7ed', borderRadius: '8px', padding: '0.45rem 0.75rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: '#92400e' }}>Chargeable · Flete cobrado</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#d97706' }}>{chargeable.toFixed(2)} kg · {usd(c.fleteC)}</span>
            </div>
          </Card>

          <Card>
            <p style={{ ...SECL, margin: '0 0 0.7rem' }}>Rentabilidad</p>
            {[
              ['Margen FOB', c.mFOB],
              ['Margen Flete', c.mFlet],
              ['Margen Aranceles', c.mAranc],
              ['Margen Gastos Aeroportuarios', c.mGas],
              ['Honorarios', c.honorarios],
            ].map(([lbl, val]) => {
              const pctFob = c.fobR > 0 ? ((val / c.fobR) * 100).toFixed(1) + '%' : '';
              const barW = c.ganTotal > 0 ? Math.max(0, Math.min(100, (val / c.ganTotal) * 100)) : 0;
              return (
                <div key={lbl} style={{ marginBottom: '0.55rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.18rem' }}>
                    <span style={{ fontSize: '0.82rem', color: '#475569' }}>{lbl}</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: val >= 0 ? '#10b981' : '#ef4444' }}>
                      {usd(val)} {pctFob && <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 400 }}>({pctFob})</span>}
                    </span>
                  </div>
                  <div style={{ height: '3px', background: '#f1f5f9', borderRadius: '99px' }}>
                    <div style={{ height: '100%', width: `${barW}%`, background: val >= 0 ? '#10b981' : '#ef4444', borderRadius: '99px' }} />
                  </div>
                </div>
              );
            })}
            <div style={{ borderTop: '2px solid #1e293b', marginTop: '0.75rem', paddingTop: '0.7rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700 }}>Ganancia total</span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: c.ganTotal >= 0 ? '#10b981' : '#ef4444' }}>{usd(c.ganTotal)}</div>
                {c.fobR > 0 && <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{((c.ganTotal / c.fobR) * 100).toFixed(1)}% s/ FOB real</div>}
              </div>
            </div>
          </Card>

          <Card>
            <p style={{ ...SECL, margin: '0 0 0.5rem' }}>Detalle: Real vs Cobrado al cliente</p>
            <div className="cot-detalle-header" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', fontSize: '0.68rem', fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
              <span>Concepto</span><span style={{ textAlign: 'right' }}>Costo real</span><span style={{ textAlign: 'right' }}>Cobro</span><span className="cot-detalle-margen" style={{ textAlign: 'right' }}>Margen</span>
            </div>
            {[
              ['FOB Mercadería', c.fobR, c.fobC, c.mFOB],
              ['FOB Declarado', c.fobDR, c.fobDC, null],
              ['Flete aéreo', c.fleteR, c.fleteC, c.mFlet],
              ['Seguro', c.segR, c.segC, c.segC - c.segR],
              ['Derechos', c.derR, c.derC, c.mDer],
              ['Tasa Estadística', c.tasR, c.tasC, c.mTas],
              ['IVA', c.ivaR, c.ivaC, c.mIva],
              ['IVA Adicional', c.ivaAR, c.ivaAC, c.mIvaA],
              ['Perc. Ganancias', c.ganR, c.ganC, c.mGan],
              ['Perc. IIBB', c.iibbR, c.iibbC, c.mIIBB],
              ['AWB', c.awbRv, c.awbCv, c.mAwb],
              ['Handling', c.handRv, c.handCv, c.mHand],
              ['Terminal aérea', c.terRv, c.terCv, c.mTer],
              ['Despachante', c.desRv, c.desCv, c.mDes],
              ['Transporte interno', c.traRv, c.traCv, c.mTra],
            ].map(([lbl, real, cobro, diff]) => (
              <div key={lbl} className="cot-detalle-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '0.3rem 0', borderBottom: '1px solid #f8fafc', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#475569' }}>{lbl}</span>
                <span style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'right' }}>{usd(real)}</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#1e293b', textAlign: 'right' }}>{usd(cobro)}</span>
                <span className="cot-detalle-margen" style={{ fontSize: '0.75rem', fontWeight: 700, textAlign: 'right', color: diff === null ? '#cbd5e1' : diff > 0 ? '#10b981' : diff < 0 ? '#ef4444' : '#94a3b8' }}>
                  {diff === null ? '—' : (diff > 0 ? '+' : '') + (usd(diff))}
                </span>
              </div>
            ))}
            <div className="cot-detalle-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '0.5rem 0.25rem', background: '#f0f7ff', borderRadius: '8px', marginTop: '0.4rem', fontWeight: 700, fontSize: '0.85rem' }}>
              <span style={{ color: '#1e293b' }}>TOTAL</span>
              <span style={{ textAlign: 'right', color: '#64748b' }}>{usd(c.totConR)}</span>
              <span style={{ textAlign: 'right', color: '#2563eb' }}>{usd(c.totConC)}</span>
              <span className="cot-detalle-margen" style={{ textAlign: 'right', color: c.ganTotal >= 0 ? '#10b981' : '#ef4444' }}>{c.ganTotal >= 0 ? '+' : ''}{usd(c.ganTotal)}</span>
            </div>
          </Card>

        </div>
      </div>

      {/* MODAL: vista cliente */}
      {showClienteView && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowClienteView(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.2rem 1.5rem', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: '#fff', borderRadius: '20px 20px 0 0', zIndex: 10 }}>
              <div>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.1rem' }}>Vista previa</p>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Cotización Aérea al Cliente</h3>
              </div>
              <button onClick={() => setShowClienteView(false)} style={{ width: '36px', height: '36px', borderRadius: '50%', border: 'none', cursor: 'pointer', background: '#f1f5f9', color: '#64748b', fontSize: '1.1rem' }}>×</button>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.2rem' }}>
                <div>
                  <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#2563eb', letterSpacing: '-0.02em' }}>TRANSTIDE FREIGHT</p>
                  <p style={{ fontSize: '0.73rem', color: '#94a3b8' }}>Gestión Logística & Importaciones</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Fecha de cotización</p>
                  <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>{new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                </div>
              </div>
              <div style={{ background: '#2563eb', borderRadius: '12px', padding: '1rem 1.2rem', marginBottom: '1.2rem' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fff', letterSpacing: '0.01em' }}>COTIZACIÓN DE IMPORTACIÓN AÉREA</p>
                {cliente && <p style={{ fontSize: '0.8rem', color: '#bfdbfe', marginTop: '3px' }}>Cliente: <strong style={{ color: '#fff' }}>{cliente}</strong></p>}
                <p style={{ fontSize: '0.72rem', color: '#bfdbfe', marginTop: '4px' }}>{p.label} · Tránsito {p.transit} · Chargeable {chargeable.toFixed(2)} kg</p>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '1rem' }}>
                <div style={{ padding: '6px 12px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}><span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Base de la Importación</span></div>
                {[
                  ['Valor de Mercadería (FOB Declarado)', usd(c.fobDC)],
                  [`Flete Aéreo (${chargeable.toFixed(2)} kg × $${n(tarifaCli).toFixed(2)}/kg)`, usd(c.fleteC)],
                  ['Seguro (1% FOB)', usd(c.segC)],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid #f8fafc', fontSize: '0.83rem', color: '#374151' }}>
                    <span>{l}</span><span>{v}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #e2e8f0', fontSize: '0.88rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff' }}>
                  <span>CIF — Base Arancelaria</span><span>{usd(c.cifC)}</span>
                </div>
                <div style={{ padding: '6px 12px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }}><span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Aranceles Aduaneros</span></div>
                {[
                  [`Derechos de Importación (${pDer}%)`, usd(c.derC)],
                  ...(pTas > 0 ? [[`Tasa Estadística (${pTas}%)`, usd(c.tasC)]] : []),
                  [`IVA (${pIva}%)`, usd(c.ivaC)],
                  ...(c.ivaAC > 0 ? [[`IVA Adicional (${pIvaA}%)`, usd(c.ivaAC)]] : []),
                  ...(c.ganC > 0 ? [[`Percepción Ganancias (${pGan}%)`, usd(c.ganC)]] : []),
                  ...(c.iibbC > 0 ? [[`Percepción IIBB (${pIIBB}%)`, usd(c.iibbC)]] : []),
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid #f8fafc', fontSize: '0.83rem', color: '#374151' }}>
                    <span>{l}</span><span>{v}</span>
                  </div>
                ))}
                {c.gasC > 0 && (<>
                  <div style={{ padding: '6px 12px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }}><span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Gastos Aeroportuarios</span></div>
                  {[['AWB', c.awbCv], ['Handling', c.handCv], ['Terminal aérea', c.terCv], ['Despachante', c.desCv], ['Transporte interno', c.traCv]].filter(([,v]) => v > 0).map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid #f8fafc', fontSize: '0.83rem', color: '#374151' }}>
                      <span>{l}</span><span>{usd(v)}</span>
                    </div>
                  ))}
                </>)}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: usaSociedadPropia ? '1fr' : '1fr 1fr', gap: '0.75rem', marginBottom: '1.2rem' }}>
                <div style={{ background: '#065f46', borderRadius: '12px', padding: '1.1rem 1.2rem' }}>
                  <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>{usaSociedadPropia ? 'Precio Final' : 'Precio Final CON Factura'}</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{usd(c.precioConF)}</p>
                </div>
                {!usaSociedadPropia && (
                  <div style={{ background: '#78350f', borderRadius: '12px', padding: '1.1rem 1.2rem' }}>
                    <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#fcd34d', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Precio Final SIN Factura</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{usd(c.precioSinF)}</p>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
                <p style={{ fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.6 }}>
                  * Cotización aérea expresada en USD. Chargeable weight = max(peso real, peso volumétrico). Validez: 7 días hábiles.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── tab switcher + default export ────────────────────────────────────────────
function CotizadorInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialMode = searchParams.get('modo') === 'aereo' ? 'aereo' : 'maritimo';
  const [mode, setMode] = useState(initialMode);

  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (mode === 'aereo') params.set('modo', 'aereo'); else params.delete('modo');
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <>
      <div style={{ display: 'flex', gap: 4, padding: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, marginBottom: '1.25rem', width: 'fit-content', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
        {[
          { id: 'maritimo', icon: <ShipIcon />, label: 'Marítimo' },
          { id: 'aereo', icon: <PlaneIcon />, label: 'Aéreo' },
        ].map(t => (
          <button key={t.id} onClick={() => setMode(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.6rem 1.2rem', borderRadius: 9, border: 'none', cursor: 'pointer',
            fontSize: '0.85rem', fontWeight: 700, transition: 'all 0.15s',
            background: mode === t.id ? '#0f172a' : 'transparent',
            color: mode === t.id ? '#fff' : '#64748b',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Both mounted to preserve state on toggle */}
      <div style={{ display: mode === 'maritimo' ? 'block' : 'none' }}>
        <CotizadorMaritimo />
      </div>
      <div style={{ display: mode === 'aereo' ? 'block' : 'none' }}>
        <CotizadorAereo />
      </div>
    </>
  );
}

export default function Cotizador() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: '#94a3b8' }}>Cargando cotizador…</div>}>
      <CotizadorInner />
    </Suspense>
  );
}
