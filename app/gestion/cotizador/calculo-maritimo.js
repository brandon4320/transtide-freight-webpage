// Cotizador marítimo sin React: presets de contenedor, cálculo y documento del cliente.
// calcularMaritimo(s) recibe el snapshot de serialize() y devuelve el objeto `c`;
// htmlClienteMaritimo({ s, c }) devuelve el HTML que ve el cliente y
// resultadoMaritimo(s, c), lo que muestra el panel de la pantalla.
// La prueba de oro (node scripts/cotizador-golden.mjs) congela los dos resultados.
//
// Cobro automático (s.cobroAuto === 1, lo emite siempre el formulario actual): un
// campo de COBRO vacío vale su costo por (1 + recargo / 100) y el FOB que te cuesta
// vacío vale el FOB cliente. Sin la marca (cotizaciones y borradores de antes) todo
// cálculo es el de siempre: vacío vale cero. migrarSnapshotMaritimo pasa un snapshot
// viejo al formato nuevo sin mover su precio. node scripts/cotizador-auto-maritimo.mjs
// lo prueba.
import { n, qFmt, qPct, qRow, qSection, qCronograma, buildQuoteHTML, LEYENDA_MAR } from './impresion';

// ─── cobro automático ─────────────────────────────────────────────────────────
// Campo de cobro → clave del costo en `c` que toma cuando queda vacío.
const COBROS_MARITIMO = { fleteCli: 'fleteR', gDes: 'desR', gTer: 'terR', gNav: 'navR', gLog: 'logR' };
// Campo de cobro → clave del valor efectivo en `c`.
const EFECTIVOS_MARITIMO = { fleteCli: 'fleteC', gDes: 'desC', gTer: 'terC', gNav: 'navC', gLog: 'logC', fobReal: 'fobR' };

// Vacío = '' (o solo espacios), undefined o null. '0' es un valor.
const vacio = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

// Snapshot de antes del cobro automático → formato actual con el MISMO precio:
// los cobros y el FOB que te cuesta vacíos valían cero, así que pasan a '0'.
// Un snapshot que ya tiene cobroAuto: 1 vuelve igual (copia). No muta `d`.
export function migrarSnapshotMaritimo(d) {
  const s = { ...(d || {}) };
  if (s.cobroAuto === 1) return s;
  for (const k of [...Object.keys(COBROS_MARITIMO), 'fobReal']) if (vacio(s[k])) s[k] = '0';
  s.cobroAuto = 1;
  return s;
}

// Valores efectivos de los cobros (y del FOB que te cuesta) como texto, para que el
// servidor (convertir a operación) no tenga que recalcularlos.
export function efectivosMaritimo(c) {
  const out = {};
  for (const [campo, clave] of Object.entries(EFECTIVOS_MARITIMO)) {
    const v = c ? c[clave] : NaN;
    out[campo] = Number.isFinite(v) ? String(v) : '0';
  }
  return out;
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

// ─── cálculo ──────────────────────────────────────────────────────────────────
// Mismo código y mismo orden de operaciones que el useMemo del componente
// (git show cd07d4e:app/gestion/cotizador/page.jsx). `s` es lo que emite
// serialize(); curM3 y curCosts se derivan igual que en el componente.
// Lo único nuevo es el cobro automático (ver arriba): sin s.cobroAuto === 1 cada
// cobro vale n(campo), exactamente como antes.
export function calcularMaritimo(s) {
  const {
    contType, contM3, contCosts,
    fobCliente, fobDecCli, fleteCli, gDes, gTer, gNav, gLog,
    fobReal, fobDecReal, fleteRealInput, m3Merch,
    pDer, pTas, pIva, pIvaA, pagaIvaA, pGan, pagaGan, pIIBB, pagaIIBB,
    cobraIvaA, cobraGan, cobraIIBB,
    pHon, pHonMin, pFac, pMrg, usaSociedadPropia,
    cobroAuto, markup,
  } = s;
  // Percepciones, dos puntas independientes: `cobra*` es lo que va en la
  // cotización del cliente y `paga*` lo que sale de tu bolsillo. Cobrar sin
  // pagar (pasa con IVA adicional, Ganancias e IIBB, que se recuperan) es
  // ganancia tuya. Las cotizaciones guardadas sin `cobra*` cobraban y pagaban
  // lo mismo: el valor por defecto conserva su precio y su margen.
  const cobraA = cobraIvaA === undefined ? pagaIvaA : cobraIvaA;
  const cobraG = cobraGan === undefined ? pagaGan : cobraGan;
  const cobraB = cobraIIBB === undefined ? pagaIIBB : cobraIIBB;
  const curM3 = contM3[contType];
  const curCosts = contCosts[contType];

  const der = pDer / 100, tas = pTas / 100, iva = pIva / 100,
        ivaA = pIvaA / 100, gan = pGan / 100, iibb = pIIBB / 100,
        hon = pHon / 100, fac = pFac / 100, mrg = pMrg / 100;

  // Cobro automático: vacío = costo con recargo. Sin la marca, vacío = 0 (n).
  const auto = cobroAuto === 1;
  const recargo = 1 + n(markup) / 100;
  const cobro = (v, costo) => (auto && vacio(v) ? costo * recargo : n(v));

  const fobC  = n(fobCliente);
  const fobDC = n(fobDecCli) || fobC;       // FOB declarado al cliente (base aranceles cliente)
  // Lo que te cuesta la mercadería; con el cobro automático, vacío = el FOB cliente.
  const fobR  = auto && vacio(fobReal) ? fobC : n(fobReal);
  // La aduana cobra sobre lo DECLARADO: sin una base declarada real distinta,
  // hereda la declarada al cliente (evita márgenes arancelarios fantasma).
  const fobDR = n(fobDecReal) || n(fobDecCli) || fobR;

  const m3val = n(m3Merch);
  const ratio = m3val > 0 && curM3 > 0 ? m3val / curM3 : 0;
  const fleteR = n(fleteRealInput) || (curCosts.flete * ratio);
  // Gastos locales reales prorrateados (se usan abajo en el lado real; se calculan
  // acá porque el cobro automático los necesita antes).
  const desR   = curCosts.despachante * ratio;
  const terR   = curCosts.terminal    * ratio;
  const navR   = curCosts.naviera     * ratio;
  const logR   = curCosts.logistica   * ratio;

  // Cobros efectivos: el campo si tiene valor (incluido '0'); vacío, según arriba.
  const fleteC = cobro(fleteCli, fleteR);

  // ── LADO CLIENTE ──
  const segC   = fobDC * 0.01;
  const cifC   = fobDC + fleteC + segC;
  const derC   = cifC * der;
  const tasC   = cifC * tas;
  const bivC   = cifC + derC + tasC;
  const ivaC   = bivC * iva; // IVA siempre aplica
  // Percepciones que se le cobran al cliente (ver `cobra*` arriba).
  const ivaAC  = cobraA ? bivC * ivaA : 0;
  const ganC   = cobraG ? bivC * gan  : 0;
  const iibbC  = cobraB ? bivC * iibb : 0;
  const arcC   = fleteC + segC + derC + tasC + ivaC + ivaAC + ganC + iibbC;
  const desC   = cobro(gDes, desR), terC = cobro(gTer, terR), navC = cobro(gNav, navR), logC = cobro(gLog, logR);
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
  const mFlet = fleteC - fleteR;
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
    fleteC, // flete cobrado efectivo (nuevo): el campo, o el flete real con recargo
    segC, cifC, derC, tasC, bivC, ivaC, ivaAC, ganC, iibbC, arcC,
    desC, terC, navC, logC, gasC, totConC, totSinC,
    fleteR, segR, cifR, derR, tasR, bivR, ivaR, ivaAR, ganR, iibbR,
    desR, terR, navR, logR, gasR, totConR, totSinR,
    honorarios, honMinAplica, gastFac, precioConF, precioSinF,
    mFOB, mFlet, mDer, mTas, mIva, mIvaA, mGan, mIIBB, mAranc, mArancEff, mGas, ganTotal,
    precioVenta, ventaNeta, gananciaNeta, ivaVentaMonto, precioVentaFinal,
    ratio, curM3,
  };
}

// ─── desglose del precio ──────────────────────────────────────────────────────
// Renglones del precio al cliente que suman EXACTO el precio (precioConF, que con
// la sociedad del cliente es igual a precioSinF porque no hay facturación): el
// mismo corte que el cronograma de pagos del documento. Facturación solo si hay.
// Con { personal: true }, los del precio de venta de una importación personal
// (costo sin IVA por rubro + ganancia + IVA de la venta = precioVentaFinal).
// Con { enteros: true } los valores vienen redondeados a dólares de modo que la
// suma de los renglones dé el precio redondeado (resto mayor): lo que se ve suma.
export function desgloseMaritimo(c, { enteros = false, personal = false } = {}) {
  const filas = personal ? [
    { label: 'Mercadería', valor: c.fobR },
    { label: 'Flete y seguro', valor: c.fleteR + c.segR },
    // Sin IVA ni IVA adicional: son crédito fiscal, no costo.
    { label: 'Aranceles y percepciones', valor: c.derR + c.tasR + c.ganR + c.iibbR },
    { label: 'Gastos locales', valor: c.gasR },
    { label: 'Ganancia', valor: c.gananciaNeta },
    { label: 'IVA de la venta', valor: c.ivaVentaMonto },
  ] : [
    { label: 'Mercadería', valor: c.fobC },
    { label: 'Flete y seguro', valor: c.fleteC + c.segC },
    { label: 'Impuestos y aranceles', valor: c.derC + c.tasC + c.ivaC + c.ivaAC + c.ganC + c.iibbC },
    { label: 'Gastos locales', valor: c.gasC },
    { label: 'Honorarios', valor: c.honorarios },
  ];
  if (!personal && c.gastFac > 0) filas.push({ label: 'Facturación', valor: c.gastFac });
  if (!enteros) return filas;
  const redondos = repartirEnteros(filas.map((f) => f.valor), personal ? c.precioVentaFinal : c.precioConF);
  return filas.map((f, i) => ({ ...f, valor: redondos[i] }));
}

// Redondea cada valor a entero sin que la suma se aparte de Math.round(total):
// piso de cada uno y el resto, de a uno, a los de mayor parte decimal.
function repartirEnteros(valores, total) {
  const finitos = valores.map((v) => (Number.isFinite(v) ? v : 0));
  const out = finitos.map((v) => Math.floor(v));
  let resto = Math.round(Number.isFinite(total) ? total : 0) - out.reduce((a, b) => a + b, 0);
  const orden = finitos.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; resto > 0 && k < orden.length; k++, resto--) out[orden[k][1]] += 1;
  for (let k = orden.length - 1; resto < 0 && k >= 0; k--, resto++) out[orden[k][1]] -= 1;
  return out;
}

// ─── resultado para la pantalla (panel de la derecha y barra del celular) ─────
// Lo que muestra el panel, a partir del estado (s) y del cálculo (c):
//  - listo / falta: hace falta FOB (en Importación personal, el FOB que te cuesta)
//    y metros cúbicos de la carga; mientras falte algo no se muestran importes.
//  - precio (con la sociedad del cliente, precioSinF), precioSinFactura (null si
//    no hay diferencia), ganancia, gananciaPct (en %), costo.
//  - desglose: renglones en dólares enteros que suman el precio redondeado.
//  - rentabilidad (solo para cliente): costo, cobro y margen por concepto, lo que
//    mostraba "Detalle real vs cobrado", más los honorarios. Con la sociedad del
//    cliente los impuestos van en un solo renglón sin margen (los paga él).
const casiCero = (v) => !Number.isFinite(v) || Math.abs(v) < 0.005;

// Costos reales por concepto (Importación personal): el detalle que antes
// mostraba "Desglose de costos reales". Suman EXACTO "Tu costo" (c.totSinR).
// El IVA y el IVA adicional del despacho no están: son crédito fiscal
// recuperable, no costo, y por eso tampoco entran en totSinR (van aparte, en
// r.ivaCredito, para que se puedan ver).
function costosMaritimo(c) {
  return [
    { label: 'Mercadería', costo: c.fobR },
    { label: 'Flete marítimo', costo: c.fleteR },
    { label: 'Seguro', costo: c.segR },
    { label: 'Derechos', costo: c.derR },
    { label: 'Tasa estadística', costo: c.tasR },
    { label: 'Percepción de Ganancias', costo: c.ganR },
    { label: 'Percepción de IIBB', costo: c.iibbR },
    { label: 'Despachante', costo: c.desR },
    { label: 'Terminal', costo: c.terR },
    { label: 'Naviera', costo: c.navR },
    { label: 'Logística', costo: c.logR },
  ].filter((f) => !casiCero(f.costo));
}

export function resultadoMaritimo(s, c) {
  const personal = s.mode === 'personal';
  const falta = [
    { label: 'FOB de la mercadería', ok: (personal ? c.fobR : c.fobC) > 0 },
    { label: 'Metros cúbicos de la carga', ok: n(s.m3Merch) > 0 },
  ];
  // Sin los m³ del contenedor no hay prorrateo (solo pasa si alguien los borra).
  if (!(n(c.curM3) > 0)) falta.push({ label: 'Metros cúbicos del contenedor', ok: false });
  const listo = falta.every((f) => f.ok);

  if (personal) {
    return {
      listo, falta,
      precio: c.precioVentaFinal,
      precioSinFactura: null,
      ganancia: c.gananciaNeta,
      gananciaPct: c.totSinR > 0 ? (c.gananciaNeta / c.totSinR) * 100 : null,
      costo: c.totSinR,
      desglose: desgloseMaritimo(c, { enteros: true, personal: true }),
      rentabilidad: null,
      costosPorConcepto: costosMaritimo(c),
      ivaCredito: c.ivaR + c.ivaAR,
    };
  }

  const propia = !!s.usaSociedadPropia;
  const precio = propia ? c.precioSinF : c.precioConF;
  const fila = (label, costo, cobro, margen) => ({ label, costo, cobro, margen });
  const impuestos = propia
    ? [fila(
      'Impuestos (los paga el cliente)',
      c.derR + c.tasR + c.ivaR + c.ivaAR + c.ganR + c.iibbR,
      c.derC + c.tasC + c.ivaC + c.ivaAC + c.ganC + c.iibbC,
      c.mArancEff,
    )]
    : [
      fila('Derechos', c.derR, c.derC, c.mDer),
      fila('Tasa estadística', c.tasR, c.tasC, c.mTas),
      fila('IVA', c.ivaR, c.ivaC, c.mIva),
      fila('IVA adicional', c.ivaAR, c.ivaAC, c.mIvaA),
      fila('Percepción de Ganancias', c.ganR, c.ganC, c.mGan),
      fila('Percepción de IIBB', c.iibbR, c.iibbC, c.mIIBB),
    ];
  const rentabilidad = [
    fila('Mercadería', c.fobR, c.fobC, c.mFOB),
    // Solo si lo declarado difiere: es la base de los aranceles y no tiene margen.
    ...(c.fobDR !== c.fobR || c.fobDC !== c.fobC ? [fila('FOB declarado', c.fobDR, c.fobDC, null)] : []),
    fila('Flete marítimo', c.fleteR, c.fleteC, c.mFlet),
    // El seguro va sin margen a propósito: la ganancia (c.ganTotal) nunca lo
    // incluyó, así que mostrarlo acá haría que la columna Margen no cerrara
    // contra "Tu ganancia". Costo y cobro sí se muestran: son parte del total.
    fila('Seguro', c.segR, c.segC, null),
    ...impuestos,
    fila('Despachante', c.desR, c.desC, c.desC - c.desR),
    fila('Terminal', c.terR, c.terC, c.terC - c.terR),
    fila('Naviera', c.navR, c.navC, c.navC - c.navR),
    fila('Logística', c.logR, c.logC, c.logC - c.logR),
    fila('Honorarios', null, c.honorarios, c.honorarios),
  ].filter((f) => !(casiCero(f.costo ?? 0) && casiCero(f.cobro) && casiCero(f.margen ?? 0)));

  return {
    listo, falta, precio,
    precioSinFactura: !propia && c.gastFac > 0 ? c.precioSinF : null,
    ganancia: c.ganTotal,
    gananciaPct: precio > 0 ? (c.ganTotal / precio) * 100 : null,
    costo: c.totConR,
    desglose: desgloseMaritimo(c, { enteros: true }),
    rentabilidad,
  };
}

// ─── documento para el cliente ─────────────────────────────────────────────────
// El mismo HTML que armaba printClienteQuote; el componente lo imprime con printHTML.
// El flete va con su valor efectivo (c.fleteC): sin cobro automático es n(fleteCli).
export function htmlClienteMaritimo({ s, c }) {
  const {
    cliente, descripcion, clasificacion,
    pDer, pTas, pIva, pIvaA, pGan, pIIBB, pHon, pFac,
    usaSociedadPropia, diasProd, diasTransito,
  } = s;
  const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const html = buildQuoteHTML({
    titulo: 'COTIZACIÓN DE IMPORTACIÓN',
    cliente, fecha: today, descripcion, clasificacion,
    izq: [
      qSection('Base de la Importación', [
        qRow('Valor de Mercadería (FOB)', qFmt(c.fobC)),
        qRow('Flete Internacional', qFmt(c.fleteC)),
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
      c, fleteMonto: c.fleteC, fleteLabel: 'Flete internacional y seguro',
      sinFacturaDistinto: !usaSociedadPropia && c.gastFac > 0,
      diasProd: n(diasProd), diasTransito: n(diasTransito),
    }),
    footer: LEYENDA_MAR,
  });
  return html;
}

export { PRESETS, PRESET_M3, PRESET_COSTS };
