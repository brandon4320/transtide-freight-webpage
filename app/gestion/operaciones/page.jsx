'use client';
import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { gToast } from '../toast';
import { importFlowState, FlowTimeline, MiniFlow } from '../flujo-importacion';
import { EmbarqueModal } from '../embarque-form';
import FichaImportacion from '../ficha-importacion';
import { useSeleccionMultiple, BarraSeleccion, Casilla } from '../seleccion-multiple';

// ─── helpers ─────────────────────────────────────────────────────────────────
const n    = (v) => parseFloat(v) || 0;
// Montos del módulo Despachante: guardados como strings es-AR ("11.886" = 11886).
const numDesp = (v) => { const x = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isNaN(x) ? 0 : x; };
// Capitaliza por palabra respetando acentos (con \b\w los acentos cuentan como fin
// de palabra y "Módulos policía" salía "MóDulos PolicíA") y dejando en mayúscula las
// siglas del negocio: los nombres se cargan TODO EN MAYÚSCULAS.
const SIGLAS = new Set(['SA', 'SRL', 'SAS', 'SL', 'SACIF', 'CNC', 'BL', 'HC', 'USA', 'EEUU', 'NCM', 'VEP', 'IVA', 'FOB', 'CIF', 'EXW', 'FCA', 'LCL', 'FCL', 'THC', 'ARCA', 'AFIP', 'CUIT', 'PRFV', 'ADC', 'RORO', 'LCL', 'HQ']);
const toTitle = (s) => s
  ? String(s).split(/(\s+)/).map(w => {
      const limpio = w.replace(/[^\p{L}\p{N}]/gu, '');
      if (limpio && SIGLAS.has(limpio.toUpperCase())) return w.toUpperCase();
      return w.toLowerCase().replace(/(^|[(/-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
    }).join('')
  : s;
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

// ─── fechas · una sola ETA, un solo formato ──────────────────────────────────
// Regla: se GUARDA siempre en ISO (yyyy-mm-dd) y se MUESTRA siempre dd/mm/aaaa.
// El parseo acepta los dos formatos porque las filas viejas quedaron en
// dd/mm/aaaa y no se migran — se leen bien igual.
const toISODate = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const ar = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (ar) return `${ar[3]}-${ar[2].padStart(2, '0')}-${ar[1].padStart(2, '0')}`;
  return '';
};
// Para pantalla. Si el formato es desconocido devuelve el texto crudo (nunca oculta el dato).
// Fecha legible de un vistazo: "sep 2 2026" (mismo criterio que Forwarding).
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const fmtFecha = (v) => {
  const iso = toISODate(v);
  if (!iso) return String(v ?? '').trim();
  const [y, m, d] = iso.split('-');
  return `${MESES[+m - 1]} ${+d} ${y}`;
};
const dateFromAny = (v) => {
  const iso = toISODate(v);
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
};
// >0 = faltan N días · 0 = hoy · <0 = arribó hace N días
const daysTo = (v) => {
  const d = dateFromAny(v);
  if (!d) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
};
// "llega en 4 días / arribó hace 6 días" — mismo criterio que Forwarding.
// Color solo semántico: ámbar = se viene / recién arribó, rojo = arribó hace
// una semana y la operación sigue abierta (ahí empieza a costar plata).
const etaRel = (v, apagada) => {
  const dd = daysTo(v);
  if (dd == null) return null;
  const dias = (k) => `${k} día${k === 1 ? '' : 's'}`;
  if (dd === 0) return { text: 'llega hoy', color: apagada ? MUTED : AMBER, days: dd };
  if (dd > 0)   return { text: `llega en ${dias(dd)}`, color: apagada || dd > 7 ? MUTED : AMBER, days: dd };
  const k = -dd;
  return { text: `arribó hace ${dias(k)}`, color: apagada ? MUTED : (k >= 7 ? RED : AMBER), days: dd };
};
// Orden por urgencia: ETA más vieja/próxima primero, sin ETA al fondo.
const urgenciaKey = (o) => {
  const d = dateFromAny(o?.eta);
  return d ? d.getTime() : Number.POSITIVE_INFINITY;
};

// ─── row calculations ─────────────────────────────────────────────────────────
const rowPesos = (r) => n(r.usd) > 0 && n(r.tc) > 0 ? n(r.usd) * n(r.tc) : n(r.pesos);
const rowUSD   = (r) => n(r.usd) > 0 && n(r.tc) === 0 ? n(r.usd) : 0;
const catTot   = (rows) => ({ pesos: rows.reduce((s, r) => s + rowPesos(r), 0), usd: rows.reduce((s, r) => s + rowUSD(r), 0) });
const newRow   = () => ({ id: Date.now() + Math.random(), desc: '', factura: '', usd: '', tc: '', pesos: '' });
// Valores de siempre al sumar un proveedor: honorarios 4% con mínimo USD 500 y,
// si se usa el giro de divisas, 1,5% + USD 45 de gasto fijo. Se editan por fila.
const newCobrar = () => ({ tc: '', honorarios: true, despAdic: '', cobrado: false, fechaCobro: '', giroMonto: '', giroPct: '1.5', giroFijo: '45', giroTotal: '', ganancia: '', honMin: '500', exigirPago: false });

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
// Filtros de la lista: agrupan los estados del flujo real (null = todas).
const FILTROS = [
  ['todas',    'Todas',       null],
  ['transito', 'En tránsito', ['Consolidando', 'En tránsito']],
  ['destino',  'En destino',  ['Arribado', 'En aduana', 'Listo p/ retiro', 'En tránsito local']],
  ['cobrar',   'Por cobrar',  ['Entregado']],
  ['cerradas', 'Cerradas',    ESTADOS_CERRADOS],
];
const PRIMARY = '#111827';
// Cómo viaja la carga. RORO (rodante) y Break Bulk (suelta / sobredimensionada) no
// van en contenedor: sin m³ fijo, la ocupación se muestra como medida real (igual que LCL).
const CONTENEDORES = ['20 Pies', '40 Pies', '40HQ', 'Flat Rack', 'LCL', 'RORO', 'Break Bulk', 'Aéreo'];
const CONTAINER_M3 = { '20 Pies': 28, '40 Pies': 56, '40HQ': 76, 'Flat Rack': 76, 'LCL': null, 'RORO': null, 'Break Bulk': null, 'Aéreo': null };

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

// ─── de qué bolsillo salió cada gasto ─────────────────────────────────────────
// Son DOS, no tres: la SOCIEDAD (Successi Ing SA, la sociedad propia — lo que
// paga ella se le reintegra después) o la CAJA de Brandon (efectivo de su
// bolsillo, que vuelve cuando el cliente paga).
const PAGADORES = [['blanco', 'Sociedad'], ['cash', 'Caja Brandon']];
// 'successi' fue un valor intermedio que separaba la sociedad en dos: se lee
// como sociedad para no perder lo que ya esté cargado con esa marca.
const normPagador = (v) => (v === 'successi' ? 'blanco' : v);
const esPagador = (v) => normPagador(v) === 'blanco' || normPagador(v) === 'cash';
// Montos tipeados a mano: mismo criterio es-AR que el resto del sistema
// ("1.234,56" = 1234,56). El formulario muestra en vivo cómo queda interpretado.
const fmtMontoAR = (v) => { if (!isFinite(v)) return ''; const r = Math.round(v * 100) / 100; return r === 0 ? '' : r.toLocaleString('es-AR', { maximumFractionDigits: 2 }); };
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Cuenta de Successi en una operación: cuánto puso, cuánto se le reintegró y
// cuánto falta. Ese "falta" es una de las condiciones de cierre.
const successiCuenta = (succPesos, tc, reintegros) => {
  const puestoUSD = tc > 0 ? Math.round((succPesos / tc) * 100) / 100 : 0;
  const reintegradoUSD = Math.round((reintegros || []).reduce((s, r) => s + numDesp(r.monto), 0) * 100) / 100;
  return {
    puestoPesos: succPesos, puestoUSD, reintegradoUSD,
    faltaUSD: Math.round((puestoUSD - reintegradoUSD) * 100) / 100,
    // Puso plata pero la operación todavía no tiene T.C.: no se puede pasar a USD.
    sinTC: succPesos > 0 && !(tc > 0),
  };
};

// Los reintegros viven en el ledger de pagos (scope 'successi'). Si esa ruta no
// acepta el scope, el plan B los guarda en la propia operación: cada reintegro
// está en UN solo lado y la lista es la unión de los dos (nunca se duplica).
const mapReintegroLedger = (x) => ({
  id: String(x.id), fecha: x.fecha || '', monto: x.monto || '',
  metodo: x.metodo || '', nota: x.nota || '', por: x.created_by || '', origen: 'ledger',
});
const mergeReintegros = (ledger, opRow) => {
  const a = (Array.isArray(ledger) ? ledger : []).filter(x => String(x.scope || '') === 'successi').map(mapReintegroLedger);
  const b = (opRow && Array.isArray(opRow.successiReintegros) ? opRow.successiReintegros : []).map(x => ({ ...x, origen: 'op' }));
  return [...a, ...b].sort((x, y) => String(y.fecha || '').localeCompare(String(x.fecha || '')));
};

// ─── condiciones de cierre ────────────────────────────────────────────────────
// Las 5 cosas que tienen que estar en cero para liquidar una operación. Se puede
// cerrar igual: las que queden abiertas se guardan en el acta de cierre con su
// monto, y la operación sigue a la vista hasta que se resuelvan.
const condicionesCierre = ({ calc, checkDone, checkTotal, ship, desp, reintegros }) => {
  const succ = successiCuenta(calc.succPesos, calc.fallbackTC, reintegros);
  const agente = ship ? trackBalNum(ship.balance_usd) : 0;
  const dsp = desp ? numDesp(desp.saldo) : 0;
  const pendClientes = Math.round((calc.totalACobrar - calc.totalCobrado) * 100) / 100;
  const nPend = calc.perProv.filter(p => !p.cb.cobrado).length;
  return [
    {
      id: 'checklist', label: 'Checklist al 100%', monto: 0,
      ok: checkTotal > 0 && checkDone >= checkTotal,
      detalle: `${checkDone} de ${checkTotal} tareas`,
    },
    {
      id: 'agente', label: 'Saldo del agente en cero', monto: Math.max(agente, 0),
      ok: agente <= 0,
      detalle: !ship ? 'sin embarque cargado' : agente > 0 ? `${ship.agente || 'el agente'} · falta pagarle` : 'saldado',
    },
    {
      id: 'despachante', label: 'Despachante saldado', monto: Math.max(dsp, 0),
      ok: dsp <= 0,
      detalle: !desp ? 'sin despacho cargado' : dsp > 0 ? 'su cuenta corriente sigue con saldo' : 'saldado',
    },
    {
      id: 'clientes', label: 'Todos los clientes cobrados', monto: Math.max(pendClientes, 0),
      ok: nPend === 0,
      detalle: calc.perProv.length === 0 ? 'sin proveedores cargados' : nPend === 0 ? `${calc.perProv.length} cobrados` : `${nPend} de ${calc.perProv.length} sin cobrar`,
    },
    {
      id: 'successi', label: 'Reintegro a Successi hecho', monto: Math.max(succ.faltaUSD, 0),
      ok: !succ.sinTC && succ.faltaUSD <= 0,
      detalle: succ.sinTC
        ? `puso ${fmtP(succ.puestoPesos)} — cargá un T.C. para pasarlo a USD`
        : succ.puestoUSD > 0 ? `puso ${fmtU(succ.puestoUSD)} · reintegrado ${fmtU(succ.reintegradoUSD)}` : 'no puso plata en esta operación',
    },
  ];
};

// ─── cálculo de la operación ─────────────────────────────────────────────────
// Vive fuera del componente: la pantalla lo usa vía useMemo y el control de
// cierre lo usa sobre un detalle recién bajado del servidor (misma cuenta, un
// solo lugar donde se define la plata).
function computeCalc(detail, clientes = []) {
  const { naviera = [], terminal = [], aduana = [], transporte = [], despachante = [], admin = [], fleteIntl = [], proveedores = [], cobrar = [], customGastos = [] } = detail;
  const tNav = catTot(naviera).pesos, tTerm = catTot(terminal).pesos, tAdu = catTot(aduana).pesos;
  const tTra = catTot(transporte).pesos, tDes = catTot(despachante).pesos, tAdm = catTot(admin).pesos;
  const tFlt = catTot(fleteIntl).pesos;

  // Split por LÍNEA: cada gasto sale de la SOCIEDAD (Successi) o de la CAJA de
  // Brandon. Sin marca, hereda el default de su categoría (flete intl → caja, el
  // resto → sociedad). VEP Aduana es siempre sociedad. Reclasificar una línea NO
  // cambia el costo total ni el "a cobrar" por proveedor (la suma prorrateada es
  // la misma): solo cambia de qué bolsillo salió, lo que recuperás en efectivo y
  // lo que hay que reintegrarle a la sociedad.
  const splitRows = (rows, defKind) => rows.reduce((a, r) => {
    const kind = esPagador(r.pagadoPor) ? normPagador(r.pagadoPor) : defKind;
    a[kind] += rowPesos(r);
    return a;
  }, { blanco: 0, cash: 0 });

  let enBlanco = tAdu, cash = 0, succPesos = tAdu; // VEP siempre sociedad
  // catsBlanco: desglose de lo que paga la SOCIEDAD IMPORTADORA (tributos,
  // naviera, terminal…) para la banda "Reparto de la plata". El DESPACHANTE
  // va aparte (despBlanco): es SU factura, no de la sociedad — si estuviera
  // acá y en su propia tarjeta se sumaría dos veces. Lo que puso Successi sale
  // de catsBlanco y va a su propia cuenta (catsSucc).
  const catsBlanco = tAdu > 0 ? [{ label: 'VEP Aduana (tributos)', monto: tAdu }] : [];
  const catsSucc = tAdu > 0 ? [{ label: 'VEP Aduana (tributos)', monto: tAdu }] : [];
  let despBlanco = 0, despSucc = 0;
  // Lo que pone la sociedad ES lo que hay que reintegrarle a Successi: el mismo
  // número, mirado desde los dos lados (cuánto salió · cuánto falta devolver).
  const acum = (s, label) => {
    enBlanco += s.blanco; cash += s.cash; succPesos += s.blanco;
    if (s.blanco > 0) { catsBlanco.push({ label, monto: s.blanco }); catsSucc.push({ label, monto: s.blanco }); }
  };
  [[naviera, 'blanco', 'Naviera'], [terminal, 'blanco', 'Terminal'], [transporte, 'blanco', 'Transporte'], [despachante, 'blanco', null], [admin, 'blanco', 'Admin'], [fleteIntl, 'cash', 'Flete Internacional']].forEach(([rows, def, label]) => {
    const s = splitRows(rows, def);
    if (label === null) {
      // Despachante: su tarjeta muestra todo lo que le pagás; lo que puso la
      // sociedad entra igual en la cuenta de reintegro.
      enBlanco += s.blanco; cash += s.cash; succPesos += s.blanco;
      despBlanco = s.blanco; despSucc = s.blanco;
      if (s.blanco > 0) catsSucc.push({ label: 'Despachante', monto: s.blanco });
      return;
    }
    acum(s, label);
  });
  customGastos.forEach(cg => {
    acum(splitRows(detail[cg.id] || [], cg.kind === 'cash' ? 'cash' : 'blanco'), cg.label || 'Otro');
  });
  // Lo que queda para la sociedad importadora: el desglose que se muestra.
  const socPesos = catsBlanco.reduce((s, c) => s + c.monto, 0);

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
    // Lo que te queda a VOS de esta fila: honorarios + giro + ganancia cargada.
    // No entran gastos de origen, VEP ni adicionales del despachante: eso se
    // pasa al cliente tal cual (por eso "Servicios" no sirve como margen).
    const gananciaUSD = Math.round((honorarios + giroUSD + n(cb.ganancia)) * 100) / 100;
    return { ...p, clienteNombre, ratio, prorPesos, prorBlancoPesos, prorCashPesos, cashUSD, vepPesos, costoFinal, tcUsed, tcInherited, gastosUSD, origenUSD, honorarios, giroUSD, gananciaUSD, totalUSD, cb, idx: i };
  });
  return {
    tNav, tTerm, tAdu, tTra, tDes, tAdm, tFlt, usdSinTC, fallbackTC,
    enBlanco, cash, prorBase, totalGastos, totalM3, perProv, catsBlanco, despBlanco,
    // Successi Ing SA: cuánto puso en esta operación (y cuánto de eso fue al
    // despachante, que se muestra en su propia tarjeta).
    succPesos, despSucc, catsSucc, socPesos,
    totalACobrar:  perProv.reduce((s, p) => s + p.totalUSD, 0),
    totalCobrado:  perProv.reduce((s, p) => s + (p.cb.cobrado ? p.totalUSD : 0), 0),
    totalCashUSD:  perProv.reduce((s, p) => s + p.cashUSD, 0),
    // Cuánto te dejó la operación (y cuánto de eso ya entró).
    totalGanancia:    perProv.reduce((s, p) => s + p.gananciaUSD, 0),
    gananciaCobrada:  perProv.reduce((s, p) => s + (p.cb.cobrado ? p.gananciaUSD : 0), 0),
    totalHonorarios:  perProv.reduce((s, p) => s + p.honorarios, 0),
    totalGiro:        perProv.reduce((s, p) => s + p.giroUSD, 0),
    totalGananciaMan: perProv.reduce((s, p) => s + n(p.cb.ganancia), 0),
    cobrados:      perProv.filter(p => p.cb.cobrado).length,
  };
}

// ─── OperationsList ───────────────────────────────────────────────────────────
function OperationsList({ onSelect, deepLinkId, query, setQuery, filter, setFilter }) {
  const [ops,       setOps]       = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(null); // null | 'new' | opObj
  const [form,      setForm]      = useState(emptyOp());
  const [confirm,   setConfirm]   = useState(null); // id to delete
  const [statusPop, setStatusPop] = useState(null); // op.id with open status picker
  const [showCerradas, setShowCerradas] = useState(false); // sección de cerradas: colapsada por defecto
  const [deepLinkDone, setDeepLinkDone] = useState(false);
  // Actas de cierre de TODAS las operaciones, en una sola request: la lista
  // necesita saber cuáles se cerraron con plata pendiente para no esconderlas.
  const [cierres,   setCierres]   = useState({});
  const [cierreFor, setCierreFor] = useState(null); // operación que se está por liquidar

  const [loadError, setLoadError] = useState(false);

  // Datos para el mini-pipeline de cada fila (no bloquean la lista).
  const [flowShips, setFlowShips] = useState([]);
  const [flowDesps, setFlowDesps] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/tracking').then(r => r.ok ? r.json() : null).then(j => { if (!cancelled && j) setFlowShips(j.shipments || []); }).catch(() => {});
    fetch('/api/db/despachante').then(r => r.ok ? r.json() : null).then(j => { if (!cancelled && Array.isArray(j)) setFlowDesps(j); }).catch(() => {});
    fetch('/api/db/operations/__cierres').then(r => r.ok ? r.json() : null).then(j => { if (!cancelled && j && typeof j === 'object') setCierres(j); }).catch(() => {});
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

  // El acta de cierre de una operación (lo que quedó abierto al liquidarla).
  const cierreDe      = (o) => (o && (o.cierre || cierres[o.id])) || null;
  const conPendientes = (o) => { const c = cierreDe(o); return !!(c && !c.completo && c.totalUsd > 0); };
  // "Cerrada" a los efectos de la lista: cerrada Y sin plata pendiente. Si quedó
  // con saldo, sigue arriba con las activas en vez de irse a la sección colapsada.
  const esCerrada = (o) => ESTADOS_CERRADOS.includes(o.estado) && !conPendientes(o);

  const setEstado = async (id, estado) => {
    const op = ops.find(o => o.id === id);
    if (!op) return;
    // Liquidar no puede ser elegir una opción de un desplegable: primero se revisa
    // qué queda abierto y por cuánta plata. Se puede cerrar igual, pero registrado.
    if (estado === 'Liquidado') { setStatusPop(null); setCierreFor(op); return; }
    const prev = op.estado;
    const next = { ...op, estado };
    // Vuelve a un estado abierto: el acta de cierre anterior deja de aplicar
    // (el servidor la borra sola cuando el estado no es de cierre).
    if (!ESTADOS_CERRADOS.includes(estado)) {
      delete next.cierre;
      setCierres(c => { if (!c[id]) return c; const x = { ...c }; delete x[id]; return x; });
    }
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
        const row = { ...created, m3_total: 0 };
        setOps([row, ...ops]);
        gToast.success('Operación creada.');
        setModal(null);
        onSelect(row); // la lista ordena por urgencia: sin esto la nueva queda al fondo
        return;
      } else {
        const id = modal.id;
        // Liquidar desde el selector de estado del modal tampoco puede ser
        // directo: se guarda el resto y se abre el control de condiciones.
        const quiereLiquidar = form.estado === 'Liquidado' && modal.estado !== 'Liquidado';
        const updated = { ...form, id, ...(quiereLiquidar ? { estado: modal.estado } : {}) };
        const r = await fetch(`/api/db/operations/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
        if (!r.ok) { gToast.error('No se pudieron guardar los cambios.'); return; }
        const row = { ...(ops.find(o => o.id === id) || {}), ...updated };
        setOps(ops.map(o => o.id === id ? row : o));
        gToast.success('Operación actualizada.');
        if (quiereLiquidar) { setModal(null); setCierreFor(row); return; }
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

  // Borrado en lote, ya confirmado y con el deshacer vencido.
  const removeMuchas = useCallback(async (ids) => {
    const res = await Promise.all(ids.map(id =>
      fetch(`/api/db/operations/${id}`, { method: 'DELETE' }).then(r => r.ok).catch(() => false)
    ));
    const ok = res.filter(Boolean).length;
    setOps(prev => prev.filter(o => !ids.includes(o.id)));
    if (ok === ids.length) gToast.success(ok === 1 ? 'Operación eliminada.' : `${ok} operaciones eliminadas.`);
    else gToast.error(`Se eliminaron ${ok} de ${ids.length}. Recargá para ver el estado real.`);
  }, []);

  const INP2 = { ...INP, padding: '0.5rem 0.75rem', boxSizing: 'border-box' };
  const SEL  = { ...INP2, cursor: 'pointer', appearance: 'auto' };

  // Buscador + filtro por estado, y orden por urgencia real (ETA más próxima o
  // ya vencida arriba) en vez de por fecha de alta.
  const q   = query.trim().toLowerCase();
  const qBL = blNorm(query);
  const visibles = useMemo(() => {
    const grupo = (FILTROS.find(f => f[0] === filter) || FILTROS[0])[2];
    let l = grupo ? ops.filter(o => grupo.includes(o.estado)) : ops;
    if (q) {
      l = l.filter(o =>
        [o.nombre, o.bl, o.clientes_txt, o.proveedores_txt, o.estado, o.contenedor].some(v => (v || '').toLowerCase().includes(q))
        // B/L sin espacios ni guiones: "MAEU 754-33" encuentra MAEU75433
        || (qBL.length >= 3 && blNorm(o.bl).includes(qBL))
      );
    }
    return [...l].sort((a, b) => urgenciaKey(a) - urgenciaKey(b));
  }, [ops, q, qBL, filter]);

  // Activas arriba, cerradas al fondo (colapsadas por defecto; si estás buscando
  // se abren solas, si no parece que el resultado no existe).
  const cerradasOpen = showCerradas || !!q || filter === 'cerradas';
  // "Seleccionar todas" alcanza SOLO lo que está a la vista: si las cerradas están
  // colapsadas no entran, para no borrar algo que no se ve.
  const aLaVista = useMemo(() => {
    const act = visibles.filter(o => !esCerrada(o));
    return cerradasOpen ? [...act, ...visibles.filter(o => esCerrada(o))] : act;
  }, [visibles, cerradasOpen]);
  const selm = useSeleccionMultiple({
    items: aLaVista,
    onEliminar: removeMuchas,
    nombre: ['operación', 'operaciones'],
  });
  const visiblesSel  = selm.filtrar(visibles);
  const opsActivas   = visiblesSel.filter(o => !esCerrada(o));
  const opsCerradas  = visiblesSel.filter(o => esCerrada(o));
  const filtrando    = !!q || filter !== 'todas';
  const totalActivas  = ops.filter(o => !esCerrada(o)).length;
  const totalCerradas = ops.length - totalActivas;

  return (
    <div>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 350, letterSpacing: '-0.02em', color: INK, margin: 0 }}>Operaciones</h2>
          <p style={{ fontSize: '0.74rem', color: MUTED, marginTop: 3 }}>
            {totalActivas} activa{totalActivas === 1 ? '' : 's'}{totalCerradas > 0 ? ` · ${totalCerradas} cerrada${totalCerradas === 1 ? '' : 's'}` : ''}
            {filtrando && ` · ${visibles.length} en pantalla`}
          </p>
        </div>
        <button onClick={openNew} style={{ ...BTN_DARK, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nueva operación
        </button>
      </div>

      {/* Buscador + filtros: una única línea fina */}
      {!loading && !loadError && ops.length > 0 && (
        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <input value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setQuery(''); } }}
            placeholder="Buscar operación, B/L, cliente, proveedor…" aria-label="Buscar operaciones" className="tt-uinp"
            style={{ flex: 1, minWidth: 200, border: 'none', borderBottom: `1px solid ${LINE}`, borderRadius: 0, background: 'transparent', padding: '0.35rem 0', fontSize: '16px', color: INK, outline: 'none', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: '1.1rem', flexWrap: 'wrap' }}>
            {FILTROS.map(([id, lbl]) => {
              const on = filter === id;
              return (
                <button key={id} onClick={() => setFilter(id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 4px', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: on ? 600 : 400, color: on ? INK : MUTED, borderBottom: on ? `2px solid ${INK}` : '2px solid transparent', whiteSpace: 'nowrap' }}>
                  {lbl}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
        ) : visibles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
            <p style={{ fontWeight: 600, color: INK, marginBottom: '0.35rem', fontSize: '0.9rem' }}>Sin resultados</p>
            <p style={{ fontSize: '0.78rem', color: MUTED, marginBottom: '1.1rem' }}>Ninguna operación coincide con la búsqueda o el filtro.</p>
            <button onClick={() => { setQuery(''); setFilter('todas'); }} className="tt-ghost" style={{ ...GHOST, fontSize: '0.78rem', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Limpiar búsqueda
            </button>
          </div>
        ) : (
        <>
        {/* Cerradas con plata pendiente: liquidadas dejando algo abierto. Antes se
            iban a "Cerradas" (colapsada) y la deuda desaparecía de la pantalla. */}
        {(() => {
          const conDeuda = ops.filter(conPendientes).sort((a, b) => (cierreDe(b).totalUsd || 0) - (cierreDe(a).totalUsd || 0))
          if (!conDeuda.length) return null
          const total = conDeuda.reduce((s, o) => s + (cierreDe(o).totalUsd || 0), 0)
          return (
            <div style={{ borderLeft: `2px solid ${RED}`, paddingLeft: 12, marginBottom: '1.25rem' }}>
              <p style={{ ...GROUP_H, marginBottom: 4 }}>Cerradas con plata pendiente · {conDeuda.length} · <span style={{ color: RED }}>{fmtU(total)}</span></p>
              {conDeuda.slice(0, 5).map(o => {
                const c = cierreDe(o)
                return (
                  <button key={o.id} onClick={() => onSelect(o)} className="tt-ghost" style={{ display: 'block', background: 'none', border: 'none', padding: '0.12rem 0', cursor: 'pointer', textAlign: 'left', fontSize: '0.78rem', color: BODY }}>
                    <b style={{ color: INK, fontWeight: 600 }}>{o.nombre}</b> cerrada {fmtFecha(c.fecha) ? `el ${fmtFecha(c.fecha)}` : ''} con <b style={{ color: RED, fontWeight: 700, ...TAB }}>{fmtU(c.totalUsd)}</b> sin resolver — {(c.pendientes || []).filter(p => p.monto > 0).map(p => p.label.toLowerCase()).join(' · ') || 'revisá el detalle'}
                  </button>
                )
              })}
            </div>
          )
        })()}

        {/* Alertas: entregadas hace 1+ semana que siguen sin liquidar */}
        {(() => {
          const viejas = ops
            .filter(o => o.estado === 'Entregado' && (daysTo(o.eta) ?? 1) <= -7)
            .sort((a, b) => urgenciaKey(a) - urgenciaKey(b))
          if (!viejas.length) return null
          return (
            <div style={{ borderLeft: `2px solid ${AMBER}`, paddingLeft: 12, marginBottom: '1.25rem' }}>
              <p style={{ ...GROUP_H, marginBottom: 4 }}>Cobranzas · {viejas.length}</p>
              {viejas.slice(0, 5).map(o => (
                <button key={o.id} onClick={() => onSelect(o)} className="tt-ghost" style={{ display: 'block', background: 'none', border: 'none', padding: '0.12rem 0', cursor: 'pointer', textAlign: 'left', fontSize: '0.78rem', color: BODY }}>
                  <b style={{ color: INK, fontWeight: 600 }}>{o.nombre}</b> arribó hace {-daysTo(o.eta)} días, entregada y sin liquidar — revisá cobros pendientes
                </button>
              ))}
            </div>
          )
        })()}

        {/* column headers */}
        <div className="ops-list-headers" style={{ display: 'grid', gridTemplateColumns: '18px 3fr 1.6fr 1.4fr 1fr auto', gap: '0.5rem', padding: '0 0.25rem 0.45rem', alignItems: 'center', borderBottom: `1px solid ${LINE}` }}>
          <Casilla checked={selm.todos} indeterminate={selm.algunos} onChange={selm.alternarTodos} label="Seleccionar todas" />
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
                  display: 'grid', gridTemplateColumns: '18px 3fr 1.6fr 1.4fr 1fr auto',
                  gap: '0.5rem', alignItems: 'center',
                  padding: cerrada ? '0.6rem 0.25rem' : '0.8rem 0.25rem',
                  borderBottom: `1px solid ${HAIR}`,
                  cursor: 'pointer',
                  opacity: cerrada ? 0.55 : 1,
                  background: selm.esta(op.id) ? '#f8fafc' : undefined,
                }}
              >
                <Casilla checked={selm.esta(op.id)} onChange={() => selm.alternar(op.id)} label={`Seleccionar ${op.nombre || 'operación'}`} />
                {/* col 1: nombre + meta */}
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 600, color: INK, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.nombre}</p>
                  <p style={{ fontSize: '0.68rem', color: MUTED, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    ETA {fmtFecha(op.eta) || fmtFecha(op.fecha) || '—'}
                    {(() => {
                      // Urgencia real de la fila: lo primero que se lee, también del celular.
                      const rel = etaRel(op.eta, cerrada)
                      return rel ? <> · <b style={{ color: rel.color, fontWeight: 600 }}>{rel.text}</b></> : null
                    })()}
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
                  {/* Cerrada dejando algo abierto: línea propia (en el celular la
                      meta de arriba se corta, y esto es justo lo que no se puede perder). */}
                  {(() => {
                    const c = cierreDe(op)
                    if (!c || c.completo) return null
                    const nPend = (c.pendientes || []).length
                    return (
                      <p style={{ fontSize: '0.7rem', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...TAB }}>
                        {c.totalUsd > 0
                          ? <b style={{ color: RED, fontWeight: 700 }}>Cerrada con {fmtU(c.totalUsd)} sin resolver</b>
                          : <b style={{ color: AMBER, fontWeight: 600 }}>Cerrada con {nPend} pendiente{nPend === 1 ? '' : 's'}</b>}
                        <span style={{ color: MUTED, fontWeight: 400 }}> · {(c.pendientes || []).map(x => x.label.toLowerCase()).join(' · ')}</span>
                      </p>
                    )
                  })()}
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
                <p className="col-eta" style={{ fontSize: '0.74rem', color: op.eta ? BODY : FAINT, ...TAB }}>{fmtFecha(op.eta) || '—'}</p>

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
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0.55rem 0.25rem', marginBottom: cerradasOpen ? '0.35rem' : 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2.5" style={{ transform: cerradasOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9"/></svg>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: MUTED }}>Cerradas · {opsCerradas.length}</span>
                    <span style={{ fontSize: '0.66rem', color: FAINT }}>entregadas, liquidadas y canceladas</span>
                  </button>
                  {cerradasOpen && opsCerradas.map(op => renderOpRow(op, true))}
                </div>
              )}
            </>
          );
        })()}
        </>
        )}
      </div>

      <BarraSeleccion s={selm} />

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
                  {/* Valor cargado antes de que existiera en la lista: se conserva en vez de pisarse al guardar. */}
                  {form.contenedor && !CONTENEDORES.includes(form.contenedor) && <option value={form.contenedor}>{form.contenedor}</option>}
                </select>
              </div>
              <div>
                <label style={LBL}>Capacidad</label>
                <p style={{ padding: '0.5rem 0', fontSize: '0.82rem', color: INK, fontWeight: 600 }}>
                  {CONTAINER_M3[form.contenedor] ? `${CONTAINER_M3[form.contenedor]} m³` : 'Variable'}
                  <span style={{ fontSize: '0.7rem', color: MUTED, fontWeight: 400 }}>
                    {CONTAINER_M3[form.contenedor] ? ' · capacidad total' : ' · se mide por la carga real'}
                  </span>
                </p>
              </div>
              <div>
                <label style={LBL}>Fecha de alta</label>
                <input type="date" value={toISODate(form.fecha)} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className="tt-inp" style={INP2} />
              </div>
              <div>
                <label style={LBL}>ETA (Fecha estimada de llegada)</label>
                <input type="date" value={toISODate(form.eta)} onChange={e => setForm(f => ({ ...f, eta: e.target.value }))} className="tt-inp" style={INP2} />
                {(() => {
                  const rel = etaRel(form.eta, false)
                  return rel ? <p style={{ fontSize: '0.66rem', color: rel.color, marginTop: 3, fontWeight: 600 }}>{rel.text}</p> : null
                })()}
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

      {/* ── Cerrar con condiciones (al marcar Liquidado) ── */}
      {cierreFor && (
        <CierreModal
          op={cierreFor}
          ship={flowShipByBL[blNorm(cierreFor.bl)]}
          desp={flowDespByBL[blNorm(cierreFor.bl)]}
          preload={null}
          onCancel={() => setCierreFor(null)}
          onDone={(cierre) => {
            const id = cierreFor.id;
            setOps(curr => curr.map(o => o.id === id ? { ...o, estado: 'Liquidado', cierre } : o));
            setCierres(c => ({ ...c, [id]: cierre }));
            setCierreFor(null);
          }}
        />
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
  // ── Autoguardado del detalle ───────────────────────────────────────────────
  // Cargar los costos de una importación son varios minutos de tipeo. Antes todo
  // vivía en memoria hasta apretar "Guardar": un corte de conexión o el celular
  // descartando la pestaña se llevaba todo. Ahora se persiste solo con debounce
  // (mismo mecanismo que el checklist) y el botón pasó a ser un indicador.
  const [saveState,  setSaveState]  = useState('idle'); // idle | saving | saved | error
  const savingRef   = useRef(false);   // guardado en vuelo (evita concurrentes)
  const autoBlocked = useRef(false);   // tras un error no reintenta solo hasta que toques algo
  const errShownRef = useRef(false);   // el aviso de error se muestra una vez, no en cada reintento
  const detailRef   = useRef(detail);  // última versión tipeada, para guardar sin depender del render
  const sentRef     = useRef(null);    // última versión confirmada por el server
  const isDirtyRef  = useRef(false);
  const salirRef    = useRef(null);    // salida con guardado, para los listeners
  detailRef.current  = detail;
  isDirtyRef.current = isDirty;
  const [showDiscard,setShowDiscard]= useState(false);
  const [pendingNav, setPendingNav] = useState(null);
  const [checked,    setChecked]    = useState(() => new Set());
  const [checklistLoaded, setChecklistLoaded] = useState(false);
  const [shipment,   setShipment]   = useState(null);
  const [shipmentLoaded, setShipmentLoaded] = useState(false);
  const [despacho, setDespacho] = useState(null);
  const [shipModal, setShipModal] = useState(false); // editor de embarque embebido en la operación
  // ETA de la operación, siempre en ISO. Estado local para poder adoptar la del embarque.
  const [etaOp, setEtaOp] = useState(() => toISODate(op.eta));
  const [adoptandoEta, setAdoptandoEta] = useState(false);
  useEffect(() => { setEtaOp(toISODate(op.eta)); }, [op.id, op.eta]);
  // Despacho de aduana vinculado por B/L — alimenta el flujo del expediente y el
  // cotejo de la tarjeta "Al despachante". Recargable: registrar un pago desde la
  // ficha del B/L tiene que refrescar el saldo sin recargar la pantalla entera.
  const despReqRef = useRef(0);
  const loadDespacho = useCallback(async () => {
    const my = ++despReqRef.current;
    if (!op.bl) { setDespacho(null); return; }
    try {
      const r = await fetch('/api/db/despachante');
      if (!r.ok) return;
      const list = await r.json();
      if (my !== despReqRef.current) return; // llegó tarde: ya hay otra búsqueda en curso
      setDespacho((Array.isArray(list) ? list : []).find(d => blNorm(d.bl) === blNorm(op.bl)) || null);
    } catch {}
  }, [op.bl]);
  useEffect(() => { setDespacho(null); loadDespacho(); }, [op.id, loadDespacho]);
  const [fichaBL, setFichaBL] = useState(false); // ficha integral del B/L abierta desde el cotejo
  const [confirmDelCat, setConfirmDelCat] = useState(null); // catId pendiente de borrar
  const [creatingShip, setCreatingShip] = useState(false);
  // ── Successi Ing SA + acta de cierre ───────────────────────────────────────
  const [estadoOp,    setEstadoOp]    = useState(op.estado);
  const [cierreOp,    setCierreOp]    = useState(op.cierre || null);
  const [cierreModal, setCierreModal] = useState(false);
  const [succModal,   setSuccModal]   = useState(false);
  const [reintLedger, setReintLedger] = useState([]); // reintegros en el ledger de pagos
  const [reintLocal,  setReintLocal]  = useState([]); // reintegros guardados en la operación
  useEffect(() => { setEstadoOp(op.estado); setCierreOp(op.cierre || null); }, [op.id, op.estado, op.cierre]);

  // Cuenta de Successi (reintegros) y acta de cierre de ESTA operación.
  useEffect(() => {
    let cancelled = false;
    setReintLedger([]); setReintLocal([]);
    (async () => {
      const asJson = async (r) => (r && r.ok ? r.json().catch(() => null) : null);
      try {
        const [rOp, rPag] = await Promise.all([
          fetch(`/api/db/operations/${op.id}`),
          fetch(`/api/db/pagos?scope=successi&ref_id=${encodeURIComponent(op.id)}`),
        ]);
        const opRow = await asJson(rOp);
        const pag   = await asJson(rPag);
        if (cancelled) return;
        if (opRow) {
          setReintLocal(Array.isArray(opRow.successiReintegros) ? opRow.successiReintegros.map(x => ({ ...x, origen: 'op' })) : []);
          setCierreOp(opRow.cierre || null);
        }
        setReintLedger((Array.isArray(pag) ? pag : []).filter(x => String(x.scope || '') === 'successi').map(mapReintegroLedger));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [op.id]);

  // Registrar un reintegro a Successi. Primero al ledger de pagos (scope
  // 'successi'); si esa ruta no acepta el scope, se borra la fila que quedó mal
  // clasificada y el reintegro se guarda en la operación en vez de perderse.
  const guardarReintLocal = async (next, okMsg) => {
    try {
      const r = await fetch(`/api/db/operations/${op.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ successiReintegros: next.map(({ origen, ...x }) => x) }),
      });
      if (!r.ok) throw new Error('failed');
      const j = await r.json().catch(() => null);
      setReintLocal(j && Array.isArray(j.successiReintegros) ? j.successiReintegros.map(x => ({ ...x, origen: 'op' })) : next);
      gToast.success(okMsg);
      return true;
    } catch {
      gToast.error('No se pudo guardar el reintegro. Revisá la conexión.');
      return false;
    }
  };

  const addReintegro = async ({ fecha, monto, metodo, nota }) => {
    try {
      const r = await fetch('/api/db/pagos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'successi', ref_id: String(op.id), bl: '', fecha, monto, metodo, nota }),
      });
      if (r.ok) {
        const j = await r.json().catch(() => null);
        // El ledger lo aceptó como 'successi' (la fila o el agregado lo confirman).
        if (j && (String(j.scope || '') === 'successi' || String(j.agg?.scope || '') === 'successi')) {
          const rr = await fetch(`/api/db/pagos?scope=successi&ref_id=${encodeURIComponent(op.id)}`).catch(() => null);
          const list = rr && rr.ok ? await rr.json().catch(() => null) : null;
          if (Array.isArray(list)) setReintLedger(list.filter(x => String(x.scope || '') === 'successi').map(mapReintegroLedger));
          else if (j.id != null) setReintLedger(l => [mapReintegroLedger(j), ...l]);
          gToast.success('Reintegro registrado.');
          return true;
        }
        // Quedó guardado con otro scope: se borra para no ensuciar los pagos al agente.
        if (j && j.id != null) fetch(`/api/db/pagos/${j.id}`, { method: 'DELETE' }).catch(() => {});
      }
    } catch {}
    return guardarReintLocal([...reintLocal, { id: `loc-${Date.now()}`, fecha, monto, metodo, nota, origen: 'op' }], 'Reintegro registrado.');
  };

  const delReintegro = async (r) => {
    if (r.origen === 'ledger') {
      try {
        const res = await fetch(`/api/db/pagos/${r.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('failed');
        setReintLedger(l => l.filter(x => x.id !== r.id));
        gToast.success('Reintegro eliminado.');
      } catch {
        gToast.error('No se pudo borrar el reintegro.');
      }
      return;
    }
    await guardarReintLocal(reintLocal.filter(x => x.id !== r.id), 'Reintegro eliminado.');
  };

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

  // intercept sidebar nav — con autoguardado ya no pregunta nada: manda lo que
  // falte y sigue viaje. Solo frena si el guardado falla (lo resuelve `salir`).
  useEffect(() => {
    const handler = (e) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      salirRef.current?.(e.detail.href);
    };
    window.addEventListener('gestion:navigate', handler);
    return () => window.removeEventListener('gestion:navigate', handler);
  }, []);

  // Marca "hay algo nuevo sin mandar". Cualquier cambio destraba el autoguardado
  // aunque el intento anterior haya fallado.
  const D = () => { autoBlocked.current = false; setIsDirty(true); };
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
      cobrar:      [...(d.cobrar || []),      newCobrar()],
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

  // Guarda el detalle completo. `silent` = disparado por el autoguardado (sin
  // cartel verde en cada tecla). Devuelve true/false para poder encadenar
  // "guardá y salí" sin perder lo tipeado.
  const saveAll = useCallback(async ({ silent = false } = {}) => {
    if (savingRef.current) return false; // evita guardados concurrentes (duplicaba datos)
    savingRef.current = true;
    setSaveState('saving');
    const snapshot = detailRef.current; // exactamente lo que se manda
    try {
      const r = await fetch(`/api/db/operations/${op.id}/detail`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      if (!r.ok) throw new Error('failed');
      sentRef.current = snapshot;
      // Si mientras se guardaba entró tipeo nuevo, sigue habiendo cambios sin
      // mandar: el autoguardado los toma en la vuelta siguiente.
      if (detailRef.current === snapshot) { isDirtyRef.current = false; setIsDirty(false); }
      autoBlocked.current = false;
      errShownRef.current = false;
      setSaveState('saved');
      if (!silent) gToast.success('Operación guardada.');
      return true;
    } catch (e) {
      autoBlocked.current = true; // no machacar un endpoint que está fallando
      const yaAvisado = errShownRef.current;
      errShownRef.current = true;
      setSaveState('error');
      if (!silent || !yaAvisado) gToast.error('Error al guardar. Reintentá — no se perdió lo que cargaste.');
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [op.id]);

  // Autoguardado con debounce — el mismo mecanismo que ya usa el checklist.
  // Se re-dispara cuando termina un guardado en vuelo (dep. saveState), así que
  // el tipeo que entró durante el guardado tampoco se pierde.
  useEffect(() => {
    if (detailLoading || !isDirty || autoBlocked.current) return;
    const t = setTimeout(() => { saveAll({ silent: true }); }, 900);
    return () => clearTimeout(t);
  }, [detail, isDirty, detailLoading, saveState, saveAll]);

  // Red de última milla: si te vas de la pantalla con tipeo sin mandar (Atrás del
  // celular, otra sección), se manda igual. `keepalive` sobrevive al desmontaje.
  useEffect(() => () => {
    if (!isDirtyRef.current || sentRef.current === detailRef.current) return;
    try {
      fetch(`/api/db/operations/${op.id}/detail`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(detailRef.current),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }, [op.id]);

  const doNavigate = () => { if (pendingNav) { router.push(pendingNav); setPendingNav(null); } else { onBack(); } };
  // Salir sin fricción: lo que falte mandar se guarda y se sale. El cartel de
  // "cambios sin guardar" queda solo para cuando el guardado falla de verdad.
  const salir = useCallback(async (href = null) => {
    const irse = () => { setPendingNav(null); if (href) router.push(href); else onBack(); };
    if (!isDirtyRef.current) { irse(); return; }
    setPendingNav(href);
    const ok = await saveAll({ silent: true });
    if (ok) irse(); else setShowDiscard(true);
  }, [router, onBack, saveAll]);
  salirRef.current = salir;
  const handleBack     = () => { salir(null); };
  const discardAndBack = () => { isDirtyRef.current = false; setIsDirty(false); setShowDiscard(false); doNavigate(); };
  const saveAndBack    = async () => { const ok = await saveAll(); if (ok) { setShowDiscard(false); doNavigate(); } };

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
  // Una sola ETA por importación: la del embarque manda. Acá se puede adoptar
  // de un toque sin volver a la lista a editarla a mano.
  const adoptarEtaEmbarque = async () => {
    const iso = toISODate(shipment?.eta);
    if (!iso || iso === etaOp || adoptandoEta) return;
    const prev = etaOp;
    setAdoptandoEta(true);
    setEtaOp(iso);
    try {
      const r = await fetch(`/api/db/operations/${op.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...op, eta: iso }),
      });
      if (!r.ok) throw new Error('failed');
      gToast.success(`ETA actualizada: ${fmtFecha(iso)}`);
    } catch {
      setEtaOp(prev);
      gToast.error('No se pudo actualizar la ETA.');
    } finally {
      setAdoptandoEta(false);
    }
  };

  const crearEmbarque = async () => {
    if (creatingShip) return;
    setCreatingShip(true);
    try {
      const body = { bl: op.bl || '', contenedores: op.contenedor || '', eta: etaOp, agente: 'Bruce', status: 'In Transit', operation_id: op.id };
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

  const calc = useMemo(() => computeCalc(detail, clientes), [detail, clientes]);

  // Reintegros a Successi: los del ledger y los de la operación son la misma
  // lista (cada uno vive en un solo lado), ordenados del más nuevo al más viejo.
  const reintegros = useMemo(
    () => [...reintLedger, ...reintLocal].sort((x, y) => String(y.fecha || '').localeCompare(String(x.fecha || ''))),
    [reintLedger, reintLocal]
  );
  const succ = useMemo(() => successiCuenta(calc.succPesos, calc.fallbackTC, reintegros), [calc.succPesos, calc.fallbackTC, reintegros]);

  // Flujo macro derivado de datos reales (estado op + tracking + despacho + cobranzas).
  const flowState = useMemo(() => importFlowState({
    op: { ...op, estado: estadoOp }, ship: shipment, desp: despacho,
    cobranza: { cobrados: calc.cobrados, total: calc.perProv.length },
    giro: calc.perProv.some(pp => pp.giroUSD > 0) ? 'hecho' : undefined,
    lockEntrega: calc.perProv.some(x => x.cb.exigirPago && !x.cb.cobrado),
  }), [op, estadoOp, shipment, despacho, calc]);

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

  // Ganancia prometida al convertir la cotización (foto guardada en la operación).
  // Si la operación se cargó a mano no existe y el KPI va solo.
  const ganCotizada = n(detail.cotizadoDetalle?.gananciaUsd);
  const ganDif = ganCotizada > 0 ? Math.round((calc.totalGanancia - ganCotizada) * 100) / 100 : null;

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
              <span>ETA {fmtFecha(etaOp) || '—'}</span>
              {(() => {
                const rel = etaRel(etaOp, ESTADOS_CERRADOS.includes(estadoOp))
                return rel ? <span style={{ color: rel.color, fontWeight: 600 }}>{rel.text}</span> : null
              })()}
              {(() => {
                // Si el agente corrió el arribo, la del embarque manda: se adopta de un toque.
                const shIso = toISODate(shipment?.eta)
                if (!shIso || shIso === etaOp) return null
                return (
                  <button onClick={adoptarEtaEmbarque} disabled={adoptandoEta} className="tt-ghost"
                    title="Copiar la ETA del embarque a la operación"
                    style={{ ...GHOST, color: AMBER, fontWeight: 600, fontSize: '0.74rem', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                    el embarque dice {fmtFecha(shIso)} — usar
                  </button>
                )
              })()}
              <span>{estadoOp}</span>
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
            {/* Cerrar la operación desde el expediente: los datos ya están en
                pantalla, así que el control de condiciones sale al instante. */}
            <button onClick={() => setCierreModal(true)} className="tt-ghost"
              title="Revisar las condiciones y liquidar la operación"
              style={{ ...GHOST, marginTop: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {estadoOp === 'Liquidado' ? 'Revisar el cierre' : 'Cerrar operación'}
            </button>
            {/* El botón Guardar pasó a ser indicador: el detalle se guarda solo.
                Vuelve a ser botón únicamente cuando el guardado falló. */}
            {saveState === 'error' ? (
              <button onClick={() => saveAll()} title="Volvé a intentar el guardado"
                style={{ ...BTN_DARK, background: RED, marginTop: 4, whiteSpace: 'nowrap' }}>
                Error al guardar · reintentar
              </button>
            ) : (
              <p aria-live="polite" style={{ marginTop: 10, fontSize: '0.76rem', fontWeight: 500, whiteSpace: 'nowrap',
                color: saveState === 'saving' || isDirty ? BODY : (saveState === 'saved' ? GREEN : FAINT) }}>
                {saveState === 'saving' || isDirty ? 'Guardando…' : saveState === 'saved' ? 'Guardado ✓' : 'Se guarda solo'}
              </p>
            )}
          </div>
        </div>

        {/* Métricas en línea (sin cajas) */}
        <div className="gestion-kpi-strip" style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap', alignItems: 'flex-start', margin: '1.1rem 0 0.9rem' }}>
          {[
            { lbl: 'Costos totales', val: fmtP(calc.totalGastos), sub: `${fmtP(calc.enBlanco)} blanco + ${fmtP(calc.cash)} cash` },
            // Lo que te dejó a VOS. Sin esto no había ningún número de margen:
            // "Servicios (tuyos)" mezcla tu ganancia con gastos de origen que
            // solo le pasás al cliente.
            {
              lbl: 'Ganancia', val: fmtU(calc.totalGanancia),
              sub: [
                calc.totalHonorarios  > 0 ? `hon. ${fmtUcompact(calc.totalHonorarios)}`  : null,
                calc.totalGiro        > 0 ? `giro ${fmtUcompact(calc.totalGiro)}`        : null,
                calc.totalGananciaMan > 0 ? `carg. ${fmtUcompact(calc.totalGananciaMan)}` : null,
              ].filter(Boolean).join(' + ') || 'honorarios + giro + ganancia cargada',
              sub2: ganDif != null
                ? <span style={{ color: ganDif >= 0 ? GREEN : RED, fontWeight: 600 }}>cotizada {fmtU(ganCotizada)} · {ganDif >= 0 ? '+' : '−'}{fmtU(Math.abs(ganDif))}</span>
                : (calc.totalGanancia > 0 ? `${fmtU(calc.gananciaCobrada)} ya cobrada` : null),
            },
            { lbl: 'Por cobrar', val: fmtU(calc.totalACobrar - calc.totalCobrado), sub: `de ${fmtU(calc.totalACobrar)} total`, accent: calc.totalACobrar - calc.totalCobrado > 0 ? AMBER : INK },
            { lbl: 'Cobrado', val: fmtU(calc.totalCobrado), sub: `${calc.cobrados}/${calc.perProv.length} proveedores`, accent: GREEN },
            { lbl: 'Ocupación', val: cap ? `${calc.totalM3.toFixed(1)} / ${cap} m³` : `${calc.totalM3.toFixed(1)} m³`, sub: cap ? `${fillPct.toFixed(0)}% del contenedor` : '—', bar: cap ? fillPct : null, barColor: fillPct > 90 ? AMBER : INK },
            { lbl: 'Checklist', val: `${doneTasks}/${totalTasks}`, sub: `${progress}% completado`, accent: progress === 100 ? GREEN : INK, bar: progress, barColor: GREEN },
          ].map(({ lbl, val, sub, sub2, accent = INK, bar, barColor }) => (
            <div key={lbl} style={{ minWidth: 0 }}>
              <p style={{ fontSize: '1.15rem', fontWeight: 700, color: accent, lineHeight: 1.15, whiteSpace: 'nowrap', ...TAB }}>{val}</p>
              <p style={{ fontSize: '0.62rem', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{lbl}</p>
              <p style={{ fontSize: '0.62rem', color: MUTED, marginTop: 1, ...TAB }}>{sub}</p>
              {sub2 && <p style={{ fontSize: '0.62rem', color: MUTED, marginTop: 1, ...TAB }}>{sub2}</p>}
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
        {flowState.lockEntrega && ['Listo p/ retiro', 'En tránsito local'].includes(estadoOp) && (
          <div style={{ marginTop: 10, borderLeft: `2px solid ${RED}`, paddingLeft: 12 }}>
            <p style={{ fontSize: '0.78rem', color: BODY }}><b style={{ color: RED, fontWeight: 700 }}>NO ENTREGAR</b> — hay clientes con pago exigido antes de la entrega y saldo pendiente.</p>
          </div>
        )}
        {/* Cerrada dejando cosas abiertas: queda escrito qué y por cuánta plata. */}
        {cierreOp && !cierreOp.completo && (
          <div style={{ marginTop: 10, borderLeft: `2px solid ${cierreOp.totalUsd > 0 ? RED : AMBER}`, paddingLeft: 12 }}>
            <p style={{ fontSize: '0.78rem', color: BODY, lineHeight: 1.5, ...TAB }}>
              Cerrada{fmtFecha(cierreOp.fecha) ? ` el ${fmtFecha(cierreOp.fecha)}` : ''}{cierreOp.por ? ` por ${cierreOp.por}` : ''} dejando abierto
              {cierreOp.totalUsd > 0 ? <> <b style={{ color: RED, fontWeight: 700 }}>{fmtU(cierreOp.totalUsd)}</b></> : null}:{' '}
              {(cierreOp.pendientes || []).map(p => `${p.label.toLowerCase()}${p.monto > 0 ? ` (${fmtU(p.monto)})` : ''}`).join(' · ') || '—'}
            </p>
            <button onClick={() => setCierreModal(true)} className="tt-ghost" style={{ ...GHOST, marginTop: 3, fontSize: '0.7rem', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Revisar y actualizar el cierre
            </button>
          </div>
        )}
      </div>

      {/* Editor de embarque embebido — misma fuente que Tracking (/api/tracking) */}
      {shipModal && (
        <EmbarqueModal
          initial={shipment}
          defaults={{ bl: op.bl || '', contenedores: op.contenedor || '', eta: etaOp, agente: 'Bruce', operation_id: op.id, suppliers: '' }}
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
              // Sin el despachante, que tiene su propia tarjeta (si estuviera acá
              // se contaría dos veces).
              const socPesos = calc.socPesos;
              const uB = uOf(socPesos);
              const hayReint = succ.puestoUSD > 0 || reintegros.length > 0;
              return (
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <p style={GROUP_H}>La sociedad · Successi</p>
                    <button onClick={() => setSuccModal(true)} className="tt-ghost"
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.62rem', fontWeight: 600, color: BODY, whiteSpace: 'nowrap' }}>
                      {hayReint ? 'Reintegros →' : 'Registrar →'}
                    </button>
                  </div>
                  {/* El total es TODO lo que puso la sociedad —incluido lo que le
                      pagó al despachante— porque eso es lo que hay que reintegrarle.
                      El desglose lo muestra línea por línea para que cierre a la vista. */}
                  <p style={{ fontSize: '1.15rem', fontWeight: 700, color: INK, lineHeight: 1.1, ...TAB }}>{succ.sinTC ? fmtP(calc.succPesos) : fmtU(succ.puestoUSD)}</p>
                  <p style={{ fontSize: '0.62rem', color: MUTED, marginTop: 3, marginBottom: 8, ...TAB }}>{succ.sinTC ? 'puestos por la sociedad · cargá un T.C. para verlo en USD' : `${fmtP(calc.succPesos)} puestos por la sociedad · al T.C. ${calc.fallbackTC}`}</p>
                  {calc.catsSucc.map((cb, ci) => (
                    <div key={`${cb.label}-${ci}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.68rem', padding: '0.22rem 0', color: BODY, borderTop: '1px solid #f8fafc' }}>
                      <span>{cb.label}</span><span style={{ fontWeight: 600, color: '#374151', ...TAB }}>{uOf(cb.monto) != null ? fmtU(uOf(cb.monto)) : fmtP(cb.monto)}</span>
                    </div>
                  ))}
                  {/* Reintegro: lo que la sociedad puso vuelve cuando cobrás */}
                  {hayReint && (<>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.68rem', padding: '0.22rem 0', marginTop: 4, color: BODY, borderTop: `1px solid ${HAIR}` }}>
                      <span>Reintegrado</span><span style={{ fontWeight: 600, color: GREEN, ...TAB }}>{fmtU(succ.reintegradoUSD)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.68rem', padding: '0.22rem 0', color: BODY, borderTop: '1px solid #f8fafc' }}>
                      <span>Falta reintegrar</span><span style={{ fontWeight: 700, color: succ.faltaUSD > 0 ? RED : GREEN, ...TAB }}>{succ.faltaUSD > 0 ? fmtU(succ.faltaUSD) : 'Nada'}</span>
                    </div>
                  </>)}
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
              // COTEJO: lo que le pagás al despachante se carga dos veces — acá
              // (la categoría que se proratea al cliente) y en su módulo. Si no
              // coinciden, o le estás cobrando de menos al cliente o pagaste de
              // más. Antes se mostraban los dos números sin compararlos nunca.
              // Se compara la categoría COMPLETA (calc.tDes: sociedad + cash),
              // porque su cuenta suma los 5 conceptos con factura y en negro.
              const enOpUSD = calc.tDes === 0 ? 0 : (calc.fallbackTC > 0 ? Math.round((calc.tDes / calc.fallbackTC) * 100) / 100 : null);
              const cuentaUSD = d ? numDesp(d.total_honorarios) : 0;
              const cotejoDif = d && cuentaUSD > 0 && enOpUSD != null ? Math.round((cuentaUSD - enOpUSD) * 100) / 100 : null;
              const desfasado = cotejoDif != null && Math.abs(cotejoDif) >= 1;
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
                    {/* Si los dos números coinciden no molesta: solo aparece el desfasaje. */}
                    {desfasado && (
                      <div style={{ marginTop: 8, borderLeft: `2px solid ${cotejoDif > 0 ? RED : AMBER}`, paddingLeft: 10 }}>
                        <p style={{ fontSize: '0.68rem', color: BODY, lineHeight: 1.45, ...TAB }}>
                          Cargaste <b style={{ color: INK, fontWeight: 600 }}>{fmtU(enOpUSD)}</b> en la categoría Despachante, su cuenta dice <b style={{ color: INK, fontWeight: 600 }}>{fmtU(cuentaUSD)}</b> —{' '}
                          {cotejoDif > 0
                            ? <>faltan <b style={{ color: RED, fontWeight: 700 }}>{fmtU(cotejoDif)}</b> que no le estás prorrateando a ningún cliente</>
                            : <>cargaste <b style={{ color: AMBER, fontWeight: 700 }}>{fmtU(-cotejoDif)}</b> de más que lo que dice su cuenta</>}
                        </p>
                        {op.bl && (
                          <button onClick={() => setFichaBL(true)} className="tt-ghost" style={{ ...GHOST, marginTop: 3, fontSize: '0.66rem', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                            Abrir la ficha del B/L
                          </button>
                        )}
                      </div>
                    )}
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
                  <p style={{ ...GROUP_H, marginBottom: 6 }}><DotNegro />Caja Brandon · cash</p>
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

            {/* 5 · Cobrás vos: total a clientes, cobrado y pendiente */}
            <div style={{ minWidth: 0 }}>
              <p style={{ ...GROUP_H, marginBottom: 6 }}>Cobrás a clientes</p>
              <p style={{ fontSize: '1.15rem', fontWeight: 700, color: INK, lineHeight: 1.1, ...TAB }}>{fmtU(calc.totalACobrar)}</p>
              <p style={{ fontSize: '0.62rem', color: MUTED, marginTop: 3, marginBottom: 8 }}>incluye gastos + servicios (con tu ganancia camuflada)</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.68rem', padding: '0.22rem 0', color: BODY, borderTop: '1px solid #f8fafc' }}>
                <span>De eso, tuyo</span><span style={{ fontWeight: 700, color: INK, ...TAB }}>{fmtU(calc.totalGanancia)}</span>
              </div>
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
            // Lo que puso la sociedad (Successi) prorrateado por cliente, sin el
            // VEP (que va por su cuenta) ni el despachante (columna propia).
            const socBase = calc.enBlanco - calc.tAdu - calc.despBlanco;
            const groups = [];
            calc.perProv.forEach(p => {
              const key = p.tipo === 'Propio' ? 'Propio' : (p.clienteNombre || 'Cliente s/asignar');
              let g = groups.find(x => x.key === key);
              if (!g) { g = { key, soc: 0, desp: 0, bols: 0, orig: 0, gan: 0, cobrar: 0, cobrados: 0, n: 0 }; groups.push(g); }
              const soc  = (p.vepPesos + p.ratio * socBase) / tc;
              const desp = (p.ratio * calc.despBlanco) / tc + n(p.cb.despAdic);
              const bols = p.cashUSD;
              const serv = p.totalUSD - soc - desp - bols; // origen + honorarios + giro + ganancia (cierra la fila)
              // "Servicios" mezclaba tu margen con los gastos de origen, que solo
              // le pasás al cliente. Se parten: origen (pasás) y ganancia (tuya).
              // El residuo va a origen para que la fila siga cerrando exacta.
              const gan  = p.gananciaUSD;
              g.soc += soc; g.desp += desp; g.bols += bols; g.gan += gan; g.orig += serv - gan;
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
                      <th style={TH2}>Caja Brandon</th>
                      <th style={TH2}>Gs. origen</th>
                      <th style={TH2}>Tu ganancia</th>
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
                        <td style={TD2}>{fmtUcompact(g.orig)}</td>
                        <td style={{ ...TD2, fontWeight: 600, color: g.gan > 0 ? INK : MUTED }}>{fmtUcompact(g.gan)}</td>
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
                {/* Lo facturado incluye lo que puso Successi: se aclara acá para
                    que el número de arriba no se lea como "todo lo puso la sociedad". */}
                {calc.succPesos > 0 && (
                  <button onClick={() => setSuccModal(true)} className="tt-ghost"
                    style={{ background: 'none', border: 'none', padding: '0.35rem 0.25rem 0', cursor: 'pointer', textAlign: 'left', fontSize: '0.62rem', color: MUTED, lineHeight: 1.4, width: '100%' }}>
                    De eso, <b style={{ color: BODY, fontWeight: 600, ...TAB }}>{fmtP(calc.succPesos)}</b> los puso Successi{succ.faltaUSD > 0 ? <> · falta reintegrarle <b style={{ color: RED, fontWeight: 700, ...TAB }}>{fmtU(succ.faltaUSD)}</b></> : ' · reintegrado'}
                  </button>
                )}

                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: '1rem 0.25rem 0.2rem' }}>
                  <span style={GROUP_H}><DotNegro />Caja Brandon · cash</span>
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
                  {/* Lo prometido vs lo que realmente te quedó (la foto de la
                      cotización se guarda al convertir). */}
                  {ganDif != null && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: `1px solid ${HAIR}` }}>
                        <span style={{ color: MUTED }}>Ganancia cotizada</span><span style={{ fontWeight: 600, color: BODY, ...TAB }}>{fmtU(ganCotizada)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: MUTED }}>Ganancia real</span><span style={{ fontWeight: 700, color: ganDif >= 0 ? GREEN : RED, ...TAB }}>{fmtU(calc.totalGanancia)}</span>
                      </div>
                    </>
                  )}
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
                      <div><span style={{ color: MUTED }}>Zarpe (ETD): </span><span style={{ color: BODY, fontWeight: 600, ...TAB }}>{fmtFecha(shipment.etd) || '—'}</span></div>
                      <div><span style={{ color: MUTED }}>ETA: </span><span style={{ color: BODY, fontWeight: 600, ...TAB }}>{fmtFecha(shipment.eta) || '—'}</span></div>
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
                ['Fecha alta', fmtFecha(op.fecha) || '—'],
                ['ETA', fmtFecha(etaOp) || '—'],
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

      {/* Ficha integral del B/L — se abre desde el cotejo con el despachante para
          registrar el pago sin salir de la operación. */}
      {fichaBL && op.bl && (
        <FichaImportacion
          bl={op.bl}
          seed={{ ship: shipment, desp: despacho }}
          onClose={() => setFichaBL(false)}
          onChanged={() => loadDespacho()}
        />
      )}

      {/* Cerrar la operación con condiciones (los datos ya están en pantalla) */}
      {cierreModal && (
        <CierreModal
          op={op}
          ship={shipment}
          desp={despacho}
          preload={{ calc, checkDone: doneTasks, checkTotal: totalTasks, reintegros }}
          onCancel={() => setCierreModal(false)}
          onDone={(cierre) => { setCierreOp(cierre); setEstadoOp('Liquidado'); setCierreModal(false); }}
        />
      )}

      {/* Cuenta de Successi Ing SA: cuánto puso, cuánto se le reintegró y cuánto falta */}
      {succModal && (
        <SuccessiModal
          op={op}
          cuenta={succ}
          reintegros={reintegros}
          onClose={() => setSuccModal(false)}
          onAdd={addReintegro}
          onDelete={delReintegro}
        />
      )}

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
            <h3 style={{ ...MODAL_T, marginBottom: '0.5rem' }}>No se pudo guardar</h3>
            <p style={{ fontSize: '0.8rem', color: BODY, marginBottom: '1.5rem', lineHeight: 1.5 }}>
              El guardado automático falló (puede ser la conexión) y quedaron cambios sin mandar al servidor. Si salís ahora se pierden.
            </p>
            <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'flex-end', alignItems: 'center' }}>
              <button onClick={discardAndBack} style={{ ...GHOST, color: RED, fontWeight: 600 }}>
                Salir y perderlos
              </button>
              <button onClick={saveAndBack} style={BTN_DARK}>
                Reintentar y salir
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

// ─── Cerrar una operación con condiciones ─────────────────────────────────────
// Marcar "Liquidado" era elegir una opción de un desplegable: se cerraba con el
// checklist a medias, con saldo al agente, con el despachante sin cobrar, con
// clientes sin pagar y sin el reintegro a Successi — y la operación se iba a
// "Cerradas" (colapsada), o sea que la plata que te deben dejaba de estar a la
// vista. Ahora se puede cerrar igual, pero queda escrito qué quedó abierto y por
// cuánta plata, y la operación sigue arriba en la lista hasta resolverlo.
function CierreModal({ op, ship, desp, preload, onCancel, onDone }) {
  const [bajado,  setBajado]  = useState(null); // lo que se trajo del servidor
  const [loading, setLoading] = useState(!preload);
  const [failed,  setFailed]  = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [intento, setIntento] = useState(0); // reintentar la revisión
  // Desde el expediente los datos ya están en pantalla; desde la lista se bajan.
  const data = preload || bajado;
  const conPreload = !!preload;

  // Se revisa la operación REAL (detalle + checklist + reintegros), no lo que se
  // ve en la fila.
  useEffect(() => {
    if (conPreload) return;
    let cancelled = false;
    setLoading(true); setFailed(false);
    (async () => {
      const asJson = async (r) => (r && r.ok ? r.json().catch(() => null) : null);
      try {
        const [rDet, rChk, rOp, rPag] = await Promise.all([
          fetch(`/api/db/operations/${op.id}/detail`),
          fetch(`/api/db/operations/${op.id}/checklist`),
          fetch(`/api/db/operations/${op.id}`),
          fetch(`/api/db/pagos?scope=successi&ref_id=${encodeURIComponent(op.id)}`),
        ]);
        if (cancelled) return;
        if (!rDet.ok) throw new Error('detail');
        const det = await asJson(rDet);
        if (!det) throw new Error('detail');
        const chk = await asJson(rChk);
        const opRow = await asJson(rOp);
        const pag = await asJson(rPag);
        if (cancelled) return;
        const hechas = new Set(Array.isArray(chk) ? chk : []);
        setBajado({
          calc: computeCalc(det, []),
          checkDone: CHECKLIST.filter(t => hechas.has(t.id)).length,
          checkTotal: CHECKLIST.length,
          reintegros: mergeReintegros(pag, opRow),
        });
      } catch {
        // Nunca mostrar "todo en cero" porque no se pudo leer: sin datos no se cierra.
        if (!cancelled) { setBajado(null); setFailed(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [op.id, conPreload, intento]);

  const cond    = data ? condicionesCierre({ ...data, ship, desp }) : [];
  const faltan  = cond.filter(c => !c.ok);
  const totalUsd = Math.round(faltan.reduce((s, c) => s + c.monto, 0) * 100) / 100;

  const confirmar = async () => {
    if (saving || !data) return;
    setSaving(true);
    const cierre = {
      estado: 'Liquidado',
      checklist: `${data.checkDone}/${data.checkTotal}`,
      pendientes: faltan.map(c => ({ id: c.id, label: c.label, detalle: c.detalle, monto: c.monto })),
    };
    try {
      const r = await fetch(`/api/db/operations/${op.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'Liquidado', cierre }),
      });
      if (!r.ok) throw new Error('failed');
      const j = await r.json().catch(() => null);
      const guardado = (j && j.cierre) || { ...cierre, completo: faltan.length === 0, totalUsd, fecha: hoyISO(), por: '' };
      gToast.success(faltan.length ? `Cerrada con ${fmtU(totalUsd)} sin resolver.` : 'Operación liquidada.');
      onDone(guardado);
    } catch {
      gToast.error('No se pudo cerrar la operación. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ ...OVERLAY, zIndex: 1300 }} onClick={onCancel}>
      <div style={{ ...PANEL, maxWidth: 500, maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: '0.9rem' }}>
          <div>
            <h3 style={MODAL_T}>Cerrar la operación</h3>
            <p style={{ fontSize: '0.72rem', color: MUTED, marginTop: 2 }}>{toTitle(op.nombre) || '—'}{op.bl ? ` · ${op.bl}` : ''}</p>
          </div>
          <button onClick={onCancel} aria-label="Cerrar" className="tt-ghost" style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: '1.3rem', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {loading ? (
          <p style={{ fontSize: '0.8rem', color: MUTED, padding: '1.5rem 0' }}>Revisando la operación…</p>
        ) : failed || !data ? (
          <>
            <p style={{ fontSize: '0.8rem', color: BODY, lineHeight: 1.5, marginBottom: '1.25rem' }}>
              No se pudo leer la operación para revisar las condiciones. No se cierra a ciegas.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1.25rem', alignItems: 'center' }}>
              <button onClick={onCancel} className="tt-ghost" style={GHOST}>Cancelar</button>
              <button onClick={() => setIntento(i => i + 1)} style={BTN_DARK}>Reintentar</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: '0.74rem', color: MUTED, marginBottom: '0.7rem' }}>Antes de marcarla liquidada:</p>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {cond.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.55rem 0', borderBottom: `1px solid ${HAIR}` }}>
                  <span aria-hidden style={{ flexShrink: 0, marginTop: 2, width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {c.ok
                      ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      : <span style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid ${c.monto > 0 ? RED : AMBER}`, display: 'block' }} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.78rem', fontWeight: c.ok ? 400 : 600, color: c.ok ? MUTED : INK }}>{c.label}</p>
                    <p style={{ fontSize: '0.66rem', color: MUTED, marginTop: 1, ...TAB }}>{c.detalle}</p>
                  </div>
                  {c.monto > 0 && (
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: RED, whiteSpace: 'nowrap', ...TAB }}>{fmtU(c.monto)}</span>
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginTop: '1rem', borderLeft: `2px solid ${faltan.length ? RED : GREEN}`, paddingLeft: 12 }}>
              {faltan.length === 0 ? (
                <p style={{ fontSize: '0.78rem', color: BODY }}>Todo en cero. La operación se cierra limpia.</p>
              ) : (
                <p style={{ fontSize: '0.78rem', color: BODY, lineHeight: 1.5, ...TAB }}>
                  Se puede cerrar igual: queda registrado que faltan <b style={{ color: INK, fontWeight: 600 }}>{faltan.length} cosa{faltan.length === 1 ? '' : 's'}</b>
                  {totalUsd > 0 ? <> por <b style={{ color: RED, fontWeight: 700 }}>{fmtU(totalUsd)}</b></> : null}, y la operación sigue apareciendo con la plata pendiente a la vista.
                </p>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1.25rem', marginTop: '1.35rem' }}>
              <button onClick={onCancel} className="tt-ghost" style={GHOST}>Cancelar</button>
              <button onClick={confirmar} disabled={saving} style={{ ...BTN_DARK, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Cerrando…' : faltan.length ? 'Cerrar igual' : 'Cerrar operación'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Cuenta de Successi Ing SA ────────────────────────────────────────────────
// Cuánto puso Successi en esta operación, cuánto se le reintegró y cuánto falta,
// con el alta del reintegro. El reintegro va al ledger de pagos (scope
// 'successi'); si el endpoint no acepta ese scope, se guarda en la operación
// para no perderlo (y la fila que quedó mal clasificada se borra).
function SuccessiModal({ op, cuenta, reintegros, onClose, onAdd, onDelete }) {
  const [form, setForm] = useState({ fecha: hoyISO(), monto: '', metodo: 'transferencia', nota: '' });
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const parsed = numDesp(form.monto);

  const submit = async () => {
    if (busy) return;
    if (!(parsed > 0)) { gToast.error('Ingresá el monto del reintegro.'); return; }
    setBusy(true);
    const ok = await onAdd({ ...form, monto: fmtMontoAR(parsed) });
    setBusy(false);
    if (ok) setForm({ fecha: hoyISO(), monto: '', metodo: 'transferencia', nota: '' });
  };

  const INP_M = { ...INP, padding: '0.4rem 0.55rem', fontSize: '0.82rem' };
  return (
    <div style={{ ...OVERLAY, zIndex: 1250 }} onClick={onClose}>
      <div style={{ ...PANEL, maxWidth: 480, maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: '1rem' }}>
          <div>
            <h3 style={MODAL_T}>Successi Ing SA</h3>
            <p style={{ fontSize: '0.72rem', color: MUTED, marginTop: 2 }}>lo que puso en {toTitle(op.nombre) || 'esta operación'} y lo que se le devolvió</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="tt-ghost" style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: '1.3rem', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', paddingBottom: '1rem', borderBottom: `1px solid ${HAIR}` }}>
          {[
            { l: 'Puso', v: cuenta.sinTC ? fmtP(cuenta.puestoPesos) : fmtU(cuenta.puestoUSD), c: INK },
            { l: 'Reintegrado', v: fmtU(cuenta.reintegradoUSD), c: GREEN },
            { l: 'Falta reintegrar', v: cuenta.faltaUSD > 0 ? fmtU(cuenta.faltaUSD) : 'Nada', c: cuenta.faltaUSD > 0 ? RED : GREEN },
          ].map(x => (
            <div key={x.l}>
              <p style={{ fontSize: '1.05rem', fontWeight: 700, color: x.c, ...TAB }}>{x.v}</p>
              <p style={{ ...GROUP_H, marginTop: 2 }}>{x.l}</p>
            </div>
          ))}
        </div>

        <div style={{ padding: '1rem 0', borderBottom: `1px solid ${HAIR}` }}>
          <p style={{ ...GROUP_H, marginBottom: 8 }}>Registrar reintegro</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={LBL}>Fecha</label>
              <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className="tt-inp" style={INP_M} />
            </div>
            <div>
              <label style={LBL}>Monto (USD)</label>
              <input inputMode="decimal" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
                placeholder="0" className="tt-inp" style={{ ...INP_M, ...TAB }} />
              {form.monto.trim() !== '' && (
                <p style={{ fontSize: '0.64rem', color: parsed > 0 ? MUTED : AMBER, marginTop: 3, ...TAB }}>
                  {parsed > 0 ? `= ${fmtU(parsed)}` : 'no se entiende el monto'}
                </p>
              )}
            </div>
            <div>
              <label style={LBL}>Método</label>
              <select value={form.metodo} onChange={e => setForm(f => ({ ...f, metodo: e.target.value }))} className="tt-inp" style={{ ...INP_M, cursor: 'pointer', appearance: 'auto' }}>
                <option value="transferencia">Transferencia</option>
                <option value="cash">Cash</option>
                <option value="compensacion">Compensación</option>
              </select>
            </div>
            <div>
              <label style={LBL}>Nota (opcional)</label>
              <input value={form.nota} onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} placeholder="Ej: parcial" className="tt-inp" style={INP_M} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={submit} disabled={busy} style={{ ...BTN_DARK, opacity: busy ? 0.6 : 1 }}>{busy ? 'Guardando…' : 'Registrar reintegro'}</button>
          </div>
        </div>

        <div style={{ paddingTop: '0.9rem' }}>
          <p style={{ ...GROUP_H, marginBottom: 6 }}>Historial · {reintegros.length}</p>
          {reintegros.length === 0 ? (
            <p style={{ fontSize: '0.74rem', color: MUTED }}>Todavía no se le devolvió nada en esta operación.</p>
          ) : reintegros.map(r => (
            <div key={`${r.origen}-${r.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.5rem 0', borderBottom: '1px solid #f8fafc' }}>
              <span style={{ fontSize: '0.72rem', color: BODY, width: 82, flexShrink: 0, ...TAB }}>{fmtFecha(r.fecha) || '—'}</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: INK, ...TAB }}>{fmtU(numDesp(r.monto))}</span>
              <span style={{ fontSize: '0.68rem', color: MUTED, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.metodo || '—'}{r.nota ? ` · ${r.nota}` : ''}{r.por ? ` · ${r.por}` : ''}
              </span>
              {confirmDel === `${r.origen}-${r.id}` ? (
                <span style={{ display: 'inline-flex', gap: 10, flexShrink: 0 }}>
                  <button onClick={() => setConfirmDel(null)} className="tt-ghost" style={{ ...GHOST, fontSize: '0.68rem' }}>No</button>
                  <button onClick={() => { setConfirmDel(null); onDelete(r); }} style={{ ...GHOST, color: RED, fontWeight: 600, fontSize: '0.68rem' }}>Borrar</button>
                </span>
              ) : (
                <button onClick={() => setConfirmDel(`${r.origen}-${r.id}`)} className="tt-icon" title="Borrar reintegro"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0, display: 'flex' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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

  // `tocado` evita propagar cuando no cambiaste nada (abrir y cerrar el modal no
  // ensucia la operación ni dispara un guardado al pedo).
  const tocado = useRef(false);
  const updRow = (i, f, v) => { tocado.current = true; setRows(rs => rs.map((r, j) => j === i ? { ...r, [f]: v } : r)); };
  const addRow = () => { tocado.current = true; setRows(rs => [...rs, newRow()]); };
  const remRow = (i) => { tocado.current = true; setRows(rs => rs.filter((_, j) => j !== i)); };

  const apply = (rs) => onChange(rs.filter(r => r.desc || r.usd || r.pesos));
  const save  = () => { if (tocado.current) apply(rows); onClose(); };
  // Las líneas se propagan al expediente mientras las tipeás (y de ahí al
  // servidor, que autoguarda): cargar 8 facturas y perder la pestaña ya no
  // borra nada. Cerrar el modal de cualquier forma también las deja aplicadas.
  useEffect(() => {
    if (!tocado.current) return;
    const t = setTimeout(() => apply(rows), 700);
    return () => clearTimeout(t);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div onClick={save} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 100 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(820px, 94vw)', maxHeight: '88vh', background: '#fff', borderRadius: 12, zIndex: 110, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.5rem 1.75rem 0.9rem', borderBottom: `1px solid ${HAIR}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.7rem', flexWrap: 'wrap' }}>
            <h3 style={MODAL_T}>{cat.label}</h3>
            {cat.note && <span style={{ fontSize: '0.68rem', color: AMBER, fontWeight: 500 }}>{cat.note}</span>}
          </div>
          {/* Cerrar con la × APLICA las líneas (igual que tocar afuera o Listo):
              cerrar el modal nunca puede tirar lo que cargaste. */}
          <button onClick={save} aria-label="Cerrar y guardar" className="tt-ghost" style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1, padding: 0 }}>×</button>
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
                  // Las filas recién agregadas todavía no tienen id de la base.
                  <tr key={row.id ?? `nueva-${i}`}>
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
                      <td style={{ padding: '0.25rem 0.3rem', width: 190 }}>
                        {(() => {
                          const kind = esPagador(row.pagadoPor) ? row.pagadoPor : defKind;
                          return (
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-start', flexWrap: 'wrap' }} title="¿Quién pagó esta línea? La sociedad importadora (facturado), Successi Ing SA (se le reintegra después) o vos en efectivo. No cambia el total a cobrar: solo de qué bolsillo salió.">
                              {PAGADORES.map(([v, l]) => {
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
            <span style={{ fontSize: '0.68rem', color: MUTED }}>Se guarda solo</span>
            <button onClick={save} style={BTN_DARK}>Listo</button>
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get('op');
  const [selected, setSelected] = useState(null);
  // Buscador y filtro viven acá arriba: volver de una operación no borra lo que estabas buscando.
  const [query,  setQuery]  = useState('');
  const [filter, setFilter] = useState('todas');
  const pushedRef  = useRef(false);  // ¿la ficha se abrió agregando una entrada al historial?
  const pendingRef = useRef(null);   // id recién abierto, mientras la URL todavía no se actualizó
  const [closedId, setClosedId] = useState(null); // operación cerrada a mano: no reabrirla aunque la URL tarde
  // El deep-link que ve la lista ignora la operación que acabás de cerrar: si no,
  // mientras la URL termina de limpiarse la lista la vuelve a abrir (el loop viejo).
  const listaDeepLink = deepLinkId && String(deepLinkId) !== String(closedId) ? deepLinkId : null;

  // La URL manda: ?op=<id> abre el expediente, sin el parámetro se ve la lista.
  // Antes `selected` era estado local y el deep-link reabría la misma operación
  // apenas tocabas Volver (loop). Ahora Volver limpia la URL, el Atrás del
  // navegador/celular hace lo esperable y el link de una operación se comparte.
  const openOp = useCallback((op) => {
    setSelected(op);
    setClosedId(null);
    if (!op?.id) return;
    if (String(deepLinkId || '') === String(op.id)) return; // ya venía por deep-link
    pendingRef.current = String(op.id);
    pushedRef.current  = true;
    router.push(`/gestion/operaciones?op=${encodeURIComponent(op.id)}`, { scroll: false });
  }, [deepLinkId, router]);

  const backToList = useCallback(() => {
    setSelected(null);
    pendingRef.current = null;
    setClosedId(deepLinkId || null);
    if (pushedRef.current) { pushedRef.current = false; router.back(); }
    else if (deepLinkId) router.replace('/gestion/operaciones', { scroll: false });
  }, [deepLinkId, router]);

  // La URL ya refleja la operación abierta.
  useEffect(() => {
    if (pendingRef.current && String(deepLinkId || '') === pendingRef.current) pendingRef.current = null;
  }, [deepLinkId]);

  // Atrás del navegador o gesto del celular: si el parámetro desapareció, cerrar la ficha.
  useEffect(() => {
    if (deepLinkId || !selected || pendingRef.current) return;
    pushedRef.current = false;
    setSelected(null);
  }, [deepLinkId, selected]);

  return (
    <>
      <style>{PAGE_CSS}</style>
      {selected
        ? <OperationDetail op={selected} onBack={backToList} />
        : <OperationsList onSelect={openOp} deepLinkId={listaDeepLink}
            query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} />}
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
