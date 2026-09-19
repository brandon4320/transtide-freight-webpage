#!/usr/bin/env node
// Prueba del COBRO AUTOMÁTICO del cotizador aéreo (app/gestion/cotizador/calculo-aereo.js).
//
//   node scripts/cotizador-auto-aereo.mjs     sale con 1 si alguna verificación falla
//
// Qué verifica (todo con datos inventados; la línea base de la prueba de oro no se toca):
//   1. migrarSnapshotAereo no le cambia el precio a nada viejo: para cada escenario
//      aéreo de la prueba de oro, calcular(migrar(s)) da el mismo c y el mismo HTML.
//   2. migrarSnapshotAereo: '' / undefined → '0' en los seis cobros y en fobReal, lo
//      cargado queda igual, pone cobroAuto: 1, no toca el original y es idempotente.
//   3. Con la marca, un cobro vacío vale su costo (sin recargo): margen cero.
//   4. Con recargo, un cobro vacío vale costo × (1 + recargo / 100).
//   5. Un cobro con valor se usa tal cual, incluido '0'.
//   6. fobReal vacío vale el FOB cliente, sin recargo; '0' y los valores, tal cual.
//   7. Vacío con la marca ≡ tipear el costo a mano sin la marca (c y HTML iguales).
//   8. efectivosAereo: textos que valen lo mismo que c, y el servidor (convertir a
//      operación) llega a los mismos cobros leyendo `efectivos`.
//   9. Sin la marca, vacío sigue valiendo 0 (compatibilidad).
//  10. Panel: el desglose suma exacto el precio y los márgenes suman la ganancia.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = join(RAIZ, 'app/gestion/cotizador/calculo-aereo.js');

// Fecha congelada, igual que la prueba de oro (el HTML lleva la fecha de hoy).
const FechaReal = Date;
const FIJO = new FechaReal(2026, 8, 19, 12, 0, 0, 0).getTime();
class FechaFija extends FechaReal {
  constructor(...args) {
    if (args.length === 0) super(FIJO);
    else super(...args);
  }
  static now() { return FIJO; }
}
globalThis.Date = FechaFija;

async function empaquetar(dest) {
  const opciones = { bundle: true, format: 'esm', platform: 'node', outdir: dest, outExtension: { '.js': '.mjs' }, logLevel: 'error' };
  let esbuild = null;
  try {
    const mod = await import('esbuild');
    esbuild = mod.build ? mod : mod.default;
  } catch { /* no está instalado en el proyecto: se usa npx */ }
  if (esbuild && esbuild.build) {
    await esbuild.build({ entryPoints: [ENTRADA], ...opciones });
    return;
  }
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  try {
    execFileSync(npx, ['--yes', 'esbuild', ENTRADA, '--bundle', '--format=esm', '--platform=node',
      `--outdir=${dest}`, '--out-extension:.js=.mjs', '--log-level=error'], { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    console.error('No se pudo empaquetar con esbuild:\n' + String(e.stderr || e.message));
    process.exit(2);
  }
}

const tmp = mkdtempSync(join(tmpdir(), 'cotizador-auto-aereo-'));
let A;
try {
  await empaquetar(tmp);
  A = await import(pathToFileURL(join(tmp, 'calculo-aereo.mjs')).href);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
const { calcularAereo, htmlClienteAereo, migrarSnapshotAereo, efectivosAereo, resultadoAereo, repartirRedondeo } = A;

// ── utilidades ────────────────────────────────────────────────────────────────
const TOL = 1e-9;
const cerca = (a, b) => (typeof a === 'number' && typeof b === 'number'
  ? Object.is(a, b) || Math.abs(a - b) <= TOL * Math.max(1, Math.abs(a), Math.abs(b))
  : a === b);

let total = 0;
const fallas = [];
const grupos = [];
function grupo(nombre, fn) {
  const antes = fallas.length;
  const cuenta0 = total;
  fn();
  grupos.push({ nombre, ok: fallas.length === antes, n: total - cuenta0 });
}
function ok(cond, msg) {
  total++;
  if (!cond) fallas.push(msg);
}
function igual(actual, esperado, msg) {
  ok(cerca(actual, esperado), `${msg}: esperado ${esperado} · actual ${actual}`);
}
// Todas las claves de `base` tienen que estar en `otro` y valer lo mismo.
function mismoC(base, otro, msg) {
  for (const [k, v] of Object.entries(base)) {
    ok(k in otro && cerca(v, otro[k]), `${msg}: c.${k} esperado ${v} · actual ${otro[k]}`);
  }
}
const n = (v) => parseFloat(v) || 0;

// Campos de cobro del aéreo y el costo del que toman su valor.
const PARES = [
  ['fleteCliInput', 'fleteRealInput', 'fleteC', 'fleteR'],
  ['awbCli', 'awbReal', 'awbC', 'awbRv'],
  ['handCli', 'handReal', 'handC', 'handRv'],
  ['terCli', 'terReal', 'terC', 'terRv'],
  ['desCli', 'desReal', 'desC', 'desRv'],
  ['traCli', 'traReal', 'traC', 'traRv'],
];
const COBROS = PARES.map((p) => p[0]);

// Snapshot inventado completo (como lo emite serialize(), sin `efectivos`).
const BASE = {
  mode: 'cliente', cliente: 'Importadora Inventada SRL', descripcion: 'Repuestos de prueba', clasificacion: '8708.99.90',
  m3Input: '2.5', pesoReal: '300', diasProd: '15', diasTransito: '7',
  fobCliente: '15000', fobDecCli: '', fleteCliInput: '', awbCli: '', handCli: '', terCli: '', desCli: '', traCli: '',
  fobReal: '', fobDecReal: '', fleteRealInput: '2300', awbReal: '80', handReal: '150', terReal: '220', desReal: '450', traReal: '150',
  pDer: 35, pTas: 0, pIva: 21, pagaIva: true, pIvaA: 20, pagaIvaA: true, pGan: 6, pagaGan: true, pIIBB: 2.5, pagaIIBB: true,
  pHon: 4, pHonMin: 500, pFac: 8, pMrg: 20, usaSociedadPropia: false, arancelToggles: 'v2',
  cobroAuto: 1, markup: '',
};
const con = (cambios) => ({ ...BASE, ...cambios });

const escenarios = JSON.parse(readFileSync(join(RAIZ, 'scripts/cotizador-escenarios.json'), 'utf8')).aereo;

// ── 1 ─────────────────────────────────────────────────────────────────────────
grupo('1. migrar no cambia el precio de lo guardado (escenarios de la prueba de oro)', () => {
  ok(escenarios.length >= 10, 'faltan escenarios aéreos en scripts/cotizador-escenarios.json');
  for (const { id, s } of escenarios) {
    ok(s.cobroAuto === undefined, `${id}: los escenarios de la línea base no tienen que traer cobroAuto`);
    const c0 = calcularAereo(structuredClone(s));
    const m = migrarSnapshotAereo(structuredClone(s));
    const c1 = calcularAereo(m);
    mismoC(c0, c1, `${id} migrado`);
    ok(htmlClienteAereo({ s: structuredClone(s), c: c0 }) === htmlClienteAereo({ s: m, c: c1 }), `${id}: el HTML del cliente cambió al migrar`);
    // El panel también ve lo mismo.
    const r0 = resultadoAereo(s, c0);
    const r1 = resultadoAereo(m, c1);
    igual(r1.precio, r0.precio, `${id}: precio del panel al migrar`);
    igual(r1.ganancia, r0.ganancia, `${id}: ganancia del panel al migrar`);
  }
});

// ── 2 ─────────────────────────────────────────────────────────────────────────
grupo('2. migrar: vacíos a "0", lo cargado igual, marca puesta, sin mutar, idempotente', () => {
  const viejo = { ...BASE, fleteCliInput: '', awbCli: '0', handCli: '250', desCli: undefined, fobReal: '', markup: undefined };
  delete viejo.cobroAuto;
  delete viejo.terCli; // campo ausente = undefined
  const copia = structuredClone(viejo);
  const m = migrarSnapshotAereo(viejo);
  ok(JSON.stringify(viejo) === JSON.stringify(copia) && !('cobroAuto' in viejo), 'migrar modificó el objeto original');
  ok(m !== viejo, 'migrar tiene que devolver una copia');
  ok(m.cobroAuto === 1, 'migrar no puso cobroAuto: 1');
  for (const k of ['fleteCliInput', 'desCli', 'terCli', 'traCli', 'fobReal']) ok(m[k] === '0', `migrar: ${k} vacío tenía que quedar '0' (quedó ${JSON.stringify(m[k])})`);
  ok(m.awbCli === '0', "migrar: awbCli '0' tenía que quedar '0'");
  ok(m.handCli === '250', "migrar: handCli '250' tenía que quedar igual");
  for (const k of ['fobCliente', 'fleteRealInput', 'awbReal', 'pDer', 'cliente']) ok(m[k] === viejo[k], `migrar tocó ${k}, que no es de cobro`);
  ok(JSON.stringify(migrarSnapshotAereo(m)) === JSON.stringify(m), 'migrar no es idempotente');
  const nuevo = con({ fleteCliInput: '' });
  const mn = migrarSnapshotAereo(nuevo);
  ok(mn !== nuevo && JSON.stringify(mn) === JSON.stringify(nuevo), 'con cobroAuto: 1, migrar tiene que devolver una copia igual');
  ok(mn.fleteCliInput === '', 'con cobroAuto: 1, migrar no tiene que llenar los cobros vacíos');
  const vacio = migrarSnapshotAereo(undefined);
  ok(vacio.cobroAuto === 1 && vacio.fobReal === '0', 'migrar(undefined) tiene que devolver un snapshot con la marca');
});

// ── 3 ─────────────────────────────────────────────────────────────────────────
grupo('3. con la marca, un cobro vacío vale su costo', () => {
  const c = calcularAereo(con({}));
  for (const [, costo, ef, real] of PARES) {
    igual(c[ef], n(BASE[costo]), `c.${ef} (vacío) tiene que valer ${costo}`);
    igual(c[ef], c[real], `c.${ef} tiene que coincidir con c.${real}`);
  }
  igual(c.mFlet, 0, 'margen del flete con el cobro en su costo');
  igual(c.mGas, 0, 'margen de los gastos con el cobro en su costo');
  igual(c.gasC, c.gasR, 'gastos cobrados = gastos reales');
  // Los alias viejos siguen valiendo lo mismo que los nombres del contrato.
  for (const [a, b] of [['awbCv', 'awbC'], ['handCv', 'handC'], ['terCv', 'terC'], ['desCv', 'desC'], ['traCv', 'traC']]) igual(c[a], c[b], `c.${a} = c.${b}`);
});

// ── 4 ─────────────────────────────────────────────────────────────────────────
grupo('4. con recargo, un cobro vacío vale costo × (1 + recargo / 100)', () => {
  for (const mk of ['15', '7.5', '0', '']) {
    const c = calcularAereo(con({ markup: mk }));
    for (const [, costo, ef] of PARES) igual(c[ef], n(BASE[costo]) * (1 + n(mk) / 100), `recargo ${JSON.stringify(mk)}: c.${ef}`);
    igual(c.mGas, c.gasR * n(mk) / 100, `recargo ${JSON.stringify(mk)}: margen de gastos`);
    igual(c.fobR, c.fobC, `recargo ${JSON.stringify(mk)}: el FOB real vacío no lleva recargo`);
  }
});

// ── 5 ─────────────────────────────────────────────────────────────────────────
grupo("5. un cobro con valor se usa tal cual, incluido '0'", () => {
  const c = calcularAereo(con({ markup: '15', fleteCliInput: '2800', awbCli: '0', handCli: '', terCli: '0', desCli: '600', traCli: '' }));
  igual(c.fleteC, 2800, "fleteCliInput '2800'");
  igual(c.awbC, 0, "awbCli '0' vale 0 aunque el costo sea 80");
  igual(c.terC, 0, "terCli '0' vale 0 aunque el costo sea 220");
  igual(c.desC, 600, "desCli '600'");
  igual(c.handC, 150 * 1.15, 'handCli vacío = costo con recargo');
  igual(c.traC, 150 * 1.15, 'traCli vacío = costo con recargo');
  igual(c.gasC, 0 + 150 * 1.15 + 0 + 600 + 150 * 1.15, 'suma de gastos cobrados');
  igual(c.mAwb, -80, 'margen de AWB cobrado en 0');
});

// ── 6 ─────────────────────────────────────────────────────────────────────────
grupo('6. fobReal vacío vale el FOB cliente (sin recargo); con valor, tal cual', () => {
  const vacio = calcularAereo(con({ markup: '20' }));
  igual(vacio.fobR, 15000, 'fobReal vacío = FOB cliente');
  igual(vacio.mFOB, 0, 'sin FOB real propio no hay margen de mercadería');
  igual(vacio.fobDR, 15000, 'la base declarada real hereda el FOB efectivo');
  const cero = calcularAereo(con({ fobReal: '0' }));
  igual(cero.fobR, 0, "fobReal '0' vale 0");
  const propio = calcularAereo(con({ fobReal: '13000', fobDecCli: '12000' }));
  igual(propio.fobR, 13000, "fobReal '13000'");
  igual(propio.fobDR, 12000, 'fobDecCli sigue mandando sobre la base declarada real');
  igual(propio.mFOB, 2000, 'margen de mercadería');
  // Importación personal: el FOB de la mercadería es el real; vacío toma el cliente.
  const pers = resultadoAereo(con({ mode: 'personal' }), calcularAereo(con({ mode: 'personal' })));
  ok(pers.listo, 'personal con FOB cliente y fobReal vacío tiene que estar listo');
});

// ── 7 ─────────────────────────────────────────────────────────────────────────
grupo('7. vacío con la marca ≡ tipear el costo sin la marca', () => {
  for (const mk of ['', '12']) {
    const auto = con({ markup: mk });
    const manual = { ...auto };
    delete manual.cobroAuto;
    for (const [cobro, costo] of PARES) manual[cobro] = String(n(BASE[costo]) * (1 + n(mk) / 100));
    manual.fobReal = BASE.fobCliente;
    const ca = calcularAereo(auto);
    const cm = calcularAereo(manual);
    mismoC(cm, ca, `recargo ${JSON.stringify(mk)}`);
    ok(htmlClienteAereo({ s: auto, c: ca }) === htmlClienteAereo({ s: manual, c: cm }), `recargo ${JSON.stringify(mk)}: el HTML del cliente no usa los efectivos`);
  }
  // Y en el HTML se ven los importes efectivos: flete 2.300 y AWB 80.
  const html = htmlClienteAereo({ s: con({}), c: calcularAereo(con({})) });
  ok(html.includes('$ 2.300,00'), 'el HTML tiene que mostrar el flete efectivo ($ 2.300,00)');
  ok(html.includes('>AWB<') && html.includes('$ 80,00'), 'el HTML tiene que mostrar el AWB efectivo ($ 80,00)');
});

// ── 8 ─────────────────────────────────────────────────────────────────────────
grupo('8. efectivos: mismos valores que c y el servidor llega a lo mismo', () => {
  const s = con({ markup: '10', awbCli: '0', desCli: '600' });
  const c = calcularAereo(s);
  const ef = efectivosAereo(c);
  const claves = [...COBROS, 'fobReal'];
  ok(JSON.stringify(Object.keys(ef).sort()) === JSON.stringify([...claves].sort()), `efectivos: claves ${Object.keys(ef).join(', ')}`);
  for (const k of claves) ok(typeof ef[k] === 'string', `efectivos.${k} tiene que ser texto`);
  for (const [cobro, , campoC] of PARES) igual(parseFloat(ef[cobro]), c[campoC], `efectivos.${cobro}`);
  igual(parseFloat(ef.fobReal), c.fobR, 'efectivos.fobReal');
  // Espejo de app/api/db/cotizaciones/[id]/convertir/route.ts (estimar, modo aéreo).
  const data = { ...s, efectivos: ef };
  const nS = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
  const efectivo = (d, k) => (d.efectivos && d.efectivos[k] !== undefined ? d.efectivos[k] : d[k]);
  igual(nS(efectivo(data, 'fleteCliInput')), c.fleteC, 'servidor: flete cobrado');
  igual(['awbCli', 'handCli', 'terCli', 'desCli', 'traCli'].reduce((t, k) => t + nS(efectivo(data, k)), 0), c.gasC, 'servidor: gastos cobrados');
  igual(nS(efectivo(data, 'fobReal')), c.fobR, 'servidor: FOB real');
  // El ciclo: calcular con `efectivos` puestos no cambia nada (se calcula del estado crudo).
  mismoC(c, calcularAereo(data), 'calcular con efectivos en el snapshot');
});

// ── 9 ─────────────────────────────────────────────────────────────────────────
grupo('9. sin la marca, vacío sigue valiendo 0', () => {
  const viejo = { ...BASE };
  delete viejo.cobroAuto;
  const c = calcularAereo(viejo);
  for (const [, , ef] of PARES) igual(c[ef], 0, `sin la marca, c.${ef} vacío vale 0`);
  igual(c.fobR, 0, 'sin la marca, fobReal vacío vale 0');
  const conOtraMarca = calcularAereo({ ...BASE, cobroAuto: '1' });
  igual(conOtraMarca.fleteC, 0, "cobroAuto '1' (texto) no es la marca");
});

// ── 10 ────────────────────────────────────────────────────────────────────────
grupo('10. panel: el desglose suma el precio y los márgenes suman la ganancia', () => {
  const casos = [
    ...escenarios.map(({ id, s }) => [id, migrarSnapshotAereo(s)]),
    ['auto', con({})],
    ['auto con recargo', con({ markup: '15', fobReal: '13000' })],
    ['sociedad del cliente', con({ usaSociedadPropia: true, markup: '8.5' })],
    ['honorario mínimo', con({ fobCliente: '1200', m3Input: '0.1', pesoReal: '12', fleteRealInput: '400' })],
    ['decimales', con({ fobCliente: '15234.57', fleteRealInput: '2311.33', awbReal: '80.49', markup: '3.3' })],
    ['personal', con({ mode: 'personal', fobReal: '9000', pMrg: '30' })],
  ];
  for (const [id, s] of casos) {
    const c = calcularAereo(s);
    const r = resultadoAereo(s, c);
    const suma = r.desglose.reduce((t, f) => t + f.valor, 0);
    ok(r.desglose.every((f) => Number.isInteger(f.valor)), `${id}: el desglose tiene que venir en dólares enteros`);
    ok(suma === Math.round(r.precio), `${id}: el desglose suma ${suma} y el precio redondeado es ${Math.round(r.precio)}`);
    // Cada fila redondeada queda a menos de un dólar de su valor exacto.
    const exactas = s.mode === 'personal'
      ? [c.fobR, c.fleteR + c.segR, c.derR + c.tasR + c.ganR + c.iibbR, c.gasR, c.gananciaNeta, c.ivaVentaMonto]
      : [c.fobC, c.fleteC + c.segC, c.derC + c.tasC + c.ivaC + c.ivaAC + c.ganC + c.iibbC, c.gasC, c.honorarios, ...(c.gastFac > 0 ? [c.gastFac] : [])];
    ok(exactas.length === r.desglose.length && r.desglose.every((f, i) => Math.abs(f.valor - exactas[i]) < 1), `${id}: alguna fila del desglose se alejó un dólar o más de su valor`);
    if (r.rentabilidad) {
      const margenes = r.rentabilidad.reduce((t, f) => t + f.margen, 0);
      igual(margenes, c.ganTotal, `${id}: los márgenes por concepto suman la ganancia`);
    }
    const precioEsperado = s.mode === 'personal' ? c.precioVentaFinal : (s.usaSociedadPropia ? c.precioSinF : c.precioConF);
    igual(r.precio, precioEsperado, `${id}: precio del panel`);
  }
  // Nunca importes con lo que falta: sin FOB o sin peso, no está listo.
  const sinPeso = con({ m3Input: '', pesoReal: '' });
  ok(!resultadoAereo(sinPeso, calcularAereo(sinPeso)).listo, 'sin m³ ni peso no tiene que estar listo');
  const sinFob = con({ fobCliente: '' });
  const rs = resultadoAereo(sinFob, calcularAereo(sinFob));
  ok(!rs.listo && rs.falta[0].ok === false && rs.falta[1].ok === true, 'sin FOB falta el FOB y el peso está');
  // repartirRedondeo: casos chicos a mano.
  ok(JSON.stringify(repartirRedondeo([0.4, 0.4, 0.4], 1.2)) === JSON.stringify([1, 0, 0]), 'repartir 0,4 × 3');
  ok(JSON.stringify(repartirRedondeo([10.6, 10.6, 0], 21.2)) === JSON.stringify([10, 11, 0]), 'repartir 10,6 + 10,6 (empate: la primera)');
  ok(JSON.stringify(repartirRedondeo([10.4, 20.7, 5], 36.1)) === JSON.stringify([10, 21, 5]), 'repartir sin diferencia');
  ok(JSON.stringify(repartirRedondeo([0, 0], 0)) === JSON.stringify([0, 0]), 'repartir ceros');
});

// ── salida ────────────────────────────────────────────────────────────────────
for (const g of grupos) console.log(`${g.ok ? 'ok   ' : 'FALLA'} ${g.nombre} (${g.n} verificaciones)`);
if (fallas.length) {
  console.log(`\nFALLA: ${fallas.length} de ${total} verificaciones.`);
  for (const f of fallas.slice(0, 60)) console.log(`  - ${f}`);
  if (fallas.length > 60) console.log(`  … y ${fallas.length - 60} más`);
  process.exit(1);
}
console.log(`\nOK: ${total} verificaciones del cobro automático aéreo.`);
