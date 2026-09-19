#!/usr/bin/env node
// Prueba de oro del Cotizador: congela los números (el objeto `c`) y el HTML que ve
// el cliente, para que ningún rediseño de pantalla cambie una cotización.
//
//   node scripts/cotizador-golden.mjs               compara contra la línea base (sale con 1 si algo difiere)
//   node scripts/cotizador-golden.mjs --actualizar  reescribe la línea base
//
// --actualizar se usó UNA vez, en la fase Base (código de la REFERENCIA cd07d4e). Después
// está PROHIBIDO: si la prueba falla, el que cambió es el código, no la línea base.
//
// Cómo funciona:
//  1. Empaqueta app/gestion/cotizador/calculo-maritimo.js y calculo-aereo.js con esbuild
//     a un directorio temporal (son puros: sin React).
//  2. Congela la fecha con una subclase de Date fija en 2026-09-19 12:00 hora local
//     (el documento lleva la fecha de hoy y el cronograma cuenta días desde hoy).
//  3. Para cada escenario de scripts/cotizador-escenarios.json (un snapshot completo de
//     serialize()) corre calcular*(s) y htmlCliente*({ s, c }) y compara con
//     scripts/cotizador-golden.json:
//       - c: TODAS las claves de la línea base tienen que estar y valer lo mismo
//         (números con tolerancia relativa 1e-9, absoluta 1e-9 por debajo de 1;
//         booleanos y textos exactos). Una clave NUEVA en c se informa pero no falla:
//         agregar valores a c está permitido, cambiar los que ya estaban no.
//       - HTML del cliente: igualdad exacta, byte a byte.
//     Un escenario sin línea base, o una línea base sin escenario, también es falla.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(RAIZ, 'app/gestion/cotizador');
const ARCH_ESCENARIOS = join(RAIZ, 'scripts/cotizador-escenarios.json');
const ARCH_BASE = join(RAIZ, 'scripts/cotizador-golden.json');
const ACTUALIZAR = process.argv.includes('--actualizar');
const TOL = 1e-9;

// ── 1. fecha congelada ────────────────────────────────────────────────────────
const FechaReal = Date;
const FIJO = new FechaReal(2026, 8, 19, 12, 0, 0, 0).getTime(); // 19/09/2026 12:00, hora local
class FechaFija extends FechaReal {
  constructor(...args) {
    if (args.length === 0) super(FIJO);
    else super(...args);
  }
  static now() { return FIJO; }
}
globalThis.Date = FechaFija;

// ── 2. empaquetar los módulos de cálculo ──────────────────────────────────────
async function empaquetar(dest) {
  const entradas = [join(DIR, 'calculo-maritimo.js'), join(DIR, 'calculo-aereo.js')];
  const opciones = { bundle: true, format: 'esm', platform: 'node', outdir: dest, outExtension: { '.js': '.mjs' }, logLevel: 'error' };
  let esbuild = null;
  try {
    const mod = await import('esbuild');
    esbuild = mod.build ? mod : mod.default;
  } catch { /* no está instalado en el proyecto: se usa npx */ }
  if (esbuild && esbuild.build) {
    await esbuild.build({ entryPoints: entradas, ...opciones });
    return;
  }
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  try {
    execFileSync(npx, ['--yes', 'esbuild', ...entradas, '--bundle', '--format=esm', '--platform=node',
      `--outdir=${dest}`, '--out-extension:.js=.mjs', '--log-level=error'], { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    console.error('No se pudo empaquetar con esbuild:\n' + String(e.stderr || e.message));
    process.exit(2);
  }
}

// ── números no finitos: JSON no los guarda, se codifican ─────────────────────
const codificar = (c) => Object.fromEntries(Object.entries(c).map(([k, v]) =>
  [k, typeof v === 'number' && !Number.isFinite(v) ? { $num: String(v) } : v]));
const decodificar = (v) => (v && typeof v === 'object' && '$num' in v ? Number(v.$num) : v);

function mismoValor(esperado, actual) {
  if (typeof esperado === 'number' && typeof actual === 'number') {
    if (Object.is(esperado, actual) || esperado === actual) return true;
    if (Number.isNaN(esperado) || Number.isNaN(actual)) return Number.isNaN(esperado) && Number.isNaN(actual);
    if (!Number.isFinite(esperado) || !Number.isFinite(actual)) return false;
    return Math.abs(esperado - actual) <= TOL * Math.max(1, Math.abs(esperado), Math.abs(actual));
  }
  return esperado === actual;
}

function primeraDiferencia(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const ctx = (t) => JSON.stringify(t.slice(Math.max(0, i - 70), i + 70));
  return `primera diferencia en el carácter ${i} (largo base ${a.length}, actual ${b.length})\n`
    + `        base  : ${ctx(a)}\n        actual: ${ctx(b)}`;
}

// ── 3. correr ─────────────────────────────────────────────────────────────────
const escenarios = JSON.parse(readFileSync(ARCH_ESCENARIOS, 'utf8'));
const tmp = mkdtempSync(join(tmpdir(), 'cotizador-golden-'));
let mar, aer;
try {
  await empaquetar(tmp);
  mar = await import(pathToFileURL(join(tmp, 'calculo-maritimo.mjs')).href);
  aer = await import(pathToFileURL(join(tmp, 'calculo-aereo.mjs')).href);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
const MODOS = {
  maritimo: { calcular: mar.calcularMaritimo, html: mar.htmlClienteMaritimo },
  aereo: { calcular: aer.calcularAereo, html: aer.htmlClienteAereo },
};

const actual = {};
for (const modo of Object.keys(MODOS)) {
  actual[modo] = {};
  for (const { id, s } of escenarios[modo]) {
    if (actual[modo][id]) throw new Error(`escenario repetido: ${modo}/${id}`);
    const c = MODOS[modo].calcular(structuredClone(s));
    const html = MODOS[modo].html({ s: structuredClone(s), c });
    actual[modo][id] = { c, html };
  }
}

if (ACTUALIZAR) {
  const salida = {
    _nota: 'Línea base de la prueba de oro del Cotizador (node scripts/cotizador-golden.mjs). '
      + 'Generada con --actualizar en la fase Base, con el código de la REFERENCIA cd07d4e. No la regeneres.',
  };
  for (const modo of Object.keys(MODOS)) {
    salida[modo] = {};
    for (const [id, r] of Object.entries(actual[modo])) salida[modo][id] = { c: codificar(r.c), html: r.html };
  }
  writeFileSync(ARCH_BASE, JSON.stringify(salida, null, 1) + '\n');
  const n = Object.keys(MODOS).map((m) => `${Object.keys(actual[m]).length} ${m}`).join(', ');
  console.log(`Línea base reescrita en scripts/cotizador-golden.json (${n}).`);
  process.exit(0);
}

let base;
try { base = JSON.parse(readFileSync(ARCH_BASE, 'utf8')); } catch (e) {
  console.error(`No pude leer la línea base (${ARCH_BASE}): ${e.message}`);
  process.exit(1);
}

const fallas = [];
const avisos = [];
for (const modo of Object.keys(MODOS)) {
  const b = base[modo] || {};
  for (const id of Object.keys(b)) if (!actual[modo][id]) fallas.push(`${modo}/${id}: está en la línea base pero no en los escenarios`);
  for (const [id, r] of Object.entries(actual[modo])) {
    const esperado = b[id];
    if (!esperado) { fallas.push(`${modo}/${id}: escenario sin línea base`); continue; }
    for (const [k, vb] of Object.entries(esperado.c)) {
      const ve = decodificar(vb);
      if (!(k in r.c)) fallas.push(`${modo}/${id}: c.${k} desapareció (base ${ve})`);
      else if (!mismoValor(ve, r.c[k])) fallas.push(`${modo}/${id}: c.${k} base ${ve} · actual ${r.c[k]}`);
    }
    const nuevas = Object.keys(r.c).filter((k) => !(k in esperado.c));
    if (nuevas.length) avisos.push(`${modo}: claves nuevas en c (permitidas): ${nuevas.join(', ')}`);
    if (esperado.html !== r.html) fallas.push(`${modo}/${id}: el HTML del cliente cambió — ${primeraDiferencia(esperado.html, r.html)}`);
  }
}

for (const a of [...new Set(avisos)]) console.log(`aviso: ${a}`);
const resumen = Object.keys(MODOS).map((m) => `${Object.keys(actual[m]).length} ${m === 'aereo' ? 'aéreos' : 'marítimos'}`).join(' y ');
if (fallas.length) {
  console.log(`FALLA: ${fallas.length} diferencia(s) contra la línea base (${resumen}).`);
  for (const f of fallas) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`OK: ${resumen} coinciden con la línea base (c completo y HTML del cliente).`);
