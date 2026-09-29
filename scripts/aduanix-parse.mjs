#!/usr/bin/env node
// Prueba del lector de resultados de Aduanix.
//
//   node scripts/aduanix-parse.mjs     sale con 1 si alguna aserción falla
//
// Los textos son copias reales de la pantalla del clasificador
// (aduanix.com.ar/app/clasificador) con la pestaña Tributos abierta, y también
// el caso en que el usuario copia sin abrirla.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'aduanix-'));
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
execFileSync(npx, ['--yes', 'esbuild', join(RAIZ, 'app/gestion/cotizador/aduanix-parse.js'),
  '--bundle', '--format=esm', '--platform=node', `--outdir=${tmp}`, '--out-extension:.js=.mjs', '--log-level=error'],
  { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'] });
const { leerAduanix } = await import(pathToFileURL(join(tmp, 'aduanix-parse.mjs')).href);

let total = 0; const fallas = [];
const ok = (cond, msg) => { total++; if (!cond) fallas.push(msg); };
const igual = (a, b, msg) => ok(a === b, `${msg}: esperado ${b}, actual ${a}`);

// ── 1. copia completa con la pestaña Tributos abierta (tabulaciones) ─────────
const CON_TRIBUTOS = `‹
Aduanix
IA APLICADA AL COMERCIO EXTERIOR
HERRAMIENTAS
Clasificador NCM
Revisor de documentos
RECIENTES
Caja fuerte de acero con…
8303.00.00.900U
29/09 10:32
CLASIFICACIÓN COMPLETADA
APERTURA SIM
8303.00.00.900U
POSICIÓN NCM
8303.00.00
PRODUCTO
Caja fuerte de acero con cerradura electronica, 60 kg, para uso domestico
Confianza
93%
Importación
Resumen	Tributos	Intervenciones	Dumping
TRIBUTO	VALOR
Derecho de importación extrazona (DIE)	16.00%
Arancel externo común (AEC)	16.00%
Derecho de importación intrazona (DII)	0.00%
Tasa estadística (TE)	3.00%
IVA	21.00%
IVA adicional	20.00%
Percepción ganancias	6.00%
Percepción IIBB	2.5%
Los resultados son orientativos y deben ser validados por un despachante de aduana habilitado.`;

{
  const r = leerAduanix(CON_TRIBUTOS);
  igual(r.ncm, '8303.00.00', 'posición NCM');
  igual(r.sim, '8303.00.00.900U', 'apertura SIM');
  igual(r.der, 16, 'derechos (extrazona)');
  igual(r.tasa, 3, 'tasa estadística');
  igual(r.iva, 21, 'IVA');
  igual(r.ivaAdic, 20, 'IVA adicional');
  igual(r.ganancias, 6, 'percepción Ganancias');
  igual(r.iibb, 2.5, 'percepción IIBB');
  igual(r.confianza, 93, 'confianza');
  ok(/caja fuerte/i.test(r.producto), `producto: ${r.producto}`);
  igual(r.falta.length, 0, 'no falta nada');
  ok(r.sirve, 'el resultado sirve');
}

// ── 2. misma copia pero con el valor en la línea de abajo del rótulo ─────────
const EN_DOS_LINEAS = `APERTURA SIM
8471.30.12.100B
POSICIÓN NCM
8471.30.12
TRIBUTO
VALOR
Derecho de importación extrazona (DIE)
0.00%
Tasa estadística (TE)
0.00%
IVA
10.50%
IVA adicional
10.00%
Percepción ganancias
6.00%
Percepción IIBB
2,5 %`;
{
  const r = leerAduanix(EN_DOS_LINEAS);
  igual(r.ncm, '8471.30.12', 'dos líneas: NCM');
  igual(r.der, 0, 'dos líneas: derechos en cero');
  igual(r.iva, 10.5, 'dos líneas: IVA con decimales');
  igual(r.ivaAdic, 10, 'dos líneas: IVA adicional');
  igual(r.iibb, 2.5, 'dos líneas: IIBB con coma');
}

// ── 3. copia sin abrir Tributos: trae la posición pero no las alícuotas ──────
const SIN_TRIBUTOS = `CLASIFICACIÓN COMPLETADA
APERTURA SIM
8303.00.00.900U
POSICIÓN NCM
8303.00.00
PRODUCTO
Caja fuerte de acero
Confianza
93%
ANTIDUMPING
Sin medidas vigentes
INTERVENCIONES DETECTADAS
CONDICIONALES / A VERIFICAR
SENASA — Embalajes de Madera de Importación (NIMF N° 15)
Trámite: Declaración Jurada de Embalajes de madera de importación`;
{
  const r = leerAduanix(SIN_TRIBUTOS);
  igual(r.ncm, '8303.00.00', 'sin tributos: igual trae la posición');
  igual(r.der, null, 'sin tributos: no inventa derechos');
  ok(r.falta.includes('derechos'), 'sin tributos: avisa que faltan los derechos');
  ok(r.intervenciones.some(i => /SENASA/.test(i)), `sin tributos: detecta la intervención (${r.intervenciones.join(' | ')})`);
  igual(r.dumping, 'Sin medidas vigentes', 'sin tributos: lee antidumping');
  ok(r.sirve, 'sin tributos: igual sirve para completar la posición');
}

// ── 4. texto que no es de Aduanix ───────────────────────────────────────────
{
  const r = leerAduanix('hola, esto no tiene nada que ver');
  ok(!r.sirve, 'texto ajeno: no sirve');
  igual(r.ncm, '', 'texto ajeno: sin NCM');
  const vacio = leerAduanix('');
  ok(!vacio.sirve, 'vacío: no sirve');
}

rmSync(tmp, { recursive: true, force: true });
if (fallas.length) {
  console.log(`FALLA: ${fallas.length} de ${total} aserciones.`);
  for (const f of fallas) console.log('  - ' + f);
  process.exit(1);
}
console.log(`OK: ${total} aserciones del lector de Aduanix.`);
