#!/usr/bin/env node
// Evaluación del clasificador arancelario (/api/ai/clasificar).
//
// Uso:
//   node scripts/eval-clasificador/run-eval.mjs --dry
//       Solo valida eval-casos.json contra data/nomenclador.json (no llama a la API).
//
//   BASE_URL=https://xxx.vercel.app SESSION_COOKIE='__Secure-authjs.session-token=...' \
//     node scripts/eval-clasificador/run-eval.mjs [opciones]
//
// Variables de entorno:
//   BASE_URL          URL del deploy (sin barra final). Obligatoria salvo en --dry.
//   SESSION_COOKIE    Header Cookie completo de una sesión con acceso al cotizador.
//   VERCEL_BYPASS     (opcional) secreto de "Protection Bypass for Automation" del proyecto.
//   CONCURRENCY       (opcional) casos en paralelo, por defecto 2.
//   TIMEOUT_MS        (opcional) timeout por request, por defecto 90000.
//
// Opciones:
//   --dry                 valida el archivo de casos y sale.
//   --casos=ruta.json     otro archivo de casos.
//   --solo=id1,id2        corre solo esos casos.
//   --sin-preguntas       manda saltarPreguntas: true (mide la clasificación directa).
//   --out=resultado.json  guarda el detalle de cada caso.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(DIR, '..', '..')

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/)
  return m ? [m[1], m[2] ?? true] : [a, true]
}))

const soloDigitos = (c) => String(c || '').replace(/[^0-9]/g, '')
const formatear = (c) => { const d = soloDigitos(c); return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : d }
const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9ñ,. ]+/g, ' ').replace(/(\d)[,.](\d)/g, '$1_$2').replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim()

// ── carga ────────────────────────────────────────────────────────────────────
const archivoCasos = path.resolve(args.casos && args.casos !== true ? args.casos : path.join(DIR, 'eval-casos.json'))
const casosArchivo = JSON.parse(fs.readFileSync(archivoCasos, 'utf8'))
let casos = casosArchivo.casos || []
if (args.solo && args.solo !== true) {
  const ids = new Set(String(args.solo).split(','))
  casos = casos.filter((c) => ids.has(c.id))
}

function cargarNomenclador() {
  const datos = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'nomenclador.json'), 'utf8'))
  const porCodigo = new Map()
  for (const p of datos.posiciones) porCodigo.set(soloDigitos(p.c), p)
  return { version: datos.version, porCodigo }
}

// ── validación (--dry y antes de cada corrida) ───────────────────────────────
function validar(casos) {
  const { version, porCodigo } = cargarNomenclador()
  const errores = []
  const avisos = []
  const ids = new Set()
  const vigente = (c) => { const p = porCodigo.get(soloDigitos(c)); return p && p.n === 8 && !p.baja ? p : null }
  for (const c of casos) {
    const donde = `[${c.id || '(sin id)'}]`
    if (!c.id) errores.push(`${donde} falta id`)
    if (ids.has(c.id)) errores.push(`${donde} id repetido`)
    ids.add(c.id)
    if (!c.descripcion || String(c.descripcion).trim().length < 3) errores.push(`${donde} descripcion vacía o muy corta`)
    if (!c.atributos || typeof c.atributos !== 'object' || !Object.keys(c.atributos).length) errores.push(`${donde} faltan atributos`)
    if (!['alta', 'media'].includes(c.confianza)) errores.push(`${donde} confianza debe ser "alta" o "media" (los casos dudosos no van)`)
    const aceptables = [c.ncm_esperado, ...(c.alternativas_aceptables || [])]
    for (const cod of aceptables) {
      if (soloDigitos(cod).length !== 8) { errores.push(`${donde} ${cod} no tiene 8 dígitos`); continue }
      const p = porCodigo.get(soloDigitos(cod))
      if (!p) errores.push(`${donde} ${cod} no existe en el nomenclador`)
      else if (p.n !== 8) errores.push(`${donde} ${cod} no es un ítem de 8 dígitos`)
      else if (p.baja) errores.push(`${donde} ${cod} está dado de baja`)
    }
    for (const cod of c.confusion || []) {
      if (!vigente(cod)) errores.push(`${donde} confusión ${cod} no existe / no vigente en el nomenclador`)
      if (aceptables.some((a) => soloDigitos(a) === soloDigitos(cod))) errores.push(`${donde} ${cod} figura como aceptable y como confusión`)
    }
    if (!(c.confusion || []).length) avisos.push(`${donde} sin código de confusión`)
  }
  return { version, errores, avisos, porCodigo }
}

function imprimirValidacion(v, casos) {
  console.log(`Nomenclador: ${v.version}`)
  console.log(`Casos: ${casos.length} (alta: ${casos.filter((c) => c.confianza === 'alta').length}, media: ${casos.filter((c) => c.confianza === 'media').length})`)
  for (const a of v.avisos) console.log(`  aviso  ${a}`)
  for (const e of v.errores) console.log(`  ERROR  ${e}`)
  if (!v.errores.length) console.log('Validación OK: todos los códigos existen y están vigentes.')
}

const validacion = validar(casos)

if (args.dry) {
  imprimirValidacion(validacion, casos)
  console.log('')
  const filas = casos.map((c) => {
    const p = validacion.porCodigo.get(soloDigitos(c.ncm_esperado))
    return [c.id, formatear(c.ncm_esperado), c.confianza, (c.alternativas_aceptables || []).map(formatear).join(' ') || '-', (c.confusion || []).map(formatear).join(' '), (p?.d || '').slice(0, 50)]
  })
  tabla(['id', 'esperado', 'conf.', 'alternativas', 'confusión', 'texto NCM'], filas)
  process.exit(validacion.errores.length ? 1 : 0)
}

if (validacion.errores.length) {
  imprimirValidacion(validacion, casos)
  console.error('\nCorregí el archivo de casos antes de correr la evaluación.')
  process.exit(1)
}

// ── corrida contra la API ────────────────────────────────────────────────────
const BASE_URL = String(process.env.BASE_URL || '').replace(/\/+$/, '')
const COOKIE = process.env.SESSION_COOKIE || ''
if (!BASE_URL) { console.error('Falta BASE_URL (o usá --dry).'); process.exit(2) }
if (!COOKIE) console.warn('Aviso: SESSION_COOKIE vacía; la API va a responder 401.')
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '2', 10) || 2)
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '90000', 10) || 90000

async function postear(cuerpo) {
  const headers = { 'content-type': 'application/json', cookie: COOKIE }
  if (process.env.VERCEL_BYPASS) headers['x-vercel-protection-bypass'] = process.env.VERCEL_BYPASS
  const t0 = performance.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(`${BASE_URL}/api/ai/clasificar`, { method: 'POST', headers, body: JSON.stringify(cuerpo), signal: ctrl.signal, redirect: 'manual' })
    const texto = await r.text()
    let json = null
    try { json = JSON.parse(texto) } catch { /* puede ser HTML de login o de Vercel */ }
    return { status: r.status, json, texto: json ? null : texto.slice(0, 200), ms: performance.now() - t0 }
  } catch (e) {
    return { status: 0, json: null, texto: e.name === 'AbortError' ? `timeout ${TIMEOUT_MS} ms` : String(e.message || e), ms: performance.now() - t0 }
  } finally { clearTimeout(timer) }
}

// Responde una pregunta de la IA con los atributos del caso.
// 1. Si el texto de una opción aparece literal en algún atributo (ej. "Nuevo",
//    "Menos de 100 t"), elige esa opción (la más larga si hay varias). Es literal a
//    propósito: con palabras sueltas "Sí, todos los ejes" coincidiría con "no todos
//    los ejes son direccionables".
// 2. Si no, contesta en texto libre con los atributos que tienen que ver con la
//    pregunta (o todos), que es lo que escribiría un vendedor que conoce el producto.
function responder(pregunta, opciones, atributos) {
  const entradas = Object.entries(atributos || {})
  const raiz = (w) => (w.length > 5 && w.endsWith('es') ? w.slice(0, -2) : w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)
  const tokens = (t) => normalizar(t).split(' ').filter((w) => w.length > 3 || /\d/.test(w)).map(raiz)
  const pregTok = new Set(tokens(pregunta))
  const textoAttr = entradas.map(([k, v]) => ` ${normalizar(`${k} ${v}`)} `)
  let elegida = null
  for (const op of opciones || []) {
    const n = normalizar(op)
    if (!n) continue
    if (textoAttr.some((t) => t.includes(` ${n} `)) && (!elegida || n.length > normalizar(elegida).length)) elegida = op
  }
  if (elegida) return { respuesta: elegida, modo: 'opcion' }
  const relevantes = entradas.filter(([k, v]) => tokens(k).some((w) => pregTok.has(w)) || tokens(v).filter((w) => pregTok.has(w)).length >= 2)
  const libre = (relevantes.length ? relevantes : entradas).map(([k, v]) => `${k}: ${v}`).join('; ')
  return { respuesta: libre.slice(0, 200), modo: 'libre' }
}

async function correrCaso(c) {
  const base = { descripcion: c.descripcion, origen: c.origen || '' }
  if (args['sin-preguntas']) base.saltarPreguntas = true
  const r1 = await postear(base)
  const res = { id: c.id, esperado: formatear(c.ncm_esperado), confianza: c.confianza, preguntas: [], ms: r1.ms, llamadas: 1 }
  let final = r1
  // El clasificador puede pedir hasta dos rondas de preguntas: se acumulan las respuestas y se reenvían.
  const respuestas = []
  while (final.status === 200 && final.json?.etapa === 'preguntas' && res.llamadas < 4) {
    for (const p of final.json.preguntas || []) {
      const a = responder(p.pregunta, p.opciones, c.atributos)
      res.preguntas.push({ pregunta: p.pregunta, opciones: p.opciones, ...a })
      respuestas.push({ pregunta: p.pregunta, respuesta: a.respuesta })
    }
    final = await postear({ ...base, respuestas, ronda: final.json.ronda || res.llamadas })
    res.ms += final.ms
    res.llamadas += 1
  }
  res.status = final.status
  if (final.status !== 200 || !final.json?.ok || final.json.etapa !== 'resultado') {
    res.error = final.json?.error || final.texto || `HTTP ${final.status}${final.json?.etapa ? ` etapa ${final.json.etapa}` : ''}`
    res.candidatos = []
  } else {
    res.candidatos = (final.json.candidatos || []).map((x) => formatear(x.ncm))
    res.ajustados = (final.json.candidatos || []).filter((x) => x.ajustado_desde).map((x) => `${x.ajustado_desde}→${formatear(x.ncm)}`)
    res.producto_normalizado = final.json.producto_normalizado
  }
  const ok = new Set([c.ncm_esperado, ...(c.alternativas_aceptables || [])].map(soloDigitos))
  const conf = new Set((c.confusion || []).map(soloDigitos))
  res.top1 = !!res.candidatos[0] && ok.has(soloDigitos(res.candidatos[0]))
  res.top3 = res.candidatos.slice(0, 3).some((x) => ok.has(soloDigitos(x)))
  res.cayo_en_confusion = !!res.candidatos[0] && conf.has(soloDigitos(res.candidatos[0]))
  return res
}

async function enParalelo(items, n, fn) {
  const salida = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++
      salida[k] = await fn(items[k])
      const r = salida[k]
      process.stderr.write(`${String(k + 1).padStart(3)}/${items.length} ${r.top1 ? 'OK  ' : r.top3 ? 'top3' : r.error ? 'ERR ' : 'MISS'} ${r.id} (${Math.round(r.ms)} ms)\n`)
    }
  }))
  return salida
}

function tabla(cab, filas) {
  const anchos = cab.map((h, i) => Math.max(h.length, ...filas.map((f) => String(f[i] ?? '').length)))
  const linea = (f) => f.map((x, i) => String(x ?? '').padEnd(anchos[i])).join(' | ')
  console.log(linea(cab))
  console.log(anchos.map((a) => '-'.repeat(a)).join('-+-'))
  for (const f of filas) console.log(linea(f))
}

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)} %` : '-')

console.error(`Evaluando ${casos.length} casos contra ${BASE_URL} (concurrencia ${CONCURRENCY})${args['sin-preguntas'] ? ' sin preguntas' : ''}...`)
const t0 = Date.now()
const resultados = await enParalelo(casos, CONCURRENCY, correrCaso)

const n = resultados.length
const conRespuesta = resultados.filter((r) => !r.error)
const top1 = resultados.filter((r) => r.top1).length
const top3 = resultados.filter((r) => r.top3).length
const conPreguntas = resultados.filter((r) => r.preguntas.length).length
const errores = resultados.filter((r) => r.error)
const confusiones = resultados.filter((r) => r.cayo_en_confusion).length
const latencias = conRespuesta.map((r) => r.ms).sort((a, b) => a - b)
const prom = latencias.length ? latencias.reduce((a, b) => a + b, 0) / latencias.length : 0
const p90 = latencias.length ? latencias[Math.min(latencias.length - 1, Math.floor(latencias.length * 0.9))] : 0
const porConfianza = (k) => { const s = resultados.filter((r) => r.confianza === k); return `${s.filter((r) => r.top1).length}/${s.length}` }

console.log('')
console.log(`Resultados (${BASE_URL}, ${new Date().toISOString()}, ${((Date.now() - t0) / 1000).toFixed(0)} s)`)
console.log(`  Top-1:                 ${top1}/${n}  ${pct(top1, n)}   (confianza alta ${porConfianza('alta')}, media ${porConfianza('media')})`)
console.log(`  Top-3:                 ${top3}/${n}  ${pct(top3, n)}`)
console.log(`  Top-1 en la confusión: ${confusiones}/${n}  ${pct(confusiones, n)}`)
console.log(`  Hicieron preguntas:    ${conPreguntas}/${n}  ${pct(conPreguntas, n)}`)
console.log(`  Errores:               ${errores.length}/${n}`)
console.log(`  Latencia promedio:     ${(prom / 1000).toFixed(1)} s por caso (p90 ${(p90 / 1000).toFixed(1)} s; incluye la ronda de preguntas)`)

const fallas = resultados.filter((r) => !r.top1)
if (fallas.length) {
  console.log('\nCasos fuera del top-1:')
  tabla(['id', 'esperado', 'obtenido (top-3)', 'top3', 'conf.', 'preguntas', 'nota'], fallas.map((r) => [
    r.id, r.esperado, r.candidatos.join(' ') || '-', r.top3 ? 'sí' : 'no', r.confianza,
    r.preguntas.length ? r.preguntas.map((p) => `${p.modo === 'libre' ? '(libre) ' : ''}${p.respuesta}`).join(' / ').slice(0, 60) : '-',
    (r.error || (r.cayo_en_confusion ? 'cayó en la confusión' : '') || (r.ajustados?.length ? `ajustado ${r.ajustados.join(',')}` : '')).slice(0, 60),
  ]))
}
const libres = resultados.flatMap((r) => r.preguntas.filter((p) => p.modo === 'libre').map((p) => `${r.id}: ${p.pregunta}`))
if (libres.length) {
  console.log('\nPreguntas contestadas en texto libre con los atributos (ninguna opción figuraba literal en ellos):')
  for (const l of libres) console.log(`  - ${l}`)
}

if (args.out && args.out !== true) {
  fs.writeFileSync(path.resolve(String(args.out)), JSON.stringify({ base_url: BASE_URL, fecha: new Date().toISOString(), resumen: { n, top1, top3, conPreguntas, errores: errores.length, confusiones, latencia_promedio_ms: Math.round(prom) }, resultados }, null, 2))
  console.log(`\nDetalle guardado en ${args.out}`)
}
