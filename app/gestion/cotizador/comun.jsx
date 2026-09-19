'use client';
// Piezas compartidas por los dos cotizadores y los paneles: formato de montos,
// impresión, estados y guardado de cotizaciones, selector de NCM, el armazón de
// diálogos y paneles (Dialogo, Confirmar), primitivas viejas de UI (F, NI, TI,
// Card…), íconos y el borrador automático.
import { useState, useEffect, useRef, useId } from 'react';
import { gToast } from '../toast';
import { Campo, TextInput } from './ui';

// ─── helpers ──────────────────────────────────────────────────────────────────
const usd = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return '$ ' + (Math.round(n * 100) / 100).toLocaleString('es-AR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
};
const cx = (...clases) => clases.filter(Boolean).join(' ');

// Camino principal de impresión: pestaña dedicada /gestion/print. El documento
// viaja por localStorage y se imprime LIMPIO (sin el layout de la app, sin
// iframes ocultos que los navegadores imprimen en blanco). La pestaña trae su
// propia barra con "Imprimir o guardar PDF", así el usuario siempre ve el
// documento y tiene un botón que funciona, pase lo que pase con el auto-print.
// La barra no sale en el papel (__no_print__): el documento impreso no cambia.
function printHTML(html) {
  try {
    const toolbar = `<div class="__no_print__" style="position:fixed;top:0;left:0;right:0;background:#111827;color:#fff;padding:10px 16px;display:flex;gap:12px;align-items:center;z-index:9999;font-family:system-ui,sans-serif"><b style="font-size:14px;font-weight:600">Vista de impresión — Transtide</b><button onclick="window.print()" style="margin-left:auto;background:#fff;color:#111827;border:none;border-radius:8px;padding:8px 16px;font-weight:600;cursor:pointer;font-size:14px">Imprimir o guardar PDF</button></div><style>@media print{.__no_print__{display:none!important}}@media screen{body{margin-top:52px}}</style>`
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

// ─── estados (saved quotes) ─────────────────────────────────────────────────────
const ESTADOS = [
  { id: 'borrador',    label: 'Borrador',       fg: '#64748b', bg: '#f1f5f9' },
  { id: 'enviada',     label: 'Enviada',        fg: '#0284c7', bg: '#eff6ff' },
  { id: 'negociacion', label: 'En negociación', fg: '#d97706', bg: '#fffbeb' },
  { id: 'aprobada',    label: 'Aprobada',       fg: '#059669', bg: '#f0fdf4' },
  { id: 'rechazada',   label: 'Rechazada',      fg: '#dc2626', bg: '#fef2f2' },
];
const estadoMeta = (id) => ESTADOS.find(e => e.id === id) || ESTADOS[0];

// ─── diálogos y paneles ────────────────────────────────────────────────────────
// Un solo armazón para todo lo que se abre encima del cotizador (guardar,
// cotizaciones guardadas, NCM, importar, confirmaciones): título legible, cuerpo
// que scrollea, pie con las acciones (un solo botón primario), Escape y click en
// el fondo cierran, Tab no se escapa del diálogo y al cerrar el foco vuelve a
// donde estaba. Los estilos (.cz-) viajan con el componente.
const CSS_DIALOGOS = `
.gestion-root .cz-capa{position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(17,24,39,.4);overscroll-behavior:contain;-webkit-tap-highlight-color:transparent}
.gestion-root .cz-capa-lateral{align-items:stretch;justify-content:flex-end;padding:0}
.gestion-root .cz-dialogo{display:flex;flex-direction:column;width:100%;min-width:0;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);margin:0!important;overflow:hidden;background:#fff;border-radius:12px;color:#111827;text-align:left}
.gestion-root .cz-capa-lateral .cz-dialogo{height:100%;max-height:none;border-radius:0;border-left:1px solid #e5e7eb}
.gestion-root .cz-dialogo:focus,.gestion-root .cz-dialogo:focus-visible{outline:none!important;box-shadow:none!important}
.gestion-root .cz-dialogo-cab{flex:none;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:20px 18px 0 24px}
.gestion-root .cz-dialogo-titulos{min-width:0;padding-top:4px}
.gestion-root .cz-dialogo-titulo{margin:0;font-size:17px;font-weight:600;line-height:1.3;letter-spacing:-.01em;color:#111827}
.gestion-root .cz-dialogo-sub{margin:4px 0 0;font-size:13px;line-height:1.5;color:#6b7280}
.gestion-root .cz-dialogo-fijo{flex:none;padding:16px 24px 0}
.gestion-root .cz-capa-lateral .cz-dialogo-fijo{padding-bottom:16px;border-bottom:1px solid #f1f5f9}
.gestion-root .cz-dialogo-cuerpo{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:20px 24px 24px}
.gestion-root .cz-dialogo-confirmar .cz-dialogo-cuerpo{padding-top:10px;padding-bottom:20px}
.gestion-root .cz-dialogo-pie{flex:none;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:12px 20px;padding:0 24px 20px}
.gestion-root .cz-dialogo-pie-linea{padding-top:16px;border-top:1px solid #f1f5f9}
.gestion-root .cz-pie-izq{margin-right:auto}
.gestion-root .cz-icono{display:inline-flex;align-items:center;justify-content:center;flex:none;width:32px;height:32px;min-width:32px!important;min-height:32px!important;margin:0;padding:0!important;border:0;border-radius:6px!important;background:transparent;color:#9ca3af;font-size:13px!important;line-height:1;cursor:pointer;transition:color 120ms ease;-webkit-tap-highlight-color:transparent!important}
.gestion-root .cz-icono:hover{color:#111827}
.gestion-root .cz-icono.cz-icono-peligro:hover{color:#dc2626}
.gestion-root .cz-icono:disabled{color:#e5e7eb;cursor:default}
.gestion-root .cz-icono:focus-visible{outline:2px solid #111827!important;outline-offset:1px;border-radius:6px!important}
.gestion-root .ct-btn-primario.cz-btn-auto{width:auto;height:40px;min-height:40px!important;padding:0 18px!important}
.gestion-root .ct-btn-primario.cz-btn-peligro{background:#dc2626}
.gestion-root .ct-btn-primario.cz-btn-peligro:hover{background:#b91c1c}
.gestion-root .ct-btn-primario.cz-btn-peligro:focus-visible{outline-color:#dc2626!important}
.gestion-root .ct-btn-texto.cz-texto-fuerte{color:#111827;font-weight:600}
.gestion-root .ct-btn-texto.cz-texto-fuerte:hover{text-decoration:underline;text-underline-offset:3px}
.gestion-root .ct-btn-texto.cz-texto-peligro{color:#dc2626}
.gestion-root .ct-btn-texto.cz-texto-peligro:hover{color:#b91c1c}
.gestion-root .ct-btn-texto.cz-texto-fuerte:disabled,.gestion-root .ct-btn-texto.cz-texto-peligro:disabled{color:#d1d5db;text-decoration:none}
.gestion-root .cz-campos{display:flex;flex-direction:column;gap:18px}
.gestion-root .cz-texto{margin:0;font-size:14px;line-height:1.55;color:#4b5563}
.gestion-root .cz-texto strong{font-weight:600;color:#111827}
.gestion-root .cz-error{margin:0;font-size:13px;line-height:1.5;color:#dc2626}
.gestion-root .cz-nota-ambar{margin:0;font-size:12.5px;line-height:1.45;color:#d97706}
.gestion-root .cz-gris{color:#9ca3af;font-weight:400}
.gestion-root .cz-subtitulo{margin:0;font-size:13px;font-weight:600;line-height:1.4;color:#111827}
.gestion-root .cz-hecho{display:flex;flex-direction:column;align-items:center;gap:10px;padding:20px 0 8px;font-size:15px;font-weight:600;color:#111827}
.gestion-root select.cz-select{display:block;width:100%!important;height:40px;min-height:0!important;margin:0;padding:0 32px 0 12px!important;border:1px solid #e5e7eb!important;border-radius:8px!important;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2.75 4.5 6 7.75 9.25 4.5' fill='none' stroke='%239ca3af' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 12px center;color:#111827;box-shadow:none!important;cursor:pointer;-webkit-appearance:none;appearance:none;transition:border-color 120ms ease,color 120ms ease!important}
.gestion-root select.cz-select:hover{border-color:#d1d5db!important}
.gestion-root select.cz-select:focus,.gestion-root select.cz-select:focus-visible{border-color:#111827!important;outline:none!important;box-shadow:0 0 0 3px rgba(17,24,39,.08)!important;border-radius:8px!important}
.gestion-root select.cz-select.cz-select-chico{width:auto!important;height:30px;padding:0 26px 0 10px!important;border-radius:6px!important;background-position:right 8px center;font-weight:500}
.gestion-root select.cz-select.cz-select-chico:focus,.gestion-root select.cz-select.cz-select-chico:focus-visible{border-radius:6px!important}
@media (min-width:768px){.gestion-root select.cz-select{font-size:15px!important}.gestion-root select.cz-select.cz-select-chico{font-size:12.5px!important}}
@media (max-width:767px){.gestion-root select.cz-select{height:44px}.gestion-root select.cz-select.cz-select-chico{height:36px}.gestion-root .cz-icono{width:40px;height:40px;min-width:40px!important;min-height:40px!important}}
@media (max-width:640px){*:has(.cz-capa){transform:none}.gestion-root .cz-icono::after{content:none}.gestion-root .cz-dialogo-cab{padding:16px 12px 0 16px}.gestion-root .cz-dialogo-fijo{padding-left:16px;padding-right:16px}.gestion-root .cz-dialogo-cuerpo{padding-left:16px;padding-right:16px}.gestion-root .cz-dialogo-pie{padding-left:16px;padding-right:16px}}
.gestion-root .cz-aviso{display:flex;align-items:center;flex-wrap:wrap;gap:6px 18px;margin:0 0 20px;padding:8px 0 8px 12px;border-left:2px solid #d97706}
.gestion-root .cz-aviso-texto{flex:1 1 240px;margin:0;font-size:13.5px;line-height:1.45;color:#4b5563;font-variant-numeric:tabular-nums}
.gestion-root .cz-aviso-texto strong{font-weight:600;color:#111827}
.gestion-root .cz-aviso-acciones{display:flex;align-items:center;gap:18px}
`;

function EstilosDialogo() {
  return <style>{CSS_DIALOGOS}</style>;
}

// Íconos de trazo fino (currentColor), sin emojis.
function IconoCerrar({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function IconoPapelera({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
    </svg>
  );
}
function IconoMas({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
// Tilde dibujado (verde = listo).
function IconoTilde({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" focusable="false" style={{ flex: 'none' }}>
      <circle cx="9" cy="9" r="8" fill="#059669" />
      <path d="M5.4 9.2 7.8 11.5 12.6 6.6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Pila de diálogos abiertos: Escape cierra solo el de más arriba.
const pilaDialogos = [];

const ENFOCABLES = 'a[href], button, input, select, textarea, [tabindex]';
function enfocables(caja) {
  if (!caja) return [];
  return Array.from(caja.querySelectorAll(ENFOCABLES)).filter((el) => {
    if (el.disabled || el.tabIndex < 0) return false;
    if (el.closest('[hidden], [inert]')) return false;
    return el.getClientRects().length > 0;
  });
}
const esTactil = () => {
  try { return !!window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches; } catch { return false; }
};

// titulo, sub: encabezado. fijo: lo que no scrollea debajo del título (buscador,
// filtros). pie: acciones. lateral: panel pegado a la derecha, alto completo.
// enfocar: selector (dentro del diálogo) de lo que toma el foco al abrir; en
// pantallas táctiles no se enfoca un campo de texto (no abre el teclado solo).
// onEnviar: Cmd/Ctrl + Enter. onGuardar: Cmd/Ctrl + S.
function Dialogo({
  titulo, sub, children, pie, fijo, onClose,
  ancho = 440, lateral = false, capa, enfocar, cerrarConFondo = true, pieConLinea = false,
  onEnviar, onGuardar, className, etiquetaCerrar = 'Cerrar',
}) {
  const caja = useRef(null);
  const abajoEnFondo = useRef(false);
  const idTitulo = useId();
  const idSub = useId();
  const ultimo = useRef(null);
  ultimo.current = { onClose, onEnviar, onGuardar };

  // Escape (solo el de más arriba) y foco: al abrir entra, al cerrar vuelve.
  useEffect(() => {
    const token = {};
    pilaDialogos.push(token);
    const alTecla = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      if (pilaDialogos[pilaDialogos.length - 1] !== token) return;
      e.preventDefault();
      ultimo.current.onClose?.();
    };
    window.addEventListener('keydown', alTecla);

    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = caja.current;
    let objetivo = null;
    if (el && enfocar) { try { objetivo = el.querySelector(enfocar); } catch { objetivo = null; } }
    if (objetivo && esTactil() && (objetivo.tagName === 'INPUT' || objetivo.tagName === 'TEXTAREA')) objetivo = null;
    try {
      (objetivo || el)?.focus({ preventScroll: true });
      if (objetivo && objetivo.tagName === 'INPUT') objetivo.select?.();
    } catch { /* nada */ }

    return () => {
      window.removeEventListener('keydown', alTecla);
      const i = pilaDialogos.indexOf(token);
      if (i >= 0) pilaDialogos.splice(i, 1);
      const activo = document.activeElement;
      const perdido = !activo || activo === document.body || !activo.isConnected || (el && el.contains(activo));
      if (previo && previo.isConnected && perdido) {
        try { previo.focus({ preventScroll: true }); } catch { /* nada */ }
      }
    };
    // Solo al abrir y al cerrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alTecla = (e) => {
    if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const lista = enfocables(caja.current);
      if (!lista.length) { e.preventDefault(); return; }
      const primero = lista[0];
      const final = lista[lista.length - 1];
      const activo = document.activeElement;
      if (e.shiftKey && (activo === primero || activo === caja.current)) { e.preventDefault(); final.focus(); }
      else if (!e.shiftKey && activo === final) { e.preventDefault(); primero.focus(); }
      return;
    }
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.nativeEvent?.isComposing) return;
    const { onEnviar: enviar, onGuardar: guardar } = ultimo.current;
    if (e.key === 'Enter' && enviar) {
      e.preventDefault();
      if (!e.repeat) enviar();
    } else if ((e.key === 's' || e.key === 'S') && guardar) {
      e.preventDefault();
      if (!e.repeat) guardar();
    }
  };

  return (
    <div
      className={cx('cz-capa', lateral && 'cz-capa-lateral')}
      style={capa ? { zIndex: capa } : undefined}
      onMouseDown={(e) => { abajoEnFondo.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        // Solo si el click empezó y terminó en el fondo (no al soltar una selección).
        if (cerrarConFondo && abajoEnFondo.current && e.target === e.currentTarget) onClose?.();
        abajoEnFondo.current = false;
      }}
    >
      <EstilosDialogo />
      <div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={sub ? idSub : undefined}
        tabIndex={-1}
        className={cx('cz-dialogo', 'cz-modal', className)}
        style={lateral ? { maxWidth: ancho } : { maxWidth: ancho }}
        onKeyDown={alTecla}
      >
        <div className="cz-dialogo-cab">
          <div className="cz-dialogo-titulos">
            <h2 className="cz-dialogo-titulo" id={idTitulo}>{titulo}</h2>
            {sub ? <p className="cz-dialogo-sub" id={idSub}>{sub}</p> : null}
          </div>
          <button type="button" className="cz-icono" aria-label={etiquetaCerrar} title="Cerrar (Escape)" onClick={() => onClose?.()}>
            <IconoCerrar />
          </button>
        </div>
        {fijo ? <div className="cz-dialogo-fijo">{fijo}</div> : null}
        <div className="cz-dialogo-cuerpo">{children}</div>
        {pie ? <div className={cx('cz-dialogo-pie', pieConLinea && 'cz-dialogo-pie-linea')}>{pie}</div> : null}
      </div>
    </div>
  );
}

// Confirmación de una acción: texto, "Cancelar" y un solo botón primario.
// peligro: el primario va en rojo y el foco arranca en "Cancelar".
function Confirmar({
  titulo, children, confirmar = 'Confirmar', cancelar = 'Cancelar', onConfirmar, onCancelar, peligro = false, capa = 1200, ancho = 400,
}) {
  return (
    <Dialogo
      titulo={titulo}
      onClose={onCancelar}
      capa={capa}
      ancho={ancho}
      className="cz-dialogo-confirmar"
      enfocar={peligro ? '[data-cancelar]' : '[data-primario]'}
      pie={(
        <>
          <button type="button" className="ct-btn-texto" data-cancelar="" onClick={() => onCancelar?.()}>{cancelar}</button>
          <button type="button" className={cx('ct-btn-primario', 'cz-btn-auto', peligro && 'cz-btn-peligro')} data-primario="" onClick={() => onConfirmar?.()}>
            {confirmar}
          </button>
        </>
      )}
    >
      <div className="cz-texto">{children}</div>
    </Dialogo>
  );
}

// ─── save-quote modal (shared) ──────────────────────────────────────────────────
// Enter en Nombre o Cliente guarda (si hay una cargada, la actualiza), igual que
// Cmd/Ctrl + Enter y Cmd/Ctrl + S. Escape cierra.
function SaveQuoteModal({ modo, defaultCliente, getPayload, ncmPayload = null, loadedQuote = null, onSaved, onClose }) {
  const [nombre, setNombre]   = useState(loadedQuote?.nombre || defaultCliente || '');
  const [cliente, setCliente] = useState(loadedQuote?.cliente || defaultCliente || '');
  const [estado, setEstado]   = useState(loadedQuote?.estado || 'borrador');
  const [notas, setNotas]     = useState(loadedQuote?.notas || '');
  const [saving, setSaving]   = useState(false);
  const [done, setDone]       = useState('');   // '' | 'nueva' | 'actualizada'
  const [err, setErr]         = useState('');
  const [faltaNombre, setFaltaNombre] = useState(false);
  const enCurso = useRef(false);                 // evita un doble envío (Enter + click)
  const idEstado = useId();
  const idNotas = useId();

  // asNew=true → siempre crea (POST). asNew=false → actualiza la cargada si existe (PUT).
  const save = async (asNew) => {
    if (enCurso.current) return;
    if (!nombre.trim()) { setFaltaNombre(true); setErr(''); return; }
    enCurso.current = true;
    setSaving(true); setErr(''); setFaltaNombre(false);
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
      setErr(e.message === 'Error al guardar' ? 'No se pudo guardar. Revisá la conexión y probá de nuevo.' : (e.message || 'No se pudo guardar.'));
      setSaving(false);
      enCurso.current = false;
    }
  };

  const actualiza = !!loadedQuote?.id;
  // La acción principal: actualizar la cargada o, si no hay, crear una nueva.
  const principal = () => { if (!done) save(!actualiza); };

  const pie = done ? null : (
    <>
      <button type="button" className="ct-btn-texto" onClick={onClose}>Cancelar</button>
      {actualiza ? (
        <button type="button" className="ct-btn-texto" disabled={saving} onClick={() => save(true)} title="Crea una cotización nueva sin tocar la anterior">
          Guardar como nueva
        </button>
      ) : null}
      <button
        type="button"
        className="ct-btn-primario cz-btn-auto"
        data-primario=""
        disabled={saving}
        onClick={principal}
        title={actualiza ? `Sobrescribe «${loadedQuote.nombre}» (Enter)` : 'Guardar (Enter)'}
      >
        {saving ? 'Guardando…' : actualiza ? 'Actualizar la anterior' : 'Guardar'}
      </button>
    </>
  );

  return (
    <Dialogo
      titulo="Guardar cotización"
      sub={actualiza && !done ? <>Estás editando «{loadedQuote.nombre}». Podés actualizarla o guardar una nueva.</> : null}
      onClose={onClose}
      ancho={460}
      enfocar="input"
      onEnviar={principal}
      onGuardar={principal}
      pie={pie}
    >
      {done ? (
        <div className="cz-hecho" role="status">
          <IconoTilde size={28} />
          {done === 'actualizada' ? 'Cotización actualizada' : 'Cotización guardada'}
        </div>
      ) : (
        <div className="cz-campos">
          <Campo label="Nombre o referencia" error={faltaNombre ? 'Escribí un nombre para encontrarla después.' : null}>
            <TextInput
              value={nombre}
              onChange={(v) => { setNombre(v); if (faltaNombre && v.trim()) setFaltaNombre(false); }}
              placeholder="Ej.: Máquinas láser para Metalúrgica Sur"
              onEnter={principal}
            />
          </Campo>
          <Campo label="Cliente">
            <TextInput value={cliente} onChange={setCliente} placeholder="Nombre del cliente" onEnter={principal} />
          </Campo>
          <Campo label="Estado" htmlFor={idEstado}>
            <select id={idEstado} className="cz-select" value={estado} onChange={e => setEstado(e.target.value)}>
              {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </Campo>
          <Campo label="Notas" htmlFor={idNotas} ayuda="Opcional.">
            <textarea id={idNotas} className="ct-input" value={notas} onChange={e => setNotas(e.target.value)} rows={3} />
          </Campo>
          {err ? <p className="cz-error" role="alert">{err}</p> : null}
        </div>
      )}
    </Dialogo>
  );
}

// ─── "guardar cotización" header button ─────────────────────────────────────────
function SaveQuoteButton({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="ct-btn-texto" title="Atajo: Cmd o Ctrl + S">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
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
    <>
      <EstilosDialogo />
      <select
        value=""
        aria-label="Elegir una NCM guardada"
        onChange={e => {
          const sel = ncmList.find(x => String(x.id) === e.target.value);
          if (sel) onPick(sel);
        }}
        className="cz-select"
      >
        <option value="">Elegir una NCM guardada</option>
        {ncmList.map(n => (
          <option key={n.id} value={n.id}>{n.codigo}{n.producto ? ` · ${n.producto}` : ''}</option>
        ))}
      </select>
    </>
  );
}

// ─── small UI primitives — Transtide Flat ─────────────────────────────────────
// Primitivas VIEJAS (antes del sistema de ui.jsx). Quedan hasta que marítimo y
// aéreo terminen de dejarlas; si quedan sin uso, se borran en la integración.
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

// ─── borrador automático (localStorage) + cambios sin guardar ─────────────────
// Cada modo persiste su snapshot (el mismo objeto `data` que viaja con la
// cotización guardada) en 'cot-borrador:<modo>' con debounce de 800 ms. Al
// montar, si hay borrador y el formulario está vacío, se ofrece restaurarlo o
// descartarlo. "Sucio" = el snapshot actual difiere del último guardado en el
// sistema (o de lo recién cargado desde "guardadas").
const claveBorrador = (modo) => `cot-borrador:${modo}`;
// Para decidir "formulario vacío" se ignora `mode` (cliente/personal): cambiar
// de pestaña sin cargar nada no es un borrador.
const sinModo = (s) => { const o = { ...(s || {}) }; delete o.mode; return JSON.stringify(o); };
const fmtFechaHora = (t) => {
  const d = new Date(t);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
};

function useBorrador({ modo, snapshot, aplicar, loadedQuote, setLoadedQuote, onDirty }) {
  const snapJson = JSON.stringify(snapshot);
  const vacioJson = useRef(null);                 // snapshot del formulario recién montado
  if (vacioJson.current === null) vacioJson.current = sinModo(snapshot);
  const esVacio = sinModo(snapshot) === vacioJson.current;

  const ultimoGuardado = useRef(snapJson);        // último snapshot guardado en el sistema
  const marcarAlProximo = useRef(false);          // tras cargar una guardada: el próximo render es "guardado"
  const [tick, setTick] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [pendiente, setPendiente] = useState(null); // borrador encontrado al montar: { t, data, meta }
  const timer = useRef(null);
  const refs = useRef({});
  refs.current = { snapshot, snapJson, aplicar, loadedQuote, setLoadedQuote, onDirty };

  // Al montar: ¿quedó un borrador de la vez anterior?
  useEffect(() => {
    try {
      const raw = localStorage.getItem(claveBorrador(modo));
      if (!raw) return;
      const b = JSON.parse(raw);
      if (b && b.data && typeof b.t === 'number' && sinModo(b.data) !== vacioJson.current) setPendiente(b);
      else localStorage.removeItem(claveBorrador(modo));
    } catch {}
  }, [modo]);

  // Sucio = distinto de lo último guardado.
  useEffect(() => {
    if (marcarAlProximo.current) { marcarAlProximo.current = false; ultimoGuardado.current = snapJson; }
    setDirty(snapJson !== ultimoGuardado.current);
  }, [snapJson, tick]);
  useEffect(() => { refs.current.onDirty?.(dirty); }, [dirty]);

  const escribir = () => {
    timer.current = null;
    const { snapshot: s, loadedQuote: lq } = refs.current;
    const meta = lq && lq.id ? { id: lq.id, nombre: lq.nombre, cliente: lq.cliente, estado: lq.estado, notas: lq.notas } : null;
    try { localStorage.setItem(claveBorrador(modo), JSON.stringify({ t: Date.now(), data: s, meta })); } catch {}
  };
  const escribirRef = useRef(escribir); escribirRef.current = escribir;

  // Autoguardado con debounce. Con el formulario vacío no escribe (así no pisa
  // un borrador pendiente); igual a lo guardado en el sistema, tampoco.
  useEffect(() => {
    if (esVacio || !dirty) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { escribirRef.current(); setPendiente(null); }, 800);
  }, [snapJson, esVacio, dirty, modo]);

  // Si se va (cierra, recarga o navega) con un debounce pendiente, se escribe igual.
  useEffect(() => {
    const flush = () => { if (timer.current) { clearTimeout(timer.current); escribirRef.current(); } };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, []);

  const restaurar = () => {
    if (!pendiente) return;
    refs.current.aplicar(pendiente.data || {});
    refs.current.setLoadedQuote?.(pendiente.meta || null);
    setPendiente(null);
  };
  const descartar = () => {
    try { localStorage.removeItem(claveBorrador(modo)); } catch {}
    setPendiente(null);
  };
  // Tras guardar en el sistema: lo actual pasa a ser "lo guardado" y el borrador sobra.
  const marcarGuardado = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    ultimoGuardado.current = refs.current.snapJson;
    setDirty(false);
    try { localStorage.removeItem(claveBorrador(modo)); } catch {}
    setPendiente(null);
  };
  // Al reactivar una cotización guardada: la aplica y la toma como punto "guardado".
  const cargarGuardada = (d) => {
    marcarAlProximo.current = true;
    refs.current.aplicar(d || {});
    setTick(t => t + 1); // garantiza un render aunque nada haya cambiado
  };

  return { aviso: pendiente && esVacio ? pendiente : null, dirty, restaurar, descartar, marcarGuardado, cargarGuardada };
}

// "hoy, 12:05" · "ayer, 18:30" · "12/09, 09:15" · "12/09/2025, 09:15"
function cuandoFue(t) {
  const d = new Date(t);
  if (isNaN(d.getTime())) return '';
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const hoy = new Date();
  const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(hoy) - dia(d)) / 86400000);
  if (dias === 0) return `hoy, ${hora}`;
  if (dias === 1) return `ayer, ${hora}`;
  const fecha = d.toLocaleDateString('es-AR', d.getFullYear() === hoy.getFullYear()
    ? { day: '2-digit', month: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${fecha}, ${hora}`;
}

// Aviso de borrador pendiente, arriba del formulario: una línea tranquila con
// "Restaurar" y "Descartar" (ámbar solo en el filete: pide atención, no alarma).
function AvisoBorrador({ b }) {
  if (!b.aviso) return null;
  const cuando = cuandoFue(b.aviso.t);
  const editando = b.aviso.meta?.nombre;
  return (
    <div className="cz-aviso" role="status">
      <EstilosDialogo />
      <p className="cz-aviso-texto">
        Tenés un borrador sin guardar
        {editando ? <> de <strong>«{editando}»</strong></> : null}
        {cuando ? ` (${cuando})` : ''}.
      </p>
      <div className="cz-aviso-acciones">
        <button type="button" onClick={b.restaurar} className="ct-btn-texto cz-texto-fuerte">Restaurar</button>
        <button type="button" onClick={b.descartar} className="ct-btn-texto">Descartar</button>
      </div>
    </div>
  );
}

export {
  usd, printHTML, printInPage,
  ESTADOS, estadoMeta, SaveQuoteModal, SaveQuoteButton, applyNcm, NcmPicker,
  LBL, INP, MINP, SECL, TBTN, PBTN,
  F, NI, TI, CostStack, SummaryChip, PagaToggle, Pill, Tab, Card, RRow,
  ShipIcon, PlaneIcon,
  claveBorrador, sinModo, fmtFechaHora, useBorrador, AvisoBorrador,
  Dialogo, Confirmar, EstilosDialogo, IconoCerrar, IconoPapelera, IconoMas, IconoTilde,
};
