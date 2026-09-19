// ─── Números del cotizador: leer lo que se tipea y mostrarlo en es-AR ─────────
// Puro: sin React ni 'use client' (lo prueba scripts/cotizador-numeros.mjs).
//
// El estado de los formularios guarda SIEMPRE el string canónico de JS
// ('53000', '2.5', '0.55'): es lo que ya usan el cálculo (parseFloat) y las
// cotizaciones guardadas. En pantalla se muestra en es-AR ('53.000', '2,5',
// '0,55'). parseNum pasa de lo que tipea el usuario al canónico y fmtNum vuelve;
// el viaje de ida y vuelta es estable para los tres tipos.
//
// Tipos: 'dinero' (importes en USD), 'decimal' (m³, kg) y 'pct' (porcentajes).

const MONEDA_Y_ESPACIOS = /u\$s|us\$|usd|\$|%|\s/gi;
const GUIONES = /[−‒–—]/g; // signos menos tipográficos → '-'

// Valor del estado (número o string canónico) → número finito, o null si no hay
// dato. Usa parseFloat, igual que n() del cálculo: lo que se muestra es lo que
// se calcula.
export function aNumero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== 'string') return null;
  const s = valor.trim();
  if (!s) return null;
  const num = parseFloat(s);
  return Number.isFinite(num) ? num : null;
}

// Texto tipeado → string canónico de JS ('' si está vacío o no es un número).
// Reglas:
//  - quita espacios, 'USD', 'U$S', 'US$', '$' y '%';
//  - si hay coma, la coma es decimal y los puntos son de miles ('53.000,50');
//    si además aparece un punto DESPUÉS de la coma, es un número pegado en
//    formato inglés ('53,000.50') y se lee al revés;
//  - si hay más de un punto, son de miles ('1.500.000');
//  - con un solo punto, es de miles solo si el tipo es 'dinero', detrás hay
//    exactamente 3 dígitos y adelante no hay solo un 0 ('1.500' → 1500,
//    '0.550' → 0.55); si no, es decimal ('1.5', '2.5' en pct, '0.550' en m³).
export function parseNum(texto, tipo = 'dinero') {
  if (texto === null || texto === undefined) return '';
  if (typeof texto === 'number') return Number.isFinite(texto) ? String(texto) : '';
  let s = String(texto).replace(GUIONES, '-').replace(MONEDA_Y_ESPACIOS, '');
  if (!s) return '';

  let signo = '';
  if (s[0] === '-' || s[0] === '+') {
    signo = s[0] === '-' ? '-' : '';
    s = s.slice(1);
  }
  if (!/^[0-9.,]+$/.test(s)) return '';

  const comas = s.split(',').length - 1;
  const puntos = s.split('.').length - 1;

  if (comas && puntos) {
    const decimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const miles = decimal === ',' ? '.' : ',';
    if (s.split(decimal).length - 1 > 1) return '';
    s = s.split(miles).join('').replace(decimal, '.');
  } else if (comas) {
    // Una coma es decimal; varias solo pueden ser separadores de miles.
    s = comas === 1 ? s.replace(',', '.') : s.split(',').join('');
  } else if (puntos > 1) {
    s = s.split('.').join('');
  } else if (puntos === 1) {
    const [antes, despues] = s.split('.');
    const esMiles = tipo === 'dinero' && /^\d{3}$/.test(despues) && !/^0*$/.test(antes);
    if (esMiles) s = antes + despues;
  }

  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return '';
  const num = Number(signo + s);
  if (!Number.isFinite(num)) return '';
  return String(num); // String(-0) === '0'
}

// Redondeo decimal sin el error binario de siempre (1.005 → 1,01).
function redondear(abs, dec) {
  const s = String(abs);
  if (s.includes('e')) return Number(abs.toFixed(dec));
  return Number(Math.round(Number(s + 'e' + dec)) + 'e-' + dec);
}

// Número → texto es-AR. minDec completa con ceros (importes con centavos).
function formatear(num, { maxDec, minDec = 0, miles }) {
  const abs = Math.abs(num);
  if (abs >= 1e21) return String(num);
  const r = redondear(abs, maxDec);
  let [entero, fraccion = ''] = r.toFixed(maxDec).split('.');
  fraccion = fraccion.replace(/0+$/, '');
  if (fraccion.length < minDec) fraccion = fraccion.padEnd(minDec, '0');
  if (miles) entero = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cero = r === 0;
  return (num < 0 && !cero ? '-' : '') + entero + (fraccion ? ',' + fraccion : '');
}

// Valor del estado → texto es-AR para mostrar en un campo ('' si no hay dato).
// Hasta 2 decimales para 'dinero' y 'pct', hasta 3 para 'decimal'.
// Solo 'dinero' agrupa miles: en 'decimal' y 'pct' un punto solo se lee como
// decimal, así que agrupar rompería la vuelta ('1.500' kg volvería como 1,5).
export function fmtNum(valor, tipo = 'dinero') {
  const num = aNumero(valor);
  if (num === null) return '';
  return formatear(num, { maxDec: tipo === 'decimal' ? 3 : 2, miles: tipo === 'dinero' });
}

// Importe para leer: 'USD 71.234'. Sin dato (o no finito): '—'.
export function fmtUSD(numero, { dec = 0 } = {}) {
  const num = aNumero(numero);
  if (num === null) return '—';
  return 'USD ' + formatear(num, { maxDec: dec, minDec: dec, miles: true });
}

// Porcentaje para leer en un resumen: '35 %', '2,5 %'. Sin dato: '—'.
export function fmtPct(valor) {
  const txt = fmtNum(valor, 'pct');
  return txt ? txt + ' %' : '—';
}
