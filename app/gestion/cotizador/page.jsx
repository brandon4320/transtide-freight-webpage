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

// Fechas estimadas de los hitos, contadas desde HOY (el día que se genera la
// cotización). El arribo sale de producción + tránsito; el flete se paga 10 días
// antes de que llegue —salvo que el tránsito sea más corto que eso (aéreo), donde
// no puede caer antes del embarque.
const qDiaMas = (dias) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + dias); return d; };
const qFecha = (d) => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
function qFechasHitos(diasProd, diasTransito) {
  const prod = Math.max(0, diasProd || 0), tran = Math.max(0, diasTransito || 0);
  const dEmbarque = prod, dArribo = prod + tran;
  return {
    hoy:      qFecha(qDiaMas(0)),
    embarque: qFecha(qDiaMas(dEmbarque)),
    flete:    qFecha(qDiaMas(Math.max(dEmbarque, dArribo - 10))),
    arribo:   qFecha(qDiaMas(dArribo)),
    despacho: qFecha(qDiaMas(dArribo + 5)),   // el despacho lleva ~5 días desde el arribo
    entrega:  qFecha(qDiaMas(dArribo + 6)),   // y se entrega al día siguiente
    prod, tran,
  };
}

// Cronograma de pagos: cuándo tiene que pagar cada parte el cliente. Los momentos
// son fijos (así trabaja Transtide); el anticipo de mercadería no lleva porcentaje
// porque lo define cada proveedor (suele ser 30% o 50%).
// Los cuatro importes suman EXACTO el precio final: mercadería + (flete y seguro) +
// (aranceles, impuestos y gastos locales) + (honorarios y facturación).
function qCronograma({ c, fleteMonto, fleteLabel, sinFacturaDistinto, diasProd, diasTransito }) {
  const f = qFechasHitos(diasProd, diasTransito);
  const fch = (d) => `<strong style="color:#1e293b;">${d}</strong> · `;
  const aranceles = c.derC + c.tasC + c.ivaC + c.ivaAC + c.ganC + c.iibbC + c.gasC;
  const cierre = c.honorarios + c.gastFac;
  const hito = (titulo, detalle, monto, opts = {}) => `<tr>
    <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;">
      <div style="font-size:0.82rem;font-weight:600;color:#1e293b;">${titulo}</div>
      <div style="font-size:0.68rem;color:#64748b;margin-top:2px;line-height:1.4;">${detalle}</div>
    </td>
    <td style="padding:9px 12px;text-align:right;vertical-align:top;font-size:0.84rem;font-weight:${opts.bold ? 700 : 600};color:#1e293b;white-space:nowrap;border-bottom:1px solid #f1f5f9;">${monto}</td>
  </tr>`;
  const total = c.fobC + fleteMonto + c.segC + aranceles + cierre;
  return `<table class="sec" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:12px;width:100%;">
    <tr><td colspan="2" style="padding:10px 12px 5px;font-size:0.65rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #e2e8f0;"><span style="border-left:3px solid #ea580c;padding-left:8px;">Cronograma de pagos</span></td></tr>
    <tr><td colspan="2" style="padding:7px 12px;font-size:0.66rem;color:#64748b;border-bottom:1px solid #f1f5f9;">Fechas estimadas tomando como inicio hoy, ${f.hoy} · producción ${f.prod} días · tránsito ${f.tran} días · <strong style="color:#1e293b;">arribo estimado ${f.arribo}</strong>.</td></tr>
    ${hito('Mercadería (FOB)', `${fch(f.hoy)}Anticipo al confirmar la orden — el porcentaje lo define el proveedor (habitualmente 30% a 50%).<br>${fch(f.embarque)}Saldo con la producción terminada, antes de embarcar.`, qFmt(c.fobC))}
    ${hito(fleteLabel, `${fch(f.flete)}10 días antes del arribo de la mercadería.`, qFmt(fleteMonto + c.segC))}
    ${hito('Aranceles, impuestos y gastos locales', `${fch(f.despacho)}Durante el despacho, que lleva unos 5 días desde el arribo.`, qFmt(aranceles))}
    ${hito('Honorarios del servicio', `${fch(f.entrega)}Contra entrega, al día siguiente de terminado el despacho.`, qFmt(cierre))}
    <tr style="background:#fff4ee;">
      <td style="padding:10px 12px;font-size:0.9rem;font-weight:700;color:#1e293b;">Total</td>
      <td style="padding:10px 12px;text-align:right;font-size:0.9rem;font-weight:700;color:#1e293b;white-space:nowrap;">${qFmt(total)}</td>
    </tr>
    ${sinFacturaDistinto ? `<tr><td colspan="2" style="padding:7px 12px;font-size:0.66rem;color:#64748b;">Sin factura, el último pago es de ${qFmt(c.honorarios)} y el total queda en ${qFmt(total - c.gastFac)}.</td></tr>` : ''}
  </table>`;
}

function buildQuoteHTML({ titulo, cliente, fecha, subtitulo, descripcion, clasificacion, izq, der, precio, cronograma, footer }) {
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

      ${cronograma || ''}

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
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="cz-modal" style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: '440px', padding: '1.5rem 1.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Guardar cotización</h3>
            {loadedQuote?.id && <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 2 }}>Editando «{loadedQuote.nombre}»</p>}
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="cz-tbtn" style={{ ...TBTN, fontSize: '1.05rem', lineHeight: 1, padding: '0 0.2rem' }}>×</button>
        </div>
        {done ? (
          <div style={{ padding: '1.5rem 0 1rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#059669' }}>✓ {done === 'actualizada' ? 'Actualizada' : 'Guardada'}</p>
          </div>
        ) : (
          <div>
            <F label="Nombre / referencia *"><input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Importación máquinas — Acme" style={MINP} /></F>
            <F label="Cliente"><input type="text" value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nombre del cliente" style={MINP} /></F>
            <F label="Estado">
              <select value={estado} onChange={e => setEstado(e.target.value)} style={{ ...MINP, cursor: 'pointer' }}>
                {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </F>
            <F label="Notas">
              <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" rows={3} style={{ ...MINP, resize: 'vertical', fontFamily: 'inherit' }} />
            </F>
            {err && <p style={{ fontSize: '0.78rem', color: '#dc2626', marginBottom: '0.6rem' }}>{err}</p>}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', marginTop: '1.25rem' }}>
              <button onClick={onClose} className="cz-tbtn" style={TBTN}>Cancelar</button>
              {loadedQuote?.id ? (
                <>
                  <button onClick={() => save(true)} disabled={saving} title="Crea una cotización nueva sin tocar la anterior" className="cz-tbtn" style={{ ...TBTN, cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Guardando…' : 'Guardar como nueva'}</button>
                  <button onClick={() => save(false)} disabled={saving} title={`Sobrescribe «${loadedQuote.nombre}»`} style={{ ...PBTN, background: saving ? '#9ca3af' : '#111827', cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Guardando…' : 'Actualizar la anterior'}</button>
                </>
              ) : (
                <button onClick={() => save(true)} disabled={saving} style={{ ...PBTN, background: saving ? '#9ca3af' : '#111827', cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Guardando…' : 'Guardar'}</button>
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
    <button onClick={onClick} className="cz-tbtn" style={{ ...TBTN, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
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
      style={{ ...INP, cursor: 'pointer' }}
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
  // Carga que no va en contenedor: RORO (rodante: maquinaria, vehículos) y Break Bulk
  // (suelta / sobredimensionada). Sin m³ fijo — se cotiza por la medida real de la carga.
  'roro': { label: 'RORO', m3: null, flete: 6000, despachante: 2200, terminal: 2500, naviera: 900, logistica: 2150 },
  'bulk': { label: 'Break Bulk', m3: null, flete: 6000, despachante: 2200, terminal: 2500, naviera: 900, logistica: 2150 },
};

// m³ por defecto de la caja de edición: los tipos sin m³ fijo arrancan en 60 para
// que el campo sea editable en vez de quedar vacío.
const PRESET_M3 = Object.fromEntries(Object.entries(PRESETS).map(([k, p]) => [k, p.m3 ?? 60]));
const PRESET_COSTS = Object.fromEntries(Object.entries(PRESETS).map(([k, p]) =>
  [k, { flete: p.flete, despachante: p.despachante, terminal: p.terminal, naviera: p.naviera, logistica: p.logistica }]));

// ─── small UI primitives — Transtide Flat ─────────────────────────────────────
// Hoja plana: inputs subrayados en la pantalla de cálculo, inputs con caja fina
// solo dentro de modales/paneles (MINP). Headers de sección en micro-uppercase.
const LBL = { display: 'block', fontSize: '0.68rem', fontWeight: 500, color: '#9ca3af', marginBottom: '0.2rem', letterSpacing: 0 };
const INP = { width: '100%', padding: '0.35rem 0.05rem', border: 'none', borderBottom: '1px solid #e5e7eb', borderRadius: 0, fontSize: '0.84rem', color: '#111827', background: 'transparent', outline: 'none', fontVariantNumeric: 'tabular-nums' };
const MINP = { width: '100%', padding: '0.45rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.84rem', color: '#111827', background: '#fff', outline: 'none', fontVariantNumeric: 'tabular-nums' };
const SECL = { fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0.6rem 0 0.45rem' };
// Botón secundario: texto plano, sin borde ni fondo (hover via <style> .cz-tbtn).
const TBTN = { border: 'none', background: 'transparent', padding: '0.25rem 0', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 500, color: '#6b7280' };
// Único botón primario de la pantalla / confirmar de modal.
const PBTN = { background: '#111827', color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 1rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' };

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
// Composición del costo: filas planas con barra fina de proporción (monocromo,
// sin fondos de color). Muestra qué domina el costo (FOB vs flete vs aranceles).
function CostStack({ segments, total, totalLabel }) {
  const segs = segments.filter(s => s && s.value > 0);
  const sum = segs.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      {segs.length === 0 && <p style={{ fontSize: '0.74rem', color: '#9ca3af', padding: '0.3rem 0' }}>Sin datos todavía.</p>}
      {segs.map((s, i) => {
        const pct = (s.value / sum) * 100;
        return (
          <div key={i} style={{ padding: '0.32rem 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: 3 }}>
              <span style={{ color: '#6b7280' }}>{s.label}</span>
              <span style={{ fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {usd(s.value)} <span style={{ color: '#9ca3af', fontSize: '0.64rem', fontWeight: 400 }}>{Math.round(pct)}%</span>
              </span>
            </div>
            {pct > 0 && pct < 100 && (
              <div style={{ height: 3, background: '#f1f5f9' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: '#111827' }} />
              </div>
            )}
          </div>
        );
      })}
      {total != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', marginTop: '0.4rem', paddingTop: '0.45rem', fontWeight: 700, fontSize: '0.84rem', color: '#111827' }}>
          <span>{totalLabel}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(total)}</span>
        </div>
      )}
    </div>
  );
}

// Métrica del resumen pegajoso: valor arriba, label micro-uppercase debajo. Sin cajas.
function SummaryChip({ label, val, color = '#111827' }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: '1.15rem', fontWeight: 700, color, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{val}</p>
      <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', whiteSpace: 'nowrap' }}>{label}</p>
    </div>
  );
}
function PagaToggle({ label, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{label}</span>
      <button onClick={() => onChange(!checked)} style={{ padding: '0.1rem 0.2rem', border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, background: 'transparent', color: checked ? '#059669' : '#dc2626' }}>
        {checked ? 'SÍ' : 'NO'}
      </button>
    </div>
  );
}
// Filtro/tab como texto: activo negro con subrayado 2px, inactivo gris.
function Pill({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding: '0 0 4px', border: 'none', borderBottom: active ? '2px solid #111827' : '2px solid transparent', cursor: 'pointer', fontSize: '0.78rem', fontWeight: active ? 600 : 400, background: 'transparent', color: active ? '#111827' : '#9ca3af' }}>
      {children}
    </button>
  );
}
function Tab({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ flex: 1, padding: '0 0 4px', border: 'none', borderBottom: active ? '2px solid #111827' : '2px solid transparent', cursor: 'pointer', fontSize: '0.75rem', fontWeight: active ? 600 : 400, background: 'transparent', color: active ? '#111827' : '#9ca3af' }}>
      {children}
    </button>
  );
}
// "Card" ahora es una sección plana: sin caja ni sombra, separada por línea fina.
function Card({ children, style = {}, className }) {
  return <div className={className} style={{ background: '#fff', padding: '1rem 0 1.25rem', borderBottom: '1px solid #f1f5f9', ...style }}>{children}</div>;
}
function RRow({ label, val, val2, diff, dimmed, bold }) {
  const s = { fontSize: bold ? '0.86rem' : '0.8rem', fontWeight: bold ? 700 : 400, fontVariantNumeric: 'tabular-nums' };
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.38rem 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ ...s, color: dimmed ? '#d1d5db' : '#6b7280' }}>{label}</span>
      <div style={{ display: 'flex', gap: '1rem' }}>
        {val2 !== undefined && <span style={{ ...s, color: '#6b7280' }}>{usd(val2)}</span>}
        <span style={{ ...s, color: bold ? '#111827' : dimmed ? '#d1d5db' : '#111827' }}>{usd(val)}</span>
        {diff !== undefined && (
          <span style={{ fontSize: '0.74rem', fontWeight: 700, minWidth: '70px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: diff > 0 ? '#059669' : diff < 0 ? '#dc2626' : '#9ca3af' }}>
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
  const [contM3, setContM3] = useState(() => ({ ...PRESET_M3 }));
  const [contCosts, setContCosts] = useState(() => ({ ...PRESET_COSTS }));

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
  // Plazos para las fechas del cronograma que ve el cliente. Marítimo desde China:
  // 45-60 días de tránsito; la producción la define el proveedor.
  const [diasProd, setDiasProd] = useState('30');
  const [diasTransito, setDiasTransito] = useState('45');

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
    diasProd, diasTransito,
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
      if (d.diasProd !== undefined) setDiasProd(d.diasProd);
      if (d.diasTransito !== undefined) setDiasTransito(d.diasTransito);
      // Cotización guardada antes de que existiera un tipo: completa los que falten.
      if (d.contM3 !== undefined) setContM3({ ...PRESET_M3, ...d.contM3 });
      if (d.contCosts !== undefined) setContCosts({ ...PRESET_COSTS, ...d.contCosts });
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
    diasProd, diasTransito,
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
            qRow('Valor de Mercadería (FOB)', qFmt(c.fobC)),
            qRow('Flete Internacional', qFmt(n(fleteCli))),
            qRow('Seguro Marítimo (1% FOB)', qFmt(c.segC)),
            // Cuando se declara menos de lo que se paga, el CIF sale del declarado:
            // se muestra para que el cliente entienda por qué los aranceles no dan
            // sobre el FOB de arriba.
            c.fobDC !== c.fobC ? qRow('FOB Declarado (base arancelaria)', qFmt(c.fobDC), { sub: true }) : '',
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
        cronograma: qCronograma({
          c, fleteMonto: n(fleteCli), fleteLabel: 'Flete internacional y seguro',
          sinFacturaDistinto: !usaSociedadPropia && c.gastFac > 0,
          diasProd: n(diasProd), diasTransito: n(diasTransito),
        }),
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'inline-flex', gap: '1.4rem' }}>
          <Pill active={mode === 'cliente'} onClick={() => switchMode('cliente')}>Para Cliente</Pill>
          <Pill active={mode === 'personal'} onClick={() => switchMode('personal')}>Importación Personal</Pill>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem' }}>
          <SaveQuoteButton onClick={() => setShowSave(true)} />
          {mode === 'cliente' && (
            <button onClick={() => setShowClienteView(true)} style={{ ...PBTN, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Ver cotización al cliente
            </button>
          )}
        </div>
      </div>

      {/* ══ RESUMEN PEGAJOSO — línea de métricas, sin cajas ═══════════════════ */}
      <div style={{ position: 'sticky', top: 0, zIndex: 30, marginBottom: '0.5rem', background: '#fff', borderBottom: '1px solid #f1f5f9', padding: '0.55rem 0 0.65rem', display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
        {mode === 'personal' ? (<>
          <SummaryChip label="Costo real (sin IVA)" val={usd(c.totSinR)} />
          <SummaryChip label={`Ganancia neta (${pMrg}%)`} val={usd(c.gananciaNeta)} color="#059669" />
          <SummaryChip label="Precio venta final" val={usd(c.precioVentaFinal)} />
        </>) : (<>
          <SummaryChip label="Costo real" val={usd(c.totConR)} />
          <SummaryChip label="A cobrar al cliente" val={usd(c.totConC)} />
          <SummaryChip label="Margen / ganancia" val={usd(c.ganTotal)} color={c.ganTotal >= 0 ? '#059669' : '#dc2626'} />
        </>)}
      </div>

      {/* ══ MAIN GRID — 2 columnas: datos (izq) · números (der, fijo) ═══════════ */}
      <div className="cot-main-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 400px', gap: '1.1rem', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 }}>

      {/* fila superior: Contenedor (izq, angosto) + Identificación (der) */}
      <div className="cot-top-row" style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '0.75rem', alignItems: 'start' }}>

      {/* ── Contenedor + Mi carga (primera sección de datos) ── */}
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>

          {/* controles: contenedor + m³ mercadería + ratio en una sola fila */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.25rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px', minWidth: 220 }}>
              <label style={LBL}>Contenedor</label>
              <div style={{ display: 'flex', gap: '1.25rem', paddingBottom: 2 }}>
                {Object.entries(PRESETS).map(([key, p]) => {
                  const on = contType === key;
                  return (
                    <button key={key} onClick={() => setContType(key)} style={{ padding: '0.3rem 0 4px', border: 'none', borderBottom: on ? '2px solid #111827' : '2px solid transparent', cursor: 'pointer', fontSize: '0.76rem', fontWeight: on ? 600 : 400, background: 'transparent', color: on ? '#111827' : '#9ca3af' }}>
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
              <span style={{ fontSize: '0.62rem', color: '#9ca3af' }}>Ratio de prorrateo</span>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: c.ratio > 0 ? '#111827' : '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{c.ratio.toFixed(3)}</span>
              <span style={{ fontSize: '0.62rem', color: '#d1d5db' }}>({n(m3Merch)}/{c.curM3} m³)</span>
            </div>
          </div>

          {/* ajustar contenedor: m³ contenedor + costos de referencia (colapsado) */}
          <details className="cot-collapse">
            <summary style={{ ...SECL, margin: '0 0 0.3rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="cot-chev" style={{ fontSize: '0.7rem', color: '#9ca3af' }}>▸</span> Ajustar contenedor y costos de referencia</span>
              <span style={{ fontSize: '0.6rem', color: '#9ca3af', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{PRESETS[contType]?.label} · {contM3[contType]}m³</span>
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

          {/* charges — filas planas. La columna "lo que cobrás" solo aplica para cliente */}
          <div>
              <div className="cot-charges-header" style={{ display: 'grid', gridTemplateColumns: mode === 'cliente' ? '1fr 1fr 1.4fr' : '1fr 1.2fr', padding: '0 0 0.3rem', borderBottom: '1px solid #f1f5f9', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>Concepto</span>
                <span className="cot-charges-prorated" style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', textAlign: 'right' }}>Tu costo prorrateado</span>
                {mode === 'cliente' && <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', textAlign: 'right' }}>Lo que cobrás al cliente</span>}
              </div>
              {[
                ['Flete', c.fleteR, fleteCli, setFleteCli],
                ['Despachante', c.desR, gDes, setGDes],
                ['Terminal', c.terR, gTer, setGTer],
                ['Naviera', c.navR, gNav, setGNav],
                ['Logística', c.logR, gLog, setGLog],
              ].map(([label, prorated, val, setVal], i, arr) => (
                <div key={label} className="cot-charges-row" style={{ display: 'grid', gridTemplateColumns: mode === 'cliente' ? '1fr 1fr 1.4fr' : '1fr 1.2fr', alignItems: 'center', padding: '0.35rem 0', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{label}</span>
                  <span className="cot-charges-prorated" style={{ fontSize: '0.78rem', color: c.ratio > 0 ? '#111827' : '#d1d5db', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(prorated)}</span>
                  {mode === 'cliente' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginLeft: 'auto', width: '120px', borderBottom: '1px solid #e5e7eb', padding: '0.15rem 0' }}>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>$</span>
                      <input type="number" inputMode="decimal" step="any" min="0" placeholder="0" value={val} onChange={e => setVal(e.target.value)} onWheel={e => e.currentTarget.blur()} style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', textAlign: 'right', fontSize: '0.78rem', color: '#111827', fontVariantNumeric: 'tabular-nums', padding: 0 }} />
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      </Card>

          {/* identification */}
          <Card>
            <p style={{ ...SECL, margin: '0 0 0.6rem' }}>Identificación del embarque</p>
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
                <input type="text" list="ncm-codes-mar" value={clasificacion} onChange={e => setClasificacion(e.target.value)} placeholder="8456.11.00" style={{ ...INP, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
                <datalist id="ncm-codes-mar">
                  {ncmList.map(nc => <option key={nc.id} value={nc.codigo}>{nc.producto}</option>)}
                </datalist>
              </F>
            </div>
            <F label="Descripción de la mercadería"><TI value={descripcion} onChange={setDescripcion} placeholder="Ej: Máquinas cortadoras láser 1000W" /></F>
            {/* Alimentan las fechas estimadas del cronograma que ve el cliente. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.6rem' }}>
              <F label="Días de producción"><input type="number" inputMode="numeric" min="0" value={diasProd} onChange={e => setDiasProd(e.target.value)} onWheel={e => e.currentTarget.blur()} style={INP} /></F>
              <F label="Días de tránsito"><input type="number" inputMode="numeric" min="0" value={diasTransito} onChange={e => setDiasTransito(e.target.value)} onWheel={e => e.currentTarget.blur()} style={INP} /></F>
            </div>

            {/* FOB — la distinción real vs cliente va solo en el color del texto */}
            <div style={{ marginTop: '0.9rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: mode === 'cliente' ? '1fr 1fr' : '1fr', gap: '0.9rem' }}>
                <div>
                  <label style={{ ...LBL, color: '#059669', fontWeight: 600 }}>FOB real (lo que pagás)</label>
                  <NI value={fobReal} onChange={setFobReal} />
                </div>
                {mode === 'cliente' && (
                  <div>
                    <label style={{ ...LBL, color: '#d97706', fontWeight: 600 }}>FOB cliente (lo que cobrás)</label>
                    <NI value={fobCliente} onChange={setFobCliente} />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem 1.1rem', flexWrap: 'wrap', marginTop: '0.7rem' }}>
                <details className="cot-collapse">
                  <summary style={{ ...SECL, margin: 0, padding: 0, color: '#059669', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <span className="cot-chev" style={{ fontSize: '0.7rem' }}>▸</span> FOB declarado real (si difiere)
                  </summary>
                  <div style={{ marginTop: '0.35rem' }}><NI value={fobDecReal} onChange={setFobDecReal} placeholder="= FOB real si no difiere" /></div>
                </details>
                {mode === 'cliente' && (
                  <details className="cot-collapse">
                    <summary style={{ ...SECL, margin: 0, padding: 0, color: '#d97706', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <span className="cot-chev" style={{ fontSize: '0.7rem' }}>▸</span> FOB declarado cliente (si difiere)
                    </summary>
                    <div style={{ marginTop: '0.35rem' }}><NI value={fobDecCli} onChange={setFobDecCli} placeholder="= FOB cliente si no difiere" /></div>
                  </details>
                )}
                <details className="cot-collapse">
                  <summary style={{ ...SECL, margin: 0, padding: 0, color: '#059669', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <span className="cot-chev" style={{ fontSize: '0.7rem' }}>▸</span> Flete real (si difiere del prorrateo)
                  </summary>
                  <div style={{ marginTop: '0.35rem' }}><NI value={fleteRealInput} onChange={setFleteRealInput} placeholder={`auto: ${usd(curCosts.flete * c.ratio)}`} /></div>
                </details>
              </div>
            </div>
          </Card>
      </div>

          {/* secciones de entrada: aranceles (izq) · honorarios/cierre (der) */}
          <Card className="cot-sections-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem 2.5rem', alignItems: 'start' }}>

            {/* ── Aranceles ── */}
            {(
              <div>
                <p style={{ ...SECL, margin: '0 0 0.9rem' }}>Configuración arancelaria</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.9rem', marginBottom: '1rem' }}>
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

                <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '0.65rem' }}>Percepciones — ¿aplican en esta importación? Con SÍ se cobran en la cotización y cuentan en el costo real; con NO, en ninguno.</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1.5rem' }}>
                  {[
                    ['IVA Adicional %', pIvaA, setPIvaA, pagaIvaA, setPagaIvaA],
                    ['Perc. Ganancias %', pGan, setPGan, pagaGan, setPagaGan],
                    ['Perc. IIBB %', pIIBB, setPIIBB, pagaIIBB, setPagaIIBB],
                  ].map(([lbl, val, setVal, paga, setPaga]) => (
                    <div key={lbl} style={{ minWidth: 0 }}>
                      <label style={{ ...LBL, marginBottom: '0.12rem' }}>{lbl}</label>
                      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #e5e7eb', maxWidth: '100%' }}>
                        <input type="number" inputMode="decimal" step="any" min="0" value={val} onChange={e => setVal(e.target.value)} onWheel={e => e.currentTarget.blur()} style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', padding: '0.35rem 0.05rem', fontSize: '0.84rem', color: paga ? '#111827' : '#d1d5db', fontVariantNumeric: 'tabular-nums' }} />
                        <button onClick={() => setPaga(!paga)} title="¿Aplica en esta importación? Afecta la cotización al cliente y tu costo real" style={{ border: 'none', background: 'transparent', padding: '0 0.1rem 0 0.6rem', cursor: 'pointer', fontSize: '0.66rem', fontWeight: 700, color: paga ? '#059669' : '#dc2626' }}>
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
                <p style={{ ...SECL, margin: '0 0 0.9rem' }}>Honorarios &amp; cierre</p>

                {/* ── Toggle: Sociedad ── */}
                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: '0.45rem' }}>¿Qué sociedad usa el cliente para importar?</p>
                  <div style={{ display: 'flex', gap: '1.4rem' }}>
                    <button onClick={() => setUsaSociedadPropia(true)} style={{ padding: '0 0 4px', border: 'none', borderBottom: usaSociedadPropia ? '2px solid #111827' : '2px solid transparent', cursor: 'pointer', fontSize: '0.78rem', fontWeight: usaSociedadPropia ? 600 : 400, background: 'transparent', color: usaSociedadPropia ? '#111827' : '#9ca3af' }}>
                      Sociedad del cliente
                    </button>
                    <button onClick={() => setUsaSociedadPropia(false)} style={{ padding: '0 0 4px', border: 'none', borderBottom: !usaSociedadPropia ? '2px solid #111827' : '2px solid transparent', cursor: 'pointer', fontSize: '0.78rem', fontWeight: !usaSociedadPropia ? 600 : 400, background: 'transparent', color: !usaSociedadPropia ? '#111827' : '#9ca3af' }}>
                      Sociedad de Transtide
                    </button>
                  </div>
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '0.35rem' }}>
                    {usaSociedadPropia ? 'Sin gastos de facturación.' : 'Se suman gastos de facturación.'}
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem' }}>
                  <F label={`Honorarios % (s/ costo CON IVA)`}>
                    <input type="number" inputMode="decimal" step="any" min="0" value={pHon} onChange={e => setPHon(e.target.value)} style={INP} />
                  </F>
                  <F label={`Honorarios mínimos (USD)`}>
                    <input type="number" inputMode="decimal" step="any" min="0" value={pHonMin} onChange={e => setPHonMin(e.target.value)} style={INP} placeholder="Sin mínimo" />
                  </F>
                </div>
                {c.honMinAplica && (
                  <p style={{ fontSize: '0.78rem', color: '#6b7280', borderLeft: '2px solid #d97706', paddingLeft: 12, marginTop: '0.45rem' }}>
                    Aplica el mínimo: {pHon}% = <span style={{ color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{usd(c.totConC * (n(pHon) / 100))}</span> &lt; <span style={{ color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{usd(n(pHonMin))}</span>
                  </p>
                )}

                {!usaSociedadPropia && (
                  <F label={`Gastos de Facturación % — sociedad Transtide`}>
                    <input type="number" inputMode="decimal" step="any" min="0" value={pFac} onChange={e => setPFac(e.target.value)} style={INP} />
                  </F>
                )}

                <div style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.38rem 0', borderBottom: '1px solid #f1f5f9', color: '#6b7280' }}>
                    <span>Costo Total CON IVA</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(c.totConC)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.38rem 0', borderBottom: '1px solid #f1f5f9', color: '#6b7280' }}>
                    <span>+ Honorarios ({c.honMinAplica ? 'mín. USD' : `${pHon}%`})</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(c.honorarios)}</span>
                  </div>
                  {!usaSociedadPropia && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.38rem 0', borderBottom: '1px solid #f1f5f9', color: '#6b7280' }}>
                      <span>+ Gastos de Facturación ({pFac}%)</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(c.gastFac)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.55rem 0', fontWeight: 700, color: '#111827' }}>
                    <span>= Precio final</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(c.precioConF)}</span>
                  </div>
                  {usaSociedadPropia && (
                    <p style={{ fontSize: '0.68rem', color: '#059669', marginTop: '0.25rem' }}>
                      Sin gastos de facturación — sociedad del cliente
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Precio de venta (personal) ── */}
            {mode === 'personal' && (
              <div>
                <p style={{ ...SECL, margin: '0 0 0.9rem' }}>Precio de venta estimado</p>
                <F label="Margen de ganancia deseado %">
                  <input type="number" inputMode="decimal" step="any" min="0" value={pMrg} onChange={e => setPMrg(e.target.value)} style={INP} />
                </F>
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '0 0 0.6rem' }}>El IVA del import es crédito fiscal recuperable: el margen se calcula sobre el costo sin IVA, y el IVA se suma recién al vender.</p>
                <div style={{ marginTop: '0.4rem' }}>
                  {[
                    ['Costo real (sin IVA)', c.totSinR, false, false],
                    [`+ Margen (${pMrg}%) — ganancia neta`, c.gananciaNeta, false, 'profit'],
                    ['= Precio de venta neto', c.ventaNeta, true, false],
                    [`+ IVA (${pIva}%) sobre la venta`, c.ivaVentaMonto, false, false],
                    ['= Precio de venta final (con IVA)', c.precioVentaFinal, 'final', false],
                  ].map(([lbl, val, emph, kind], i, arr) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: emph === 'final' ? '0.92rem' : '0.8rem', padding: '0.4rem 0', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none', fontWeight: emph ? 700 : 400, color: emph === 'final' ? '#059669' : kind === 'profit' ? '#059669' : emph ? '#111827' : '#6b7280' }}>
                      <span>{lbl}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </Card>
        </div>

        {/* ── resultado: columna de números fija a la derecha ──────────────── */}
        <div className="cot-right-rail" style={{ position: 'sticky', top: '1rem', maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* ══ MODO CLIENTE ════════════════════════════════════════════════ */}
          {mode === 'cliente' && (<>

            <Card>
              <p style={{ ...SECL, margin: '0 0 0.2rem' }}>Precio final al cliente</p>
              <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: '0.8rem' }}>
                {usaSociedadPropia ? 'Sociedad del cliente — sin gastos de facturación' : 'Sociedad Transtide — incluye gastos de facturación'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: usaSociedadPropia ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>
                <div>
                  <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#059669', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.precioConF)}</p>
                  <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginTop: '0.2rem' }}>
                    {usaSociedadPropia ? 'Precio final' : 'Con factura'}
                  </p>
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '0.15rem', fontVariantNumeric: 'tabular-nums' }}>
                    Hon. {usd(c.honorarios)}{!usaSociedadPropia ? ` + Fac. ${usd(c.gastFac)}` : ''}
                  </p>
                </div>
                {!usaSociedadPropia && (
                  <div>
                    <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#d97706', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.precioSinF)}</p>
                    <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginTop: '0.2rem' }}>Sin factura</p>
                    <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '0.15rem', fontVariantNumeric: 'tabular-nums' }}>Ahorro del cliente: {usd(c.gastFac)}</p>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '2.5rem', marginTop: '0.9rem', paddingTop: '0.7rem', borderTop: '1px solid #f1f5f9' }}>
                <div>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{usd(c.totConC)}</p>
                  <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>Costo total con IVA</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{usd(c.totSinC)}</p>
                  <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>Costo total sin IVA</p>
                </div>
              </div>
              <div style={{ marginTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>FOB dec. cliente · CIF aranceles</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{usd(c.fobDC)} · {usd(c.cifC)}</span>
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
                <summary style={{ ...SECL, margin: '0 0 0.3rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, cursor: 'pointer' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="cot-chev" style={{ fontSize: '0.7rem', color: '#9ca3af' }}>▸</span> Rentabilidad por concepto</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: c.ganTotal >= 0 ? '#059669' : '#dc2626', textTransform: 'none', letterSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>{usd(c.ganTotal)}</span>
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
                          <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{lbl}</span>
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: val >= 0 ? '#059669' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                            {usd(val)} {pctFob && <span style={{ fontSize: '0.66rem', color: '#9ca3af', fontWeight: 400 }}>({pctFob})</span>}
                          </span>
                        </div>
                        {barW > 0 && barW < 100 && (
                          <div style={{ height: '3px', background: '#f1f5f9' }}>
                            <div style={{ height: '100%', width: `${barW}%`, background: val >= 0 ? '#059669' : '#dc2626', transition: 'width 0.3s' }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '0.75rem', paddingTop: '0.7rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#111827' }}>Ganancia total</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.15rem', fontWeight: 700, color: c.ganTotal >= 0 ? '#059669' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{usd(c.ganTotal)}</div>
                      {c.fobR > 0 && <div style={{ fontSize: '0.66rem', color: '#9ca3af' }}>{((c.ganTotal / c.fobR) * 100).toFixed(1)}% s/ FOB real</div>}
                    </div>
                  </div>
                </div>
              </details>
            </Card>

            <Card>
              <details className="cot-collapse">
                <summary style={{ ...SECL, margin: '0 0 0.3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="cot-chev" style={{ fontSize: '0.7rem', color: '#9ca3af' }}>▸</span> Detalle real vs cobrado</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: c.ganTotal >= 0 ? '#059669' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{usd(c.ganTotal)}</span>
                </summary>
                <div style={{ marginTop: '0.4rem' }}>
              <div className="cot-detalle-header" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: '0.35rem', paddingBottom: '0.3rem', borderBottom: '1px solid #f1f5f9' }}>
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
                <div key={lbl} className="cot-detalle-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '0.3rem 0', borderBottom: '1px solid #f1f5f9', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{lbl}</span>
                  <span style={{ fontSize: '0.78rem', color: '#6b7280', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(real)}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#111827', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(cobro)}</span>
                  <span className="cot-detalle-margen" style={{ fontSize: '0.74rem', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: diff === null ? '#d1d5db' : diff > 0 ? '#059669' : diff < 0 ? '#dc2626' : '#9ca3af' }}>
                    {diff === null ? '—' : (diff > 0 ? '+' : '') + (usd(diff))}
                  </span>
                </div>
              ))}
              <div className="cot-detalle-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '0.5rem 0', borderTop: '1px solid #f1f5f9', marginTop: '0.4rem', fontWeight: 700, fontSize: '0.84rem', fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: '#111827' }}>TOTAL</span>
                <span style={{ textAlign: 'right', color: '#6b7280' }}>{usd(c.totConR)}</span>
                <span style={{ textAlign: 'right', color: '#111827' }}>{usd(c.totConC)}</span>
                <span className="cot-detalle-margen" style={{ textAlign: 'right', color: c.ganTotal >= 0 ? '#059669' : '#dc2626' }}>{c.ganTotal >= 0 ? '+' : ''}{usd(c.ganTotal)}</span>
              </div>
                </div>
              </details>
            </Card>

          </>)}

          {/* ══ MODO PERSONAL ═══════════════════════════════════════════════ */}
          {mode === 'personal' && (<>

            <Card>
              <p style={{ ...SECL, margin: '0 0 0.7rem' }}>Costo real de importación (sin IVA)</p>
              <p style={{ fontSize: '1.7rem', fontWeight: 700, color: '#111827', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.totSinR)}</p>
              <p style={{ fontSize: '0.76rem', color: '#9ca3af', marginTop: '0.3rem' }}>Con IVA pagás {usd(c.totConR)} · el IVA es crédito fiscal recuperable</p>
              {c.ventaNeta > 0 && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>Ganancia neta ({pMrg}%)</span>
                    <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>{usd(c.gananciaNeta)}</span>
                  </div>
                  <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: '0.15rem' }}>
                    Precio de venta neto (sin IVA)
                  </p>
                  <p style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.ventaNeta)}</p>
                  <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', margin: '0.6rem 0 0.15rem' }}>
                    Precio de venta final (con IVA {pIva}%)
                  </p>
                  <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#059669', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.precioVentaFinal)}</p>
                  <p style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: '0.2rem' }}>incluye {usd(c.ivaVentaMonto)} de IVA</p>
                </div>
              )}
              <div style={{ marginTop: '0.75rem', paddingTop: '0.55rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>FOB declarado · CIF declarado</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{usd(c.fobDR)} · {usd(c.cifR)}</span>
              </div>
              <p style={{ marginTop: '0.55rem', fontSize: '0.7rem', color: '#9ca3af' }}>Importación personal — siempre con sociedad Transtide</p>
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
                <summary style={{ ...SECL, margin: '0 0 0.3rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <span className="cot-chev" style={{ fontSize: '0.7rem', color: '#9ca3af' }}>▸</span>
                  Desglose de costos reales
                </summary>
                <div style={{ marginTop: '0.3rem' }}>
                  <RRow label="FOB Real" val={c.fobR} />
                  <RRow label="Flete prorrateado" val={c.fleteR} />
                  <RRow label="Seguro (1%)" val={c.segR} />
                  <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', margin: '0.5rem 0 0.25rem' }}>Aranceles pagados</p>
                  <RRow label={`Derechos (${pDer}%)`} val={c.derR} />
                  <RRow label={`Tasa Estadística (${pTas}%)`} val={c.tasR} />
                  <RRow label={`IVA (${pIva}%)`} val={c.ivaR} dimmed={!pagaIva} />
                  <RRow label={`IVA Adicional (${pIvaA}%)`} val={c.ivaAR} dimmed={!pagaIvaA} />
                  <RRow label={`Perc. Ganancias (${pGan}%)`} val={c.ganR} dimmed={!pagaGan} />
                  <RRow label={`Perc. IIBB (${pIIBB}%)`} val={c.iibbR} dimmed={!pagaIIBB} />
                  <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', margin: '0.5rem 0 0.25rem' }}>Gastos locales</p>
                  <RRow label="Despachante" val={c.desR} />
                  <RRow label="Terminal" val={c.terR} />
                  <RRow label="Naviera" val={c.navR} />
                  <RRow label="Logística Interna" val={c.logR} />
                </div>
              </details>
              <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '0.6rem', paddingTop: '0.6rem', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#111827' }}>Total CON IVA</span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{usd(c.totConR)}</span>
              </div>
            </Card>

          </>)}

        </div>
      </div>


      {/* ══ MODAL: VISTA COTIZACIÓN CLIENTE ═════════════════════════════════ */}
      {showClienteView && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowClienteView(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div className="cz-modal" style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto' }}>

            {/* modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.2rem 1.75rem', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: '#fff', borderRadius: '12px 12px 0 0', zIndex: 10 }}>
              <div>
                <p style={{ fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: '0.1rem' }}>Vista previa</p>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Cotización al Cliente</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button onClick={printClienteQuote} style={{ ...PBTN, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Imprimir / PDF
                </button>
                <button onClick={() => setShowClienteView(false)} className="cz-tbtn" style={{ ...TBTN, fontSize: '1.05rem', lineHeight: 1 }}>×</button>
              </div>
            </div>

            {/* modal body — quote preview */}
            <div style={{ padding: '1.5rem 1.75rem' }}>

              {/* brand + date */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.2rem' }}>
                <div>
                  <p style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>TRANSTIDE FREIGHT</p>
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Gestión Logística & Importaciones</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '0.66rem', color: '#9ca3af' }}>Fecha de cotización</p>
                  <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                </div>
              </div>

              {/* title */}
              <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.7rem', marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827' }}>Cotización de importación{cliente ? <span style={{ color: '#6b7280', fontWeight: 400 }}> · {cliente}</span> : ''}</p>
              </div>

              {/* client info */}
              {(descripcion || clasificacion) && (
                <div style={{ marginBottom: '1.2rem', display: 'grid', gap: '0.35rem' }}>
                  {descripcion && <div style={{ display: 'flex', gap: '1rem' }}><span style={{ fontSize: '0.7rem', color: '#9ca3af', minWidth: '130px' }}>Descripción</span><span style={{ fontSize: '0.8rem', color: '#111827' }}>{descripcion}</span></div>}
                  {clasificacion && <div style={{ display: 'flex', gap: '1rem' }}><span style={{ fontSize: '0.7rem', color: '#9ca3af', minWidth: '130px' }}>Pos. Arancelaria</span><span style={{ fontSize: '0.8rem', color: '#111827', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{clasificacion}</span></div>}
                </div>
              )}

              {/* desglose — filas planas por sección */}
              <div style={{ marginBottom: '1rem' }}>

                {/* base importación */}
                <p style={{ ...SECL, margin: '0 0 0.2rem' }}>Base de la Importación</p>
                {[
                  ['Valor de Mercadería (FOB)', usd(c.fobC)],
                  ['Flete Internacional', usd(n(fleteCli))],
                  ['Seguro Marítimo (1% FOB)', usd(c.segC)],
                  ...(c.fobDC !== c.fobC ? [['FOB Declarado (base arancelaria)', usd(c.fobDC)]] : []),
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.8rem', color: '#6b7280' }}>
                    <span>{l}</span><span style={{ color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.84rem', fontWeight: 700, color: '#111827' }}>
                  <span>CIF — Base Arancelaria</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(c.cifC)}</span>
                </div>

                {/* aranceles */}
                <p style={{ ...SECL, margin: '1.1rem 0 0.2rem' }}>Aranceles Aduaneros</p>
                {[
                  [`Derechos de Importación (${pDer}%)`, usd(c.derC)],
                  ...(pTas > 0 ? [[`Tasa Estadística (${pTas}%)`, usd(c.tasC)]] : []),
                  ['Base IVA', usd(c.bivC), true],
                  [`IVA (${pIva}%)`, usd(c.ivaC)],
                  ...(c.ivaAC > 0 ? [[`IVA Adicional (${pIvaA}%)`, usd(c.ivaAC)]] : []),
                  ...(c.ganC > 0 ? [[`Percepción Ganancias (${pGan}%)`, usd(c.ganC)]] : []),
                  ...(c.iibbC > 0 ? [[`Percepción IIBB (${pIIBB}%)`, usd(c.iibbC)]] : []),
                ].map(([l, v, sub]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.8rem', color: sub ? '#9ca3af' : '#6b7280' }}>
                    <span>{l}</span><span style={{ color: sub ? '#9ca3af' : '#111827', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                  </div>
                ))}

                {/* gastos locales */}
                {(c.desC > 0 || c.terC > 0 || c.navC > 0 || c.logC > 0) && (<>
                  <p style={{ ...SECL, margin: '1.1rem 0 0.2rem' }}>Gastos Locales</p>
                  {[
                    ['Despachante de Aduana', c.desC],
                    ['Terminal Portuaria', c.terC],
                    ['Naviera', c.navC],
                    ['Logística Interna', c.logC],
                  ].filter(([, v]) => v > 0).map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.8rem', color: '#6b7280' }}>
                      <span>{l}</span><span style={{ color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{usd(v)}</span>
                    </div>
                  ))}
                </>)}

                {/* totales */}
                <p style={{ ...SECL, margin: '1.1rem 0 0.2rem' }}>Resumen</p>
                {[
                  ['Costo Total CON IVA', usd(c.totConC), false, true],
                  ['Costo Total SIN IVA', usd(c.totSinC), true, false],
                  [c.honMinAplica ? 'Honorarios del Servicio' : `Honorarios del Servicio (${pHon}%)`, usd(c.honorarios), false, false],
                  ...(c.gastFac > 0 ? [[`Gastos de Facturación (${pFac}%)`, usd(c.gastFac), true, false]] : []),
                ].map(([l, v, sub, bold]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: sub ? '0.78rem' : bold ? '0.86rem' : '0.8rem', fontWeight: bold ? 700 : 400, color: sub ? '#9ca3af' : bold ? '#111827' : '#6b7280' }}>
                    <span>{l}</span><span style={{ fontVariantNumeric: 'tabular-nums', color: sub ? '#9ca3af' : '#111827' }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* final prices */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', margin: '1.2rem 0', paddingTop: '0.9rem', borderTop: '1px solid #f1f5f9' }}>
                <div>
                  <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: '4px' }}>Precio Final CON Factura</p>
                  <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#059669', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.precioConF)}</p>
                  <p style={{ fontSize: '0.66rem', color: '#9ca3af', marginTop: '5px', fontVariantNumeric: 'tabular-nums' }}>Hon. {usd(c.honorarios)} + Gs.Fac. {usd(c.gastFac)}</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: '4px' }}>Precio Final SIN Factura</p>
                  <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#d97706', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.precioSinF)}</p>
                  <p style={{ fontSize: '0.66rem', color: '#9ca3af', marginTop: '5px', fontVariantNumeric: 'tabular-nums' }}>Ahorro del cliente: {usd(c.gastFac)}</p>
                </div>
              </div>

              {/* disclaimer */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', lineHeight: 1.6 }}>
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
  // Plazos para las fechas del cronograma. Aéreo regular: 5-10 días de tránsito.
  const [diasProd, setDiasProd] = useState('30');
  const [diasTransito, setDiasTransito] = useState('7');

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
            qRow('Valor de Mercadería (FOB)', qFmt(c.fobC)),
            qRow(`Flete Aéreo (${chargeable.toFixed(2)} kg chargeable)`, qFmt(c.fleteC)),
            qRow('Seguro (1% FOB)', qFmt(c.segC)),
            c.fobDC !== c.fobC ? qRow('FOB Declarado (base arancelaria)', qFmt(c.fobDC), { sub: true }) : '',
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
        cronograma: qCronograma({
          c, fleteMonto: c.fleteC, fleteLabel: 'Flete aéreo y seguro',
          sinFacturaDistinto: !usaSociedadPropia && c.gastFac > 0,
          diasProd: n(diasProd), diasTransito: n(diasTransito),
        }),
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

      {/* HEADER — modo + acciones, una sola fila (el título vive arriba, en la página) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'inline-flex', gap: '1.4rem' }}>
          <Pill active={mode === 'cliente'} onClick={() => switchMode('cliente')}>Para Cliente</Pill>
          <Pill active={mode === 'personal'} onClick={() => switchMode('personal')}>Importación Personal</Pill>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem' }}>
          <SaveQuoteButton onClick={() => setShowSave(true)} />
          {mode === 'cliente' && (
            <button onClick={() => setShowClienteView(true)} style={{ ...PBTN, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Ver cotización al cliente
            </button>
          )}
        </div>
      </div>

      {/* RESUMEN PEGAJOSO — línea de métricas, sin cajas */}
      <div style={{ position: 'sticky', top: 0, zIndex: 30, marginBottom: '0.5rem', background: '#fff', borderBottom: '1px solid #f1f5f9', padding: '0.55rem 0 0.65rem', display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
        {mode === 'personal' ? (<>
          <SummaryChip label="Costo real (sin IVA)" val={usd(c.totSinR)} />
          <SummaryChip label={`Ganancia neta (${pMrg}%)`} val={usd(c.gananciaNeta)} color="#059669" />
          <SummaryChip label="Precio venta final" val={usd(c.precioVentaFinal)} />
        </>) : (<>
          <SummaryChip label="Costo real" val={usd(c.totConR)} />
          <SummaryChip label="A cobrar al cliente" val={usd(c.totConC)} />
          <SummaryChip label="Margen / ganancia" val={usd(c.ganTotal)} color={c.ganTotal >= 0 ? '#059669' : '#dc2626'} />
        </>)}
      </div>

      {/* SETUP — Carga a transportar */}
      <Card>
        <p style={{ ...SECL, margin: '0 0 0.7rem' }}>Carga a transportar</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: '1.25rem', alignItems: 'end' }}>
          <div>
            <label style={LBL}>Volumen (m³)</label>
            <NI value={m3Input} onChange={setM3Input} />
            <p style={{ fontSize: '0.62rem', color: '#9ca3af', marginTop: '0.3rem' }}>1 m³ ≈ {KG_PER_M3} kg vol. (IATA)</p>
          </div>
          <div>
            <label style={LBL}>Peso real (kg)</label>
            <NI value={pesoReal} onChange={setPesoReal} />
            <p style={{ fontSize: '0.62rem', color: '#9ca3af', marginTop: '0.3rem' }}>peso bruto declarado</p>
          </div>
          <div>
            <p style={{ fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.2, color: chargeable > 0 ? '#111827' : '#d1d5db', fontVariantNumeric: 'tabular-nums' }}>{chargeable.toFixed(2)} kg</p>
            <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>Peso a tarifar (chargeable)</p>
            <p style={{ fontSize: '0.64rem', marginTop: '0.2rem', color: chargeable > 0 && usaVolumetrico ? '#d97706' : '#9ca3af' }}>
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
          <Card>
            <p style={{ ...SECL, margin: '0 0 0.6rem' }}>Identificación del embarque</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
              <F label="Cliente">
                <input type="text" list="clientes-list-aereo" value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nombre del cliente" style={INP} />
                <datalist id="clientes-list-aereo">
                  {clientesList.map(cl => <option key={cl.id} value={cl.nombre} />)}
                </datalist>
              </F>
              <F label="Posición arancelaria">
                <input type="text" list="ncm-codes-aereo" value={clasificacion} onChange={e => setClasificacion(e.target.value)} placeholder="8456.11.00" style={{ ...INP, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
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
            {/* Alimentan las fechas estimadas del cronograma que ve el cliente. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.6rem' }}>
              <F label="Días de producción"><input type="number" inputMode="numeric" min="0" value={diasProd} onChange={e => setDiasProd(e.target.value)} onWheel={e => e.currentTarget.blur()} style={INP} /></F>
              <F label="Días de tránsito"><input type="number" inputMode="numeric" min="0" value={diasTransito} onChange={e => setDiasTransito(e.target.value)} onWheel={e => e.currentTarget.blur()} style={INP} /></F>
            </div>
          </Card>

          {/* tab bar — texto con subrayado, sobre línea fina */}
          <div style={{ display: 'flex', gap: '1.4rem', borderBottom: '1px solid #f1f5f9', paddingTop: '0.5rem', flexWrap: 'wrap' }}>
            {tabs.map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: '0 0 6px', border: 'none', borderBottom: tab === id ? '2px solid #111827' : '2px solid transparent', marginBottom: -1, cursor: 'pointer', fontSize: '0.76rem', fontWeight: tab === id ? 600 : 400, background: 'transparent', color: tab === id ? '#111827' : '#9ca3af', lineHeight: 1.2 }}>
                {label}
              </button>
            ))}
          </div>

          {/* tab content */}
          <Card>

            {/* COTIZACIÓN CLIENTE */}
            {tab === 'cliente_fob' && (
              <div>
                <p style={{ ...SECL, margin: '0 0 0.9rem', color: '#d97706' }}>FOB &amp; costos cobrados al cliente</p>

                <div style={{ marginBottom: '0.55rem' }}>
                  <label style={{ ...LBL, color: '#d97706', fontWeight: 600 }}>FOB Cliente</label>
                  <NI value={fobCliente} onChange={setFobCliente} />
                </div>
                <details className="cot-collapse" style={{ marginBottom: '0.85rem' }}>
                  <summary style={{ ...SECL, margin: '0 0 0.35rem', color: '#d97706', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <span className="cot-chev" style={{ fontSize: '0.7rem' }}>▸</span> FOB declarado en aduana (si difiere del cobrado)
                  </summary>
                  <div><NI value={fobDecCli} onChange={setFobDecCli} placeholder="= FOB cliente si no difiere" /></div>
                </details>

                <p style={SECL}>Línea aérea destino (cobrado al cliente)</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem 1.5rem' }}>
                  <F label="Flete aéreo (USD)"><NI value={fleteCliInput} onChange={setFleteCliInput} /></F>
                  <F label="AWB"><NI value={awbCli} onChange={setAwbCli} /></F>
                  <F label="Handling"><NI value={handCli} onChange={setHandCli} /></F>
                  <F label="Terminal aérea"><NI value={terCli} onChange={setTerCli} /></F>
                  <F label="Despachante"><NI value={desCli} onChange={setDesCli} /></F>
                  <F label="Transporte interno"><NI value={traCli} onChange={setTraCli} /></F>
                </div>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
                  <div>
                    <p style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600 }}>CIF base aranceles cliente</p>
                    <p style={{ fontSize: '0.65rem', color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>FOB dec. {usd(c.fobDC)} + Flete {usd(c.fleteC)} + Seguro {usd(c.segC)}</p>
                  </div>
                  <p style={{ fontSize: '1.05rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{usd(c.cifC)}</p>
                </div>
              </div>
            )}

            {/* MIS COSTOS REALES */}
            {tab === 'real_fob' && (
              <div>
                <p style={{ ...SECL, margin: '0 0 0.9rem', color: '#059669' }}>FOB &amp; costos reales</p>

                <div style={{ marginBottom: '0.55rem' }}>
                  <label style={{ ...LBL, color: '#059669', fontWeight: 600 }}>FOB Real</label>
                  <NI value={fobReal} onChange={setFobReal} />
                </div>
                <details className="cot-collapse" style={{ marginBottom: '0.85rem' }}>
                  <summary style={{ ...SECL, margin: '0 0 0.35rem', color: '#059669', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <span className="cot-chev" style={{ fontSize: '0.7rem' }}>▸</span> FOB declarado en aduana (si difiere del pagado)
                  </summary>
                  <div><NI value={fobDecReal} onChange={setFobDecReal} placeholder="= FOB real si no difiere" /></div>
                </details>

                <p style={SECL}>Línea aérea destino &amp; gastos aeroportuarios (real)</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem 1.5rem' }}>
                  <F label="Flete aéreo real (USD)"><NI value={fleteRealInput} onChange={setFleteRealInput} /></F>
                  <F label="AWB real"><NI value={awbReal} onChange={setAwbReal} /></F>
                  <F label="Handling real"><NI value={handReal} onChange={setHandReal} /></F>
                  <F label="Terminal aérea real"><NI value={terReal} onChange={setTerReal} /></F>
                  <F label="Despachante real"><NI value={desReal} onChange={setDesReal} /></F>
                  <F label="Transporte real"><NI value={traReal} onChange={setTraReal} /></F>
                </div>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
                  <div>
                    <p style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600 }}>CIF declarado real</p>
                    <p style={{ fontSize: '0.65rem', color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>FOB dec. {usd(c.fobDR)} + Flete {usd(c.fleteR)} + Seguro {usd(c.segR)}</p>
                  </div>
                  <p style={{ fontSize: '1.05rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{usd(c.cifR)}</p>
                </div>
              </div>
            )}

            {/* ARANCELES — same logic as maritimo */}
            {tab === 'aranceles' && (
              <div>
                <p style={{ ...SECL, margin: '0 0 0.4rem' }}>Configuración arancelaria</p>
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: '0.85rem' }}>Misma lógica que importación marítima — CIF = FOB declarado + Flete + Seguro 1%.</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.9rem', marginBottom: '1rem' }}>
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

                <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '0.65rem' }}>Percepciones — ¿aplican en esta importación? Con SÍ se cobran en la cotización y cuentan en el costo real; con NO, en ninguno.</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1.5rem' }}>
                  {[
                    ['IVA Adicional %', pIvaA, setPIvaA, pagaIvaA, setPagaIvaA],
                    ['Perc. Ganancias %', pGan, setPGan, pagaGan, setPagaGan],
                    ['Perc. IIBB %', pIIBB, setPIIBB, pagaIIBB, setPagaIIBB],
                  ].map(([lbl, val, setVal, paga, setPaga]) => (
                    <div key={lbl} style={{ minWidth: 0 }}>
                      <label style={{ ...LBL, marginBottom: '0.12rem' }}>{lbl}</label>
                      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #e5e7eb', maxWidth: '100%' }}>
                        <input type="number" inputMode="decimal" step="any" min="0" value={val} onChange={e => setVal(e.target.value)} onWheel={e => e.currentTarget.blur()} style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', padding: '0.35rem 0.05rem', fontSize: '0.84rem', color: paga ? '#111827' : '#d1d5db', fontVariantNumeric: 'tabular-nums' }} />
                        <button onClick={() => setPaga(!paga)} title="¿Aplica en esta importación? Afecta la cotización al cliente y tu costo real" style={{ border: 'none', background: 'transparent', padding: '0 0.1rem 0 0.6rem', cursor: 'pointer', fontSize: '0.66rem', fontWeight: 700, color: paga ? '#059669' : '#dc2626' }}>
                        {paga ? 'SÍ' : 'NO'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '2.5rem', marginTop: '0.9rem', paddingTop: '0.6rem', borderTop: '1px solid #f1f5f9' }}>
                  {[['Base IVA cliente', c.bivC], ['Base IVA real', c.bivR]].map(([l, v]) => (
                    <div key={l}>
                      <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{usd(v)}</p>
                      <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>{l}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CIERRE */}
            {tab === 'cierre' && (
              <div>
                <p style={{ ...SECL, margin: '0 0 0.9rem' }}>Honorarios &amp; cierre</p>

                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: '0.45rem' }}>¿Qué sociedad usa el cliente para importar?</p>
                  <div style={{ display: 'flex', gap: '1.4rem' }}>
                    <button onClick={() => setUsaSociedadPropia(true)} style={{ padding: '0 0 4px', border: 'none', borderBottom: usaSociedadPropia ? '2px solid #111827' : '2px solid transparent', cursor: 'pointer', fontSize: '0.78rem', fontWeight: usaSociedadPropia ? 600 : 400, background: 'transparent', color: usaSociedadPropia ? '#111827' : '#9ca3af' }}>
                      Sociedad del cliente
                    </button>
                    <button onClick={() => setUsaSociedadPropia(false)} style={{ padding: '0 0 4px', border: 'none', borderBottom: !usaSociedadPropia ? '2px solid #111827' : '2px solid transparent', cursor: 'pointer', fontSize: '0.78rem', fontWeight: !usaSociedadPropia ? 600 : 400, background: 'transparent', color: !usaSociedadPropia ? '#111827' : '#9ca3af' }}>
                      Sociedad de Transtide
                    </button>
                  </div>
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '0.35rem' }}>
                    {usaSociedadPropia ? 'Sin gastos de facturación.' : 'Se suman gastos de facturación.'}
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem' }}>
                  <F label={`Honorarios % (s/ costo CON IVA)`}>
                    <input type="number" inputMode="decimal" step="any" min="0" value={pHon} onChange={e => setPHon(e.target.value)} style={INP} />
                  </F>
                  <F label={`Honorarios mínimos (USD)`}>
                    <input type="number" inputMode="decimal" step="any" min="0" value={pHonMin} onChange={e => setPHonMin(e.target.value)} style={INP} placeholder="Sin mínimo" />
                  </F>
                </div>
                {c.honMinAplica && (
                  <p style={{ fontSize: '0.78rem', color: '#6b7280', borderLeft: '2px solid #d97706', paddingLeft: 12, marginTop: '0.45rem' }}>
                    Aplica el mínimo: {pHon}% = <span style={{ color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{usd(c.totConC * (n(pHon) / 100))}</span> &lt; <span style={{ color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{usd(n(pHonMin))}</span>
                  </p>
                )}
                {!usaSociedadPropia && (
                  <F label={`Gastos de Facturación % — sociedad Transtide`}>
                    <input type="number" inputMode="decimal" step="any" min="0" value={pFac} onChange={e => setPFac(e.target.value)} style={INP} />
                  </F>
                )}

                <div style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.38rem 0', borderBottom: '1px solid #f1f5f9', color: '#6b7280' }}><span>Costo Total CON IVA</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(c.totConC)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.38rem 0', borderBottom: '1px solid #f1f5f9', color: '#6b7280' }}><span>+ Honorarios ({c.honMinAplica ? 'mín. USD' : `${pHon}%`})</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(c.honorarios)}</span></div>
                  {!usaSociedadPropia && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.38rem 0', borderBottom: '1px solid #f1f5f9', color: '#6b7280' }}><span>+ Gastos de Facturación ({pFac}%)</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(c.gastFac)}</span></div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.55rem 0', fontWeight: 700, color: '#111827' }}><span>= Precio final</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(c.precioConF)}</span></div>
                </div>
              </div>
            )}

            {tab === 'venta' && (
              <div>
                <p style={{ ...SECL, margin: '0 0 0.9rem' }}>Precio de venta estimado</p>
                <F label="Margen de ganancia deseado %">
                  <input type="number" inputMode="decimal" step="any" min="0" value={pMrg} onChange={e => setPMrg(e.target.value)} style={INP} />
                </F>
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '0 0 0.6rem' }}>El IVA del import es crédito fiscal recuperable: el margen se calcula sobre el costo sin IVA, y el IVA se suma recién al vender.</p>
                <div style={{ marginTop: '0.2rem' }}>
                  {[
                    ['Costo real (sin IVA)', c.totSinR, false, false],
                    [`+ Margen (${pMrg}%) — ganancia neta`, c.gananciaNeta, false, 'profit'],
                    ['= Precio de venta neto', c.ventaNeta, true, false],
                    [`+ IVA (${pIva}%) sobre la venta`, c.ivaVentaMonto, false, false],
                    ['= Precio de venta final (con IVA)', c.precioVentaFinal, 'final', false],
                  ].map(([lbl, val, emph, kind], i, arr) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: emph === 'final' ? '0.92rem' : '0.8rem', padding: '0.4rem 0', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none', fontWeight: emph ? 700 : 400, color: emph === 'final' ? '#059669' : kind === 'profit' ? '#059669' : emph ? '#111827' : '#6b7280' }}>
                      <span>{lbl}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </Card>
        </div>

        {/* RIGHT: results */}
        <div className="cot-right-rail" style={{ position: 'sticky', top: '1rem', maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {mode === 'personal' && (
            <Card>
              <p style={{ ...SECL, margin: '0 0 0.7rem' }}>Costo real de importación (sin IVA)</p>
              <p style={{ fontSize: '1.7rem', fontWeight: 700, color: '#111827', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.totSinR)}</p>
              <p style={{ fontSize: '0.76rem', color: '#9ca3af', marginTop: '0.3rem' }}>Con IVA pagás {usd(c.totConR)} · el IVA es crédito fiscal recuperable</p>
              {c.ventaNeta > 0 && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>Ganancia neta ({pMrg}%)</span>
                    <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>{usd(c.gananciaNeta)}</span>
                  </div>
                  <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: '0.15rem' }}>Precio de venta neto (sin IVA)</p>
                  <p style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.ventaNeta)}</p>
                  <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', margin: '0.6rem 0 0.15rem' }}>Precio de venta final (con IVA {pIva}%)</p>
                  <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#059669', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.precioVentaFinal)}</p>
                  <p style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: '0.2rem' }}>incluye {usd(c.ivaVentaMonto)} de IVA</p>
                </div>
              )}
              <div style={{ marginTop: '0.75rem', paddingTop: '0.55rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>FOB declarado · CIF declarado</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{usd(c.fobDR)} · {usd(c.cifR)}</span>
              </div>
              <p style={{ marginTop: '0.55rem', fontSize: '0.7rem', color: '#9ca3af' }}>Importación personal — siempre con sociedad Transtide</p>
            </Card>
          )}

          {mode === 'cliente' && (<>
          <Card>
            <p style={{ ...SECL, margin: '0 0 0.2rem' }}>Precio final al cliente</p>
            <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: '0.8rem' }}>
              {usaSociedadPropia ? 'Sociedad del cliente — sin gastos de facturación' : 'Sociedad Transtide — incluye gastos de facturación'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: usaSociedadPropia ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>
              <div>
                <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#059669', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.precioConF)}</p>
                <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginTop: '0.2rem' }}>{usaSociedadPropia ? 'Precio final' : 'Con factura'}</p>
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '0.15rem', fontVariantNumeric: 'tabular-nums' }}>Hon. {usd(c.honorarios)}{!usaSociedadPropia ? ` + Fac. ${usd(c.gastFac)}` : ''}</p>
              </div>
              {!usaSociedadPropia && (
                <div>
                  <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#d97706', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.precioSinF)}</p>
                  <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginTop: '0.2rem' }}>Sin factura</p>
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '0.15rem', fontVariantNumeric: 'tabular-nums' }}>Ahorro del cliente: {usd(c.gastFac)}</p>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '2.5rem', marginTop: '0.9rem', paddingTop: '0.7rem', borderTop: '1px solid #f1f5f9' }}>
              <div>
                <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{usd(c.totConC)}</p>
                <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>Costo total con IVA</p>
              </div>
              <div>
                <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{usd(c.totSinC)}</p>
                <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>Costo total sin IVA</p>
              </div>
            </div>
            <div style={{ marginTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Chargeable · Flete cobrado</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{chargeable.toFixed(2)} kg · {usd(c.fleteC)}</span>
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
                    <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{lbl}</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: val >= 0 ? '#059669' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                      {usd(val)} {pctFob && <span style={{ fontSize: '0.66rem', color: '#9ca3af', fontWeight: 400 }}>({pctFob})</span>}
                    </span>
                  </div>
                  {barW > 0 && barW < 100 && (
                    <div style={{ height: '3px', background: '#f1f5f9' }}>
                      <div style={{ height: '100%', width: `${barW}%`, background: val >= 0 ? '#059669' : '#dc2626' }} />
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '0.75rem', paddingTop: '0.7rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#111827' }}>Ganancia total</span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: c.ganTotal >= 0 ? '#059669' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{usd(c.ganTotal)}</div>
                {c.fobR > 0 && <div style={{ fontSize: '0.66rem', color: '#9ca3af' }}>{((c.ganTotal / c.fobR) * 100).toFixed(1)}% s/ FOB real</div>}
              </div>
            </div>
          </Card>

          <Card>
            <p style={{ ...SECL, margin: '0 0 0.5rem' }}>Detalle: Real vs Cobrado al cliente</p>
            <div className="cot-detalle-header" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: '0.35rem', paddingBottom: '0.3rem', borderBottom: '1px solid #f1f5f9' }}>
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
              <div key={lbl} className="cot-detalle-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '0.3rem 0', borderBottom: '1px solid #f1f5f9', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{lbl}</span>
                <span style={{ fontSize: '0.78rem', color: '#6b7280', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(real)}</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#111827', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(cobro)}</span>
                <span className="cot-detalle-margen" style={{ fontSize: '0.74rem', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: diff === null ? '#d1d5db' : diff > 0 ? '#059669' : diff < 0 ? '#dc2626' : '#9ca3af' }}>
                  {diff === null ? '—' : (diff > 0 ? '+' : '') + (usd(diff))}
                </span>
              </div>
            ))}
            <div className="cot-detalle-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '0.5rem 0', borderTop: '1px solid #f1f5f9', marginTop: '0.4rem', fontWeight: 700, fontSize: '0.84rem', fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ color: '#111827' }}>TOTAL</span>
              <span style={{ textAlign: 'right', color: '#6b7280' }}>{usd(c.totConR)}</span>
              <span style={{ textAlign: 'right', color: '#111827' }}>{usd(c.totConC)}</span>
              <span className="cot-detalle-margen" style={{ textAlign: 'right', color: c.ganTotal >= 0 ? '#059669' : '#dc2626' }}>{c.ganTotal >= 0 ? '+' : ''}{usd(c.ganTotal)}</span>
            </div>
          </Card>
          </>)}

        </div>
      </div>

      {/* MODAL: vista cliente */}
      {showClienteView && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowClienteView(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div className="cz-modal" style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.2rem 1.75rem', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: '#fff', borderRadius: '12px 12px 0 0', zIndex: 10 }}>
              <div>
                <p style={{ fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: '0.1rem' }}>Vista previa</p>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Cotización Aérea al Cliente</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button onClick={printClienteQuote} style={{ ...PBTN, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Imprimir / PDF
                </button>
                <button onClick={() => setShowClienteView(false)} className="cz-tbtn" style={{ ...TBTN, fontSize: '1.05rem', lineHeight: 1 }}>×</button>
              </div>
            </div>
            <div id="cot-aereo-print" style={{ padding: '1.5rem 1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.2rem' }}>
                <div>
                  <p style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>TRANSTIDE FREIGHT</p>
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Gestión Logística & Importaciones</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '0.66rem', color: '#9ca3af' }}>Fecha de cotización</p>
                  <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                </div>
              </div>
              <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.7rem', marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827' }}>Cotización de importación aérea{cliente ? <span style={{ color: '#6b7280', fontWeight: 400 }}> · {cliente}</span> : ''}</p>
                <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '3px', fontVariantNumeric: 'tabular-nums' }}>Servicio aéreo · Chargeable {chargeable.toFixed(2)} kg ({n(m3Input).toFixed(2)} m³ · {n(pesoReal).toFixed(2)} kg real)</p>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <p style={{ ...SECL, margin: '0 0 0.2rem' }}>Base de la Importación</p>
                {[
                  ['Valor de Mercadería (FOB)', usd(c.fobC)],
                  [`Flete Aéreo (${chargeable.toFixed(2)} kg chargeable)`, usd(c.fleteC)],
                  ['Seguro (1% FOB)', usd(c.segC)],
                  ...(c.fobDC !== c.fobC ? [['FOB Declarado (base arancelaria)', usd(c.fobDC)]] : []),
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.8rem', color: '#6b7280' }}>
                    <span>{l}</span><span style={{ color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.84rem', fontWeight: 700, color: '#111827' }}>
                  <span>CIF — Base Arancelaria</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(c.cifC)}</span>
                </div>
                <p style={{ ...SECL, margin: '1.1rem 0 0.2rem' }}>Aranceles Aduaneros</p>
                {[
                  [`Derechos de Importación (${pDer}%)`, usd(c.derC)],
                  ...(pTas > 0 ? [[`Tasa Estadística (${pTas}%)`, usd(c.tasC)]] : []),
                  [`IVA (${pIva}%)`, usd(c.ivaC)],
                  ...(c.ivaAC > 0 ? [[`IVA Adicional (${pIvaA}%)`, usd(c.ivaAC)]] : []),
                  ...(c.ganC > 0 ? [[`Percepción Ganancias (${pGan}%)`, usd(c.ganC)]] : []),
                  ...(c.iibbC > 0 ? [[`Percepción IIBB (${pIIBB}%)`, usd(c.iibbC)]] : []),
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.8rem', color: '#6b7280' }}>
                    <span>{l}</span><span style={{ color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                  </div>
                ))}
                {c.gasC > 0 && (<>
                  <p style={{ ...SECL, margin: '1.1rem 0 0.2rem' }}>Gastos Aeroportuarios</p>
                  {[['AWB', c.awbCv], ['Handling', c.handCv], ['Terminal aérea', c.terCv], ['Despachante', c.desCv], ['Transporte interno', c.traCv]].filter(([,v]) => v > 0).map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.8rem', color: '#6b7280' }}>
                      <span>{l}</span><span style={{ color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{usd(v)}</span>
                    </div>
                  ))}
                </>)}
              </div>

              {/* Honorarios & cierre — itemizado */}
              <div style={{ marginBottom: '1.2rem' }}>
                <p style={{ ...SECL, margin: '0 0 0.2rem' }}>Servicio Transtide</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.8rem', fontWeight: 600, color: '#111827' }}>
                  <span>Costo Total (mercadería + flete + aranceles + gastos)</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(c.totConC)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.8rem', color: '#6b7280' }}>
                  <span>+ Honorarios{c.honMinAplica ? '' : ` (${pHon}%)`}</span><span style={{ color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{usd(c.honorarios)}</span>
                </div>
                {!usaSociedadPropia && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.8rem', color: '#6b7280' }}>
                    <span>+ Gastos de Facturación ({pFac}%)</span><span style={{ color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{usd(c.gastFac)}</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: usaSociedadPropia ? '1fr' : '1fr 1fr', gap: '1.25rem', margin: '1.2rem 0', paddingTop: '0.9rem', borderTop: '1px solid #f1f5f9' }}>
                <div>
                  <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: '4px' }}>{usaSociedadPropia ? 'Precio Final' : 'Precio Final CON Factura'}</p>
                  <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#059669', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.precioConF)}</p>
                  <p style={{ fontSize: '0.66rem', color: '#9ca3af', marginTop: '0.2rem', fontVariantNumeric: 'tabular-nums' }}>Hon. {usd(c.honorarios)}{!usaSociedadPropia ? ` + Fac. ${usd(c.gastFac)}` : ''}</p>
                </div>
                {!usaSociedadPropia && (
                  <div>
                    <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: '4px' }}>Precio Final SIN Factura</p>
                    <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#d97706', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.precioSinF)}</p>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', lineHeight: 1.6 }}>
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
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1050, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
      <div className="cz-modal" style={{ background: '#fff', width: '100%', maxWidth: '560px', height: '100%', overflowY: 'auto', borderLeft: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column' }}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.1rem 1.5rem', borderBottom: '1px solid #f1f5f9', background: '#fff', position: 'sticky', top: 0, zIndex: 10 }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Cotizaciones guardadas</h3>
            <p style={{ fontSize: '0.74rem', color: '#9ca3af' }}>{quotes.length} guardada{quotes.length === 1 ? '' : 's'}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="cz-tbtn" style={{ ...TBTN, fontSize: '1.05rem', lineHeight: 1 }}>×</button>
        </div>

        {/* filters */}
        <div style={{ padding: '0.9rem 1.5rem', background: '#fff', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: '64px', zIndex: 9 }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o cliente…" style={{ ...INP, marginBottom: '0.7rem' }} />
          <div style={{ display: 'flex', gap: '1.1rem', flexWrap: 'wrap' }}>
            {[['todas', 'Todas'], ...ESTADOS.map(e => [e.id, e.label])].map(([id, label]) => {
              const active = filter === id;
              return (
                <button key={id} onClick={() => setFilter(id)} style={{ padding: '0 0 4px', border: 'none', borderBottom: active ? '2px solid #111827' : '2px solid transparent', cursor: 'pointer', fontSize: '0.74rem', fontWeight: active ? 600 : 400, background: 'transparent', color: active ? '#111827' : '#9ca3af' }}>
                  {label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.7rem' }}>
            <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Agrupar por</span>
            <select value={agrupar} onChange={e => setAgrupar(e.target.value)} style={{ padding: '0.15rem 0.1rem', border: 'none', borderBottom: '1px solid #e5e7eb', borderRadius: 0, fontSize: '0.76rem', fontWeight: 500, color: '#111827', background: 'transparent', cursor: 'pointer', outline: 'none' }}>
              <option value="estado">Estado</option>
              <option value="cliente">Cliente</option>
              <option value="fecha">Más recientes</option>
              <option value="valor">Mayor valor</option>
            </select>
          </div>
        </div>

        {/* list */}
        <div style={{ padding: '0.5rem 1.5rem 1.25rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
          {loading && <p style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '0.75rem 0' }}>Cargando…</p>}
          {err && <p style={{ color: '#dc2626', fontSize: '0.85rem', padding: '0.75rem 0' }}>{err}</p>}
          {!loading && !err && visible.length === 0 && <p style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '0.75rem 0' }}>No hay cotizaciones que coincidan.</p>}
          {/* Alertas de seguimiento: cotizaciones frías y aprobadas sin convertir */}
          {!loading && !err && (() => {
            const now = Date.now()
            const dias = (v) => { const d = new Date(v || 0); return isNaN(d.getTime()) ? 0 : Math.floor((now - d.getTime()) / 86400000) }
            const frias = quotes.filter(q => ['enviada', 'negociacion'].includes(q.estado) && dias(q.updated_at || q.created_at) >= 5)
            const sinConv = quotes.filter(q => q.estado === 'aprobada' && !q.operation_id)
            if (!frias.length && !sinConv.length) return null
            return (
              <div style={{ borderLeft: '2px solid #d97706', paddingLeft: 12, margin: '0.6rem 0' }}>
                <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Seguimiento</p>
                {sinConv.slice(0, 3).map(q => (
                  <p key={q.id} style={{ fontSize: '0.78rem', color: '#6b7280', padding: '0.08rem 0' }}><b style={{ color: '#111827' }}>{q.nombre}</b> está aprobada — convertila en operación</p>
                ))}
                {frias.slice(0, 4).map(q => (
                  <p key={q.id} style={{ fontSize: '0.78rem', color: '#6b7280', padding: '0.08rem 0' }}><b style={{ color: '#111827' }}>{q.nombre}</b> sin respuesta hace <span style={{ color: '#d97706' }}>{dias(q.updated_at || q.created_at)} días</span> — hacé follow-up{q.cliente ? ` a ${q.cliente}` : ''}</p>
                ))}
              </div>
            )
          })()}
          {!loading && !err && groups.map(g => (
            <div key={g.key}>
              {g.label && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, margin: '1.5rem 0 0.1rem' }}>
                  <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{g.label}</span>
                  <span style={{ fontSize: '0.64rem', fontWeight: 500, color: '#9ca3af' }}>{g.items.length}</span>
                </div>
              )}
              <div>
                {g.items.map(q => {
                  const busy = busyId === q.id;
                  return (
                    <div key={q.id} className="cz-row" style={{ padding: '0.8rem 0.25rem', borderBottom: '1px solid #f1f5f9', opacity: busy ? 0.6 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.6rem' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ fontSize: '0.88rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.nombre}</p>
                          <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 2 }}>
                            {[q.cliente, q.modo === 'aereo' ? 'Aéreo' : 'Marítimo', fmtDate(q.updated_at || q.created_at)].filter(Boolean).join(' · ')}
                          </p>
                          {q.resumen && <p className="cz-mid" style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 2 }}>{q.resumen}</p>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {q.total_usd && (<>
                            <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>USD {Number(q.total_usd).toLocaleString('es-AR')}</p>
                            <p style={{ fontSize: '0.6rem', color: '#9ca3af' }}>total cotizado</p>
                          </>)}
                          <select value={q.estado} onChange={e => changeEstado(q, e.target.value)} disabled={busy} title="Cambiar estado" style={{ marginTop: 3, padding: 0, border: 'none', fontSize: '0.68rem', fontWeight: 600, color: q.estado === 'aprobada' ? '#059669' : q.estado === 'rechazada' ? '#dc2626' : '#6b7280', background: 'transparent', cursor: 'pointer', textAlign: 'right', outline: 'none' }}>
                            {ESTADOS.map(e => <option key={e.id} value={e.id} style={{ color: '#111827', background: '#fff' }}>{e.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', marginTop: '0.45rem' }}>
                        <button onClick={() => reactivate(q)} disabled={busy} className="cz-tbtn" style={{ ...TBTN, fontSize: '0.72rem', cursor: busy ? 'default' : 'pointer' }}>
                          Reactivar
                        </button>
                        <button onClick={() => convertir(q)} disabled={busy} title={q.operation_id ? 'Ya convertida — ir a la operación' : 'Crear operación desde esta cotización'} className="cz-tbtn" style={{ ...TBTN, fontSize: '0.72rem', cursor: busy ? 'default' : 'pointer', color: q.operation_id ? '#059669' : '#6b7280' }}>
                          {q.operation_id ? 'Ver operación' : 'Convertir'}
                        </button>
                        <button onClick={() => remove(q)} disabled={busy} aria-label="Eliminar" title="Eliminar" className="cz-iconbtn" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: busy ? 'default' : 'pointer', background: 'none', color: '#c4c9d4', padding: 2 }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
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
            <div style={{ marginTop: '1.25rem' }}>
              <button onClick={() => setShowCerradas(v => !v)} className="cz-tbtn" style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', background: 'none', border: 'none', padding: '0.15rem 0', cursor: 'pointer', textAlign: 'left', fontSize: '0.72rem', color: '#9ca3af' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: cerradasAbiertas ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><polyline points="9 18 15 12 9 6"/></svg>
                <span style={{ fontWeight: 600 }}>Cerradas · {cerradas.length}</span>
              </button>
              {cerradasAbiertas && (
                <div style={{ marginTop: '0.2rem' }}>
                  {[...cerradas].sort(byDateDesc).map(q => {
                    const busy = busyId === q.id;
                    return (
                      <div key={q.id} className="cz-row" style={{ padding: '0.6rem 0.25rem', borderBottom: '1px solid #f1f5f9', opacity: busy ? 0.4 : 0.55 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.nombre}</p>
                            <p style={{ fontSize: '0.66rem', color: '#9ca3af', marginTop: 1 }}>
                              {[estadoMeta(q.estado).label, q.cliente, q.modo === 'aereo' ? 'Aéreo' : 'Marítimo', q.total_usd ? `USD ${Number(q.total_usd).toLocaleString('es-AR')}` : '', fmtDate(q.updated_at || q.created_at)].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          {q.operation_id && (
                            <button onClick={() => convertir(q)} disabled={busy} title="Ir a la operación" className="cz-tbtn" style={{ ...TBTN, fontSize: '0.7rem', cursor: busy ? 'default' : 'pointer' }}>Ver operación</button>
                          )}
                          <button onClick={() => reactivate(q)} disabled={busy} className="cz-tbtn" style={{ ...TBTN, fontSize: '0.7rem', cursor: busy ? 'default' : 'pointer' }}>Reactivar</button>
                          <button onClick={() => remove(q)} disabled={busy} aria-label="Eliminar" title="Eliminar" className="cz-iconbtn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: busy ? 'default' : 'pointer', background: 'none', color: '#c4c9d4', padding: 2 }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
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
      <div onClick={() => setConfirmConv(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '1.5rem 1.75rem', maxWidth: 380 }}>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', marginBottom: '0.4rem' }}>¿Convertir en operación?</p>
          <p style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '1.25rem' }}>Se creará una operación con el cliente, contenedor, m³ y FOB precargados desde “{confirmConv.nombre}”.</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button onClick={() => setConfirmConv(null)} className="cz-tbtn" style={TBTN}>Cancelar</button>
            <button onClick={() => doConvertir(confirmConv)} style={PBTN}>Convertir</button>
          </div>
        </div>
      </div>
    )}

    {confirmDel && (
      <div onClick={() => setConfirmDel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '1.5rem 1.75rem', maxWidth: 360 }}>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', marginBottom: '0.4rem' }}>¿Eliminar cotización?</p>
          <p style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '1.25rem' }}>Se borra “<span style={{ color: '#dc2626' }}>{confirmDel.nombre}</span>”. No se puede deshacer.</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button onClick={() => setConfirmDel(null)} className="cz-tbtn" style={TBTN}>Cancelar</button>
            <button onClick={() => doRemove(confirmDel)} style={{ ...TBTN, fontSize: '0.78rem', fontWeight: 600, color: '#dc2626' }}>Eliminar</button>
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
    <div style={{ padding: '0.9rem 0 1.1rem', borderBottom: '1px solid #f1f5f9' }}>
      <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827', marginBottom: '0.8rem' }}>{initial && initial.id ? 'Editar NCM' : 'Nueva NCM'}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem 1.5rem' }}>
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
              style={{ ...INP, fontFamily: key === 'codigo' ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit' }}
            />
          </div>
        ))}
      </div>
      <div style={{ marginTop: '0.6rem' }}>
        <label style={LBL}>Notas</label>
        <textarea value={form.notas ?? ''} onChange={e => set('notas', e.target.value)} placeholder="Opcional" rows={2} style={{ ...INP, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>
      {err && <p style={{ fontSize: '0.78rem', color: '#dc2626', marginTop: '0.5rem' }}>{err}</p>}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', alignItems: 'center', marginTop: '0.75rem' }}>
        <button onClick={onCancel} className="cz-tbtn" style={TBTN}>Cancelar</button>
        <button onClick={save} disabled={saving} style={{ ...PBTN, background: saving ? '#9ca3af' : '#111827', cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Guardando…' : 'Guardar'}</button>
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
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1050, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
      <div className="cz-modal" style={{ background: '#fff', width: '100%', maxWidth: '560px', height: '100%', overflowY: 'auto', borderLeft: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column' }}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.1rem 1.5rem', borderBottom: '1px solid #f1f5f9', background: '#fff', position: 'sticky', top: 0, zIndex: 10 }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>NCM guardadas</h3>
            <p style={{ fontSize: '0.74rem', color: '#9ca3af' }}>{list.length} posición{list.length === 1 ? '' : 'es'} arancelaria{list.length === 1 ? '' : 's'}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="cz-tbtn" style={{ ...TBTN, fontSize: '1.05rem', lineHeight: 1 }}>×</button>
        </div>

        {/* search + new */}
        <div style={{ padding: '0.9rem 1.5rem', background: '#fff', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: '64px', zIndex: 9, display: 'flex', gap: '1.1rem', alignItems: 'center' }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por código o producto…" style={{ ...INP, flex: 1 }} />
          <button onClick={() => setEditing({})} style={{ ...PBTN, flexShrink: 0, whiteSpace: 'nowrap' }}>
            + Nueva NCM
          </button>
        </div>

        {/* body */}
        <div style={{ padding: '0.5rem 1.5rem 1.25rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
          {editing && (
            <NcmForm initial={editing.id ? editing : null} onCancel={() => setEditing(null)} onSaved={onSaved} />
          )}

          {loading && <p style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '0.75rem 0' }}>Cargando…</p>}
          {err && <p style={{ color: '#dc2626', fontSize: '0.85rem', padding: '0.75rem 0' }}>{err}</p>}
          {!loading && !err && visible.length === 0 && !editing && <p style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '0.75rem 0' }}>No hay NCM que coincidan. Creá una con “+ Nueva NCM”.</p>}

          {visible.map(nc => {
            const busy = busyId === nc.id;
            const rl = ratesLine(nc);
            return (
              <div key={nc.id} className="cz-row" style={{ padding: '0.8rem 0.25rem', borderBottom: '1px solid #f1f5f9', opacity: busy ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.2rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '0.88rem', fontWeight: 600, color: '#111827', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{nc.codigo}</p>
                    {nc.producto && <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.1rem' }}>{nc.producto}</p>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexShrink: 0 }}>
                    <button onClick={() => setEditing(nc)} disabled={busy} className="cz-tbtn" style={{ ...TBTN, fontSize: '0.72rem', cursor: busy ? 'default' : 'pointer' }}>Editar</button>
                    <button onClick={() => remove(nc)} disabled={busy} title="Eliminar" aria-label="Eliminar" className="cz-iconbtn" style={{ border: 'none', cursor: busy ? 'default' : 'pointer', background: 'none', color: '#c4c9d4', padding: 2, display: 'inline-flex' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                    </button>
                  </div>
                </div>
                {rl && <p style={{ fontSize: '0.72rem', color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{rl}</p>}
                {nc.notas && <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.2rem' }}>{nc.notas}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>

    {confirmDel && (
      <div onClick={() => setConfirmDel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '1.5rem 1.75rem', maxWidth: 360 }}>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', marginBottom: '0.4rem' }}>¿Eliminar NCM?</p>
          <p style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '1.25rem' }}>Se borra la posición “<span style={{ color: '#dc2626' }}>{confirmDel.codigo}</span>”. No se puede deshacer.</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button onClick={() => setConfirmDel(null)} className="cz-tbtn" style={TBTN}>Cancelar</button>
            <button onClick={() => doRemove(confirmDel)} style={{ ...TBTN, fontSize: '0.78rem', fontWeight: 600, color: '#dc2626' }}>Eliminar</button>
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
    <div className="cotz" style={{ background: '#fff' }}>
      <style>{`
        .cotz input:focus, .cotz textarea:focus, .cotz select:focus { border-color: #111827 !important; outline: none !important; box-shadow: none !important; }
        .cotz .cz-tbtn:hover { color: #111827 !important; }
        .cotz .cz-iconbtn:hover { color: #111827 !important; }
        .cotz .cz-row:hover { background: #fafafa; }
        @media (max-width: 640px) {
          .cotz .cz-mid { display: none !important; }
        }
      `}</style>

      {/* ── header de página ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.75rem 1.5rem', marginBottom: '0.9rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 350, letterSpacing: '-0.02em', color: '#111827', lineHeight: 1.2 }}>Cotizador</h2>
          <p style={{ fontSize: '0.74rem', color: '#9ca3af', marginTop: 2 }}>Costo real, cotización al cliente y rentabilidad</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.4rem', flexWrap: 'wrap' }}>
          <button onClick={() => setSavedOpen(true)} className="cz-tbtn" style={{ ...TBTN, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Cotizaciones guardadas
          </button>

          <button onClick={() => setNcmOpen(true)} className="cz-tbtn" style={{ ...TBTN, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
            NCM guardadas
          </button>

          <button onClick={() => setImportOpen(true)} className="cz-tbtn" style={{ ...TBTN, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Importar de PDF/foto
            <span style={{ fontSize: '0.6rem', fontWeight: 600, color: '#9ca3af' }}>IA</span>
          </button>
        </div>
      </div>

      {/* ── switcher marítimo / aéreo — tabs de texto ─────────────────────── */}
      <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid #f1f5f9', marginBottom: '1rem' }}>
        {[
          { id: 'maritimo', icon: <ShipIcon size={14} />, label: 'Marítimo' },
          { id: 'aereo', icon: <PlaneIcon size={14} />, label: 'Aéreo' },
        ].map(t => (
          <button key={t.id} onClick={() => setMode(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0 0 0.5rem', border: 'none', cursor: 'pointer',
            borderBottom: mode === t.id ? '2px solid #111827' : '2px solid transparent',
            marginBottom: -1,
            fontSize: '0.82rem', fontWeight: mode === t.id ? 600 : 400,
            background: 'transparent',
            color: mode === t.id ? '#111827' : '#9ca3af',
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
    </div>
  );
}

export default function Cotizador() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: '#9ca3af', background: '#fff' }}>Cargando cotizador…</div>}>
      <CotizadorInner />
    </Suspense>
  );
}
