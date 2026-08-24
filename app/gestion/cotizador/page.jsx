'use client';
import { useState, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import ImportDialog from './import-dialog';
import { gToast } from '../toast';

// ─── helpers ──────────────────────────────────────────────────────────────────
const usd = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return '$ ' + (Math.round(n * 100) / 100).toLocaleString('es-AR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
};
const n = (v) => parseFloat(v) || 0;

// Camino principal de impresión: pestaña dedicada /gestion/print. El documento
// viaja por localStorage y se imprime LIMPIO (sin el layout de la app, sin
// iframes ocultos que los navegadores imprimen en blanco). La pestaña trae su
// propia barra con "Imprimir / Guardar PDF", así el usuario siempre ve el
// documento y tiene un botón que funciona, pase lo que pase con el auto-print.
function printHTML(html) {
  try {
    const toolbar = `<div class="__no_print__" style="position:fixed;top:0;left:0;right:0;background:#0f172a;color:#fff;padding:10px 16px;display:flex;gap:12px;align-items:center;z-index:9999;font-family:system-ui,sans-serif"><b style="font-size:14px">Vista de impresión — Transtide</b><button onclick="window.print()" style="margin-left:auto;background:#2563eb;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer;font-size:14px">🖨 Imprimir / Guardar PDF</button></div><style>@media print{.__no_print__{display:none!important}}@media screen{body{margin-top:52px}}</style>`
    const docHtml = html.includes('</body>') ? html.replace('</body>', toolbar + '</body>') : html + toolbar
    localStorage.setItem('__ttf_print_html__', docHtml)
    const w = window.open('/print', '_blank')
    if (w) return
    // popup bloqueado → fallback en la misma página
  } catch {}
  printInPage(html)
}

// Fallback: imprime dentro del propio documento (hoja + body.cot-printing).
// Los navegadores
// modernos (Brave/Chrome/Safari) bloquean o imprimen en blanco los iframes 0x0.
// En su lugar se monta el contenido como "hoja" dentro del propio documento y se
// imprime la ventana principal; el CSS de gestion.css (body.cot-printing) hace que
// en la impresión se vea SOLO la hoja. Mismo patrón que el estado de cuenta.
function printInPage(html) {
  try {
    // El HTML llega como documento completo: extraer estilos + contenido del body.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Scopear reglas globales (body, *) a la hoja para no pisar la app mientras está montada.
    const css = [...doc.querySelectorAll('style')]
      .map(s => s.textContent || '')
      .join('\n')
      .replace(/(^|\})(\s*)body(\s*\{)/g, '$1$2.cot-print-sheet$3')
      .replace(/(^|\})(\s*)\*(\s*\{)/g, '$1$2.cot-print-sheet *$3');

    const prevSheet = document.getElementById('__print_sheet__');
    if (prevSheet) { try { prevSheet.remove(); } catch {} }
    const prevCss = document.getElementById('__print_sheet_css__');
    if (prevCss) { try { prevCss.remove(); } catch {} }

    const styleEl = document.createElement('style');
    styleEl.id = '__print_sheet_css__';
    styleEl.textContent = css;
    const sheet = document.createElement('div');
    sheet.id = '__print_sheet__';
    sheet.className = 'cot-print-sheet';
    sheet.innerHTML = doc.body ? doc.body.innerHTML : html;

    document.head.appendChild(styleEl);
    document.body.appendChild(sheet);
    document.body.classList.add('cot-printing');

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.body.classList.remove('cot-printing');
      try { sheet.remove(); } catch {}
      try { styleEl.remove(); } catch {}
      window.removeEventListener('afterprint', cleanup);
    };
    // afterprint dispara al cerrar el diálogo (también en Safari); red de seguridad a los 60s.
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 60000);

    setTimeout(() => { window.focus(); window.print(); }, 150);
  } catch (e) {
    console.error('print failed', e);
    gToast.error('No se pudo abrir la impresión. Probá de nuevo o usá Cmd/Ctrl+P.');
  }
}

// ─── documento imprimible de cotización ──────────────────────────────────────
// UN SOLO generador para marítimo y aéreo: A4 apaisado, dos columnas y paleta de
// marca. Todo cambio de formato aplica a los dos cotizadores a la vez — no
// duplicar plantillas (el aéreo había quedado con un formato propio).
const qFmt = (v) => '$ ' + (Math.round((parseFloat(v) || 0) * 100) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Los % vienen del estado del form y pueden ser STRING (una cotización guardada
// los restaura como texto): parsear siempre antes de formatear.
const qPct = (v) => (parseFloat(v) || 0).toFixed(1) + '%';

function qRow(label, val, opts = {}) {
  const bg = opts.highlight ? '#fff4ee' : 'transparent';
  const size = opts.bold ? '0.9' : '0.84';
  const weight = opts.bold ? 700 : opts.semibold ? 600 : 400;
  return `<tr style="background:${bg};">
    <td style="padding:7px 12px;font-size:${size}rem;font-weight:${weight};color:${opts.sub ? '#64748b' : opts.bold ? '#1e293b' : '#374151'};border-bottom:1px solid #f1f5f9;">${label}</td>
    <td style="padding:7px 12px;text-align:right;font-size:${size}rem;font-weight:${weight};color:${opts.sub ? '#64748b' : opts.bold ? '#1e293b' : '#374151'};border-bottom:1px solid #f1f5f9;">${val}</td>
  </tr>`;
}

// Sección con título acentuado; se omite entera si no tiene filas visibles.
function qSection(title, rows) {
  const filas = (rows || []).filter(Boolean).join('');
  if (!filas) return '';
  const divider = `<tr><td colspan="2" style="padding:10px 12px 5px;font-size:0.65rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #e2e8f0;"><span style="border-left:3px solid #ea580c;padding-left:8px;">${title}</span></td></tr>`;
  return `<table class="sec" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:12px;">${divider}${filas}</table>`;
}

function buildQuoteHTML({ titulo, cliente, fecha, subtitulo, descripcion, clasificacion, izq, der, precio, footer }) {
  const cols = (arr) => (arr || []).filter(Boolean).join('');
  const chipTxt = [
    descripcion ? `<strong style="color:#9a3412;font-size:0.72rem;">Descripción:</strong> ${descripcion}` : '',
    clasificacion ? `<strong style="color:#9a3412;font-size:0.72rem;">Posición arancelaria:</strong> ${clasificacion}` : '',
    subtitulo ? `<strong style="color:#9a3412;font-size:0.72rem;">Servicio:</strong> ${subtitulo}` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  const banda = precio.unico
    ? `<tr><td style="padding:14px 20px;background:#0f172a;border-radius:10px;">
         <div style="font-size:0.65rem;font-weight:700;color:#fb923c;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Precio Final</div>
         <div style="font-size:1.5rem;font-weight:800;color:#ffffff;line-height:1;">${qFmt(precio.conFactura)}</div>
         <div style="font-size:0.7rem;color:#94a3b8;margin-top:4px;">Honorarios ${qFmt(precio.honorarios)} incluidos</div>
       </td></tr>`
    : `<tr>
         <td style="padding:14px 20px;background:#0f172a;border-radius:10px 0 0 10px;width:50%;">
           <div style="font-size:0.65rem;font-weight:700;color:#fb923c;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Precio Final CON Factura</div>
           <div style="font-size:1.5rem;font-weight:800;color:#ffffff;line-height:1;">${qFmt(precio.conFactura)}</div>
           <div style="font-size:0.7rem;color:#94a3b8;margin-top:4px;">Hon. ${qFmt(precio.honorarios)} + Gs.Fac. ${qFmt(precio.gastFac)}</div>
         </td>
         <td style="width:8px;"></td>
         <td style="padding:14px 20px;background:#ea580c;border-radius:0 10px 10px 0;width:50%;">
           <div style="font-size:0.65rem;font-weight:700;color:#ffedd5;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Precio Final SIN Factura</div>
           <div style="font-size:1.5rem;font-weight:800;color:#ffffff;line-height:1;">${qFmt(precio.sinFactura)}</div>
           <div style="font-size:0.7rem;color:#ffedd5;margin-top:4px;">Ahorro para el cliente: ${qFmt(precio.gastFac)}</div>
         </td>
       </tr>`;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>${titulo} - ${cliente || 'Cliente'}</title>
    <style>
      @page { margin: 10mm 14mm; size: A4 landscape; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; }
      .page { max-width: 1060px; margin: 0 auto; }
      table { width: 100%; border-collapse: collapse; }
      .sec { break-inside: avoid; page-break-inside: avoid; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
    <div class="page">

      <table class="sec" style="margin-bottom:12px;">
        <tr>
          <td style="width:28%;">
            <img src="/images/transtide-logo-full.png" alt="Transtide Freight" style="height:36px;width:auto;display:block;" />
            <div style="font-size:0.68rem;color:#94a3b8;margin-top:3px;">Gestión Logística &amp; Importaciones</div>
          </td>
          <td style="text-align:center;">
            <div style="display:inline-block;background:#0f172a;border-radius:8px;padding:8px 22px;">
              <span style="font-size:0.95rem;font-weight:800;color:#fff;">${titulo}</span>${cliente ? `<span style="font-size:0.85rem;color:#94a3b8;"> · <strong style="color:#fb923c;">${cliente}</strong></span>` : ''}
            </div>
          </td>
          <td style="width:16%;text-align:right;vertical-align:top;">
            <div style="font-size:0.68rem;color:#94a3b8;">Fecha de cotización</div>
            <div style="font-size:0.85rem;font-weight:600;color:#475569;">${fecha}</div>
          </td>
        </tr>
      </table>

      ${chipTxt ? `<div class="sec" style="background:#fff4ee;border:1px solid #fed7aa;border-radius:8px;padding:7px 14px;margin-bottom:12px;font-size:0.78rem;color:#1e293b;">${chipTxt}</div>` : ''}

      <table style="margin-bottom:12px;"><tr>
        <td style="width:49.5%;vertical-align:top;">${cols(izq)}</td>
        <td style="width:1%;"></td>
        <td style="width:49.5%;vertical-align:top;">${cols(der)}</td>
      </tr></table>

      <table class="sec" style="margin-bottom:10px;border-radius:10px;overflow:hidden;">${banda}</table>

      <div class="sec" style="border-top:1px solid #e2e8f0;padding-top:8px;">
        <p style="font-size:0.66rem;color:#94a3b8;line-height:1.45;">${footer}</p>
      </div>
    </div>
    </body></html>`;
}

// Leyenda legal — misma cobertura en marítimo y aéreo; el aéreo suma chargeable.
const LEYENDA_BASE = 'Los valores se calculan sobre la base de tarifas, tipo de cambio y normativa vigentes a la fecha de emisión, y el importe definitivo se confirmará al momento del despacho, pudiendo variar según: (i) el tipo de cambio oficial al momento del despacho; (ii) el flete internacional, cuya tarifa puede ajustarse hasta la fecha efectiva de embarque; (iii) actualizaciones arancelarias, impositivas o normativas; (iv) condiciones del proveedor en origen; y (v) contingencias operativas o aduaneras ajenas a Transtide, tales como asignación de canal rojo o naranja, verificaciones físicas, escaneos, almacenajes, estadías o demoras. De producirse alguna de estas variaciones, la diferencia se trasladará al costo final, con la documentación respaldatoria correspondiente. La presente cotización no constituye una oferta en firme, tiene validez de 7 días hábiles desde su emisión y comprende únicamente los conceptos aquí detallados; todo servicio no incluido se cotiza por separado.';
const LEYENDA_MAR = '* Cotización de carácter estimativo y no final, expresada en dólares estadounidenses (USD). ' + LEYENDA_BASE;
const LEYENDA_AER = '* Cotización aérea de carácter estimativo y no final, expresada en dólares estadounidenses (USD). Chargeable weight = máx(peso real, peso volumétrico). ' + LEYENDA_BASE;


// ─── estados (saved quotes) ─────────────────────────────────────────────────────
const ESTADOS = [
  { id: 'borrador',    label: 'Borrador',       fg: '#64748b', bg: '#f1f5f9' },
  { id: 'enviada',     label: 'Enviada',        fg: '#0284c7', bg: '#eff6ff' },
  { id: 'negociacion', label: 'En negociación', fg: '#d97706', bg: '#fffbeb' },
  { id: 'aprobada',    label: 'Aprobada',       fg: '#059669', bg: '#f0fdf4' },
  { id: 'rechazada',   label: 'Rechazada',      fg: '#dc2626', bg: '#fef2f2' },
];
const estadoMeta = (id) => ESTADOS.find(e => e.id === id) || ESTADOS[0];

// ─── save-quote modal (shared) ──────────────────────────────────────────────────
function SaveQuoteModal({ modo, defaultCliente, getPayload, ncmPayload = null, loadedQuote = null, onSaved, onClose }) {
  const [nombre, setNombre]   = useState(loadedQuote?.nombre || defaultCliente || '');
  const [cliente, setCliente] = useState(loadedQuote?.cliente || defaultCliente || '');
  const [estado, setEstado]   = useState(loadedQuote?.estado || 'borrador');
  const [notas, setNotas]     = useState(loadedQuote?.notas || '');
  const [saving, setSaving]   = useState(false);
  const [done, setDone]       = useState('');   // '' | 'nueva' | 'actualizada'
  const [err, setErr]         = useState('');

  // asNew=true → siempre crea (POST). asNew=false → actualiza la cargada si existe (PUT).
  const save = async (asNew) => {
    if (!nombre.trim()) { setErr('La referencia es obligatoria.'); return; }
    setSaving(true); setErr('');
    try {
      const extra = getPayload();
      const body = { nombre: nombre.trim(), cliente: cliente.trim(), estado, notas, modo, ...extra };
      const updating = !asNew && loadedQuote?.id;
      const res = await fetch(updating ? `/api/db/cotizaciones/${loadedQuote.id}` : '/api/db/cotizaciones', {
        method: updating ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Error al guardar');
      const j = await res.json().catch(() => ({}));
      const savedId = updating ? loadedQuote.id : (j.id || null);
      // Best-effort: upsert la NCM a la biblioteca. Nunca bloquea el guardado.
      if (ncmPayload) {
        try {
          const np = ncmPayload();
          if (np) {
            await fetch('/api/db/ncm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(np),
            }).catch(() => {});
          }
        } catch {}
      }
      // Enlaza el editor a la cotización guardada para que el próximo "Guardar" la actualice.
      if (onSaved && savedId) onSaved({ id: savedId, nombre: nombre.trim(), cliente: cliente.trim(), estado, notas });
      setDone(updating ? 'actualizada' : 'nueva');
      setTimeout(onClose, 900);
    } catch (e) {
      setErr(e.message || 'Error al guardar');
      setSaving(false);
    }
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div style={{ background: '#fff', borderRadius: '18px', width: '100%', maxWidth: '440px', boxShadow: '0 25px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.1rem 1.4rem', borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Guardar cotización</h3>
            {loadedQuote?.id && <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>Editando «{loadedQuote.nombre}»</p>}
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', cursor: 'pointer', background: '#f1f5f9', color: '#64748b', fontSize: '1.1rem' }}>×</button>
        </div>
        {done ? (
          <div style={{ padding: '2.5rem 1.4rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem' }}>✓</div>
            <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#059669', marginTop: '0.4rem' }}>{done === 'actualizada' ? 'Actualizada' : 'Guardada'}</p>
          </div>
        ) : (
          <div style={{ padding: '1.3rem 1.4rem' }}>
            <F label="Nombre / referencia *"><TI value={nombre} onChange={setNombre} placeholder="Ej: Importación máquinas — Acme" /></F>
            <F label="Cliente"><TI value={cliente} onChange={setCliente} placeholder="Nombre del cliente" /></F>
            <F label="Estado">
              <select value={estado} onChange={e => setEstado(e.target.value)} style={INP}>
                {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </F>
            <F label="Notas">
              <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" rows={3} style={{ ...INP, resize: 'vertical', fontFamily: 'inherit' }} />
            </F>
            {err && <p style={{ fontSize: '0.78rem', color: '#dc2626', marginBottom: '0.6rem' }}>{err}</p>}
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={onClose} style={{ padding: '0.55rem 1.1rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              {loadedQuote?.id ? (
                <>
                  <button onClick={() => save(true)} disabled={saving} title="Crea una cotización nueva sin tocar la anterior" style={{ padding: '0.55rem 1.1rem', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 700, fontSize: '0.82rem', cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Guardando…' : 'Guardar como nueva'}</button>
                  <button onClick={() => save(false)} disabled={saving} title={`Sobrescribe «${loadedQuote.nombre}»`} style={{ padding: '0.55rem 1.3rem', borderRadius: '10px', border: 'none', background: saving ? '#94a3b8' : '#0f172a', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Guardando…' : 'Actualizar la anterior'}</button>
                </>
              ) : (
                <button onClick={() => save(true)} disabled={saving} style={{ padding: '0.55rem 1.3rem', borderRadius: '10px', border: 'none', background: saving ? '#94a3b8' : '#0f172a', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Guardando…' : 'Guardar'}</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── "guardar cotización" header button ─────────────────────────────────────────
function SaveQuoteButton({ onClick }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 1.1rem', borderRadius: '50px', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, background: '#fff', color: '#334155' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      Guardar cotización
    </button>
  );
}

// ─── NCM picker (compact selector, used in both cotizadores) ────────────────────
// Aplica una NCM guardada: setea código, descripción (solo si la guardada no está vacía)
// y todas las tasas tal cual están almacenadas (strings crudos).
function applyNcm(n, setters) {
  if (!n) return;
  const { setClasificacion, setDescripcion, setPDer, setPTas, setPIva, setPIvaA, setPGan, setPIIBB } = setters;
  setClasificacion(n.codigo || '');
  if (n.producto) setDescripcion(n.producto);
  setPDer(n.der || '');
  setPTas(n.tasa || '');
  setPIva(n.iva || '');
  setPIvaA(n.iva_adic || '');
  setPGan(n.ganancias || '');
  setPIIBB(n.iibb || '');
}

function NcmPicker({ ncmList, onPick }) {
  return (
    <select
      value=""
      onChange={e => {
        const sel = ncmList.find(x => String(x.id) === e.target.value);
        if (sel) onPick(sel);
      }}
      style={{ ...INP, cursor: 'pointer', background: '#f8fafc' }}
    >
      <option value="">— Elegir NCM guardada —</option>
      {ncmList.map(n => (
        <option key={n.id} value={n.id}>{n.codigo}{n.producto ? ` — ${n.producto}` : ''}</option>
      ))}
    </select>
  );
}

// ─── container presets ────────────────────────────────────────────────────────
const PRESETS = {
  '20': { label: '20 Pies', m3: 30, flete: 3500, despachante: 2000, terminal: 2300, naviera: 800, logistica: 2150 },
  '40hq': { label: '40 Pies / HQ', m3: 60, flete: 4500, despachante: 2000, terminal: 2300, naviera: 800, logistica: 2150 },
  'fr': { label: 'Flat Rack', m3: null, flete: 6000, despachante: 2200, terminal: 2500, naviera: 900, logistica: 2150 },
};

// ─── small UI primitives ──────────────────────────────────────────────────────
// Escala compacta: etiquetas e inputs más bajos, números tabulares, headers finos.
const LBL = { display: 'block', fontSize: '0.68rem', fontWeight: 600, color: '#64748b', marginBottom: '0.2rem', letterSpacing: 0 };
const INP = { width: '100%', padding: '0.38rem 0.6rem', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '0.82rem', color: '#1e293b', background: '#fff', outline: 'none', fontVariantNumeric: 'tabular-nums' };
const SECL = { fontSize: '0.74rem', fontWeight: 700, letterSpacing: 0, color: '#334155', margin: '0.6rem 0 0.45rem', paddingBottom: '0.3rem', borderBottom: '1px solid #f1f5f9' };

function F({ label, children, half }) {
  return (
    <div style={{ marginBottom: '0.5rem', ...(half ? {} : {}) }}>
      {label && <label style={LBL}>{label}</label>}
      {children}
    </div>
  );
}
function NI({ value, onChange, placeholder = '0' }) {
  // onWheel→blur: evita que la ruedita del mouse cambie montos sin querer al scrollear.
  return <input type="number" inputMode="decimal" step="any" min="0" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} onWheel={e => e.currentTarget.blur()} style={INP} />;
}
function TI({ value, onChange, placeholder = '' }) {
  return <input type="text" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} style={INP} />;
}
// Cascada de composición del costo: barra 100% apilada + leyenda con valor y %.
// Muestra de un vistazo qué domina el costo (FOB vs flete vs aranceles vs gastos).
function CostStack({ segments, total, totalLabel }) {
  const segs = segments.filter(s => s && s.value > 0);
  const sum = segs.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', border: '1px solid #e8ecf1', marginBottom: '0.65rem' }}>
        {segs.map((s, i) => (
          <div key={i} title={`${s.label}: ${usd(s.value)}`} style={{ width: `${(s.value / sum) * 100}%`, background: s.color }} />
        ))}
        {segs.length === 0 && <div style={{ width: '100%', background: '#f1f5f9' }} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
        {segs.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#475569' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, flexShrink: 0 }} />{s.label}
            </span>
            <span style={{ fontWeight: 600, color: '#1e293b', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {usd(s.value)} <span style={{ color: '#cbd5e1', fontSize: '0.66rem', fontWeight: 400 }}>{Math.round((s.value / sum) * 100)}%</span>
            </span>
          </div>
        ))}
        {total != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e8ecf1', marginTop: '0.35rem', paddingTop: '0.45rem', fontWeight: 800, fontSize: '0.85rem' }}>
            <span>{totalLabel}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(total)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Chip del resumen pegajoso (siempre visible arriba mientras se cargan los datos).
function SummaryChip({ label, val, color = '#1e293b', bg = '#fff', border = '#e8ecf1' }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: '9px', padding: '0.4rem 0.7rem', minWidth: 0 }}>
      <p style={{ fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</p>
      <p style={{ fontSize: '1rem', fontWeight: 800, color, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{val}</p>
    </div>
  );
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
    <button onClick={onClick} style={{ padding: '0.45rem 1rem', borderRadius: '50px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, transition: 'all 0.15s', background: active ? '#0f172a' : 'transparent', color: active ? '#fff' : '#94a3b8' }}>
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
function Card({ children, style = {}, className }) {
  return <div className={className} style={{ background: '#fff', borderRadius: '16px', padding: '1.2rem', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.03)', ...style }}>{children}</div>;
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

// ─── aéreo: conversión IATA volumétrica ──────────────────────────────────────
// 1 m³ ≈ 167 kg volumétrico (estándar IATA para carga general)
const KG_PER_M3 = 167;

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
    setContCosts(prev => ({ ...prev, [type]: { ...prev[type], [field]: val } }));
  const setM3 = (type, val) =>
    setContM3(prev => ({ ...prev, [type]: val }));

  const curM3 = contM3[contType];
  const curCosts = contCosts[contType];

  // ── identification ──
  const [cliente, setCliente] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [clasificacion, setClasificacion] = useState('');

  // ── clientes (autocomplete) ──
  const [clientesList, setClientesList] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/db/clientes');
        if (!r.ok) throw new Error('failed');
        const data = await r.json();
        if (!cancelled) setClientesList(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setClientesList([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── NCM library (picker + autocomplete) ──
  const [ncmList, setNcmList] = useState([]);
  useEffect(() => {
    fetch('/api/db/ncm').then(r => r.ok ? r.json() : []).then(d => setNcmList(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // ── LADO CLIENTE ──
  const [fobCliente, setFobCliente] = useState('');       // lo que cobro por la mercadería
  const [fobDecCli, setFobDecCli] = useState('');         // lo que le digo que voy a declarar
  const [fleteCli, setFleteCli] = useState('');           // flete cobrado
  const [gDes, setGDes] = useState('');                   // gastos locales cobrados
  const [gTer, setGTer] = useState('');
  const [gNav, setGNav] = useState('');
  const [gLog, setGLog] = useState('');
  const [markup, setMarkup] = useState('');               // markup % opcional para derivar lo que cobrás

  // ── LADO REAL ──
  const [fobReal, setFobReal] = useState('');             // lo que me costó a mí
  const [fobDecReal, setFobDecReal] = useState('');       // lo que realmente declaro
  const [fleteRealInput, setFleteRealInput] = useState(''); // si está vacío, se calcula del prorrateo
  const [m3Merch, setM3Merch] = useState('');             // m³ de mi mercadería en el contenedor

  // ── ARANCELES ──
  const [pDer, setPDer] = useState(35);
  const [pTas, setPTas] = useState(0);
  const [pIva, setPIva] = useState(21);    const [pagaIva, setPagaIva] = useState(true);
  const [pIvaA, setPIvaA] = useState(20);  const [pagaIvaA, setPagaIvaA] = useState(true);
  const [pGan, setPGan] = useState(6);     const [pagaGan, setPagaGan] = useState(true);
  const [pIIBB, setPIIBB] = useState(2.5); const [pagaIIBB, setPagaIIBB] = useState(true);

  // ── CIERRE ──
  const [pHon, setPHon] = useState(4);
  const [pHonMin, setPHonMin] = useState(500); // piso de honorarios en USD; vacío/0 = sin mínimo
  const [pFac, setPFac] = useState(8);
  const [pMrg, setPMrg] = useState(20); // solo modo personal

  // ── SOCIEDAD ──
  const [usaSociedadPropia, setUsaSociedadPropia] = useState(false); // true = cliente usa su propia sociedad

  // ── UI ──
  const [showClienteView, setShowClienteView] = useState(false);
  const [showSave, setShowSave] = useState(false);
  // Cotización cargada desde "guardadas" (para poder actualizarla en vez de duplicar).
  const [loadedQuote, setLoadedQuote] = useState(null);

  // ── serialize / restore (saved quotes) ──
  const serialize = () => ({
    mode, // 'cliente' | 'personal' — para reactivar con el formato elegido
    contType, contM3, contCosts, cliente, descripcion, clasificacion,
    fobCliente, fobDecCli, fleteCli, gDes, gTer, gNav, gLog,
    fobReal, fobDecReal, fleteRealInput, m3Merch,
    pDer, pTas, pIva, pagaIva, pIvaA, pagaIvaA, pGan, pagaGan, pIIBB, pagaIIBB,
    pHon, pHonMin, pFac, pMrg, usaSociedadPropia,
    arancelToggles: 'v2', // v2: percepciones con toggle afectan cobro Y costo real
  });

  useEffect(() => {
    const handler = (e) => {
      if (!e.detail || e.detail.mode !== 'maritimo') return;
      setLoadedQuote(e.detail.meta || null);
      const d = e.detail.data || {};
      if (d.mode === 'cliente' || d.mode === 'personal') {
        setMode(d.mode);
        setTab(d.mode === 'cliente' ? 'cliente_fob' : 'real_fob');
      }
      if (d.contType !== undefined) setContType(d.contType);
      if (d.contM3 !== undefined) setContM3(d.contM3);
      if (d.contCosts !== undefined) setContCosts(d.contCosts);
      if (d.cliente !== undefined) setCliente(d.cliente);
      if (d.descripcion !== undefined) setDescripcion(d.descripcion);
      if (d.clasificacion !== undefined) setClasificacion(d.clasificacion);
      if (d.fobCliente !== undefined) setFobCliente(d.fobCliente);
      if (d.fobDecCli !== undefined) setFobDecCli(d.fobDecCli);
      if (d.fleteCli !== undefined) setFleteCli(d.fleteCli);
      if (d.gDes !== undefined) setGDes(d.gDes);
      if (d.gTer !== undefined) setGTer(d.gTer);
      if (d.gNav !== undefined) setGNav(d.gNav);
      if (d.gLog !== undefined) setGLog(d.gLog);
      if (d.fobReal !== undefined) setFobReal(d.fobReal);
      if (d.fobDecReal !== undefined) setFobDecReal(d.fobDecReal);
      if (d.fleteRealInput !== undefined) setFleteRealInput(d.fleteRealInput);
      if (d.m3Merch !== undefined) setM3Merch(d.m3Merch);
      if (d.pDer !== undefined) setPDer(d.pDer);
      if (d.pTas !== undefined) setPTas(d.pTas);
      if (d.pIva !== undefined) setPIva(d.pIva);
      if (d.pagaIva !== undefined) setPagaIva(d.pagaIva);
      if (d.pIvaA !== undefined) setPIvaA(d.pIvaA);
      // Migración pre-v2: el cliente pagaba toda percepción con % > 0 (el toggle
      // solo tocaba el costo real) — restaurar "aplica" preserva el precio guardado.
      if (d.pagaIvaA !== undefined) setPagaIvaA(d.arancelToggles === 'v2' ? d.pagaIvaA : (d.pagaIvaA || n(d.pIvaA) > 0));
      if (d.pGan !== undefined) setPGan(d.pGan);
      if (d.pagaGan !== undefined) setPagaGan(d.arancelToggles === 'v2' ? d.pagaGan : (d.pagaGan || n(d.pGan) > 0));
      if (d.pIIBB !== undefined) setPIIBB(d.pIIBB);
      if (d.pagaIIBB !== undefined) setPagaIIBB(d.arancelToggles === 'v2' ? d.pagaIIBB : (d.pagaIIBB || n(d.pIIBB) > 0));
      if (d.pHon !== undefined) setPHon(d.pHon);
      // Cotizaciones guardadas ANTES del mínimo: sin pHonMin → '' (no cambia el número guardado).
      setPHonMin(d.pHonMin !== undefined ? d.pHonMin : '');
      if (d.pFac !== undefined) setPFac(d.pFac);
      if (d.pMrg !== undefined) setPMrg(d.pMrg);
      if (d.usaSociedadPropia !== undefined) setUsaSociedadPropia(d.usaSociedadPropia);
    };
    window.addEventListener('cotizador:load', handler);
    return () => window.removeEventListener('cotizador:load', handler);
  }, []);

  // ── AI import event listener ──
  useEffect(() => {
    const handler = (e) => {
      if (!e.detail || e.detail.mode !== 'maritimo') return;
      setLoadedQuote(e.detail.meta || null);
      const d = e.detail.data || {};
      if (d.proveedor) setCliente(d.proveedor);
      const desc = [
        d.notas,
        d.items && d.items.length
          ? `Items: ${d.items.slice(0, 5).map((it) => it.descripcion).filter(Boolean).join(', ')}${d.items.length > 5 ? '…' : ''}`
          : null,
      ].filter(Boolean).join(' — ');
      if (desc) setDescripcion(desc);
      if (d.total_m3 != null) setM3Merch(String(d.total_m3));
      if (d.total_fob != null) {
        setFobCliente(String(d.total_fob));
        setFobReal(String(d.total_fob));
      }
    };
    window.addEventListener('cotizador:apply', handler);
    return () => window.removeEventListener('cotizador:apply', handler);
  }, []);

  // ─── calculations ─────────────────────────────────────────────────────────
  const c = useMemo(() => {
    const der = pDer / 100, tas = pTas / 100, iva = pIva / 100,
          ivaA = pIvaA / 100, gan = pGan / 100, iibb = pIIBB / 100,
          hon = pHon / 100, fac = pFac / 100, mrg = pMrg / 100;

    const fobC  = n(fobCliente);
    const fobDC = n(fobDecCli) || fobC;       // FOB declarado al cliente (base aranceles cliente)
    const fobR  = n(fobReal);
    // La aduana cobra sobre lo DECLARADO: sin una base declarada real distinta,
    // hereda la declarada al cliente (evita márgenes arancelarios fantasma).
    const fobDR = n(fobDecReal) || n(fobDecCli) || fobR;

    const m3val = n(m3Merch);
    const ratio = m3val > 0 && curM3 > 0 ? m3val / curM3 : 0;
    const fleteR = n(fleteRealInput) || (curCosts.flete * ratio);

    // ── LADO CLIENTE ──
    const segC   = fobDC * 0.01;
    const cifC   = fobDC + n(fleteCli) + segC;
    const derC   = cifC * der;
    const tasC   = cifC * tas;
    const bivC   = cifC + derC + tasC;
    const ivaC   = bivC * iva; // IVA siempre aplica
    // Percepciones: si aplican, juegan en las DOS puntas (cobro y costo real).
    const ivaAC  = pagaIvaA ? bivC * ivaA : 0;
    const ganC   = pagaGan  ? bivC * gan  : 0;
    const iibbC  = pagaIIBB ? bivC * iibb : 0;
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
    const ivaR   = bivR * iva; // IVA siempre se paga
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
    // Honorarios = máx(% sobre costo, mínimo USD): el mínimo cubre el trabajo fijo
    // de una importación chica; el % gana a partir del punto de cruce.
    const honPct  = totConC * hon;
    const honMinV = n(pHonMin);
    const honMinAplica = totConC > 0 && honMinV > honPct;
    const honorarios = honMinAplica ? honMinV : honPct;
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
    // Con sociedad del cliente los aranceles los paga él directamente:
    // no existe margen arancelario para Transtide.
    const mArancEff = usaSociedadPropia ? 0 : mAranc;
    const ganTotal = mFOB + mFlet + mArancEff + mGas + honorarios;

    // ── modo personal ──
    // El IVA del import es crédito fiscal recuperable → NO es costo real.
    // El margen se aplica sobre el costo SIN IVA; al vender se suma el IVA.
    const ventaNeta      = totSinR * (1 + mrg);          // precio de venta sin IVA
    const gananciaNeta   = totSinR * mrg;                // = ventaNeta - costo sin IVA
    const ivaVentaMonto  = ventaNeta * iva;              // IVA que cargás en la venta (pIva)
    const precioVentaFinal = ventaNeta * (1 + iva);      // precio final con IVA
    const precioVenta    = precioVentaFinal;             // alias (compat)

    return {
      fobC, fobDC, fobR, fobDR,
      segC, cifC, derC, tasC, bivC, ivaC, ivaAC, ganC, iibbC, arcC,
      desC, terC, navC, logC, gasC, totConC, totSinC,
      fleteR, segR, cifR, derR, tasR, bivR, ivaR, ivaAR, ganR, iibbR,
      desR, terR, navR, logR, gasR, totConR, totSinR,
      honorarios, honMinAplica, gastFac, precioConF, precioSinF,
      mFOB, mFlet, mDer, mTas, mIva, mIvaA, mGan, mIIBB, mAranc, mArancEff, mGas, ganTotal,
      precioVenta, ventaNeta, gananciaNeta, ivaVentaMonto, precioVentaFinal,
      ratio, curM3,
    };
  }, [
    fobCliente, fobDecCli, fleteCli, gDes, gTer, gNav, gLog,
    fobReal, fobDecReal, fleteRealInput, m3Merch,
    pDer, pTas, pIva, pagaIva, pIvaA, pagaIvaA, pGan, pagaGan, pIIBB, pagaIIBB,
    pHon, pHonMin, pFac, pMrg, usaSociedadPropia, curM3, curCosts,
  ]);

  // ─── tabs per mode ────────────────────────────────────────────────────────
  const tabs = mode === 'cliente'
    ? [['cliente_fob','Cotización cliente'],['real_fob','Mis costos reales'],['aranceles','Aranceles'],['cierre','Cierre']]
    : [['real_fob','Mis costos'],['aranceles','Aranceles'],['venta','Precio de venta']];

  // reset tab when switching mode
  // Impo personal = SIEMPRE con sociedad Transtide.
  const switchMode = (m) => { setMode(m); setTab(m === 'cliente' ? 'cliente_fob' : 'real_fob'); if (m === 'personal') setUsaSociedadPropia(false); };

  // ─── print client quote ───────────────────────────────────────────────────
  const printClienteQuote = () => {
    try {
      const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const html = buildQuoteHTML({
        titulo: 'COTIZACIÓN DE IMPORTACIÓN',
        cliente, fecha: today, descripcion, clasificacion,
        izq: [
          qSection('Base de la Importación', [
            qRow('Valor de Mercadería (FOB Declarado)', qFmt(c.fobDC)),
            qRow('Flete Internacional', qFmt(n(fleteCli))),
            qRow('Seguro Marítimo (1% FOB)', qFmt(c.segC)),
            qRow('CIF — Base Arancelaria', qFmt(c.cifC), { bold: true, highlight: true }),
          ]),
          qSection('Gastos Locales', [
            c.desC > 0 ? qRow('Despachante de Aduana', qFmt(c.desC)) : '',
            c.terC > 0 ? qRow('Terminal Portuaria', qFmt(c.terC)) : '',
            c.navC > 0 ? qRow('Naviera', qFmt(c.navC)) : '',
            c.logC > 0 ? qRow('Logística Interna', qFmt(c.logC)) : '',
          ]),
        ],
        der: [
          qSection('Aranceles Aduaneros', [
            qRow(`Derechos de Importación (${qPct(pDer)})`, qFmt(c.derC)),
            n(pTas) > 0 ? qRow(`Tasa Estadística (${qPct(pTas)})`, qFmt(c.tasC)) : '',
            qRow('Base IVA', qFmt(c.bivC), { sub: true }),
            qRow(`IVA (${qPct(pIva)})`, qFmt(c.ivaC)),
            c.ivaAC > 0 ? qRow(`IVA Adicional (${qPct(pIvaA)})`, qFmt(c.ivaAC)) : '',
            c.ganC > 0 ? qRow(`Percepción Ganancias (${qPct(pGan)})`, qFmt(c.ganC)) : '',
            c.iibbC > 0 ? qRow(`Percepción IIBB (${qPct(pIIBB)})`, qFmt(c.iibbC)) : '',
          ]),
          qSection('Totales', [
            qRow('Costo Total CON IVA', qFmt(c.totConC), { bold: true }),
            qRow('Costo Total SIN IVA', qFmt(c.totSinC), { sub: true }),
            qRow(c.honMinAplica ? 'Honorarios del Servicio' : `Honorarios del Servicio (${qPct(pHon)})`, qFmt(c.honorarios)),
            c.gastFac > 0 ? qRow(`Gastos de Facturación (${qPct(pFac)})`, qFmt(c.gastFac), { sub: true }) : '',
          ]),
        ],
        precio: {
          unico: usaSociedadPropia, // con sociedad del cliente no hay gastos de facturación
          conFactura: c.precioConF, sinFactura: c.precioSinF,
          honorarios: c.honorarios, gastFac: c.gastFac,
        },
        footer: LEYENDA_MAR,
      });
      printHTML(html);
    } catch (e) {
      console.error('print build failed', e);
      gToast.error('No se pudo armar el documento: ' + (e.message || e));
    }
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={{ paddingBottom: '3rem' }}>

      {/* ══ HEADER (modo + acciones, una sola fila) ═══════════════════════════ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: '50px', padding: '4px', gap: '2px' }}>
          <Pill active={mode === 'cliente'} onClick={() => switchMode('cliente')}>Para Cliente</Pill>
          <Pill active={mode === 'personal'} onClick={() => switchMode('personal')}>Importación Personal</Pill>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <SaveQuoteButton onClick={() => setShowSave(true)} />
          {mode === 'cliente' && (
            <button onClick={() => setShowClienteView(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 1.1rem', borderRadius: '50px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, background: '#0f172a', color: '#fff' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Ver cotización al cliente
            </button>
          )}
        </div>
      </div>

      {/* ══ RESUMEN PEGAJOSO ══════════════════════════════════════════════════ */}
      <div style={{ position: 'sticky', top: 0, zIndex: 30, marginBottom: '0.85rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, background: 'rgba(248,250,252,0.94)', backdropFilter: 'blur(6px)', padding: '0.45rem', borderRadius: 12, border: '1px solid #e8ecf1' }}>
          {mode === 'personal' ? (<>
            <SummaryChip label="Costo real (sin IVA)" val={usd(c.totSinR)} />
            <SummaryChip label={`Ganancia neta (${pMrg}%)`} val={usd(c.gananciaNeta)} color="#16a34a" />
            <SummaryChip label="Precio venta final" val={usd(c.precioVentaFinal)} color="#0f172a" />
          </>) : (<>
            <SummaryChip label="Costo real" val={usd(c.totConR)} />
            <SummaryChip label="A cobrar al cliente" val={usd(c.totConC)} color="#0f172a" />
            <SummaryChip label="Margen / ganancia" val={usd(c.ganTotal)} color="#16a34a" />
          </>)}
        </div>
      </div>

      {/* ══ MAIN GRID — 2 columnas: datos (izq) · números (der, fijo) ═══════════ */}
      <div className="cot-main-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 400px', gap: '1.1rem', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 }}>

      {/* fila superior: Contenedor (izq, angosto) + Identificación (der) */}
      <div className="cot-top-row" style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '0.75rem', alignItems: 'start' }}>

      {/* ── Contenedor + Mi carga (primera tarjeta de datos) ── */}
      <Card style={{ padding: '0.85rem 1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>

          {/* controles: contenedor + m³ mercadería + ratio en una sola fila */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.25rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px', minWidth: 220 }}>
              <label style={LBL}>Contenedor</label>
              <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '10px', padding: '3px', gap: '2px' }}>
                {Object.entries(PRESETS).map(([key, p]) => {
                  const on = contType === key;
                  return (
                    <button key={key} onClick={() => setContType(key)} style={{ flex: 1, padding: '0.45rem 0.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.73rem', fontWeight: on ? 700 : 500, transition: 'all 0.15s', background: on ? '#fff' : 'transparent', color: on ? '#1d4ed8' : '#64748b', boxShadow: on ? '0 1px 2px rgba(15,23,42,0.10)' : 'none' }}>
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label style={LBL}>M³ de mi mercadería</label>
              <input type="number" inputMode="decimal" step="any" min="0" placeholder="0" value={m3Merch} onChange={e => setM3Merch(e.target.value)} onWheel={e => e.currentTarget.blur()} style={{ ...INP, width: '120px' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: '0.45rem' }}>
              <span style={{ fontSize: '0.62rem', color: '#94a3b8' }}>Ratio de prorrateo</span>
              <span style={{ fontSize: '0.95rem', fontWeight: 800, color: c.ratio > 0 ? '#2563eb' : '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{c.ratio.toFixed(3)}</span>
              <span style={{ fontSize: '0.62rem', color: '#cbd5e1' }}>({n(m3Merch)}/{c.curM3} m³)</span>
            </div>
          </div>

          {/* ajustar contenedor: m³ contenedor + costos de referencia (colapsado) */}
          <details className="cot-collapse">
            <summary style={{ ...SECL, margin: '0 0 0.3rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="cot-chev" style={{ fontSize: '0.7rem', color: '#94a3b8' }}>▸</span> Ajustar contenedor y costos de referencia</span>
              <span style={{ fontSize: '0.6rem', color: '#94a3b8', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>{PRESETS[contType]?.label} · {contM3[contType]}m³</span>
            </summary>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.85rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
              <div>
                <label style={{ ...LBL, fontSize: '0.6rem' }}>M³ del contenedor</label>
                <input type="number" inputMode="decimal" step="any" min="1" value={contM3[contType]} onChange={e => setM3(contType, e.target.value)} onWheel={e => e.currentTarget.blur()} style={{ ...INP, width: '100px' }} />
              </div>
              {[['Flete','flete'],['Despachante','despachante'],['Terminal','terminal'],['Naviera','naviera'],['Logística','logistica']].map(([label, key]) => (
                <div key={key}>
                  <label style={{ ...LBL, fontSize: '0.6rem' }}>{label}</label>
                  <input type="number" inputMode="decimal" step="any" min="0" value={contCosts[contType][key]} onChange={e => setCost(contType, key, e.target.value)} onWheel={e => e.currentTarget.blur()} style={{ ...INP, width: '100px' }} />
                </div>
              ))}
            </div>
          </details>

          {/* charges table — a todo el ancho. La columna "lo que cobrás" solo aplica para cliente */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
              <div className="cot-charges-header" style={{ display: 'grid', gridTemplateColumns: mode === 'cliente' ? '1fr 1fr 1.4fr' : '1fr 1.2fr', background: '#f8fafc', padding: '0.32rem 0.85rem', borderBottom: '1px solid #e2e8f0', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0 }}>Concepto</span>
                <span className="cot-charges-prorated" style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0, textAlign: 'right' }}>Tu costo prorrateado</span>
                {mode === 'cliente' && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0, textAlign: 'right' }}>Lo que cobrás al cliente</span>}
              </div>
              {[
                ['Flete', c.fleteR, fleteCli, setFleteCli],
                ['Despachante', c.desR, gDes, setGDes],
                ['Terminal', c.terR, gTer, setGTer],
                ['Naviera', c.navR, gNav, setGNav],
                ['Logística', c.logR, gLog, setGLog],
              ].map(([label, prorated, val, setVal], i, arr) => (
                <div key={label} className="cot-charges-row" style={{ display: 'grid', gridTemplateColumns: mode === 'cliente' ? '1fr 1fr 1.4fr' : '1fr 1.2fr', alignItems: 'center', padding: '0.22rem 0.85rem', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>{label}</span>
                  <span className="cot-charges-prorated" style={{ fontSize: '0.8rem', color: c.ratio > 0 ? '#1e293b' : '#cbd5e1', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(prorated)}</span>
                  {mode === 'cliente' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginLeft: 'auto', width: '120px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '0.2rem 0.55rem' }}>
                      <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>$</span>
                      <input type="number" inputMode="decimal" step="any" min="0" placeholder="0" value={val} onChange={e => setVal(e.target.value)} onWheel={e => e.currentTarget.blur()} style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', textAlign: 'right', fontSize: '0.8rem', color: '#1e293b', fontVariantNumeric: 'tabular-nums', padding: 0 }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
      </Card>

          {/* identification */}
          <Card style={{ padding: '1rem 1.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.55rem' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', letterSpacing: 0 }}>Identificación del embarque</p>
            </div>
            {/* NCM primero: elegir una guardada autocompleta posición + las 6 alícuotas de un saque */}
            {ncmList.length > 0 && (
              <F label="NCM guardada (autocompleta posición y aranceles)">
                <NcmPicker ncmList={ncmList} onPick={(nc) => applyNcm(nc, { setClasificacion, setDescripcion, setPDer, setPTas, setPIva, setPIvaA, setPGan, setPIIBB })} />
              </F>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
              <F label={mode === 'cliente' ? 'Cliente' : 'Cliente / Referencia'}>
                <input type="text" list="clientes-list-mar" value={cliente} onChange={e => setCliente(e.target.value)} placeholder={mode === 'cliente' ? 'Nombre del cliente' : 'Referencia de la importación'} style={INP} />
                <datalist id="clientes-list-mar">
                  {clientesList.map(cl => <option key={cl.id} value={cl.nombre} />)}
                </datalist>
              </F>
              <F label="Posición arancelaria">
                <input type="text" list="ncm-codes-mar" value={clasificacion} onChange={e => setClasificacion(e.target.value)} placeholder="8456.11.00" style={INP} />
                <datalist id="ncm-codes-mar">
                  {ncmList.map(nc => <option key={nc.id} value={nc.codigo}>{nc.producto}</option>)}
                </datalist>
              </F>
            </div>
            <F label="Descripción de la mercadería"><TI value={descripcion} onChange={setDescripcion} placeholder="Ej: Máquinas cortadoras láser 1000W" /></F>

            {/* FOB — acá abajo de la identificación para compactar (sin markup) */}
            <div style={{ marginTop: '0.7rem', paddingTop: '0.7rem', borderTop: '1px solid #eef2f7' }}>
              <div style={{ display: 'grid', gridTemplateColumns: mode === 'cliente' ? '1fr 1fr' : '1fr', gap: '0.6rem' }}>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '0.55rem 0.75rem' }}>
                  <label style={{ ...LBL, color: '#065f46' }}>FOB real (lo que pagás)</label>
                  <NI value={fobReal} onChange={setFobReal} />
                </div>
                {mode === 'cliente' && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '0.55rem 0.75rem' }}>
                    <label style={{ ...LBL, color: '#b45309' }}>FOB cliente (lo que cobrás)</label>
                    <NI value={fobCliente} onChange={setFobCliente} />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem 1.1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                <details className="cot-collapse">
                  <summary style={{ ...SECL, margin: 0, padding: 0, border: 'none', color: '#065f46', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="cot-chev" style={{ fontSize: '0.7rem' }}>▸</span> FOB declarado real (si difiere)
                  </summary>
                  <div style={{ marginTop: '0.35rem' }}><NI value={fobDecReal} onChange={setFobDecReal} placeholder="= FOB real si no difiere" /></div>
                </details>
                {mode === 'cliente' && (
                  <details className="cot-collapse">
                    <summary style={{ ...SECL, margin: 0, padding: 0, border: 'none', color: '#b45309', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="cot-chev" style={{ fontSize: '0.7rem' }}>▸</span> FOB declarado cliente (si difiere)
                    </summary>
                    <div style={{ marginTop: '0.35rem' }}><NI value={fobDecCli} onChange={setFobDecCli} placeholder="= FOB cliente si no difiere" /></div>
                  </details>
                )}
                <details className="cot-collapse">
                  <summary style={{ ...SECL, margin: 0, padding: 0, border: 'none', color: '#065f46', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="cot-chev" style={{ fontSize: '0.7rem' }}>▸</span> Flete real (si difiere del prorrateo)
                  </summary>
                  <div style={{ marginTop: '0.35rem' }}><NI value={fleteRealInput} onChange={setFleteRealInput} placeholder={`auto: ${usd(curCosts.flete * c.ratio)}`} /></div>
                </details>
              </div>
            </div>
          </Card>
      </div>

          {/* secciones de entrada: aranceles (izq) · honorarios/cierre (der) */}
          <Card className="cot-sections-2col" style={{ padding: '0.85rem 1.1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem 1.4rem', alignItems: 'start' }}>

            {/* ── Aranceles ── */}
            {(
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '1rem' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4338ca', letterSpacing: 0 }}>Configuración arancelaria</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
                  <F label="Derechos de Importación %">
                    <input type="number" inputMode="decimal" step="any" min="0" value={pDer} onChange={e => setPDer(e.target.value)} style={INP} />
                  </F>
                  <F label="Tasa Estadística %">
                    <input type="number" inputMode="decimal" step="any" min="0" value={pTas} onChange={e => setPTas(e.target.value)} style={INP} />
                  </F>
                  <F label="IVA %">
                    <input type="number" inputMode="decimal" step="any" min="0" value={pIva} onChange={e => setPIva(e.target.value)} style={INP} />
                  </F>
                </div>

                <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.65rem' }}>Percepciones — ¿aplican en esta importación? Con SÍ se cobran en la cotización y cuentan en el costo real; con NO, en ninguno.</p>

                <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '0.65rem 0.85rem', border: '1px solid #f1f5f9', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 0.9rem' }}>
                  {[
                    ['IVA Adicional %', pIvaA, setPIvaA, pagaIvaA, setPagaIvaA],
                    ['Perc. Ganancias %', pGan, setPGan, pagaGan, setPagaGan],
                    ['Perc. IIBB %', pIIBB, setPIIBB, pagaIIBB, setPagaIIBB],
                  ].map(([lbl, val, setVal, paga, setPaga]) => (
                    <div key={lbl} style={{ minWidth: 0 }}>
                      <label style={{ ...LBL, marginBottom: '0.12rem' }}>{lbl}</label>
                      <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid #e2e8f0', borderRadius: '7px', overflow: 'hidden', background: '#fff', maxWidth: '100%' }}>
                        <input type="number" inputMode="decimal" step="any" min="0" value={val} onChange={e => setVal(e.target.value)} onWheel={e => e.currentTarget.blur()} style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', padding: '0.38rem 0.6rem', fontSize: '0.82rem', color: '#1e293b', fontVariantNumeric: 'tabular-nums' }} />
                        <button onClick={() => setPaga(!paga)} title="¿Aplica en esta importación? Afecta la cotización al cliente y tu costo real" style={{ border: 'none', borderLeft: '1px solid #e2e8f0', padding: '0 0.7rem', cursor: 'pointer', fontSize: '0.66rem', fontWeight: 700, minWidth: '42px', background: paga ? '#ecfdf5' : '#fef2f2', color: paga ? '#059669' : '#dc2626' }}>
                        {paga ? 'SÍ' : 'NO'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Honorarios & cierre ── */}
            {mode === 'cliente' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '1rem' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5"><path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5b21b6', letterSpacing: 0 }}>Honorarios & cierre</p>
                </div>

                {/* ── Toggle: Sociedad ── */}
                <div style={{ marginBottom: '1rem', background: usaSociedadPropia ? '#f0fdf4' : '#eff6ff', borderRadius: '12px', padding: '0.85rem 1rem', border: `1px solid ${usaSociedadPropia ? '#bbf7d0' : '#bfdbfe'}` }}>
                  <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0, marginBottom: '0.5rem' }}>¿Qué sociedad usa el cliente para importar?</p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setUsaSociedadPropia(true)}
                      style={{ flex: 1, padding: '0.6rem 0.75rem', borderRadius: '10px', border: `2px solid ${usaSociedadPropia ? '#059669' : '#e2e8f0'}`, cursor: 'pointer', background: usaSociedadPropia ? '#dcfce7' : '#fff', textAlign: 'left', transition: 'all 0.15s' }}>
                      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: usaSociedadPropia ? '#059669' : '#64748b', marginBottom: '0.15rem' }}>
                        {usaSociedadPropia ? '✓ ' : ''}Sociedad del cliente
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <F label={`Honorarios % (s/ costo CON IVA)`}>
                    <input type="number" inputMode="decimal" step="any" min="0" value={pHon} onChange={e => setPHon(e.target.value)} style={INP} />
                  </F>
                  <F label={`Honorarios mínimos (USD)`}>
                    <input type="number" inputMode="decimal" step="any" min="0" value={pHonMin} onChange={e => setPHonMin(e.target.value)} style={INP} placeholder="Sin mínimo" />
                  </F>
                </div>
                {c.honMinAplica && (
                  <p style={{ fontSize: '0.7rem', color: '#9a3412', background: '#fff4ee', border: '1px solid #fed7aa', borderRadius: '8px', padding: '0.4rem 0.6rem', marginTop: '0.35rem' }}>
                    Aplica el mínimo: {pHon}% = {usd(c.totConC * (n(pHon) / 100))} &lt; {usd(n(pHonMin))}
                  </p>
                )}

                {!usaSociedadPropia && (
                  <F label={`Gastos de Facturación % — sociedad Transtide`}>
                    <input type="number" inputMode="decimal" step="any" min="0" value={pFac} onChange={e => setPFac(e.target.value)} style={INP} />
                  </F>
                )}

                <div style={{ background: '#faf5ff', borderRadius: '10px', padding: '1rem', border: '1px solid #e9d5ff', marginTop: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '0.38rem 0', borderBottom: '1px solid #f3e8ff', color: '#475569' }}>
                    <span>Costo Total CON IVA</span><span>{usd(c.totConC)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '0.38rem 0', borderBottom: '1px solid #f3e8ff', color: '#475569' }}>
                    <span>+ Honorarios ({c.honMinAplica ? 'mín. USD' : `${pHon}%`})</span><span>{usd(c.honorarios)}</span>
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
                      ✓ Sin gastos de facturación — sociedad del cliente
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Precio de venta (personal) ── */}
            {mode === 'personal' && (
              <div>
                <p style={SECL}>Precio de venta estimado</p>
                <F label="Margen de ganancia deseado %">
                  <input type="number" inputMode="decimal" step="any" min="0" value={pMrg} onChange={e => setPMrg(e.target.value)} style={INP} />
                </F>
                <p style={{ fontSize: '0.68rem', color: '#94a3b8', margin: '0 0 0.6rem' }}>El IVA del import es crédito fiscal recuperable: el margen se calcula sobre el costo sin IVA, y el IVA se suma recién al vender.</p>
                <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '1rem', marginTop: '0.2rem' }}>
                  {[
                    ['Costo real (sin IVA)', c.totSinR, false, false],
                    [`+ Margen (${pMrg}%) — ganancia neta`, c.gananciaNeta, false, 'profit'],
                    ['= Precio de venta neto', c.ventaNeta, true, false],
                    [`+ IVA (${pIva}%) sobre la venta`, c.ivaVentaMonto, false, false],
                    ['= Precio de venta final (con IVA)', c.precioVentaFinal, 'final', false],
                  ].map(([lbl, val, emph, kind], i, arr) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: emph === 'final' ? '0.95rem' : '0.85rem', padding: '0.4rem 0', borderBottom: i < arr.length - 1 ? '1px solid #d1fae5' : 'none', fontWeight: emph ? 800 : 400, color: emph === 'final' ? '#059669' : kind === 'profit' ? '#0891b2' : emph ? '#065f46' : '#374151' }}>
                      <span>{lbl}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </Card>
        </div>

        {/* ── resultado: columna de números fija a la derecha ──────────────── */}
        <div className="cot-right-rail" style={{ position: 'sticky', top: '1rem', maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

          {/* ══ MODO CLIENTE ════════════════════════════════════════════════ */}
          {mode === 'cliente' && (<>

            <Card>
              <p style={{ ...SECL, margin: '0 0 0.7rem' }}>Precio final al cliente</p>
              {/* Sociedad badge */}
              <div style={{ marginBottom: '0.75rem', padding: '0.4rem 0.7rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e8ecf1' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b' }}>
                  {usaSociedadPropia ? 'Sociedad del cliente — sin gastos de facturación' : 'Sociedad Transtide — incluye gastos de facturación'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: usaSociedadPropia ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '1rem' }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#059669', letterSpacing: 0, marginBottom: '0.4rem' }}>
                    {usaSociedadPropia ? 'Precio final' : 'CON Factura'}
                  </p>
                  <p style={{ fontSize: '1.45rem', fontWeight: 800, color: '#10b981', lineHeight: 1 }}>{usd(c.precioConF)}</p>
                  <p style={{ fontSize: '0.7rem', color: '#6ee7b7', marginTop: '0.2rem' }}>
                    Hon. {usd(c.honorarios)}{!usaSociedadPropia ? ` + Fac. ${usd(c.gastFac)}` : ''}
                  </p>
                </div>
                {!usaSociedadPropia && (
                  <div style={{ background: '#fefce8', borderRadius: '12px', padding: '1rem' }}>
                    <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#d97706', letterSpacing: 0, marginBottom: '0.4rem' }}>SIN Factura</p>
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

            {/* Cascada: de qué se compone TU costo real (para comparar contra lo que cobrás) */}
            <Card>
              <p style={{ ...SECL, margin: '0 0 0.6rem' }}>¿De qué se compone tu costo?</p>
              <CostStack
                segments={[
                  { label: 'FOB (mercadería)', value: c.fobR, color: '#378ADD' },
                  { label: 'Flete + seguro', value: c.fleteR + c.segR, color: '#1D9E75' },
                  { label: 'Aranceles', value: c.derR + c.tasR + c.ganR + c.iibbR, color: '#BA7517' },
                  { label: 'Gastos locales', value: c.desR + c.terR + c.navR + c.logR, color: '#7F77DD' },
                ]}
                total={c.totSinR}
                totalLabel="Tu costo real (sin IVA)"
              />
            </Card>

            <Card>
              <details className="cot-collapse">
                <summary style={{ ...SECL, margin: '0 0 0.3rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="cot-chev" style={{ fontSize: '0.7rem', color: '#94a3b8' }}>▸</span> Rentabilidad por concepto</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: c.ganTotal >= 0 ? '#10b981' : '#ef4444', textTransform: 'none', letterSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>{usd(c.ganTotal)}</span>
                </summary>
                <div style={{ marginTop: '0.4rem' }}>
                  {[
                    ['Margen FOB', c.mFOB],
                    ['Margen Flete', c.mFlet],
                    [usaSociedadPropia ? 'Margen Aranceles — los paga el cliente (su sociedad)' : 'Margen Aranceles', c.mArancEff],
                    ['Margen Gastos Locales', c.mGas],
                    ['Honorarios', c.honorarios],
                  ].map(([lbl, val]) => {
                    const pctFob = c.fobR > 0 ? ((val / c.fobR) * 100).toFixed(1) + '%' : '';
                    const barW = c.ganTotal > 0 ? Math.max(0, Math.min(100, (val / c.ganTotal) * 100)) : 0;
                    return (
                      <div key={lbl} style={{ marginBottom: '0.55rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.18rem' }}>
                          <span style={{ fontSize: '0.82rem', color: '#475569' }}>{lbl}</span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: val >= 0 ? '#10b981' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
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
                </div>
              </details>
            </Card>

            <Card>
              <details className="cot-collapse">
                <summary style={{ ...SECL, margin: '0 0 0.3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="cot-chev" style={{ fontSize: '0.7rem', color: '#94a3b8' }}>▸</span> Detalle real vs cobrado</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: c.ganTotal >= 0 ? '#10b981' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{usd(c.ganTotal)}</span>
                </summary>
                <div style={{ marginTop: '0.4rem' }}>
              <div className="cot-detalle-header" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', fontSize: '0.68rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '0.35rem' }}>
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
                <span style={{ textAlign: 'right', color: '#0f172a' }}>{usd(c.totConC)}</span>
                <span className="cot-detalle-margen" style={{ textAlign: 'right', color: c.ganTotal >= 0 ? '#10b981' : '#ef4444' }}>{c.ganTotal >= 0 ? '+' : ''}{usd(c.ganTotal)}</span>
              </div>
                </div>
              </details>
            </Card>

          </>)}

          {/* ══ MODO PERSONAL ═══════════════════════════════════════════════ */}
          {mode === 'personal' && (<>

            <Card>
              <p style={{ ...SECL, margin: '0 0 0.7rem' }}>Costo real de importación (sin IVA)</p>
              <p style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>{usd(c.totSinR)}</p>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.3rem' }}>Con IVA pagás {usd(c.totConR)} · el IVA es crédito fiscal recuperable</p>
              {c.ventaNeta > 0 && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                  {/* Ganancia neta */}
                  <div style={{ background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: '8px', padding: '0.5rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0891b2', letterSpacing: 0 }}>Ganancia neta ({pMrg}%)</span>
                    <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0891b2', fontVariantNumeric: 'tabular-nums' }}>{usd(c.gananciaNeta)}</span>
                  </div>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0, marginBottom: '0.15rem' }}>
                    Precio de venta neto (sin IVA)
                  </p>
                  <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669', lineHeight: 1.1 }}>{usd(c.ventaNeta)}</p>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0, margin: '0.6rem 0 0.15rem' }}>
                    Precio de venta final (con IVA {pIva}%)
                  </p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981', lineHeight: 1 }}>{usd(c.precioVentaFinal)}</p>
                  <p style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.2rem' }}>incluye {usd(c.ivaVentaMonto)} de IVA</p>
                </div>
              )}
              <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '0.45rem 0.75rem', marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.72rem', color: '#065f46' }}>FOB declarado · CIF declarado</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#059669' }}>{usd(c.fobDR)} · {usd(c.cifR)}</span>
              </div>
              <div style={{ marginTop: '0.75rem', padding: '0.45rem 0.75rem', background: '#f8fafc', border: '1px solid #e8ecf1', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b' }}>Importación personal — siempre con sociedad Transtide</span>
              </div>
            </Card>

            {/* Cascada: de qué se compone el costo real (sin IVA) */}
            <Card>
              <p style={{ ...SECL, margin: '0 0 0.6rem' }}>¿De qué se compone tu costo?</p>
              <CostStack
                segments={[
                  { label: 'FOB (mercadería)', value: c.fobR, color: '#378ADD' },
                  { label: 'Flete + seguro', value: c.fleteR + c.segR, color: '#1D9E75' },
                  { label: 'Aranceles', value: c.derR + c.tasR + c.ganR + c.iibbR, color: '#BA7517' },
                  { label: 'Gastos locales', value: c.desR + c.terR + c.navR + c.logR, color: '#7F77DD' },
                ]}
                total={c.totSinR}
                totalLabel="Costo real (sin IVA)"
              />
            </Card>

            <Card>
              <details className="cot-collapse">
                <summary style={{ ...SECL, margin: '0 0 0.3rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="cot-chev" style={{ fontSize: '0.7rem', color: '#94a3b8' }}>▸</span>
                  Desglose de costos reales
                </summary>
                <div style={{ marginTop: '0.3rem' }}>
                  <RRow label="FOB Real" val={c.fobR} />
                  <RRow label="Flete prorrateado" val={c.fleteR} />
                  <RRow label="Seguro (1%)" val={c.segR} />
                  <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#cbd5e1', margin: '0.5rem 0 0.25rem' }}>Aranceles pagados</p>
                  <RRow label={`Derechos (${pDer}%)`} val={c.derR} />
                  <RRow label={`Tasa Estadística (${pTas}%)`} val={c.tasR} />
                  <RRow label={`IVA (${pIva}%)`} val={c.ivaR} dimmed={!pagaIva} />
                  <RRow label={`IVA Adicional (${pIvaA}%)`} val={c.ivaAR} dimmed={!pagaIvaA} />
                  <RRow label={`Perc. Ganancias (${pGan}%)`} val={c.ganR} dimmed={!pagaGan} />
                  <RRow label={`Perc. IIBB (${pIIBB}%)`} val={c.iibbR} dimmed={!pagaIIBB} />
                  <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#cbd5e1', margin: '0.5rem 0 0.25rem' }}>Gastos locales</p>
                  <RRow label="Despachante" val={c.desR} />
                  <RRow label="Terminal" val={c.terR} />
                  <RRow label="Naviera" val={c.navR} />
                  <RRow label="Logística Interna" val={c.logR} />
                </div>
              </details>
              <div style={{ borderTop: '2px solid #1e293b', marginTop: '0.6rem', paddingTop: '0.6rem', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700 }}>Total CON IVA</span>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: '#1e293b', fontVariantNumeric: 'tabular-nums' }}>{usd(c.totConR)}</span>
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
                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0, marginBottom: '0.1rem' }}>Vista previa</p>
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
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0 }}>Base de la Importación</span>
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
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0 }}>Aranceles Aduaneros</span>
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
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0 }}>Gastos Locales</span>
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
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0 }}>Resumen</span>
                </div>
                {[
                  ['Costo Total CON IVA', usd(c.totConC), false, true],
                  ['Costo Total SIN IVA', usd(c.totSinC), true, false],
                  [c.honMinAplica ? 'Honorarios del Servicio' : `Honorarios del Servicio (${pHon}%)`, usd(c.honorarios), false, false],
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
                  <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#6ee7b7', letterSpacing: 0, marginBottom: '6px' }}>Precio Final CON Factura</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{usd(c.precioConF)}</p>
                  <p style={{ fontSize: '0.68rem', color: '#6ee7b7', marginTop: '5px' }}>Hon. {usd(c.honorarios)} + Gs.Fac. {usd(c.gastFac)}</p>
                </div>
                <div style={{ background: '#78350f', borderRadius: '12px', padding: '1.1rem 1.2rem' }}>
                  <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#fcd34d', letterSpacing: 0, marginBottom: '6px' }}>Precio Final SIN Factura</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{usd(c.precioSinF)}</p>
                  <p style={{ fontSize: '0.68rem', color: '#fcd34d', marginTop: '5px' }}>Ahorro del cliente: {usd(c.gastFac)}</p>
                </div>
              </div>

              {/* disclaimer */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
                <p style={{ fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.6 }}>
                  * Cotización de carácter estimativo y no final, expresada en USD. Los valores se calculan con tarifas, tipo de cambio y normativa vigentes a la fecha de emisión; el importe definitivo se confirma al momento del despacho y puede variar según el tipo de cambio oficial, el flete internacional (ajustable hasta la fecha efectiva de embarque), actualizaciones arancelarias o normativas, condiciones del proveedor en origen y contingencias aduaneras ajenas a Transtide (canal rojo/naranja, verificaciones, escaneos, almacenajes, estadías o demoras). Las diferencias se trasladan al costo final con documentación respaldatoria. No constituye una oferta en firme. Validez: 7 días hábiles; servicios no incluidos se cotizan por separado.
                </p>
              </div>

            </div>
          </div>
        </div>
      )}

      {showSave && (
        <SaveQuoteModal
          modo="maritimo"
          defaultCliente={cliente}
          getPayload={() => ({
            total_usd: String(Math.round(usaSociedadPropia ? c.precioSinF : c.precioConF)),
            resumen: `FOB ${Math.round(c.fobC)} · ${n(m3Merch)}m³ · USD ${(Math.round((usaSociedadPropia ? c.precioSinF : c.precioConF)) / 1000).toFixed(1)}k final`,
            data: serialize(),
          })}
          ncmPayload={() => clasificacion.trim() ? ({ codigo: clasificacion.trim(), producto: descripcion, der: String(pDer), tasa: String(pTas), iva: String(pIva), iva_adic: String(pIvaA), ganancias: String(pGan), iibb: String(pIIBB) }) : null}
          loadedQuote={loadedQuote}
          onSaved={setLoadedQuote}
          onClose={() => setShowSave(false)}
        />
      )}

    </div>
  );
}

// ─── aéreo component ──────────────────────────────────────────────────────────
function CotizadorAereo() {
  // identification
  const [cliente, setCliente] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [clasificacion, setClasificacion] = useState('');

  // ── clientes (autocomplete) ──
  const [clientesList, setClientesList] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/db/clientes');
        if (!r.ok) throw new Error('failed');
        const data = await r.json();
        if (!cancelled) setClientesList(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setClientesList([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── NCM library (picker + autocomplete) ──
  const [ncmList, setNcmList] = useState([]);
  useEffect(() => {
    fetch('/api/db/ncm').then(r => r.ok ? r.json() : []).then(d => setNcmList(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // carga: el agente nos pasa m³ y peso real, no diferenciamos por bulto
  const [m3Input,  setM3Input]  = useState('');
  const [pesoReal, setPesoReal] = useState('');

  const pesoVol       = n(m3Input) * KG_PER_M3;
  const chargeable    = Math.max(n(pesoReal), pesoVol);
  const usaVolumetrico = pesoVol > n(pesoReal) && pesoVol > 0;

  // lado cliente
  const [fobCliente, setFobCliente] = useState('');
  const [fobDecCli, setFobDecCli] = useState('');
  const [fleteCliInput, setFleteCliInput] = useState('');
  const [awbCli, setAwbCli] = useState('');
  const [handCli, setHandCli] = useState('');
  const [terCli, setTerCli] = useState('');
  const [desCli, setDesCli] = useState('');
  const [traCli, setTraCli] = useState('');

  // lado real
  const [fobReal, setFobReal] = useState('');
  const [fobDecReal, setFobDecReal] = useState('');
  const [fleteRealInput, setFleteRealInput] = useState('');
  const [awbReal, setAwbReal] = useState('');
  const [handReal, setHandReal] = useState('');
  const [terReal, setTerReal] = useState('');
  const [desReal, setDesReal] = useState('');
  const [traReal, setTraReal] = useState('');

  // aranceles
  const [pDer, setPDer] = useState(35);
  const [pTas, setPTas] = useState(0);
  const [pIva, setPIva] = useState(21);    const [pagaIva, setPagaIva] = useState(true);
  const [pIvaA, setPIvaA] = useState(20);  const [pagaIvaA, setPagaIvaA] = useState(true);
  const [pGan, setPGan] = useState(6);     const [pagaGan, setPagaGan] = useState(true);
  const [pIIBB, setPIIBB] = useState(2.5); const [pagaIIBB, setPagaIIBB] = useState(true);

  // cierre
  const [pHon, setPHon] = useState(4);
  const [pHonMin, setPHonMin] = useState(500); // piso de honorarios en USD; vacío/0 = sin mínimo
  const [pFac, setPFac] = useState(8);
  const [pMrg, setPMrg] = useState(20);
  const [usaSociedadPropia, setUsaSociedadPropia] = useState(false);

  // ui
  const [mode, setMode] = useState('cliente'); // 'cliente' | 'personal'
  const [tab, setTab] = useState('cliente_fob');
  // Impo personal = SIEMPRE con sociedad Transtide (la pregunta de sociedad
  // del cliente solo existe cuando cotizás para un cliente).
  const switchMode = (m) => { setMode(m); setTab(m === 'cliente' ? 'cliente_fob' : 'real_fob'); if (m === 'personal') setUsaSociedadPropia(false); };
  const [showClienteView, setShowClienteView] = useState(false);
  const [showSave, setShowSave] = useState(false);
  // Cotización cargada desde "guardadas" (para poder actualizarla en vez de duplicar).
  const [loadedQuote, setLoadedQuote] = useState(null);

  // ── serialize / restore (saved quotes) ──
  const serialize = () => ({
    mode, // 'cliente' | 'personal'
    cliente, descripcion, clasificacion, m3Input, pesoReal,
    fobCliente, fobDecCli, fleteCliInput, awbCli, handCli, terCli, desCli, traCli,
    fobReal, fobDecReal, fleteRealInput, awbReal, handReal, terReal, desReal, traReal,
    pDer, pTas, pIva, pagaIva, pIvaA, pagaIvaA, pGan, pagaGan, pIIBB, pagaIIBB,
    pHon, pHonMin, pFac, pMrg, usaSociedadPropia,
    arancelToggles: 'v2', // v2: percepciones con toggle afectan cobro Y costo real
  });

  useEffect(() => {
    const handler = (e) => {
      if (!e.detail || e.detail.mode !== 'aereo') return;
      setLoadedQuote(e.detail.meta || null);
      const d = e.detail.data || {};
      if (d.mode === 'cliente' || d.mode === 'personal') {
        setMode(d.mode);
        setTab(d.mode === 'cliente' ? 'cliente_fob' : 'real_fob');
      }
      if (d.cliente !== undefined) setCliente(d.cliente);
      if (d.descripcion !== undefined) setDescripcion(d.descripcion);
      if (d.clasificacion !== undefined) setClasificacion(d.clasificacion);
      if (d.m3Input !== undefined) setM3Input(d.m3Input);
      if (d.pesoReal !== undefined) setPesoReal(d.pesoReal);
      if (d.fobCliente !== undefined) setFobCliente(d.fobCliente);
      if (d.fobDecCli !== undefined) setFobDecCli(d.fobDecCli);
      if (d.fleteCliInput !== undefined) setFleteCliInput(d.fleteCliInput);
      if (d.awbCli !== undefined) setAwbCli(d.awbCli);
      if (d.handCli !== undefined) setHandCli(d.handCli);
      if (d.terCli !== undefined) setTerCli(d.terCli);
      if (d.desCli !== undefined) setDesCli(d.desCli);
      if (d.traCli !== undefined) setTraCli(d.traCli);
      if (d.fobReal !== undefined) setFobReal(d.fobReal);
      if (d.fobDecReal !== undefined) setFobDecReal(d.fobDecReal);
      if (d.fleteRealInput !== undefined) setFleteRealInput(d.fleteRealInput);
      if (d.awbReal !== undefined) setAwbReal(d.awbReal);
      if (d.handReal !== undefined) setHandReal(d.handReal);
      if (d.terReal !== undefined) setTerReal(d.terReal);
      if (d.desReal !== undefined) setDesReal(d.desReal);
      if (d.traReal !== undefined) setTraReal(d.traReal);
      if (d.pDer !== undefined) setPDer(d.pDer);
      if (d.pTas !== undefined) setPTas(d.pTas);
      if (d.pIva !== undefined) setPIva(d.pIva);
      if (d.pagaIva !== undefined) setPagaIva(d.pagaIva);
      if (d.pIvaA !== undefined) setPIvaA(d.pIvaA);
      // Migración pre-v2: el cliente pagaba toda percepción con % > 0 (el toggle
      // solo tocaba el costo real) — restaurar "aplica" preserva el precio guardado.
      if (d.pagaIvaA !== undefined) setPagaIvaA(d.arancelToggles === 'v2' ? d.pagaIvaA : (d.pagaIvaA || n(d.pIvaA) > 0));
      if (d.pGan !== undefined) setPGan(d.pGan);
      if (d.pagaGan !== undefined) setPagaGan(d.arancelToggles === 'v2' ? d.pagaGan : (d.pagaGan || n(d.pGan) > 0));
      if (d.pIIBB !== undefined) setPIIBB(d.pIIBB);
      if (d.pagaIIBB !== undefined) setPagaIIBB(d.arancelToggles === 'v2' ? d.pagaIIBB : (d.pagaIIBB || n(d.pIIBB) > 0));
      if (d.pHon !== undefined) setPHon(d.pHon);
      // Cotizaciones guardadas ANTES del mínimo: sin pHonMin → '' (no cambia el número guardado).
      setPHonMin(d.pHonMin !== undefined ? d.pHonMin : '');
      if (d.pFac !== undefined) setPFac(d.pFac);
      if (d.pMrg !== undefined) setPMrg(d.pMrg);
      if (d.usaSociedadPropia !== undefined) setUsaSociedadPropia(d.usaSociedadPropia);
    };
    window.addEventListener('cotizador:load', handler);
    return () => window.removeEventListener('cotizador:load', handler);
  }, []);

  // ── AI import event listener ──
  useEffect(() => {
    const handler = (e) => {
      if (!e.detail || e.detail.mode !== 'aereo') return;
      setLoadedQuote(e.detail.meta || null);
      const d = e.detail.data || {};
      if (d.proveedor) setCliente(d.proveedor);
      const desc = [
        d.notas,
        d.items && d.items.length
          ? `Items: ${d.items.slice(0, 5).map((it) => it.descripcion).filter(Boolean).join(', ')}${d.items.length > 5 ? '…' : ''}`
          : null,
      ].filter(Boolean).join(' — ');
      if (desc) setDescripcion(desc);
      if (d.total_m3 != null) setM3Input(String(d.total_m3));
      if (d.total_kg != null) setPesoReal(String(d.total_kg));
      if (d.total_fob != null) {
        setFobCliente(String(d.total_fob));
        setFobReal(String(d.total_fob));
      }
    };
    window.addEventListener('cotizador:apply', handler);
    return () => window.removeEventListener('cotizador:apply', handler);
  }, []);

  // calc
  const c = useMemo(() => {
    const der = pDer / 100, tas = pTas / 100, iva = pIva / 100,
          ivaA = pIvaA / 100, gan = pGan / 100, iibb = pIIBB / 100,
          hon = pHon / 100, fac = pFac / 100, mrg = pMrg / 100;

    const fobC  = n(fobCliente);
    const fobDC = n(fobDecCli) || fobC;
    const fobR  = n(fobReal);
    // Igual que en marítimo: la base real hereda lo declarado al cliente.
    const fobDR = n(fobDecReal) || n(fobDecCli) || fobR;

    // flete = total USD (cerrado, lo pasa el agente)
    const fleteC = n(fleteCliInput);
    const fleteR = n(fleteRealInput);

    // ── LADO CLIENTE ──
    const segC   = fobDC * 0.01;
    const cifC   = fobDC + fleteC + segC;
    const derC   = cifC * der;
    const tasC   = cifC * tas;
    const bivC   = cifC + derC + tasC;
    const ivaC   = bivC * iva; // IVA siempre aplica
    // Percepciones: si aplican, juegan en las DOS puntas (cobro y costo real).
    const ivaAC  = pagaIvaA ? bivC * ivaA : 0;
    const ganC   = pagaGan  ? bivC * gan  : 0;
    const iibbC  = pagaIIBB ? bivC * iibb : 0;
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
    const ivaR   = bivR * iva; // IVA siempre se paga
    const ivaAR  = pagaIvaA ? bivR * ivaA : 0;
    const ganR   = pagaGan  ? bivR * gan  : 0;
    const iibbR  = pagaIIBB ? bivR * iibb : 0;
    const awbRv  = n(awbReal), handRv = n(handReal), terRv = n(terReal), desRv = n(desReal), traRv = n(traReal);
    const gasR   = awbRv + handRv + terRv + desRv + traRv;
    const totConR = fobR + fleteR + segR + derR + tasR + ivaR + ivaAR + ganR + iibbR + gasR;
    const totSinR = totConR - ivaR - ivaAR;

    // cierre
    // Honorarios = máx(% sobre costo, mínimo USD) — igual que en marítimo.
    const honPct  = totConC * hon;
    const honMinV = n(pHonMin);
    const honMinAplica = totConC > 0 && honMinV > honPct;
    const honorarios = honMinAplica ? honMinV : honPct;
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
    // Con sociedad del cliente los aranceles los paga él directamente:
    // no existe margen arancelario para Transtide.
    const mArancEff = usaSociedadPropia ? 0 : mAranc;
    const ganTotal = mFOB + mFlet + mArancEff + mGas + honorarios;

    // modo personal — igual que marítimo: el IVA del import es crédito fiscal
    // recuperable, el margen se aplica sobre el costo SIN IVA y el IVA se suma
    // recién al vender.
    const ventaNeta      = totSinR * (1 + mrg);
    const gananciaNeta   = totSinR * mrg;
    const ivaVentaMonto  = ventaNeta * iva;
    const precioVentaFinal = ventaNeta * (1 + iva);
    const precioVenta    = precioVentaFinal;

    return {
      fobC, fobDC, fobR, fobDR,
      fleteC, fleteR,
      segC, cifC, derC, tasC, bivC, ivaC, ivaAC, ganC, iibbC, arcC,
      awbCv, handCv, terCv, desCv, traCv, gasC, totConC, totSinC,
      segR, cifR, derR, tasR, bivR, ivaR, ivaAR, ganR, iibbR,
      awbRv, handRv, terRv, desRv, traRv, gasR, totConR, totSinR,
      honorarios, honMinAplica, gastFac, precioConF, precioSinF,
      mFOB, mFlet, mDer, mTas, mIva, mIvaA, mGan, mIIBB, mAranc, mArancEff,
      mAwb, mHand, mTer, mDes, mTra, mGas, ganTotal,
      precioVenta, ventaNeta, gananciaNeta, ivaVentaMonto, precioVentaFinal,
    };
  }, [
    fobCliente, fobDecCli, fobReal, fobDecReal,
    fleteCliInput, fleteRealInput, chargeable,
    awbCli, handCli, terCli, desCli, traCli,
    awbReal, handReal, terReal, desReal, traReal,
    pDer, pTas, pIva, pagaIva, pIvaA, pagaIvaA, pGan, pagaGan, pIIBB, pagaIIBB,
    pHon, pHonMin, pFac, pMrg, usaSociedadPropia,
  ]);

  const tabs = mode === 'cliente'
    ? [['cliente_fob','Cotización cliente'],['real_fob','Mis costos reales'],['aranceles','Aranceles'],['cierre','Cierre']]
    : [['real_fob','Mis costos'],['aranceles','Aranceles'],['venta','Precio de venta']];

  // ─── print client quote (mismo documento que marítimo) ────────────────────
  const printClienteQuote = () => {
    try {
      const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const html = buildQuoteHTML({
        titulo: 'COTIZACIÓN DE IMPORTACIÓN AÉREA',
        cliente, fecha: today, descripcion, clasificacion,
        subtitulo: `Chargeable ${chargeable.toFixed(2)} kg (${n(m3Input).toFixed(2)} m³ · ${n(pesoReal).toFixed(2)} kg real)`,
        izq: [
          qSection('Base de la Importación', [
            qRow('Valor de Mercadería (FOB Declarado)', qFmt(c.fobDC)),
            qRow(`Flete Aéreo (${chargeable.toFixed(2)} kg chargeable)`, qFmt(c.fleteC)),
            qRow('Seguro (1% FOB)', qFmt(c.segC)),
            qRow('CIF — Base Arancelaria', qFmt(c.cifC), { bold: true, highlight: true }),
          ]),
          qSection('Gastos Aeroportuarios', [
            c.awbCv > 0 ? qRow('AWB', qFmt(c.awbCv)) : '',
            c.handCv > 0 ? qRow('Handling', qFmt(c.handCv)) : '',
            c.terCv > 0 ? qRow('Terminal Aérea', qFmt(c.terCv)) : '',
            c.desCv > 0 ? qRow('Despachante de Aduana', qFmt(c.desCv)) : '',
            c.traCv > 0 ? qRow('Transporte Interno', qFmt(c.traCv)) : '',
          ]),
        ],
        der: [
          qSection('Aranceles Aduaneros', [
            qRow(`Derechos de Importación (${qPct(pDer)})`, qFmt(c.derC)),
            n(pTas) > 0 ? qRow(`Tasa Estadística (${qPct(pTas)})`, qFmt(c.tasC)) : '',
            qRow('Base IVA', qFmt(c.bivC), { sub: true }),
            qRow(`IVA (${qPct(pIva)})`, qFmt(c.ivaC)),
            c.ivaAC > 0 ? qRow(`IVA Adicional (${qPct(pIvaA)})`, qFmt(c.ivaAC)) : '',
            c.ganC > 0 ? qRow(`Percepción Ganancias (${qPct(pGan)})`, qFmt(c.ganC)) : '',
            c.iibbC > 0 ? qRow(`Percepción IIBB (${qPct(pIIBB)})`, qFmt(c.iibbC)) : '',
          ]),
          qSection('Totales', [
            qRow('Costo Total CON IVA', qFmt(c.totConC), { bold: true }),
            qRow('Costo Total SIN IVA', qFmt(c.totSinC), { sub: true }),
            qRow(c.honMinAplica ? 'Honorarios del Servicio' : `Honorarios del Servicio (${qPct(pHon)})`, qFmt(c.honorarios)),
            c.gastFac > 0 ? qRow(`Gastos de Facturación (${qPct(pFac)})`, qFmt(c.gastFac), { sub: true }) : '',
          ]),
        ],
        precio: {
          unico: usaSociedadPropia,
          conFactura: c.precioConF, sinFactura: c.precioSinF,
          honorarios: c.honorarios, gastFac: c.gastFac,
        },
        footer: LEYENDA_AER,
      });
      printHTML(html);
    } catch (e) {
      console.error('print build failed', e);
      gToast.error('No se pudo armar el documento: ' + (e.message || e));
    }
  };

  return (
    <div style={{ paddingBottom: '3rem' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.2rem' }}>Cotizador Aéreo</h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Calculá el costo real, lo que cobrás y tu rentabilidad — importación aérea</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <SaveQuoteButton onClick={() => setShowSave(true)} />
          {mode === 'cliente' && (
            <button onClick={() => setShowClienteView(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 1.1rem', borderRadius: '50px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, background: '#0f172a', color: '#fff' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Ver cotización al cliente
            </button>
          )}
        </div>
      </div>

      {/* MODO — misma lógica que marítimo: para cliente o impo personal */}
      <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: '50px', padding: '4px', gap: '2px', marginBottom: '0.85rem' }}>
        <Pill active={mode === 'cliente'} onClick={() => switchMode('cliente')}>Para Cliente</Pill>
        <Pill active={mode === 'personal'} onClick={() => switchMode('personal')}>Importación Personal</Pill>
      </div>

      {/* RESUMEN PEGAJOSO */}
      <div style={{ position: 'sticky', top: 0, zIndex: 30, marginBottom: '0.85rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, background: 'rgba(248,250,252,0.94)', backdropFilter: 'blur(6px)', padding: '0.45rem', borderRadius: 12, border: '1px solid #e8ecf1' }}>
          {mode === 'personal' ? (<>
            <SummaryChip label="Costo real (sin IVA)" val={usd(c.totSinR)} />
            <SummaryChip label={`Ganancia neta (${pMrg}%)`} val={usd(c.gananciaNeta)} color="#16a34a" />
            <SummaryChip label="Precio venta final" val={usd(c.precioVentaFinal)} color="#0f172a" />
          </>) : (<>
            <SummaryChip label="Costo real" val={usd(c.totConR)} />
            <SummaryChip label="A cobrar al cliente" val={usd(c.totConC)} color="#0f172a" />
            <SummaryChip label="Margen / ganancia" val={usd(c.ganTotal)} color="#16a34a" />
          </>)}
        </div>
      </div>

      {/* SETUP — Carga a transportar */}
      <Card style={{ marginBottom: '0.85rem', padding: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
          <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
          </div>
          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>Carga a transportar</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: '0.85rem', alignItems: 'stretch' }}>
          <div>
            <label style={LBL}>Volumen (m³)</label>
            <NI value={m3Input} onChange={setM3Input} />
            <p style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '0.3rem' }}>1 m³ ≈ {KG_PER_M3} kg vol. (IATA)</p>
          </div>
          <div>
            <label style={LBL}>Peso real (kg)</label>
            <NI value={pesoReal} onChange={setPesoReal} />
            <p style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '0.3rem' }}>peso bruto declarado</p>
          </div>
          <div style={{ background: chargeable > 0 ? 'linear-gradient(135deg, #f97316, #ea580c)' : '#f8fafc', border: chargeable > 0 ? 'none' : '1px solid #f1f5f9', borderRadius: '10px', padding: '0.7rem 1rem', color: chargeable > 0 ? '#fff' : '#cbd5e1', boxShadow: chargeable > 0 ? '0 2px 12px rgba(249,115,22,0.25)' : 'none', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <p style={{ fontSize: '0.62rem', marginBottom: '0.2rem', letterSpacing: 0, fontWeight: 700, opacity: chargeable > 0 ? 0.9 : 1 }}>Peso a tarifar (chargeable)</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1 }}>{chargeable.toFixed(2)} kg</p>
            <p style={{ fontSize: '0.62rem', marginTop: '0.25rem', opacity: chargeable > 0 ? 0.9 : 1 }}>
              {chargeable > 0
                ? (usaVolumetrico
                  ? `aplica volumétrico (${pesoVol.toFixed(2)} kg) — supera al real`
                  : `aplica peso real — supera al volumétrico (${pesoVol.toFixed(2)} kg)`)
                : 'cargá volumen y peso'}
            </p>
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
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', letterSpacing: 0 }}>Identificación del embarque</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
              <F label="Cliente">
                <input type="text" list="clientes-list-aereo" value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nombre del cliente" style={INP} />
                <datalist id="clientes-list-aereo">
                  {clientesList.map(cl => <option key={cl.id} value={cl.nombre} />)}
                </datalist>
              </F>
              <F label="Posición arancelaria">
                <input type="text" list="ncm-codes-aereo" value={clasificacion} onChange={e => setClasificacion(e.target.value)} placeholder="8456.11.00" style={INP} />
                <datalist id="ncm-codes-aereo">
                  {ncmList.map(nc => <option key={nc.id} value={nc.codigo}>{nc.producto}</option>)}
                </datalist>
              </F>
            </div>
            {ncmList.length > 0 && (
              <F label="NCM guardada (autocompleta aranceles)">
                <NcmPicker ncmList={ncmList} onPick={(nc) => applyNcm(nc, { setClasificacion, setDescripcion, setPDer, setPTas, setPIva, setPIvaA, setPGan, setPIIBB })} />
              </F>
            )}
            <F label="Descripción de la mercadería"><TI value={descripcion} onChange={setDescripcion} placeholder="Ej: Componentes electrónicos" /></F>
          </Card>

          {/* tab bar */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tabs.length}, 1fr)`, background: '#fff', borderRadius: '12px', padding: '4px', border: '1px solid #e2e8f0', gap: '3px' }}>
            {tabs.map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: '0.6rem 0.25rem', borderRadius: '9px', border: 'none', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 700, transition: 'all 0.15s', background: tab === id ? '#0f172a' : 'transparent', color: tab === id ? '#fff' : '#94a3b8', lineHeight: 1.2 }}>
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
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e', letterSpacing: 0 }}>FOB & costos cobrados al cliente</p>
                </div>

                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '0.6rem 0.75rem', marginBottom: '0.55rem' }}>
                  <label style={{ ...LBL, color: '#b45309' }}>FOB Cliente</label>
                  <NI value={fobCliente} onChange={setFobCliente} />
                </div>
                <details className="cot-collapse" style={{ marginBottom: '0.75rem' }}>
                  <summary style={{ ...SECL, margin: '0 0 0.35rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="cot-chev" style={{ fontSize: '0.7rem' }}>▸</span> FOB declarado en aduana (si difiere del cobrado)
                  </summary>
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '0.6rem 0.75rem' }}>
                    <NI value={fobDecCli} onChange={setFobDecCli} placeholder="= FOB cliente si no difiere" />
                  </div>
                </details>

                <p style={SECL}>Línea aérea destino (cobrado al cliente)</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <F label="Flete aéreo (USD)"><NI value={fleteCliInput} onChange={setFleteCliInput} /></F>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '1rem' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#065f46', letterSpacing: 0 }}>FOB & costos reales</p>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '0.6rem 0.75rem', marginBottom: '0.55rem' }}>
                  <label style={{ ...LBL, color: '#065f46' }}>FOB Real</label>
                  <NI value={fobReal} onChange={setFobReal} />
                </div>
                <details className="cot-collapse" style={{ marginBottom: '0.75rem' }}>
                  <summary style={{ ...SECL, margin: '0 0 0.35rem', color: '#065f46', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="cot-chev" style={{ fontSize: '0.7rem' }}>▸</span> FOB declarado en aduana (si difiere del pagado)
                  </summary>
                  <div style={{ background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '0.6rem 0.75rem' }}>
                    <NI value={fobDecReal} onChange={setFobDecReal} placeholder="= FOB real si no difiere" />
                  </div>
                </details>

                <p style={SECL}>Línea aérea destino & gastos aeroportuarios (real)</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <F label="Flete aéreo real (USD)"><NI value={fleteRealInput} onChange={setFleteRealInput} /></F>
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
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4338ca', letterSpacing: 0 }}>Configuración arancelaria</p>
                </div>
                <p style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.85rem', fontStyle: 'italic' }}>Misma lógica que importación marítima — CIF = FOB declarado + Flete + Seguro 1%.</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
                  <F label="Derechos de Importación %">
                    <input type="number" inputMode="decimal" step="any" min="0" value={pDer} onChange={e => setPDer(e.target.value)} style={INP} />
                  </F>
                  <F label="Tasa Estadística %">
                    <input type="number" inputMode="decimal" step="any" min="0" value={pTas} onChange={e => setPTas(e.target.value)} style={INP} />
                  </F>
                  <F label="IVA %">
                    <input type="number" inputMode="decimal" step="any" min="0" value={pIva} onChange={e => setPIva(e.target.value)} style={INP} />
                  </F>
                </div>

                <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.65rem' }}>Percepciones — ¿aplican en esta importación? Con SÍ se cobran en la cotización y cuentan en el costo real; con NO, en ninguno.</p>

                <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '0.65rem 0.85rem', border: '1px solid #f1f5f9', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 0.9rem' }}>
                  {[
                    ['IVA Adicional %', pIvaA, setPIvaA, pagaIvaA, setPagaIvaA],
                    ['Perc. Ganancias %', pGan, setPGan, pagaGan, setPagaGan],
                    ['Perc. IIBB %', pIIBB, setPIIBB, pagaIIBB, setPagaIIBB],
                  ].map(([lbl, val, setVal, paga, setPaga]) => (
                    <div key={lbl} style={{ minWidth: 0 }}>
                      <label style={{ ...LBL, marginBottom: '0.12rem' }}>{lbl}</label>
                      <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid #e2e8f0', borderRadius: '7px', overflow: 'hidden', background: '#fff', maxWidth: '100%' }}>
                        <input type="number" inputMode="decimal" step="any" min="0" value={val} onChange={e => setVal(e.target.value)} onWheel={e => e.currentTarget.blur()} style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', padding: '0.38rem 0.6rem', fontSize: '0.82rem', color: '#1e293b', fontVariantNumeric: 'tabular-nums' }} />
                        <button onClick={() => setPaga(!paga)} title="¿Aplica en esta importación? Afecta la cotización al cliente y tu costo real" style={{ border: 'none', borderLeft: '1px solid #e2e8f0', padding: '0 0.7rem', cursor: 'pointer', fontSize: '0.66rem', fontWeight: 700, minWidth: '42px', background: paga ? '#ecfdf5' : '#fef2f2', color: paga ? '#059669' : '#dc2626' }}>
                        {paga ? 'SÍ' : 'NO'}
                        </button>
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
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5b21b6', letterSpacing: 0 }}>Honorarios & cierre</p>
                </div>

                <div style={{ marginBottom: '1rem', background: usaSociedadPropia ? '#f0fdf4' : '#eff6ff', borderRadius: '12px', padding: '0.85rem 1rem', border: `1px solid ${usaSociedadPropia ? '#bbf7d0' : '#bfdbfe'}` }}>
                  <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0, marginBottom: '0.5rem' }}>¿Qué sociedad usa el cliente para importar?</p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => setUsaSociedadPropia(true)} style={{ flex: 1, padding: '0.6rem 0.75rem', borderRadius: '10px', border: `2px solid ${usaSociedadPropia ? '#059669' : '#e2e8f0'}`, cursor: 'pointer', background: usaSociedadPropia ? '#dcfce7' : '#fff', textAlign: 'left' }}>
                      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: usaSociedadPropia ? '#059669' : '#64748b', marginBottom: '0.15rem' }}>{usaSociedadPropia ? '✓ ' : ''}Sociedad del cliente</p>
                      <p style={{ fontSize: '0.65rem', color: usaSociedadPropia ? '#059669' : '#94a3b8' }}>Sin gastos de facturación</p>
                    </button>
                    <button onClick={() => setUsaSociedadPropia(false)} style={{ flex: 1, padding: '0.6rem 0.75rem', borderRadius: '10px', border: `2px solid ${!usaSociedadPropia ? '#2563eb' : '#e2e8f0'}`, cursor: 'pointer', background: !usaSociedadPropia ? '#eff6ff' : '#fff', textAlign: 'left' }}>
                      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: !usaSociedadPropia ? '#2563eb' : '#64748b', marginBottom: '0.15rem' }}>{!usaSociedadPropia ? '✓ ' : ''}Sociedad de Transtide</p>
                      <p style={{ fontSize: '0.65rem', color: !usaSociedadPropia ? '#2563eb' : '#94a3b8' }}>Se suman gastos de facturación</p>
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <F label={`Honorarios % (s/ costo CON IVA)`}>
                    <input type="number" inputMode="decimal" step="any" min="0" value={pHon} onChange={e => setPHon(e.target.value)} style={INP} />
                  </F>
                  <F label={`Honorarios mínimos (USD)`}>
                    <input type="number" inputMode="decimal" step="any" min="0" value={pHonMin} onChange={e => setPHonMin(e.target.value)} style={INP} placeholder="Sin mínimo" />
                  </F>
                </div>
                {c.honMinAplica && (
                  <p style={{ fontSize: '0.7rem', color: '#9a3412', background: '#fff4ee', border: '1px solid #fed7aa', borderRadius: '8px', padding: '0.4rem 0.6rem', marginTop: '0.35rem' }}>
                    Aplica el mínimo: {pHon}% = {usd(c.totConC * (n(pHon) / 100))} &lt; {usd(n(pHonMin))}
                  </p>
                )}
                {!usaSociedadPropia && (
                  <F label={`Gastos de Facturación % — sociedad Transtide`}>
                    <input type="number" inputMode="decimal" step="any" min="0" value={pFac} onChange={e => setPFac(e.target.value)} style={INP} />
                  </F>
                )}

                <div style={{ background: '#faf5ff', borderRadius: '10px', padding: '1rem', border: '1px solid #e9d5ff', marginTop: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '0.38rem 0', borderBottom: '1px solid #f3e8ff', color: '#475569' }}><span>Costo Total CON IVA</span><span>{usd(c.totConC)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '0.38rem 0', borderBottom: '1px solid #f3e8ff', color: '#475569' }}><span>+ Honorarios ({c.honMinAplica ? 'mín. USD' : `${pHon}%`})</span><span>{usd(c.honorarios)}</span></div>
                  {!usaSociedadPropia && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '0.38rem 0', borderBottom: '1px solid #f3e8ff', color: '#7c3aed' }}><span>+ Gastos de Facturación ({pFac}%)</span><span>{usd(c.gastFac)}</span></div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.55rem 0', fontWeight: 700, color: '#7c3aed' }}><span>= Precio final</span><span>{usd(c.precioConF)}</span></div>
                </div>
              </div>
            )}

            {tab === 'venta' && (
              <div>
                <p style={SECL}>Precio de venta estimado</p>
                <F label="Margen de ganancia deseado %">
                  <input type="number" inputMode="decimal" step="any" min="0" value={pMrg} onChange={e => setPMrg(e.target.value)} style={INP} />
                </F>
                <p style={{ fontSize: '0.68rem', color: '#94a3b8', margin: '0 0 0.6rem' }}>El IVA del import es crédito fiscal recuperable: el margen se calcula sobre el costo sin IVA, y el IVA se suma recién al vender.</p>
                <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '1rem', marginTop: '0.2rem' }}>
                  {[
                    ['Costo real (sin IVA)', c.totSinR, false, false],
                    [`+ Margen (${pMrg}%) — ganancia neta`, c.gananciaNeta, false, 'profit'],
                    ['= Precio de venta neto', c.ventaNeta, true, false],
                    [`+ IVA (${pIva}%) sobre la venta`, c.ivaVentaMonto, false, false],
                    ['= Precio de venta final (con IVA)', c.precioVentaFinal, 'final', false],
                  ].map(([lbl, val, emph, kind], i, arr) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: emph === 'final' ? '0.95rem' : '0.85rem', padding: '0.4rem 0', borderBottom: i < arr.length - 1 ? '1px solid #d1fae5' : 'none', fontWeight: emph ? 800 : 400, color: emph === 'final' ? '#059669' : kind === 'profit' ? '#0891b2' : emph ? '#065f46' : '#374151' }}>
                      <span>{lbl}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </Card>
        </div>

        {/* RIGHT: results */}
        <div className="cot-right-rail" style={{ position: 'sticky', top: '1rem', maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {mode === 'personal' && (
            <Card>
              <p style={{ ...SECL, margin: '0 0 0.7rem' }}>Costo real de importación (sin IVA)</p>
              <p style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>{usd(c.totSinR)}</p>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.3rem' }}>Con IVA pagás {usd(c.totConR)} · el IVA es crédito fiscal recuperable</p>
              {c.ventaNeta > 0 && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: '8px', padding: '0.5rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0891b2', letterSpacing: 0 }}>Ganancia neta ({pMrg}%)</span>
                    <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0891b2', fontVariantNumeric: 'tabular-nums' }}>{usd(c.gananciaNeta)}</span>
                  </div>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0, marginBottom: '0.15rem' }}>Precio de venta neto (sin IVA)</p>
                  <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669', lineHeight: 1.1 }}>{usd(c.ventaNeta)}</p>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0, margin: '0.6rem 0 0.15rem' }}>Precio de venta final (con IVA {pIva}%)</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981', lineHeight: 1 }}>{usd(c.precioVentaFinal)}</p>
                  <p style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.2rem' }}>incluye {usd(c.ivaVentaMonto)} de IVA</p>
                </div>
              )}
              <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '0.45rem 0.75rem', marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.72rem', color: '#065f46' }}>FOB declarado · CIF declarado</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#059669' }}>{usd(c.fobDR)} · {usd(c.cifR)}</span>
              </div>
              <div style={{ marginTop: '0.75rem', padding: '0.45rem 0.75rem', background: '#f8fafc', border: '1px solid #e8ecf1', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b' }}>Importación personal — siempre con sociedad Transtide</span>
              </div>
            </Card>
          )}

          {mode === 'cliente' && (<>
          <Card>
            <p style={{ ...SECL, margin: '0 0 0.7rem' }}>Precio final al cliente</p>
            <div style={{ marginBottom: '0.75rem', padding: '0.4rem 0.7rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e8ecf1' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b' }}>
                {usaSociedadPropia ? 'Sociedad del cliente — sin gastos de facturación' : 'Sociedad Transtide — incluye gastos de facturación'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: usaSociedadPropia ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '1rem' }}>
                <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#059669', letterSpacing: 0, marginBottom: '0.4rem' }}>{usaSociedadPropia ? 'Precio final' : 'CON Factura'}</p>
                <p style={{ fontSize: '1.45rem', fontWeight: 800, color: '#10b981', lineHeight: 1 }}>{usd(c.precioConF)}</p>
                <p style={{ fontSize: '0.7rem', color: '#6ee7b7', marginTop: '0.2rem' }}>Hon. {usd(c.honorarios)}{!usaSociedadPropia ? ` + Fac. ${usd(c.gastFac)}` : ''}</p>
              </div>
              {!usaSociedadPropia && (
                <div style={{ background: '#fefce8', borderRadius: '12px', padding: '1rem' }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#d97706', letterSpacing: 0, marginBottom: '0.4rem' }}>SIN Factura</p>
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
              [usaSociedadPropia ? 'Margen Aranceles — los paga el cliente (su sociedad)' : 'Margen Aranceles', c.mArancEff],
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
            <div className="cot-detalle-header" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', fontSize: '0.68rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '0.35rem' }}>
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
          </>)}

        </div>
      </div>

      {/* MODAL: vista cliente */}
      {showClienteView && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowClienteView(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.2rem 1.5rem', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: '#fff', borderRadius: '20px 20px 0 0', zIndex: 10 }}>
              <div>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0, marginBottom: '0.1rem' }}>Vista previa</p>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Cotización Aérea al Cliente</h3>
              </div>
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button onClick={printClienteQuote} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: '50px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, background: '#2563eb', color: '#fff', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Imprimir / PDF
                </button>
                <button onClick={() => setShowClienteView(false)} style={{ width: '36px', height: '36px', borderRadius: '50%', border: 'none', cursor: 'pointer', background: '#f1f5f9', color: '#64748b', fontSize: '1.1rem' }}>×</button>
              </div>
            </div>
            <div id="cot-aereo-print" style={{ padding: '1.5rem' }}>
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
                <p style={{ fontSize: '0.72rem', color: '#bfdbfe', marginTop: '4px' }}>Servicio aéreo · Chargeable {chargeable.toFixed(2)} kg ({n(m3Input).toFixed(2)} m³ · {n(pesoReal).toFixed(2)} kg real)</p>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '1rem' }}>
                <div style={{ padding: '6px 12px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}><span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0 }}>Base de la Importación</span></div>
                {[
                  ['Valor de Mercadería (FOB Declarado)', usd(c.fobDC)],
                  [`Flete Aéreo (${chargeable.toFixed(2)} kg chargeable)`, usd(c.fleteC)],
                  ['Seguro (1% FOB)', usd(c.segC)],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid #f8fafc', fontSize: '0.83rem', color: '#374151' }}>
                    <span>{l}</span><span>{v}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #e2e8f0', fontSize: '0.88rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff' }}>
                  <span>CIF — Base Arancelaria</span><span>{usd(c.cifC)}</span>
                </div>
                <div style={{ padding: '6px 12px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }}><span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0 }}>Aranceles Aduaneros</span></div>
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
                  <div style={{ padding: '6px 12px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }}><span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', letterSpacing: 0 }}>Gastos Aeroportuarios</span></div>
                  {[['AWB', c.awbCv], ['Handling', c.handCv], ['Terminal aérea', c.terCv], ['Despachante', c.desCv], ['Transporte interno', c.traCv]].filter(([,v]) => v > 0).map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid #f8fafc', fontSize: '0.83rem', color: '#374151' }}>
                      <span>{l}</span><span>{usd(v)}</span>
                    </div>
                  ))}
                </>)}
              </div>

              {/* Honorarios & cierre — itemizado */}
              <div style={{ border: '1px solid #e9d5ff', borderRadius: '10px', overflow: 'hidden', marginBottom: '1.2rem' }}>
                <div style={{ padding: '6px 12px', background: '#faf5ff', borderBottom: '2px solid #e9d5ff' }}><span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#7c3aed', letterSpacing: 0 }}>Servicio Transtide</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid #f8fafc', fontSize: '0.83rem', fontWeight: 600, color: '#1e293b' }}>
                  <span>Costo Total (mercadería + flete + aranceles + gastos)</span><span>{usd(c.totConC)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid #f8fafc', fontSize: '0.83rem', color: '#374151' }}>
                  <span>+ Honorarios{c.honMinAplica ? '' : ` (${pHon}%)`}</span><span>{usd(c.honorarios)}</span>
                </div>
                {!usaSociedadPropia && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid #f8fafc', fontSize: '0.83rem', color: '#7c3aed' }}>
                    <span>+ Gastos de Facturación ({pFac}%)</span><span>{usd(c.gastFac)}</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: usaSociedadPropia ? '1fr' : '1fr 1fr', gap: '0.75rem', marginBottom: '1.2rem' }}>
                <div style={{ background: '#065f46', borderRadius: '12px', padding: '1.1rem 1.2rem' }}>
                  <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#6ee7b7', letterSpacing: 0, marginBottom: '6px' }}>{usaSociedadPropia ? 'Precio Final' : 'Precio Final CON Factura'}</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{usd(c.precioConF)}</p>
                  <p style={{ fontSize: '0.7rem', color: '#6ee7b7', marginTop: '0.2rem' }}>Hon. {usd(c.honorarios)}{!usaSociedadPropia ? ` + Fac. ${usd(c.gastFac)}` : ''}</p>
                </div>
                {!usaSociedadPropia && (
                  <div style={{ background: '#78350f', borderRadius: '12px', padding: '1.1rem 1.2rem' }}>
                    <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#fcd34d', letterSpacing: 0, marginBottom: '6px' }}>Precio Final SIN Factura</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{usd(c.precioSinF)}</p>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
                <p style={{ fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.6 }}>
                  * Cotización aérea de carácter estimativo y no final, expresada en USD. Chargeable weight = max(peso real, peso volumétrico). Los valores se calculan con tarifas, tipo de cambio y normativa vigentes a la fecha de emisión; el importe definitivo se confirma al momento del despacho y puede variar según el tipo de cambio oficial, el flete internacional (ajustable hasta la fecha efectiva de embarque), actualizaciones arancelarias o normativas, condiciones del proveedor en origen y contingencias aduaneras ajenas a Transtide (canal rojo/naranja, verificaciones, escaneos, almacenajes, estadías o demoras). Las diferencias se trasladan al costo final con documentación respaldatoria. No constituye una oferta en firme. Validez: 7 días hábiles; servicios no incluidos se cotizan por separado.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSave && (
        <SaveQuoteModal
          modo="aereo"
          defaultCliente={cliente}
          getPayload={() => ({
            total_usd: String(Math.round(usaSociedadPropia ? c.precioSinF : c.precioConF)),
            resumen: `FOB ${Math.round(c.fobC)} · ${chargeable.toFixed(0)}kg · USD ${(Math.round((usaSociedadPropia ? c.precioSinF : c.precioConF)) / 1000).toFixed(1)}k final`,
            data: serialize(),
          })}
          ncmPayload={() => clasificacion.trim() ? ({ codigo: clasificacion.trim(), producto: descripcion, der: String(pDer), tasa: String(pTas), iva: String(pIva), iva_adic: String(pIvaA), ganancias: String(pGan), iibb: String(pIIBB) }) : null}
          loadedQuote={loadedQuote}
          onSaved={setLoadedQuote}
          onClose={() => setShowSave(false)}
        />
      )}

    </div>
  );
}

// ─── saved-quotes panel ─────────────────────────────────────────────────────────
function SavedQuotesPanel({ onClose, onReactivate }) {
  const [quotes, setQuotes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');
  const [filter, setFilter]   = useState('todas');
  const [search, setSearch]   = useState('');
  const [agrupar, setAgrupar] = useState('estado'); // estado | cliente | fecha | valor
  const [busyId, setBusyId]   = useState(null);
  const [confirmConv, setConfirmConv] = useState(null); // cotización a convertir
  const [confirmDel, setConfirmDel]   = useState(null); // cotización a eliminar
  const [showCerradas, setShowCerradas] = useState(false); // sección "Cerradas" colapsada por defecto

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const res = await fetch('/api/db/cotizaciones');
      if (!res.ok) throw new Error('Error al cargar');
      const json = await res.json();
      setQuotes(Array.isArray(json) ? json : (json.data || json.rows || []));
    } catch (e) {
      setErr(e.message || 'Error al cargar');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const reactivate = async (q) => {
    setBusyId(q.id);
    try {
      const res = await fetch(`/api/db/cotizaciones/${q.id}`);
      if (!res.ok) throw new Error('Error al abrir');
      const full = await res.json();
      const data = full.data || {};
      onReactivate(q.modo, data, { id: q.id, nombre: q.nombre, cliente: q.cliente, estado: q.estado, notas: full.notas || '' });
    } catch (e) {
      gToast.error(e.message || 'Error al abrir la cotización');
      setBusyId(null);
    }
  };

  const changeEstado = async (q, estado) => {
    setBusyId(q.id);
    try {
      const res = await fetch(`/api/db/cotizaciones/${q.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onlyEstado: true, estado }),
      });
      if (!res.ok) throw new Error('Error');
      setQuotes(qs => qs.map(x => x.id === q.id ? { ...x, estado } : x));
    } catch (e) {
      gToast.error('No se pudo cambiar el estado');
    } finally {
      setBusyId(null);
    }
  };

  // Si ya está convertida, va directo a la operación; si no, abre el modal de confirmación.
  const convertir = (q) => {
    if (q.operation_id) { window.location.href = '/gestion/operaciones?op=' + q.operation_id; return; }
    setConfirmConv(q);
  };
  const doConvertir = async (q) => {
    setConfirmConv(null);
    setBusyId(q.id);
    try {
      const res = await fetch(`/api/db/cotizaciones/${q.id}/convertir`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Error al convertir');
      gToast.success('Operación creada. Abriéndola…');
      window.location.href = '/gestion/operaciones?op=' + j.operationId;
    } catch (e) {
      gToast.error(e.message || 'No se pudo convertir');
      setBusyId(null);
    }
  };

  const remove = (q) => setConfirmDel(q);
  const doRemove = async (q) => {
    setConfirmDel(null);
    setBusyId(q.id);
    try {
      const res = await fetch(`/api/db/cotizaciones/${q.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error');
      setQuotes(qs => qs.filter(x => x.id !== q.id));
      gToast.success('Cotización eliminada.');
    } catch (e) {
      gToast.error('No se pudo eliminar');
    } finally {
      setBusyId(null);
    }
  };

  const s = search.trim().toLowerCase();
  const visible = quotes.filter(q => {
    if (filter !== 'todas' && q.estado !== filter) return false;
    if (s && !((q.nombre || '').toLowerCase().includes(s) || (q.cliente || '').toLowerCase().includes(s))) return false;
    return true;
  });

  // "Cerrada" = ya no requiere trabajo: rechazada, o aprobada ya convertida en operación.
  const isCerrada = (q) => q.estado === 'rechazada' || (q.estado === 'aprobada' && q.operation_id);
  const activas  = visible.filter(q => !isCerrada(q));
  const cerradas = visible.filter(isCerrada);
  // Si el filtro o la búsqueda apuntan a cerradas, la sección se muestra sola.
  const cerradasAbiertas = showCerradas || filter === 'rechazada' || filter === 'aprobada' || (!!s && cerradas.length > 0);

  const fmtDate = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Agrupación / orden de la lista para poder trabajar (no todo apilado suelto).
  // Solo las ACTIVAS se agrupan acá; las cerradas van todas juntas al fondo.
  const byDateDesc = (a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
  let groups;
  if (agrupar === 'cliente') {
    const m = {};
    activas.forEach(q => { const k = ((q.cliente || '').trim()) || 'Sin cliente'; (m[k] = m[k] || []).push(q); });
    groups = Object.keys(m).sort((a, b) => a.localeCompare(b, 'es')).map(k => ({ key: k, label: k, count: m[k].length, items: m[k].sort(byDateDesc) }));
  } else if (agrupar === 'valor') {
    groups = [{ key: 'all', items: [...activas].sort((a, b) => Number(b.total_usd || 0) - Number(a.total_usd || 0)) }];
  } else if (agrupar === 'fecha') {
    groups = [{ key: 'all', items: [...activas].sort(byDateDesc) }];
  } else { // estado (default): en orden de pipeline
    groups = ESTADOS.map(e => ({ key: e.id, label: e.label, dot: e.fg, count: 0, items: activas.filter(q => q.estado === e.id).sort(byDateDesc) })).filter(g => g.items.length);
  }

  return (
    <>
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 1050, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
      <div style={{ background: '#f8fafc', width: '100%', maxWidth: '560px', height: '100%', overflowY: 'auto', boxShadow: '-10px 0 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.1rem 1.4rem', borderBottom: '1px solid #e2e8f0', background: '#fff', position: 'sticky', top: 0, zIndex: 10 }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>Cotizaciones guardadas</h3>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{quotes.length} guardada{quotes.length === 1 ? '' : 's'}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: '34px', height: '34px', borderRadius: '50%', border: 'none', cursor: 'pointer', background: '#f1f5f9', color: '#64748b', fontSize: '1.1rem' }}>×</button>
        </div>

        {/* filters */}
        <div style={{ padding: '0.9rem 1.4rem', background: '#fff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: '64px', zIndex: 9 }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o cliente…" style={{ ...INP, marginBottom: '0.6rem' }} />
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {[['todas', 'Todas'], ...ESTADOS.map(e => [e.id, e.label])].map(([id, label]) => {
              const active = filter === id;
              return (
                <button key={id} onClick={() => setFilter(id)} style={{ padding: '0.3rem 0.75rem', borderRadius: '50px', border: `1px solid ${active ? '#0f172a' : '#e2e8f0'}`, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, background: active ? '#0f172a' : '#fff', color: active ? '#fff' : '#64748b' }}>
                  {label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.7rem' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Agrupar por</span>
            <select value={agrupar} onChange={e => setAgrupar(e.target.value)} style={{ padding: '0.32rem 0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.76rem', fontWeight: 600, color: '#334155', background: '#fff', cursor: 'pointer' }}>
              <option value="estado">Estado</option>
              <option value="cliente">Cliente</option>
              <option value="fecha">Más recientes</option>
              <option value="valor">Mayor valor</option>
            </select>
          </div>
        </div>

        {/* list */}
        <div style={{ padding: '1rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '1.1rem', flex: 1 }}>
          {loading && <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Cargando…</p>}
          {err && <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{err}</p>}
          {!loading && !err && visible.length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No hay cotizaciones que coincidan.</p>}
          {/* Alertas de seguimiento: cotizaciones frías y aprobadas sin convertir */}
          {!loading && !err && (() => {
            const now = Date.now()
            const dias = (v) => { const d = new Date(v || 0); return isNaN(d.getTime()) ? 0 : Math.floor((now - d.getTime()) / 86400000) }
            const frias = quotes.filter(q => ['enviada', 'negociacion'].includes(q.estado) && dias(q.updated_at || q.created_at) >= 5)
            const sinConv = quotes.filter(q => q.estado === 'aprobada' && !q.operation_id)
            if (!frias.length && !sinConv.length) return null
            return (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '0.6rem 0.85rem' }}>
                <p style={{ fontSize: '0.6rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Seguimiento</p>
                {sinConv.slice(0, 3).map(q => (
                  <p key={q.id} style={{ fontSize: '0.76rem', color: '#78350f', padding: '0.08rem 0' }}><b>{q.nombre}</b> está aprobada — convertila en operación</p>
                ))}
                {frias.slice(0, 4).map(q => (
                  <p key={q.id} style={{ fontSize: '0.76rem', color: '#78350f', padding: '0.08rem 0' }}><b>{q.nombre}</b> sin respuesta hace {dias(q.updated_at || q.created_at)} días — hacé follow-up{q.cliente ? ` a ${q.cliente}` : ''}</p>
                ))}
              </div>
            )
          })()}
          {!loading && !err && groups.map(g => (
            <div key={g.key}>
              {g.label && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '0 0 0.55rem 0.1rem' }}>
                  {g.dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.dot, flex: '0 0 auto' }} />}
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{g.label}</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#fff', background: '#94a3b8', borderRadius: '50px', padding: '0.05rem 0.45rem' }}>{g.items.length}</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {g.items.map(q => {
                  const busy = busyId === q.id;
                  return (
                    <div key={q.id} style={{ background: '#fff', borderRadius: '10px', padding: '0.65rem 0.9rem', border: '1px solid #e2e8f0', opacity: busy ? 0.6 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.6rem' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.nombre}</p>
                          <p style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 2 }}>
                            {[q.cliente, q.modo === 'aereo' ? 'Aéreo' : 'Marítimo', fmtDate(q.updated_at || q.created_at)].filter(Boolean).join(' · ')}
                          </p>
                          {q.resumen && <p style={{ fontSize: '0.68rem', color: '#cbd5e1', marginTop: 2 }}>{q.resumen}</p>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {q.total_usd && <p style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>USD {Number(q.total_usd).toLocaleString('es-AR')}</p>}
                          <select value={q.estado} onChange={e => changeEstado(q, e.target.value)} disabled={busy} title="Cambiar estado" style={{ marginTop: 3, padding: '0.22rem 0.4rem', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '0.68rem', fontWeight: 600, color: q.estado === 'aprobada' ? '#16a34a' : q.estado === 'rechazada' ? '#dc2626' : '#64748b', background: '#fff', cursor: 'pointer' }}>
                            {ESTADOS.map(e => <option key={e.id} value={e.id} style={{ color: '#334155', background: '#fff' }}>{e.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.55rem' }}>
                        <button onClick={() => reactivate(q)} disabled={busy} style={{ padding: '0.32rem 0.7rem', borderRadius: '7px', border: '1px solid #e2e8f0', cursor: busy ? 'default' : 'pointer', fontSize: '0.72rem', fontWeight: 600, background: '#fff', color: '#334155' }}>
                          Reactivar
                        </button>
                        <button onClick={() => convertir(q)} disabled={busy} title={q.operation_id ? 'Ya convertida — ir a la operación' : 'Crear operación desde esta cotización'} style={{ padding: '0.32rem 0.7rem', borderRadius: '7px', border: '1px solid #e2e8f0', cursor: busy ? 'default' : 'pointer', fontSize: '0.72rem', fontWeight: 600, background: '#fff', color: q.operation_id ? '#16a34a' : '#334155' }}>
                          {q.operation_id ? 'Ver operación' : 'Convertir'}
                        </button>
                        <button onClick={() => remove(q)} disabled={busy} aria-label="Eliminar" title="Eliminar" style={{ marginLeft: 'auto', width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', border: 'none', cursor: busy ? 'default' : 'pointer', background: 'none', color: '#cbd5e1' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Cerradas: rechazadas y aprobadas ya convertidas — todas al fondo, colapsadas */}
          {!loading && !err && cerradas.length > 0 && (
            <div style={{ marginTop: '0.25rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={() => setShowCerradas(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', background: 'none', border: 'none', padding: '0.15rem 0.1rem', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: '0.62rem', color: '#94a3b8' }}>{cerradasAbiertas ? '▾' : '▸'}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cerradas · {cerradas.length}</span>
              </button>
              {cerradasAbiertas && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.45rem' }}>
                  {[...cerradas].sort(byDateDesc).map(q => {
                    const busy = busyId === q.id;
                    return (
                      <div key={q.id} style={{ background: '#fff', borderRadius: '10px', padding: '0.5rem 0.9rem', border: '1px solid #eef2f7', opacity: busy ? 0.5 : 0.7 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.nombre}</p>
                            <p style={{ fontSize: '0.66rem', color: '#94a3b8', marginTop: 1 }}>
                              {[estadoMeta(q.estado).label, q.cliente, q.modo === 'aereo' ? 'Aéreo' : 'Marítimo', q.total_usd ? `USD ${Number(q.total_usd).toLocaleString('es-AR')}` : '', fmtDate(q.updated_at || q.created_at)].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          {q.operation_id && (
                            <button onClick={() => convertir(q)} disabled={busy} title="Ir a la operación" style={{ padding: '0.28rem 0.65rem', borderRadius: '7px', border: '1px solid #e2e8f0', cursor: busy ? 'default' : 'pointer', fontSize: '0.7rem', fontWeight: 600, background: '#fff', color: '#334155' }}>Ver operación</button>
                          )}
                          <button onClick={() => reactivate(q)} disabled={busy} style={{ padding: '0.28rem 0.65rem', borderRadius: '7px', border: '1px solid #e2e8f0', cursor: busy ? 'default' : 'pointer', fontSize: '0.7rem', fontWeight: 600, background: '#fff', color: '#334155' }}>Reactivar</button>
                          <button onClick={() => remove(q)} disabled={busy} aria-label="Eliminar" title="Eliminar" style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', border: 'none', cursor: busy ? 'default' : 'pointer', background: 'none', color: '#cbd5e1' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {confirmConv && (
      <div onClick={() => setConfirmConv(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', maxWidth: 380, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
          <p style={{ fontWeight: 800, color: '#0f172a', marginBottom: '0.4rem' }}>¿Convertir en operación?</p>
          <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1.25rem' }}>Se creará una operación con el cliente, contenedor, m³ y FOB precargados desde “{confirmConv.nombre}”.</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button onClick={() => setConfirmConv(null)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={() => doConvertir(confirmConv)} style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Convertir</button>
          </div>
        </div>
      </div>
    )}

    {confirmDel && (
      <div onClick={() => setConfirmDel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', maxWidth: 360, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
          <p style={{ fontWeight: 800, color: '#0f172a', marginBottom: '0.4rem' }}>¿Eliminar cotización?</p>
          <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1.25rem' }}>Se borra “{confirmDel.nombre}”. No se puede deshacer.</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button onClick={() => setConfirmDel(null)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={() => doRemove(confirmDel)} style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Eliminar</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ─── NCM library panel (manage saved NCM codes) ────────────────────────────────
const NCM_FIELDS = [
  ['codigo', 'Código NCM *', '8456.11.00'],
  ['producto', 'Producto / descripción', 'Ej: Máquinas láser'],
  ['der', 'DER %', '35'],
  ['tasa', 'Tasa Estadística %', '0'],
  ['iva', 'IVA %', '21'],
  ['iva_adic', 'IVA Adicional %', '20'],
  ['ganancias', 'Perc. Ganancias %', '6'],
  ['iibb', 'Perc. IIBB %', '2.5'],
];

function NcmForm({ initial, onCancel, onSaved }) {
  const empty = { codigo: '', producto: '', der: '', tasa: '', iva: '', iva_adic: '', ganancias: '', iibb: '', notas: '' };
  const [form, setForm] = useState({ ...empty, ...(initial || {}) });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.codigo.trim()) { setErr('El código NCM es obligatorio.'); return; }
    setSaving(true); setErr('');
    const body = {
      codigo: form.codigo.trim(), producto: form.producto, der: form.der, tasa: form.tasa,
      iva: form.iva, iva_adic: form.iva_adic, ganancias: form.ganancias, iibb: form.iibb, notas: form.notas,
    };
    try {
      let res;
      if (initial && initial.id) {
        res = await fetch(`/api/db/ncm/${initial.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        res = await fetch('/api/db/ncm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      if (!res.ok) throw new Error('Error al guardar');
      onSaved();
    } catch (e) {
      setErr(e.message || 'Error al guardar');
      setSaving(false);
    }
  };

  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: '1rem', border: '1px solid #e2e8f0' }}>
      <p style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.8rem' }}>{initial && initial.id ? 'Editar NCM' : 'Nueva NCM'}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
        {NCM_FIELDS.map(([key, label, ph]) => (
          <div key={key} style={key === 'codigo' || key === 'producto' ? { gridColumn: '1 / -1' } : {}}>
            <label style={LBL}>{label}</label>
            <input
              type={['der','tasa','iva','iva_adic','ganancias','iibb'].includes(key) ? 'number' : 'text'}
              inputMode={['der','tasa','iva','iva_adic','ganancias','iibb'].includes(key) ? 'decimal' : undefined}
              step="any"
              value={form[key] ?? ''}
              onChange={e => set(key, e.target.value)}
              placeholder={ph}
              style={{ ...INP, fontFamily: key === 'codigo' ? 'monospace' : 'inherit' }}
            />
          </div>
        ))}
      </div>
      <div style={{ marginTop: '0.6rem' }}>
        <label style={LBL}>Notas</label>
        <textarea value={form.notas ?? ''} onChange={e => set('notas', e.target.value)} placeholder="Opcional" rows={2} style={{ ...INP, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>
      {err && <p style={{ fontSize: '0.78rem', color: '#dc2626', marginTop: '0.5rem' }}>{err}</p>}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
        <button onClick={onCancel} style={{ padding: '0.5rem 1rem', borderRadius: '9px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>Cancelar</button>
        <button onClick={save} disabled={saving} style={{ padding: '0.5rem 1.2rem', borderRadius: '9px', border: 'none', background: saving ? '#94a3b8' : '#0f172a', color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  );
}

function NcmPanel({ onClose }) {
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');
  const [search, setSearch]   = useState('');
  const [editing, setEditing] = useState(null); // null = none, {} = new, {id,...} = edit
  const [busyId, setBusyId]   = useState(null);
  const [confirmDel, setConfirmDel] = useState(null); // NCM a eliminar

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const res = await fetch('/api/db/ncm');
      if (!res.ok) throw new Error('Error al cargar');
      const json = await res.json();
      setList(Array.isArray(json) ? json : []);
    } catch (e) {
      setErr(e.message || 'Error al cargar');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const remove = (nc) => setConfirmDel(nc);
  const doRemove = async (nc) => {
    setConfirmDel(null);
    setBusyId(nc.id);
    try {
      const res = await fetch(`/api/db/ncm/${nc.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error');
      setList(xs => xs.filter(x => x.id !== nc.id));
      gToast.success('NCM eliminada.');
    } catch {
      gToast.error('No se pudo eliminar la NCM');
    } finally {
      setBusyId(null);
    }
  };

  const onSaved = () => { setEditing(null); load(); };

  const s = search.trim().toLowerCase();
  const visible = list.filter(nc =>
    !s || (nc.codigo || '').toLowerCase().includes(s) || (nc.producto || '').toLowerCase().includes(s)
  );

  // arma "DER 35% · IVA 21% · …" omitiendo vacíos/cero
  const ratesLine = (nc) => {
    const parts = [];
    const add = (lbl, v) => { const num = parseFloat(v); if (v != null && v !== '' && !isNaN(num) && num !== 0) parts.push(`${lbl} ${v}%`); };
    add('DER', nc.der); add('Tasa', nc.tasa); add('IVA', nc.iva);
    add('IVA ad.', nc.iva_adic); add('Gan.', nc.ganancias); add('IIBB', nc.iibb);
    return parts.join(' · ');
  };

  return (
    <>
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 1050, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
      <div style={{ background: '#f8fafc', width: '100%', maxWidth: '560px', height: '100%', overflowY: 'auto', boxShadow: '-10px 0 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.1rem 1.4rem', borderBottom: '1px solid #e2e8f0', background: '#fff', position: 'sticky', top: 0, zIndex: 10 }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>NCM guardadas</h3>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{list.length} posición{list.length === 1 ? '' : 'es'} arancelaria{list.length === 1 ? '' : 's'}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: '34px', height: '34px', borderRadius: '50%', border: 'none', cursor: 'pointer', background: '#f1f5f9', color: '#64748b', fontSize: '1.1rem' }}>×</button>
        </div>

        {/* search + new */}
        <div style={{ padding: '0.9rem 1.4rem', background: '#fff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: '64px', zIndex: 9, display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por código o producto…" style={{ ...INP, flex: 1 }} />
          <button onClick={() => setEditing({})} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.55rem 0.9rem', borderRadius: '9px', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, background: '#0f172a', color: '#fff', whiteSpace: 'nowrap' }}>
            + Nueva NCM
          </button>
        </div>

        {/* body */}
        <div style={{ padding: '1rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
          {editing && (
            <NcmForm initial={editing.id ? editing : null} onCancel={() => setEditing(null)} onSaved={onSaved} />
          )}

          {loading && <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Cargando…</p>}
          {err && <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{err}</p>}
          {!loading && !err && visible.length === 0 && !editing && <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No hay NCM que coincidan. Creá una con “+ Nueva NCM”.</p>}

          {visible.map(nc => {
            const busy = busyId === nc.id;
            const rl = ratesLine(nc);
            return (
              <div key={nc.id} style={{ background: '#fff', borderRadius: '12px', padding: '0.9rem 1rem', border: '1px solid #e2e8f0', opacity: busy ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.35rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b', fontFamily: 'monospace' }}>{nc.codigo}</p>
                    {nc.producto && <p style={{ fontSize: '0.78rem', color: '#475569', marginTop: '0.1rem' }}>{nc.producto}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                    <button onClick={() => setEditing(nc)} disabled={busy} style={{ padding: '0.32rem 0.7rem', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: busy ? 'default' : 'pointer', fontSize: '0.74rem', fontWeight: 700, background: '#fff', color: '#334155' }}>Editar</button>
                    <button onClick={() => remove(nc)} disabled={busy} title="Eliminar" aria-label="Eliminar" style={{ width: '28px', height: '28px', borderRadius: '8px', border: 'none', cursor: busy ? 'default' : 'pointer', fontSize: '0.95rem', fontWeight: 700, background: 'none', color: '#94a3b8', lineHeight: 1 }}>×</button>
                  </div>
                </div>
                {rl && <p style={{ fontSize: '0.74rem', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{rl}</p>}
                {nc.notas && <p style={{ fontSize: '0.72rem', color: '#cbd5e1', marginTop: '0.25rem' }}>{nc.notas}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>

    {confirmDel && (
      <div onClick={() => setConfirmDel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', maxWidth: 360, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
          <p style={{ fontWeight: 800, color: '#0f172a', marginBottom: '0.4rem' }}>¿Eliminar NCM?</p>
          <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1.25rem' }}>Se borra la posición “{confirmDel.codigo}”. No se puede deshacer.</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button onClick={() => setConfirmDel(null)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={() => doRemove(confirmDel)} style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Eliminar</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ─── tab switcher + default export ────────────────────────────────────────────
function CotizadorInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialMode = searchParams.get('modo') === 'aereo' ? 'aereo' : 'maritimo';
  const [mode, setMode] = useState(initialMode);
  const [importOpen, setImportOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [ncmOpen, setNcmOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (mode === 'aereo') params.set('modo', 'aereo'); else params.delete('modo');
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleApply = (targetMode, data) => {
    setMode(targetMode);
    // Defer dispatch so the target cotizador is visible/ready
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('cotizador:apply', { detail: { mode: targetMode, data } })
      );
    }, 0);
    setImportOpen(false);
  };

  const handleReactivate = (targetMode, data, meta = null) => {
    const m = targetMode === 'aereo' ? 'aereo' : 'maritimo';
    setMode(m);
    setSavedOpen(false);
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('cotizador:load', { detail: { mode: m, data, meta } })
      );
    }, 0);
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: 4, padding: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, width: 'fit-content', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button
            onClick={() => setSavedOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '0.55rem 1.1rem', borderRadius: 10, border: '1px solid #e2e8f0',
              background: '#fff', color: '#334155', fontWeight: 700, fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Cotizaciones guardadas
          </button>

          <button
            onClick={() => setNcmOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '0.55rem 1.1rem', borderRadius: 10, border: '1px solid #e2e8f0',
              background: '#fff', color: '#334155', fontWeight: 700, fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
            NCM guardadas
          </button>

          <button
            onClick={() => setImportOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '0.55rem 1.1rem', borderRadius: 10, border: '1px solid #e2e8f0',
              background: '#fff', color: '#334155', fontWeight: 700, fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Importar de PDF/foto
            <span style={{ fontSize: '0.62rem', fontWeight: 600, color: '#94a3b8' }}>IA</span>
          </button>
        </div>
      </div>

      {/* Both mounted to preserve state on toggle */}
      <div style={{ display: mode === 'maritimo' ? 'block' : 'none' }}>
        <CotizadorMaritimo />
      </div>
      <div style={{ display: mode === 'aereo' ? 'block' : 'none' }}>
        <CotizadorAereo />
      </div>

      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onApply={handleApply}
        />
      )}

      {savedOpen && (
        <SavedQuotesPanel
          onClose={() => setSavedOpen(false)}
          onReactivate={handleReactivate}
        />
      )}

      {ncmOpen && (
        <NcmPanel onClose={() => setNcmOpen(false)} />
      )}
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
