// Prueba de app/gestion/cotizador/numeros.js (lectura y formato de números es-AR).
// Uso: node scripts/cotizador-numeros.mjs  → sale con código 1 si algo falla.
//
// Empaqueta numeros.js con esbuild a un temporal (el módulo es ESM puro dentro
// de una app Next) y lo importa desde ahí.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const fuente = join(raiz, 'app/gestion/cotizador/numeros.js');
const dir = mkdtempSync(join(tmpdir(), 'cotizador-numeros-'));
const salida = join(dir, 'numeros.mjs');

let mod;
try {
  execFileSync('npx', ['--yes', 'esbuild', fuente, '--bundle', '--format=esm', '--platform=neutral', '--log-level=error', `--outfile=${salida}`], {
    cwd: raiz,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, npm_config_loglevel: 'error' }, // sin avisos de npm en la salida
  });
  mod = await import(pathToFileURL(salida).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
const { parseNum, fmtNum, fmtUSD, fmtPct, aNumero } = mod;

let fallas = 0;
let total = 0;
const ver = (nombre, obtenido, esperado) => {
  total++;
  if (Object.is(obtenido, esperado)) return;
  fallas++;
  console.error(`FALLA  ${nombre}\n       esperado ${JSON.stringify(esperado)}\n       obtenido ${JSON.stringify(obtenido)}`);
};

// ── casos del contrato ──────────────────────────────────────────────────────
const parseos = [
  ['53.000', 'dinero', '53000'],
  ['53000', 'dinero', '53000'],
  ['53.000,50', 'dinero', '53000.5'],
  ['1.500', 'dinero', '1500'],
  ['1.5', 'dinero', '1.5'],
  ['0.550', 'decimal', '0.55'],
  ['0.550', 'dinero', '0.55'],
  ['2,5', 'pct', '2.5'],
  ['2.5', 'pct', '2.5'],
  ['1.500.000', 'dinero', '1500000'],
  ['USD 1.234', 'dinero', '1234'],
  [' 35 % ', 'pct', '35'],
  ['', 'dinero', ''],
  ['0', 'dinero', '0'],
  ['-370', 'dinero', '-370'],
  ['abc', 'dinero', ''],
];
for (const [texto, tipo, esperado] of parseos) ver(`parseNum(${JSON.stringify(texto)}, '${tipo}')`, parseNum(texto, tipo), esperado);

const formatos = [
  ['53000', 'dinero', '53.000'],
  ['53000.5', 'dinero', '53.000,5'],
  ['2.5', 'pct', '2,5'],
  ['0.55', 'decimal', '0,55'],
  ['', 'dinero', ''],
];
for (const [valor, tipo, esperado] of formatos) ver(`fmtNum(${JSON.stringify(valor)}, '${tipo}')`, fmtNum(valor, tipo), esperado);

ver('fmtUSD(71234.4)', fmtUSD(71234.4), 'USD 71.234');
ver('fmtUSD(NaN)', fmtUSD(NaN), '—');

// ── casos extra: lo que puede aparecer al pegar o al cargar estado viejo ────
const extraParseos = [
  ['U$S 1.500', 'dinero', '1500'],
  ['US$ 2.000,75', 'dinero', '2000.75'],
  ['$1.234,5', 'dinero', '1234.5'],
  ['53,000.50', 'dinero', '53000.5'],   // pegado en formato inglés
  ['1,234,567', 'dinero', '1234567'],   // varias comas: miles
  ['−370', 'dinero', '-370'],      // signo menos tipográfico
  ['+45', 'dinero', '45'],
  ['1 500', 'dinero', '1500'],     // espacio duro
  ['0,5', 'decimal', '0.5'],
  ['1.500', 'decimal', '1.5'],          // en m³ un punto solo es decimal
  ['1.500', 'pct', '1.5'],
  ['.550', 'dinero', '0.55'],
  ['53.', 'dinero', '53'],
  ['007', 'dinero', '7'],
  ['-0', 'dinero', '0'],
  ['-', 'dinero', ''],
  ['.', 'dinero', ''],
  ['1,2,3.4', 'dinero', '123.4'],
  ['1.2,3,4', 'dinero', ''],
  ['12abc', 'dinero', ''],
  [null, 'dinero', ''],
  [undefined, 'dinero', ''],
  [35, 'pct', '35'],
];
for (const [texto, tipo, esperado] of extraParseos) ver(`parseNum(${JSON.stringify(texto)}, '${tipo}')`, parseNum(texto, tipo), esperado);

// ── 'peso' (kg): agrupa miles como 'dinero' y admite 3 decimales ────────────
const pesos = [
  ['1.500', 'peso', '1500'],        // kg de cuatro cifras, no 1,5
  ['1.500', 'decimal', '1.5'],      // m³ y días siguen leyendo el punto como decimal
  ['12.000', 'peso', '12000'],
  ['1,5', 'peso', '1.5'],
  ['0.550', 'peso', '0.55'],
  ['1.500,25', 'peso', '1500.25'],
  ['300', 'peso', '300'],
  ['1.234.567', 'peso', '1234567'],
];
for (const [texto, tipo, esperado] of pesos) ver(`parseNum(${JSON.stringify(texto)}, '${tipo}')`, parseNum(texto, tipo), esperado);
const pesosFmt = [
  ['1500', 'peso', '1.500'],
  ['1.5', 'peso', '1,5'],
  ['1500.125', 'peso', '1.500,125'],
  ['300', 'peso', '300'],
];
for (const [valor, tipo, esperado] of pesosFmt) ver(`fmtNum(${JSON.stringify(valor)}, '${tipo}')`, fmtNum(valor, tipo), esperado);

const extraFormatos = [
  [35, 'pct', '35'],
  ['1500', 'dinero', '1.500'],
  ['1500', 'decimal', '1500'],
  ['1500.25', 'decimal', '1500,25'],
  ['0.1234', 'decimal', '0,123'],
  ['1.005', 'dinero', '1,01'],
  ['-370.5', 'dinero', '-370,5'],
  ['-0.001', 'dinero', '0'],
  ['1234567.891', 'dinero', '1.234.567,89'],
  ['abc', 'dinero', ''],
  [null, 'dinero', ''],
];
for (const [valor, tipo, esperado] of extraFormatos) ver(`fmtNum(${JSON.stringify(valor)}, '${tipo}')`, fmtNum(valor, tipo), esperado);

ver('fmtUSD(-1234.5)', fmtUSD(-1234.5), 'USD -1.235');
ver('fmtUSD(-0.4)', fmtUSD(-0.4), 'USD 0');
ver('fmtUSD(1234.5, { dec: 2 })', fmtUSD(1234.5, { dec: 2 }), 'USD 1.234,50');
ver("fmtUSD('')", fmtUSD(''), '—');
ver('fmtUSD(null)', fmtUSD(null), '—');
ver('fmtUSD(Infinity)', fmtUSD(Infinity), '—');
ver('fmtPct(2.5)', fmtPct(2.5), '2,5 %');
ver("fmtPct('')", fmtPct(''), '—');
ver("aNumero(' 12 ')", aNumero(' 12 '), 12);
ver("aNumero('')", aNumero(''), null);

// ── ida y vuelta: lo que se muestra se vuelve a leer igual ──────────────────
// El estado guarda el canónico; con foco el campo edita el texto formateado y
// al salir lo vuelve a leer: tiene que dar el mismo canónico. (parseNum es
// para texto tipeado: nunca se le pasa el canónico, que en 'dinero' puede
// parecer de miles, p. ej. '1234.567'.)
let semilla = 20260919;
const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
const muestras = [0, 1, 7, 10, 99, 100, 999, 1000, 1500, 9999, 53000, 123456, 1500000, 0.5, 0.55, 0.05, 1.5, 2.25, 12.345, 60, 33.333];
for (let i = 0; i < 400; i++) {
  const escala = [1, 10, 1000, 100000, 10000000][i % 5];
  muestras.push(Math.round(azar() * escala * 1000) / 1000);
}
for (const tipo of ['dinero', 'decimal', 'pct', 'peso']) {
  const dec = tipo === 'decimal' || tipo === 'peso' ? 3 : 2;
  for (const base of muestras) {
    for (const v of [base, -base]) {
      const canon = String(Number(v.toFixed(dec)));
      const texto = fmtNum(canon, tipo);
      ver(`ida y vuelta ${tipo} ${canon} → ${JSON.stringify(texto)}`, parseNum(texto, tipo), canon);
    }
  }
}

if (fallas) {
  console.error(`\n${fallas} de ${total} verificaciones fallaron.`);
  process.exit(1);
}
console.log(`numeros.js: ${total} verificaciones OK.`);
