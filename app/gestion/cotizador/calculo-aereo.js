// Cotizador aéreo sin React: conversión volumétrica, cálculo y documento del cliente.
// calcularAereo(s) recibe el snapshot de serialize() y devuelve el objeto `c`
// (incluye pesoVol, chargeable y usaVolumetrico); htmlClienteAereo({ s, c })
// devuelve el HTML que ve el cliente.
// La prueba de oro (node scripts/cotizador-golden.mjs) congela los dos resultados y
// scripts/cotizador-auto-aereo.mjs prueba el cobro automático.
import { n, qFmt, qPct, qRow, qSection, qCronograma, buildQuoteHTML, LEYENDA_AER } from './impresion';

// ─── aéreo: conversión IATA volumétrica ──────────────────────────────────────
// 1 m³ ≈ 167 kg volumétrico (estándar IATA para carga general)
const KG_PER_M3 = 167;

// ─── cobro automático ─────────────────────────────────────────────────────────
// Con s.cobroAuto === 1, un campo de COBRO vacío vale su costo con el recargo
// ("Recargo sobre costos %", s.markup; '' vale 0) y fobReal vacío vale el FOB
// cliente, sin recargo. Un campo con valor, incluido '0', se usa tal cual.
// Sin la marca (cotizaciones y borradores anteriores) el cálculo es el de siempre:
// vacío vale 0. migrarSnapshotAereo convierte lo viejo sin cambiarle el precio.

// [campo de cobro, campo de costo del que toma su valor cuando queda vacío]
const COBROS_AEREO = [
  ['fleteCliInput', 'fleteRealInput'],
  ['awbCli', 'awbReal'],
  ['handCli', 'handReal'],
  ['terCli', 'terReal'],
  ['desCli', 'desReal'],
  ['traCli', 'traReal'],
];

// Vacío = sin dato ('' o undefined; también null o solo espacios).
const vacio = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

// Costo con el recargo: costo + costo × markup / 100 (con markup 0 da el costo exacto).
const conRecargo = (costo, markup) => costo + (costo * n(markup)) / 100;

// Snapshot de antes del cobro automático → snapshot con la marca y el MISMO precio:
// los campos de cobro vacíos y fobReal vacío pasan a '0' (lo que valían). Pura: no
// toca `d`, devuelve una copia. Con la marca ya puesta, devuelve la copia tal cual.
export function migrarSnapshotAereo(d) {
  const s = { ...(d || {}) };
  if (s.cobroAuto === 1) return s;
  for (const [campo] of COBROS_AEREO) if (vacio(s[campo])) s[campo] = '0';
  if (vacio(s.fobReal)) s.fobReal = '0';
  s.cobroAuto = 1;
  return s;
}

// ─── cálculo ──────────────────────────────────────────────────────────────────
// Mismo código y mismo orden de operaciones que el useMemo del componente
// (git show cd07d4e:app/gestion/cotizador/page.jsx). `s` es lo que emite
// serialize(). pesoVol, chargeable y usaVolumetrico se derivaban fuera del
// useMemo: se derivan acá, igual, y viajan en c.
// Los cobros son los EFECTIVOS (ver cobro automático): c.fleteC, c.awbC, c.handC,
// c.terC, c.desC y c.traC (iguales a awbCv… de siempre) y c.fobR para el FOB real.
export function calcularAereo(s) {
  const {
    m3Input, pesoReal,
    fobCliente, fobDecCli, fleteCliInput, awbCli, handCli, terCli, desCli, traCli,
    fobReal, fobDecReal, fleteRealInput, awbReal, handReal, terReal, desReal, traReal,
    pDer, pTas, pIva, pIvaA, pagaIvaA, pGan, pagaGan, pIIBB, pagaIIBB,
    pHon, pHonMin, pFac, pMrg, usaSociedadPropia,
    cobroAuto, markup,
  } = s;
  const pesoVol       = n(m3Input) * KG_PER_M3;
  const chargeable    = Math.max(n(pesoReal), pesoVol);
  const usaVolumetrico = pesoVol > n(pesoReal) && pesoVol > 0;

  // Cobro de un gasto: vacío con la marca → costo con recargo; si no, n(campo).
  const auto = cobroAuto === 1;
  const cobro = (campo, costo) => (auto && vacio(campo) ? conRecargo(costo, markup) : n(campo));

  const der = pDer / 100, tas = pTas / 100, iva = pIva / 100,
        ivaA = pIvaA / 100, gan = pGan / 100, iibb = pIIBB / 100,
        hon = pHon / 100, fac = pFac / 100, mrg = pMrg / 100;

  const fobC  = n(fobCliente);
  const fobDC = n(fobDecCli) || fobC;
  // FOB que te cuesta: vacío con la marca → el FOB cliente (sin recargo).
  const fobR  = auto && vacio(fobReal) ? fobC : n(fobReal);
  // Igual que en marítimo: la base real hereda lo declarado al cliente.
  const fobDR = n(fobDecReal) || n(fobDecCli) || fobR;

  // flete = total USD (cerrado, lo pasa el agente)
  const fleteR = n(fleteRealInput);
  const fleteC = cobro(fleteCliInput, fleteR);

  // costos de los gastos (se cargan a mano); los cobros salen de acá si quedan vacíos
  const awbRv  = n(awbReal), handRv = n(handReal), terRv = n(terReal), desRv = n(desReal), traRv = n(traReal);

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
  const awbCv  = cobro(awbCli, awbRv), handCv = cobro(handCli, handRv), terCv = cobro(terCli, terRv),
        desCv  = cobro(desCli, desRv), traCv = cobro(traCli, traRv);
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
    pesoVol, chargeable, usaVolumetrico,
    // cobros efectivos con los nombres del contrato (c.fleteC ya estaba arriba)
    awbC: awbCv, handC: handCv, terC: terCv, desC: desCv, traC: traCv,
  };
}

// Valores efectivos para serialize() → `efectivos`: lo que valió cada campo de
// cobro y fobReal en este cálculo, como texto. El servidor (convertir a
// operación) los lee en lugar del campo crudo y no tiene que recalcular.
// Campo → clave del valor efectivo en `c` (mismo criterio que efectivosMaritimo).
const EFECTIVOS_AEREO = {
  fleteCliInput: 'fleteC', awbCli: 'awbC', handCli: 'handC', terCli: 'terC', desCli: 'desC', traCli: 'traC',
  fobReal: 'fobR',
};
export function efectivosAereo(c) {
  const out = {};
  for (const [campo, clave] of Object.entries(EFECTIVOS_AEREO)) {
    const v = c ? c[clave] : NaN;
    out[campo] = Number.isFinite(v) ? String(v) : '0';
  }
  return out;
}

// ─── resultado para la pantalla (panel de la derecha y barra del celular) ─────
// Redondea a dólares enteros de modo que las filas sumen EXACTO el total
// redondeado (método del mayor resto): el desglose tiene que dar el precio que
// se ve arriba, sin diferencias de un dólar. Las filas en cero no se tocan.
export function repartirRedondeo(valores, total) {
  const vals = valores.map((v) => (Number.isFinite(v) ? v : 0));
  const out = vals.map((v) => Math.round(v));
  let dif = Math.round(Number.isFinite(total) ? total : 0) - out.reduce((a, b) => a + b, 0);
  if (!dif) return out;
  const paso = Math.sign(dif);
  // Primero las filas a las que el redondeo más les sacó (o les agregó, si sobra).
  const orden = vals.map((_, i) => i).filter((i) => vals[i] !== 0)
    .sort((a, b) => paso * ((vals[b] - out[b]) - (vals[a] - out[a])));
  for (let k = 0; dif !== 0 && k < orden.length * 4; k++) {
    out[orden[k % orden.length]] += paso;
    dif -= paso;
  }
  return out;
}

const casiCero = (v) => !Number.isFinite(v) || Math.abs(v) < 0.005;

// Costos reales por concepto (Importación personal): el detalle que antes
// mostraba "Desglose de costos reales". Suman EXACTO "Tu costo" (c.totSinR).
// El IVA y el IVA adicional del despacho no están: son crédito fiscal
// recuperable, no costo, y por eso tampoco entran en totSinR (van aparte, en
// r.ivaCredito, para que se puedan ver).
function costosAereo(c) {
  return [
    { label: 'Mercadería', costo: c.fobR },
    { label: 'Flete aéreo', costo: c.fleteR },
    { label: 'Seguro', costo: c.segR },
    { label: 'Derechos', costo: c.derR },
    { label: 'Tasa estadística', costo: c.tasR },
    { label: 'Percepción de Ganancias', costo: c.ganR },
    { label: 'Percepción de IIBB', costo: c.iibbR },
    { label: 'AWB', costo: c.awbRv },
    { label: 'Handling', costo: c.handRv },
    { label: 'Terminal', costo: c.terRv },
    { label: 'Despachante', costo: c.desRv },
    { label: 'Transporte interno', costo: c.traRv },
  ].filter((f) => !casiCero(f.costo));
}

// Lo que muestra el panel de resultado, a partir del estado (s) y del cálculo (c):
//  - listo / falta: hace falta FOB (en Importación personal, el FOB real) y peso
//    cobrable; mientras falte algo no se muestran importes;
//  - precio, precioSinFactura (null si no hay diferencia), ganancia, gananciaPct,
//    costo;
//  - desglose: filas que suman exacto el precio (redondeado a dólares);
//  - rentabilidad (solo para cliente): costo, cobro y margen por concepto. Los
//    costos suman "Tu costo" (c.totConR) y los márgenes suman la ganancia
//    (c.ganTotal); los renglones que no entran en la ganancia van con margen
//    null y se ven como '—'.
export function resultadoAereo(s, c) {
  const personal = s.mode === 'personal';
  const fob = personal ? c.fobR : c.fobC;
  const falta = [
    { label: 'FOB de la mercadería', ok: fob > 0 },
    { label: 'Metros cúbicos o peso', ok: c.chargeable > 0 },
  ];
  const listo = falta.every((f) => f.ok);

  if (personal) {
    // Precio de venta = costo sin IVA + ganancia neta + IVA de la venta.
    const precio = c.precioVentaFinal;
    const filas = [
      ['Mercadería', c.fobR],
      ['Flete aéreo y seguro', c.fleteR + c.segR],
      ['Impuestos y aranceles sin IVA', c.derR + c.tasR + c.ganR + c.iibbR],
      ['Gastos locales', c.gasR],
      ['Ganancia neta', c.gananciaNeta],
      ['IVA de la venta', c.ivaVentaMonto],
    ];
    const red = repartirRedondeo(filas.map((f) => f[1]), precio);
    return {
      listo, falta, precio, precioSinFactura: null,
      ganancia: c.gananciaNeta,
      gananciaPct: c.totSinR > 0 ? (c.gananciaNeta / c.totSinR) * 100 : null,
      costo: c.totSinR,
      desglose: filas.map(([label], i) => ({ label, valor: red[i] })),
      rentabilidad: null,
      costosPorConcepto: costosAereo(c),
      ivaCredito: c.ivaR + c.ivaAR,
    };
  }

  const propia = !!s.usaSociedadPropia;
  const precio = propia ? c.precioSinF : c.precioConF;
  const filas = [
    ['Mercadería', c.fobC],
    ['Flete aéreo y seguro', c.fleteC + c.segC],
    ['Impuestos y aranceles', c.derC + c.tasC + c.ivaC + c.ivaAC + c.ganC + c.iibbC],
    ['Gastos locales', c.gasC],
    ['Honorarios', c.honorarios],
    // Solo si hay facturación (sociedad de Transtide): con la del cliente vale 0.
    ...(c.gastFac > 0 ? [['Facturación', c.gastFac]] : []),
  ];
  const red = repartirRedondeo(filas.map((f) => f[1]), precio);
  const rentabilidad = [
    { label: 'Mercadería', costo: c.fobR, cobro: c.fobC, margen: c.mFOB },
    { label: 'Flete aéreo', costo: c.fleteR, cobro: c.fleteC, margen: c.mFlet },
    // Sin margen a propósito: la ganancia (c.ganTotal) no lo incluye. Va igual
    // para que la columna Costo cierre contra "Tu costo" (c.totConR lo suma).
    { label: 'Seguro', costo: c.segR, cobro: c.segC, margen: null },
    {
      label: propia ? 'Impuestos (los paga el cliente)' : 'Impuestos y aranceles',
      costo: c.derR + c.tasR + c.ivaR + c.ivaAR + c.ganR + c.iibbR,
      cobro: c.derC + c.tasC + c.ivaC + c.ivaAC + c.ganC + c.iibbC,
      margen: c.mArancEff,
    },
    { label: 'AWB', costo: c.awbRv, cobro: c.awbC, margen: c.mAwb },
    { label: 'Handling', costo: c.handRv, cobro: c.handC, margen: c.mHand },
    { label: 'Terminal', costo: c.terRv, cobro: c.terC, margen: c.mTer },
    { label: 'Despachante', costo: c.desRv, cobro: c.desC, margen: c.mDes },
    { label: 'Transporte', costo: c.traRv, cobro: c.traC, margen: c.mTra },
    { label: 'Honorarios', costo: null, cobro: c.honorarios, margen: c.honorarios },
  ].filter((f) => !(casiCero(f.costo ?? 0) && casiCero(f.cobro) && casiCero(f.margen ?? 0)));
  return {
    listo, falta, precio,
    precioSinFactura: !propia && c.gastFac > 0 ? c.precioSinF : null,
    ganancia: c.ganTotal,
    gananciaPct: precio > 0 ? (c.ganTotal / precio) * 100 : null,
    costo: c.totConR,
    desglose: filas.map(([label], i) => ({ label, valor: red[i] })),
    rentabilidad,
  };
}

// ─── documento para el cliente (mismo formato que marítimo) ────────────────────
// El mismo HTML que armaba printClienteQuote; el componente lo imprime con printHTML.
// Todos los importes salen de `c` (valores efectivos), ninguno del campo crudo.
export function htmlClienteAereo({ s, c }) {
  const {
    cliente, descripcion, clasificacion, m3Input, pesoReal,
    pDer, pTas, pIva, pIvaA, pGan, pIIBB, pHon, pFac,
    usaSociedadPropia, diasProd, diasTransito,
  } = s;
  const { chargeable } = c;
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
  return html;
}

export { KG_PER_M3, COBROS_AEREO, conRecargo };
