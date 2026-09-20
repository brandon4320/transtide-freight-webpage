#!/usr/bin/env node
// Prueba del COBRO AUTOMÁTICO del cotizador marítimo (calculo-maritimo.js).
//
//   node scripts/cotizador-auto-maritimo.mjs      sale con 1 si alguna aserción falla
//
// Con s.cobroAuto === 1 un cobro vacío vale su costo por (1 + recargo / 100) y el
// FOB que te cuesta vacío vale el FOB cliente (sin recargo). Un valor cargado,
// incluido '0', se usa tal cual. migrarSnapshotMaritimo lleva un snapshot de antes
// (sin la marca) al formato nuevo sin mover su precio: lo prueba contra la línea
// base de la prueba de oro (scripts/cotizador-golden.json), que NO se toca.
//
// Empaqueta calculo-maritimo.js con esbuild a un temporal y congela la fecha en
// 2026-09-19 12:00 hora local, igual que scripts/cotizador-golden.mjs.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = join(RAIZ, 'app/gestion/cotizador/calculo-maritimo.js');
const ESCENARIOS = JSON.parse(readFileSync(join(RAIZ, 'scripts/cotizador-escenarios.json'), 'utf8')).maritimo;
const BASE = JSON.parse(readFileSync(join(RAIZ, 'scripts/cotizador-golden.json'), 'utf8')).maritimo;

// ── fecha congelada (el documento lleva la fecha de hoy) ──────────────────────
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

// ── empaquetar ────────────────────────────────────────────────────────────────
async function empaquetar(dest) {
  const opciones = { bundle: true, format: 'esm', platform: 'node', outdir: dest, outExtension: { '.js': '.mjs' }, logLevel: 'error' };
  let esbuild = null;
  try {
    const mod = await import('esbuild');
    esbuild = mod.build ? mod : mod.default;
  } catch { /* no está en el proyecto: npx */ }
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

const tmp = mkdtempSync(join(tmpdir(), 'cotizador-auto-mar-'));
let M;
try {
  await empaquetar(tmp);
  M = await import(pathToFileURL(join(tmp, 'calculo-maritimo.mjs')).href);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
const { calcularMaritimo, htmlClienteMaritimo, migrarSnapshotMaritimo, efectivosMaritimo, desgloseMaritimo, resultadoMaritimo } = M;
const n = (v) => parseFloat(v) || 0; // igual que n() de impresion.js

// ── aserciones ────────────────────────────────────────────────────────────────
let total = 0;
const fallas = [];
const cerca = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
function ok(cond, msg) {
  total++;
  if (!cond) fallas.push(msg);
}
function igual(actual, esperado, msg) {
  const bien = typeof esperado === 'number' && typeof actual === 'number' ? cerca(actual, esperado) : actual === esperado;
  ok(bien, `${msg}: esperado ${esperado}, actual ${actual}`);
}
const decodificar = (v) => (v && typeof v === 'object' && '$num' in v ? Number(v.$num) : v);
const clon = (x) => structuredClone(x);
const qFmt = (v) => '$ ' + (Math.round((parseFloat(v) || 0) * 100) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Escenario base: m02 (40 HQ, 15 de 60 m³, cobros cargados) con la marca nueva.
const m02 = ESCENARIOS.find((e) => e.id === 'm02').s;
const auto = (cambios) => ({ ...clon(m02), cobroAuto: 1, markup: '', ...cambios });
const VACIOS = { fleteCli: '', gDes: '', gTer: '', gNav: '', gLog: '' };

// 1. Vacío vale el costo.
{
  const c = calcularMaritimo(auto({ ...VACIOS }));
  ok(c.fleteR > 0 && c.desR > 0, 'vacío: el escenario tiene costos prorrateados');
  igual(c.fleteC, c.fleteR, 'vacío: flete cobrado = flete real');
  igual(c.desC, c.desR, 'vacío: despachante cobrado = costo');
  igual(c.terC, c.terR, 'vacío: terminal cobrada = costo');
  igual(c.navC, c.navR, 'vacío: naviera cobrada = costo');
  igual(c.logC, c.logR, 'vacío: logística cobrada = costo');
  igual(c.mFlet, 0, 'vacío: margen de flete en cero');
  igual(c.mGas, 0, 'vacío: margen de gastos locales en cero');
  // undefined cuenta como vacío (un snapshot que no trae el campo).
  const sinCampos = auto({});
  for (const k of Object.keys(VACIOS)) delete sinCampos[k];
  const c2 = calcularMaritimo(sinCampos);
  igual(c2.precioConF, c.precioConF, 'undefined vale lo mismo que vacío');
}

// 2. Recargo del 10 % sobre las filas vacías (y solo sobre ellas).
{
  const c = calcularMaritimo(auto({ ...VACIOS, gTer: '999', markup: '10' }));
  igual(c.fleteC, c.fleteR * 1.1, 'recargo 10 %: flete');
  igual(c.desC, c.desR * 1.1, 'recargo 10 %: despachante');
  igual(c.navC, c.navR * 1.1, 'recargo 10 %: naviera');
  igual(c.logC, c.logR * 1.1, 'recargo 10 %: logística');
  igual(c.terC, 999, 'recargo 10 %: una fila cargada no lleva recargo');
  igual(c.mFlet, c.fleteR * 0.1, 'recargo 10 %: margen de flete = 10 % del costo');
  const sinRecargo = calcularMaritimo(auto({ ...VACIOS, gTer: '999', markup: '' }));
  ok(c.precioConF > sinRecargo.precioConF, 'recargo 10 %: el precio sube respecto de recargo vacío');
  const recargoCero = calcularMaritimo(auto({ ...VACIOS, gTer: '999', markup: '0' }));
  igual(recargoCero.precioConF, sinRecargo.precioConF, "recargo '0' vale lo mismo que vacío");
}

// 3. '0' explícito vale 0 (no toma el costo).
{
  const c = calcularMaritimo(auto({ ...VACIOS, fleteCli: '0', gDes: '0', markup: '10' }));
  igual(c.fleteC, 0, "'0' explícito: flete cobrado en cero");
  igual(c.desC, 0, "'0' explícito: despachante cobrado en cero");
  igual(c.mFlet, -c.fleteR, "'0' explícito: el margen de flete es el costo en negativo");
  igual(c.terC, c.terR * 1.1, "'0' explícito: las filas vacías siguen con recargo");
}

// 4. Un valor explícito se respeta, con y sin recargo.
{
  const c = calcularMaritimo(auto({ fleteCli: '1750.5', gDes: '640', gTer: '', markup: '25' }));
  igual(c.fleteC, 1750.5, 'explícito: flete tal cual');
  igual(c.desC, 640, 'explícito: despachante tal cual');
  igual(c.gasC, 640 + c.terR * 1.25 + c.navC + c.logC, 'explícito: los gastos suman lo cargado y lo automático');
  // El mismo valor con y sin la marca da lo mismo si no hay vacíos.
  const lleno = { fleteCli: '1750.5', gDes: '640', gTer: '700', gNav: '200', gLog: '550', fobReal: '18000' };
  const conMarca = calcularMaritimo(auto({ ...lleno, markup: '40' }));
  const sinMarca = calcularMaritimo({ ...clon(m02), ...lleno });
  igual(conMarca.precioConF, sinMarca.precioConF, 'explícito: sin vacíos la marca y el recargo no cambian el precio');
}

// 5. FOB que te cuesta vacío vale el FOB cliente, sin recargo.
{
  const c = calcularMaritimo(auto({ fobReal: '', markup: '10' }));
  igual(c.fobR, 20000, 'fobReal vacío: vale el FOB cliente');
  igual(c.mFOB, 0, 'fobReal vacío: margen de mercadería en cero');
  igual(c.fobDR, 20000, 'fobReal vacío: el declarado real lo hereda');
  const cero = calcularMaritimo(auto({ fobReal: '0' }));
  igual(cero.fobR, 0, "fobReal '0' explícito: vale cero");
  const viejo = calcularMaritimo({ ...clon(m02), fobReal: '' });
  igual(viejo.fobR, 0, 'fobReal vacío sin la marca: vale cero como antes');
  // Importación personal: el FOB visible es fobReal; vacío sigue al FOB cliente.
  const personal = calcularMaritimo(auto({ mode: 'personal', fobReal: '', fobCliente: '40000' }));
  igual(personal.fobR, 40000, 'personal: fobReal vacío sigue al FOB cliente');
}

// 6. Cada escenario de la línea base, migrado, da el MISMO precio y el mismo c y HTML.
{
  let conVacios = 0;
  for (const { id, s } of ESCENARIOS) {
    const original = clon(s);
    const migrado = migrarSnapshotMaritimo(s);
    ok(JSON.stringify(s) === JSON.stringify(original), `${id}: migrar no muta el snapshot`);
    igual(migrado.cobroAuto, 1, `${id}: el migrado lleva cobroAuto 1`);
    for (const k of ['fleteCli', 'gDes', 'gTer', 'gNav', 'gLog', 'fobReal']) {
      const antes = s[k];
      if (antes === '' || antes === undefined) igual(migrado[k], '0', `${id}: ${k} vacío pasa a '0'`);
      else igual(migrado[k], antes, `${id}: ${k} cargado queda igual`);
    }
    const base = BASE[id];
    ok(!!base, `${id}: tiene línea base`);
    if (!base) continue;
    const c = calcularMaritimo(clon(migrado));
    igual(c.precioConF, decodificar(base.c.precioConF), `${id}: precioConF migrado = línea base`);
    igual(c.precioSinF, decodificar(base.c.precioSinF), `${id}: precioSinF migrado = línea base`);
    const distintas = Object.entries(base.c).filter(([k, v]) => {
      const e = decodificar(v);
      return typeof e === 'number' ? !cerca(c[k], e) : c[k] !== e;
    }).map(([k]) => k);
    ok(distintas.length === 0, `${id}: c migrado = línea base (difieren: ${distintas.join(', ')})`);
    ok(htmlClienteMaritimo({ s: clon(migrado), c }) === base.html, `${id}: HTML del cliente migrado = línea base`);
    // Migrar dos veces no cambia nada.
    ok(JSON.stringify(migrarSnapshotMaritimo(migrado)) === JSON.stringify(migrado), `${id}: migrar es idempotente`);
    if (['fleteCli', 'gDes', 'gTer', 'gNav', 'gLog', 'fobReal'].some((k) => s[k] === '' || s[k] === undefined)) conVacios++;
  }
  ok(conVacios >= 3, `hay escenarios con cobros vacíos para que la migración importe (${conVacios})`);
  // Sin migrar, el escenario de cobros vacíos cambia de precio con la marca: la
  // migración es la que lo protege.
  const m21 = ESCENARIOS.find((e) => e.id === 'm21').s;
  const sinMigrar = calcularMaritimo({ ...clon(m21), cobroAuto: 1 });
  ok(!cerca(sinMigrar.precioConF, decodificar(BASE.m21.c.precioConF)), 'm21: sin migrar, la marca sí cambia el precio');
  // Cotización vieja con FOB cliente y "FOB que te cuesta" vacío (ningún escenario
  // de la línea base lo tiene): al migrar conserva el precio y el margen de antes.
  const viejo = { ...clon(m02), fobReal: '', fleteCli: '', gLog: '' };
  delete viejo.gNav; // un campo que el snapshot ni trae
  const antes = calcularMaritimo(clon(viejo));
  const despues = calcularMaritimo(migrarSnapshotMaritimo(viejo));
  igual(despues.precioConF, antes.precioConF, 'viejo con fobReal vacío: el precio no cambia al migrar');
  igual(despues.ganTotal, antes.ganTotal, 'viejo con fobReal vacío: la ganancia no cambia al migrar');
  igual(despues.fobR, 0, 'viejo con fobReal vacío: el FOB que te cuesta sigue en cero');
  igual(migrarSnapshotMaritimo(viejo).gNav, '0', 'viejo sin el campo: el cobro que falta pasa a 0');
  // Un snapshot que ya tiene la marca vuelve igual (copia nueva).
  const ya = auto({ ...VACIOS, markup: '10' });
  const deNuevo = migrarSnapshotMaritimo(ya);
  ok(deNuevo !== ya && JSON.stringify(deNuevo) === JSON.stringify(ya), 'con cobroAuto 1: migrar devuelve una copia igual (no toca los vacíos)');
}

// 7. efectivos: lo que viaja al servidor, en texto.
{
  const c = calcularMaritimo(auto({ ...VACIOS, fobReal: '', gDes: '700', markup: '10' }));
  const ef = efectivosMaritimo(c);
  const claves = ['fleteCli', 'gDes', 'gTer', 'gNav', 'gLog', 'fobReal'];
  ok(JSON.stringify(Object.keys(ef).sort()) === JSON.stringify([...claves].sort()), `efectivos: claves ${Object.keys(ef).join(', ')}`);
  ok(Object.values(ef).every((v) => typeof v === 'string'), 'efectivos: todos en texto');
  igual(Number(ef.fleteCli), c.fleteC, 'efectivos: flete');
  igual(Number(ef.gDes), 700, 'efectivos: despachante cargado');
  igual(Number(ef.gTer), c.terR * 1.1, 'efectivos: terminal automática');
  igual(Number(ef.fobReal), 20000, 'efectivos: FOB que te cuesta = FOB cliente');
  // El ciclo: calcular con { ...crudo, efectivos } da lo mismo que con el crudo.
  const crudo = auto({ ...VACIOS, fobReal: '', gDes: '700', markup: '10' });
  const conEf = calcularMaritimo({ ...crudo, efectivos: ef });
  igual(conEf.precioConF, c.precioConF, 'efectivos: el cálculo los ignora (sin ciclo)');
  const raro = efectivosMaritimo({ ...c, fleteC: NaN, desC: Infinity });
  ok(raro.fleteCli === '0' && raro.gDes === '0', 'efectivos: un no finito viaja como 0');
}

// 8. Documento del cliente con cobro automático: el flete efectivo, nunca $ 0,00.
{
  const s = auto({ ...VACIOS, markup: '10' });
  const c = calcularMaritimo(s);
  const html = htmlClienteMaritimo({ s, c });
  ok(c.fleteC > 0 && html.includes(qFmt(c.fleteC)), `HTML: el flete va con su valor efectivo (${qFmt(c.fleteC)})`);
  ok(html.includes(qFmt(c.fleteC + c.segC)), 'HTML: el cronograma usa flete efectivo más seguro');
  ok(html.includes(qFmt(c.precioConF)), 'HTML: el precio con factura está en el documento');
  ok(html.includes(qFmt(c.desC)), 'HTML: el despachante automático está en gastos locales');
}

// 9. El desglose del panel suma el precio (exacto y en dólares enteros).
{
  const casos = [
    ...ESCENARIOS.map(({ id, s }) => [id, migrarSnapshotMaritimo(s)]),
    ['auto-vacios', auto({ ...VACIOS, markup: '12.5' })],
    ['auto-sociedad-cliente', auto({ ...VACIOS, usaSociedadPropia: true })],
    ['auto-sin-facturacion', auto({ ...VACIOS, pFac: '0' })],
  ];
  for (const [id, s] of casos) {
    const c = calcularMaritimo(clon(s));
    const filas = desgloseMaritimo(c);
    const suma = filas.reduce((a, f) => a + f.valor, 0);
    const precio = s.usaSociedadPropia ? c.precioSinF : c.precioConF;
    ok(Math.abs(suma - precio) <= 1e-6 * Math.max(1, Math.abs(precio)), `${id}: el desglose suma el precio (${suma} vs ${precio})`);
    ok(filas.some((f) => f.label === 'Facturación') === c.gastFac > 0, `${id}: Facturación aparece solo si hay`);
    const redondos = desgloseMaritimo(c, { enteros: true });
    const sumaRedonda = redondos.reduce((a, f) => a + f.valor, 0);
    igual(sumaRedonda, Math.round(precio), `${id}: en dólares enteros también suma el precio`);
    ok(redondos.every((f, i) => Number.isInteger(f.valor) && Math.abs(f.valor - filas[i].valor) < 1), `${id}: cada renglón se aparta menos de un dólar`);
    // Importación personal: costo sin IVA por rubro + ganancia + IVA de la venta.
    const pers = desgloseMaritimo(c, { personal: true });
    const sumaPers = pers.reduce((a, f) => a + f.valor, 0);
    ok(Math.abs(sumaPers - c.precioVentaFinal) <= 1e-6 * Math.max(1, c.precioVentaFinal), `${id}: el desglose personal suma el precio de venta (${sumaPers} vs ${c.precioVentaFinal})`);
    const persRedondo = desgloseMaritimo(c, { personal: true, enteros: true }).reduce((a, f) => a + f.valor, 0);
    igual(persRedondo, Math.round(c.precioVentaFinal), `${id}: el desglose personal en enteros suma el precio de venta`);
  }
}

// 10. resultadoMaritimo: lo que muestra el panel de la pantalla.
{
  // Formulario vacío: no está listo y dice qué falta (no hay importes que mostrar).
  const vacioS = migrarSnapshotMaritimo(clon(ESCENARIOS.find((e) => e.id === 'm01').s));
  const r0 = resultadoMaritimo(vacioS, calcularMaritimo(vacioS));
  ok(r0.listo === false, 'panel vacío: no está listo');
  ok(JSON.stringify(r0.falta.map((f) => [f.label, f.ok])) === JSON.stringify([['FOB de la mercadería', false], ['Metros cúbicos de la carga', false]]),
    `panel vacío: faltan FOB y metros cúbicos (${JSON.stringify(r0.falta)})`);
  // Con FOB y sin m³: falta solo el volumen.
  const sinM3 = auto({ m3Merch: '' });
  const r1 = resultadoMaritimo(sinM3, calcularMaritimo(sinM3));
  ok(!r1.listo && r1.falta[0].ok && !r1.falta[1].ok, 'panel: con FOB y sin m³ falta solo el volumen');
  // Alguien borró los m³ del contenedor: no hay prorrateo y se pide.
  const sinCont = auto({ contM3: { ...m02.contM3, [m02.contType]: '' } });
  const r2 = resultadoMaritimo(sinCont, calcularMaritimo(sinCont));
  ok(!r2.listo && r2.falta.some((f) => f.label === 'Metros cúbicos del contenedor' && !f.ok), 'panel: sin m³ del contenedor no está listo');
  // Importación personal: el FOB que cuenta es el que te cuesta (vacío, el FOB cliente).
  const pers = auto({ mode: 'personal', fobReal: '', fobCliente: '' });
  ok(!resultadoMaritimo(pers, calcularMaritimo(pers)).falta[0].ok, 'panel personal: sin ningún FOB falta el FOB');
  const pers2 = auto({ mode: 'personal', fobReal: '9000', fobCliente: '' });
  ok(resultadoMaritimo(pers2, calcularMaritimo(pers2)).listo, 'panel personal: con el FOB que te cuesta está listo');

  // Cada escenario de la línea base, migrado: mismo precio, desglose que suma y
  // márgenes que explican la ganancia.
  for (const { id, s: s0 } of ESCENARIOS) {
    const s = migrarSnapshotMaritimo(clon(s0));
    const c = calcularMaritimo(clon(s));
    const r = resultadoMaritimo(s, c);
    const personal = s.mode === 'personal';
    const propia = !!s.usaSociedadPropia;
    const base = BASE[id].c;
    const precioBase = decodificar(personal ? base.precioVentaFinal : propia ? base.precioSinF : base.precioConF);
    igual(r.precio, precioBase, `${id}: el precio del panel es el de la línea base`);
    igual(r.desglose.reduce((a, f) => a + f.valor, 0), Math.round(r.precio), `${id}: el desglose del panel suma el precio que se ve`);
    ok(r.desglose.every((f) => Number.isInteger(f.valor)), `${id}: el desglose va en dólares enteros`);
    if (personal) {
      ok(r.rentabilidad === null && r.precioSinFactura === null, `${id}: personal sin rentabilidad ni "Sin factura"`);
      igual(r.ganancia, c.gananciaNeta, `${id}: personal, ganancia neta`);
      igual(r.costo, c.totSinR, `${id}: personal, costo real sin IVA`);
      if (c.totSinR > 0) igual(r.gananciaPct, n(s.pMrg), `${id}: personal, la ganancia es el margen sobre el costo`);
      // "Ver costos por concepto": el detalle real tiene que sumar "Tu costo".
      // El IVA y el IVA adicional van aparte (crédito fiscal, no costo).
      const detalle = r.costosPorConcepto.reduce((a, f) => a + f.costo, 0);
      ok(Math.abs(detalle - c.totSinR) < 0.1, `${id}: personal, los costos por concepto suman tu costo (${detalle} vs ${c.totSinR})`);
      ok(r.costosPorConcepto.every((f) => !/IVA/.test(f.label)), `${id}: personal, el IVA no va como costo`);
      igual(r.ivaCredito, c.ivaR + c.ivaAR, `${id}: personal, el IVA del despacho se informa aparte`);
      continue;
    }
    igual(r.ganancia, c.ganTotal, `${id}: tu ganancia = ganTotal`);
    igual(r.costo, c.totConR, `${id}: tu costo = costo real con IVA`);
    if (r.precio > 0) igual(r.gananciaPct, (c.ganTotal / r.precio) * 100, `${id}: % de ganancia sobre el precio`);
    ok((r.precioSinFactura !== null) === (!propia && c.gastFac > 0), `${id}: "Sin factura" solo con la sociedad de Transtide y facturación`);
    // Los márgenes por concepto suman EXACTO la ganancia: los renglones que
    // ganTotal no cuenta (el seguro, el FOB declarado) van con margen null.
    const sumaMargenes = r.rentabilidad.reduce((a, f) => a + (f.margen ?? 0), 0);
    ok(Math.abs(sumaMargenes - c.ganTotal) < 0.1, `${id}: los márgenes suman la ganancia (${sumaMargenes} vs ${c.ganTotal})`);
    ok(r.rentabilidad.every((f) => f.label !== 'Seguro' || f.margen === null), `${id}: el seguro va sin margen`);
    ok(r.rentabilidad.some((f) => f.label === 'Impuestos (los paga el cliente)') === (propia && r.rentabilidad.some((f) => f.label.startsWith('Impuestos'))),
      `${id}: con la sociedad del cliente los impuestos van en un renglón`);
    ok(!propia || r.rentabilidad.every((f) => !['Derechos', 'IVA'].includes(f.label)), `${id}: con la sociedad del cliente no hay margen por arancel`);
    ok(r.rentabilidad.every((f) => f.label !== 'Facturación'), `${id}: la facturación no es margen`);
  }

  // Cobro automático en el panel: vacío con recargo sube la ganancia en el recargo.
  const conRec = auto({ ...VACIOS, markup: '10' });
  const cRec = calcularMaritimo(conRec);
  const rRec = resultadoMaritimo(conRec, cRec);
  const flete = rRec.rentabilidad.find((f) => f.label === 'Flete marítimo');
  igual(flete.cobro, cRec.fleteR * 1.1, 'panel: el flete cobrado es el efectivo (costo con recargo)');
  igual(flete.margen, cRec.fleteR * 0.1, 'panel: el margen de flete es el recargo');
}

if (fallas.length) {
  console.log(`FALLA: ${fallas.length} de ${total} aserciones.`);
  for (const f of fallas) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`OK: ${total} aserciones del cobro automático marítimo (${ESCENARIOS.length} escenarios migrados contra la línea base).`);
