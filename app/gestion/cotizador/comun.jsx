'use client';
// Piezas compartidas por los dos cotizadores y los paneles: impresión, estados y
// guardado de cotizaciones, aplicar una NCM guardada, el armazón de diálogos y
// paneles (Dialogo, Confirmar), íconos y el borrador automático.
import { useState, useEffect, useRef, useId } from 'react';
import { gToast } from '../toast';
import { Campo, TextInput } from './ui';

// ─── helpers ──────────────────────────────────────────────────────────────────
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
.gestion-root .cz-aviso-texto{flex:0 1 auto;margin:0;font-size:13.5px;line-height:1.45;color:#4b5563;font-variant-numeric:tabular-nums}
.gestion-root .cz-aviso-texto strong{font-weight:600;color:#111827}
.gestion-root .cz-aviso-acciones{display:flex;align-items:center;gap:18px}
.gestion-root .cz-barra{display:flex;align-items:center;flex-wrap:wrap;gap:10px 16px}
.gestion-root .cz-barra-busca{flex:1 1 220px;min-width:0}
.gestion-root .cz-barra-lado{display:flex;align-items:center;gap:8px;flex:none}
.gestion-root .cz-rotulo{display:inline!important;margin:0!important;font-size:12.5px!important;font-weight:500!important;line-height:1.3;color:#4b5563;white-space:nowrap}
.gestion-root .cz-filtros{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:14px}
.gestion-root .cz-filtro{display:inline-flex;align-items:baseline;gap:5px;height:auto;min-height:0!important;min-width:0!important;margin:0;padding:4px 0 6px!important;border:0;border-bottom:2px solid transparent;border-radius:0!important;background:transparent;color:#6b7280;font-size:13px!important;font-weight:500;line-height:1.3;white-space:nowrap;cursor:pointer;transition:color 120ms ease,border-color 120ms ease;-webkit-tap-highlight-color:transparent!important}
.gestion-root .cz-filtro:hover{color:#111827}
.gestion-root .cz-filtro[aria-pressed="true"]{color:#111827;font-weight:600;border-bottom-color:#111827}
.gestion-root .cz-filtro:focus-visible{outline:2px solid #111827!important;outline-offset:2px;border-radius:4px!important}
.gestion-root .cz-cuenta{font-weight:400;color:#9ca3af;font-variant-numeric:tabular-nums}
.gestion-root .cz-estado-vacio{margin:0;padding:20px 0;font-size:14px;line-height:1.55;color:#6b7280}
.gestion-root .cz-seguimiento{margin:0 0 24px;padding:2px 0 2px 12px;border-left:2px solid #d97706}
.gestion-root .cz-seguimiento-titulo{margin:0 0 6px;font-size:13px;font-weight:600;line-height:1.4;color:#111827}
.gestion-root .cz-seguimiento ul{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.gestion-root .cz-seguimiento li{font-size:13.5px;line-height:1.5;color:#4b5563}
.gestion-root .cz-seguimiento strong{font-weight:600;color:#111827}
.gestion-root .cz-ambar{color:#d97706}
.gestion-root .ct-btn-texto.cz-en-linea{display:inline;padding:0!important;font-size:inherit!important;line-height:inherit;vertical-align:baseline}
.gestion-root .cz-grupo + .cz-grupo{margin-top:28px}
.gestion-root .cz-grupo-titulo{display:flex;align-items:center;gap:8px;margin:0;padding-bottom:4px;font-size:13px;font-weight:600;line-height:1.4;color:#111827}
.gestion-root .cz-punto{display:inline-block;flex:none;width:8px;height:8px;border-radius:50%}
.gestion-root .cz-lista{margin:0;padding:0;list-style:none}
.gestion-root .cz-item{padding:14px 0;border-bottom:1px solid #f1f5f9}
.gestion-root .cz-item[aria-busy="true"]{opacity:.5}
.gestion-root .cz-item-cab{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.gestion-root .cz-item-textos{flex:1 1 auto;min-width:0}
.gestion-root .cz-item-nombre{margin:0;font-size:14.5px;font-weight:600;line-height:1.35;color:#111827;overflow-wrap:anywhere}
.gestion-root .cz-item-cerrada .cz-item-nombre{font-weight:500;color:#4b5563}
.gestion-root .cz-item-meta{margin:3px 0 0;font-size:12.5px;line-height:1.45;color:#6b7280;font-variant-numeric:tabular-nums}
.gestion-root .cz-item-extra{margin:2px 0 0;font-size:12px;line-height:1.45;color:#9ca3af;overflow-wrap:anywhere}
.gestion-root .cz-item-monto{flex:none;margin:0;text-align:right;font-size:15px;font-weight:600;line-height:1.35;color:#111827;font-variant-numeric:tabular-nums;white-space:nowrap}
.gestion-root .cz-item-cerrada .cz-item-monto{font-weight:500;color:#4b5563}
.gestion-root .cz-item-monto small{display:block;margin-top:1px;font-size:12px;font-weight:400;color:#9ca3af}
.gestion-root .cz-item-acciones{display:flex;align-items:center;flex-wrap:wrap;gap:6px 18px;margin-top:8px}
.gestion-root .cz-item-derecha{display:flex;align-items:center;gap:4px;margin-left:auto}
.gestion-root .cz-estado{display:inline-flex;align-items:center;gap:6px}
.gestion-root .cz-cerradas{margin-top:24px}
.gestion-root .cz-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.gestion-root .cz-form{margin:0 0 4px;padding:16px 0 20px;border-bottom:1px solid #f1f5f9}
.gestion-root .cz-form-titulo{margin:0 0 16px;font-size:14px;font-weight:600;line-height:1.4;color:#111827}
.gestion-root .cz-form-acciones{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:12px 20px;margin-top:20px}
.gestion-root .cz-grilla-2,.gestion-root .cz-grilla-3{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}
.gestion-root .cz-grilla-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.gestion-root .cz-grilla-codigo{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:16px;align-items:start}
@media (max-width:560px){.gestion-root .cz-grilla-3{grid-template-columns:repeat(2,minmax(0,1fr))}.gestion-root .cz-grilla-codigo{grid-template-columns:minmax(0,1fr)}.gestion-root .cz-item-acciones .cz-item-derecha{width:100%;margin-left:0;justify-content:space-between}}
@media (max-width:640px){.gestion-root .cz-filtro::after{content:none}}
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
    const token = { el: caja.current };
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
      if (!perdido) return;
      // Vuelve a donde estaba; si eso ya no existe (por ejemplo, la fila que se
      // acaba de eliminar), al diálogo que quedó abierto debajo.
      const debajo = pilaDialogos[pilaDialogos.length - 1]?.el;
      const destino = previo && previo.isConnected ? previo : (debajo && debajo.isConnected ? debajo : null);
      try { destino?.focus({ preventScroll: true }); } catch { /* nada */ }
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
        style={{ maxWidth: ancho }}
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

// Error del guardado en castellano. Si se corta la red, fetch tira un TypeError
// con el mensaje del navegador en inglés: ese nunca se muestra.
function errorDeGuardado(e) {
  const m = String(e?.message || '');
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(m)) {
    return 'No hay conexión con el servidor. Revisá internet y probá de nuevo.';
  }
  if (/unauthorized|\b401\b/i.test(m)) return 'Tu sesión venció. Volvé a entrar y probá de nuevo.';
  return 'No se pudo guardar. Revisá la conexión y probá de nuevo.';
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
      // Nada de mensajes del navegador en inglés ("Failed to fetch", "Load failed").
      setErr(errorDeGuardado(e));
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

// ─── NCM guardada → formulario (la usan los combobox de NCM de los dos cotizadores) ─
// Aplica una NCM guardada: setea código, descripción y todas las tasas tal cual
// están almacenadas (strings crudos). La descripción se completa SOLO si está
// vacía: con el orden nuevo (Cliente, Descripción, NCM) elegir la NCM llegaba
// después de escribirla y le pasaba el trapo, y ese texto es el que va al
// documento del cliente.
function applyNcm(n, setters) {
  if (!n) return;
  const { setClasificacion, setDescripcion, setPDer, setPTas, setPIva, setPIvaA, setPGan, setPIIBB } = setters;
  setClasificacion(n.codigo || '');
  if (n.producto) setDescripcion((d) => (String(d ?? '').trim() ? d : n.producto));
  setPDer(n.der || '');
  setPTas(n.tasa || '');
  setPIva(n.iva || '');
  setPIvaA(n.iva_adic || '');
  setPGan(n.ganancias || '');
  setPIIBB(n.iibb || '');
}

// ─── biblioteca de NCM, al día ───────────────────────────────────────────────
// Los combobox de NCM leían la lista una sola vez, al montar: una NCM recién
// creada en el panel (o guardada sola al guardar una cotización) no aparecía
// hasta recargar la página, y eso empujaba a tipear el código a mano. Quien la
// cambia avisa con avisarNcmCambiada() y los dos cotizadores la vuelven a pedir.
const EVENTO_NCM = 'cotizador:ncm';

function avisarNcmCambiada() {
  try { window.dispatchEvent(new Event(EVENTO_NCM)); } catch {}
}

function useNcmList() {
  const [lista, setLista] = useState([]);
  useEffect(() => {
    let vivo = true;
    const cargar = () => {
      fetch('/api/db/ncm')
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => { if (vivo) setLista(Array.isArray(d) ? d : []); })
        .catch(() => {});
    };
    cargar();
    window.addEventListener(EVENTO_NCM, cargar);
    return () => { vivo = false; window.removeEventListener(EVENTO_NCM, cargar); };
  }, []);
  return lista;
}

// ─── NCM que se guarda sola al guardar una cotización ────────────────────────
// Las tasas se actualizan (son las que se usaron para cotizar), pero el producto
// se manda SOLO si la NCM no existe todavía o no tiene ninguno: la descripción
// de UNA cotización no puede renombrar la posición para todas las demás. El
// servidor conserva el producto anterior cuando le llega vacío.
function ncmParaGuardar({ codigo, descripcion, ncmList, der, tasa, iva, ivaAdic, ganancias, iibb }) {
  const cod = String(codigo || '').trim();
  if (!cod) return null;
  const norm = (s) => String(s || '').trim().toLowerCase();
  const guardada = (Array.isArray(ncmList) ? ncmList : []).find((x) => x && norm(x.codigo) === norm(cod));
  const yaTieneProducto = !!(guardada && String(guardada.producto || '').trim());
  return {
    codigo: cod,
    producto: yaTieneProducto ? '' : String(descripcion || ''),
    der: String(der ?? ''), tasa: String(tasa ?? ''), iva: String(iva ?? ''),
    iva_adic: String(ivaAdic ?? ''), ganancias: String(ganancias ?? ''), iibb: String(iibb ?? ''),
  };
}

// ─── borrador automático (localStorage) + cambios sin guardar ─────────────────
// Cada modo persiste su snapshot (el mismo objeto `data` que viaja con la
// cotización guardada) en 'cot-borrador:<modo>' con debounce de 800 ms. Al
// montar, si hay borrador, se ofrece restaurarlo o descartarlo. "Sucio" = el
// snapshot actual difiere del último guardado en el sistema (o de lo recién
// cargado desde "guardadas").
const claveBorrador = (modo) => `cot-borrador:${modo}`;
// Mientras hay un borrador sin decidir, lo que se va tipeando se guarda acá: el
// anterior no se pisa hasta que alguien elija Restaurar o Descartar. Antes, la
// primera tecla lo borraba a los 800 ms sin que nadie lo decidiera.
const claveEnCurso = (modo) => `cot-borrador:${modo}:en-curso`;
// Para decidir "formulario vacío" se ignora `mode` (cliente/personal): cambiar
// de pestaña sin cargar nada no es un borrador.
const sinModo = (s) => { const o = { ...(s || {}) }; delete o.mode; return JSON.stringify(o); };

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
  refs.current = { snapshot, snapJson, aplicar, loadedQuote, setLoadedQuote, onDirty, pendiente };

  // Al montar: ¿quedó un borrador de la vez anterior? Pueden ser dos (el que
  // había sin decidir y lo que se tipeó encima): se ofrece el más reciente y
  // queda uno solo en la clave de siempre.
  useEffect(() => {
    const leer = (clave) => {
      try {
        const raw = localStorage.getItem(clave);
        if (!raw) return null;
        const b = JSON.parse(raw);
        return (b && b.data && typeof b.t === 'number' && sinModo(b.data) !== vacioJson.current) ? b : null;
      } catch { return null; }
    };
    const anterior = leer(claveBorrador(modo));
    const enCurso = leer(claveEnCurso(modo));
    const elegido = !anterior ? enCurso : (!enCurso ? anterior : (enCurso.t > anterior.t ? enCurso : anterior));
    try {
      localStorage.removeItem(claveEnCurso(modo));
      if (elegido) localStorage.setItem(claveBorrador(modo), JSON.stringify(elegido));
      else localStorage.removeItem(claveBorrador(modo));
    } catch {}
    setPendiente(elegido);
  }, [modo]);

  // Sucio = distinto de lo último guardado.
  useEffect(() => {
    if (marcarAlProximo.current) { marcarAlProximo.current = false; ultimoGuardado.current = snapJson; }
    setDirty(snapJson !== ultimoGuardado.current);
  }, [snapJson, tick]);
  useEffect(() => { refs.current.onDirty?.(dirty); }, [dirty]);

  const escribir = () => {
    timer.current = null;
    const { snapshot: s, loadedQuote: lq, pendiente: p } = refs.current;
    const meta = lq && lq.id ? { id: lq.id, nombre: lq.nombre, cliente: lq.cliente, estado: lq.estado, notas: lq.notas } : null;
    // Con un borrador sin decidir, lo nuevo va a la clave aparte: el anterior
    // sigue ahí hasta que alguien elija Restaurar o Descartar.
    const clave = p ? claveEnCurso(modo) : claveBorrador(modo);
    try { localStorage.setItem(clave, JSON.stringify({ t: Date.now(), data: s, meta })); } catch {}
  };
  const escribirRef = useRef(escribir); escribirRef.current = escribir;

  // Lo que se tipeó mientras el aviso estaba en pantalla pasa a ser EL borrador.
  const consolidar = () => {
    try {
      const enCurso = localStorage.getItem(claveEnCurso(modo));
      if (enCurso) localStorage.setItem(claveBorrador(modo), enCurso);
      localStorage.removeItem(claveEnCurso(modo));
      return !!enCurso;
    } catch { return false; }
  };

  // Autoguardado con debounce. Con el formulario vacío no escribe (así no pisa
  // un borrador pendiente); igual a lo guardado en el sistema, tampoco.
  useEffect(() => {
    if (esVacio || !dirty) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { escribirRef.current(); }, 800);
  }, [snapJson, esVacio, dirty, modo]);

  // Si se va (cierra, recarga o navega) con un debounce pendiente, se escribe igual.
  useEffect(() => {
    const flush = () => { if (timer.current) { clearTimeout(timer.current); escribirRef.current(); } };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, []);

  const restaurar = () => {
    if (!pendiente) return;
    // Lo que hubiera tipeado encima queda reemplazado por el borrador restaurado.
    try { localStorage.removeItem(claveEnCurso(modo)); } catch {}
    refs.current.aplicar(pendiente.data || {});
    refs.current.setLoadedQuote?.(pendiente.meta || null);
    setPendiente(null);
  };
  const descartar = () => {
    // Si ya se estaba tipeando otra cosa, esa pasa a ser el borrador.
    try { if (!consolidar()) localStorage.removeItem(claveBorrador(modo)); } catch {}
    setPendiente(null);
  };
  // Tras guardar en el sistema: lo actual pasa a ser "lo guardado" y el borrador sobra.
  const marcarGuardado = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    ultimoGuardado.current = refs.current.snapJson;
    setDirty(false);
    try {
      localStorage.removeItem(claveBorrador(modo));
      localStorage.removeItem(claveEnCurso(modo));
    } catch {}
    setPendiente(null);
  };
  // Al reactivar una cotización guardada: la aplica y la toma como punto "guardado".
  const cargarGuardada = (d) => {
    // Abrir una guardada es decidir: el aviso se va y lo tipeado hasta acá,
    // que la guardada está por reemplazar, queda como borrador.
    consolidar();
    setPendiente(null);
    marcarAlProximo.current = true;
    refs.current.aplicar(d || {});
    setTick(t => t + 1); // garantiza un render aunque nada haya cambiado
  };

  // El aviso no se esconde al primer tecleo: si el borrador sigue sin decidirse,
  // "Restaurar" tiene que seguir a mano (y el formulario no salta mientras se tipea).
  return { aviso: pendiente, dirty, restaurar, descartar, marcarGuardado, cargarGuardada };
}

// "hoy, 12:05" · "ayer, 18:30" · "12/09, 09:15" · "12/09/2025, 09:15"
function cuandoFue(t) {
  const d = new Date(t);
  if (isNaN(d.getTime())) return '';
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const hoy = new Date();
  const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(hoy) - dia(d)) / 86400000);
  if (dias === 0) return `hoy, ${hora}`;
  if (dias === 1) return `ayer, ${hora}`;
  const dos = (x) => String(x).padStart(2, '0');
  const dm = `${dos(d.getDate())}/${dos(d.getMonth() + 1)}`;
  const fecha = d.getFullYear() === hoy.getFullYear() ? dm : `${dm}/${d.getFullYear()}`;
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
  printHTML, printInPage,
  ESTADOS, estadoMeta, SaveQuoteModal, applyNcm, ncmParaGuardar, useNcmList, avisarNcmCambiada,
  sinModo, useBorrador, AvisoBorrador,
  Dialogo, Confirmar, EstilosDialogo, IconoCerrar, IconoPapelera, IconoMas, IconoTilde,
};
