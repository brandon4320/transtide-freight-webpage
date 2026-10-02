// Clasificador arancelario con IA para el Cotizador.
//
// Cómo decide, en dos pasos con Gemini:
//   1. ORIENTAR: con la descripción (y las fotos del producto, si hay) propone
//      partidas probables y palabras de búsqueda. Si falta un dato que cambia la
//      posición (material, uso, potencia...), devuelve preguntas con opciones.
//   2. ELEGIR: se le dan posiciones REALES de la NCM vigente (las que cuelgan de
//      esas partidas más las que coinciden por texto) y elige hasta tres.
// Después todo se valida contra el nomenclador oficial: un código que no existe
// se ajusta al más cercano de la misma partida o se descarta. Nunca se inventa.
//
// Cada candidato vuelve enriquecido con datos de fuentes oficiales: descripción y
// jerarquía de la NCM, Arancel Externo Común, medidas antidumping vigentes para el
// país de origen (CNCE) y, si la posición ya está en la biblioteca de NCM del
// sistema, sus alícuotas validadas, que mandan sobre cualquier sugerencia.
//
// POST /api/ai/clasificar
//   { descripcion, origen?, imagenes?: [r2Key], respuestas?: [{ pregunta, respuesta }], saltarPreguntas? }
import { NextResponse } from 'next/server'
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import { getSessionInfo, hasSection, isAdmin } from '@/lib/perms'
import { d1Query } from '@/lib/d1'
import { r2SignedGetUrl } from '@/lib/r2'
import {
  buscarPorTexto, hijos, jerarquia, buscarPosicion, codigoMasCercano, existe, formatear,
  soloDigitos, infoNomenclador, type Posicion,
} from '@/lib/nomenclador'
import { medidasPara, infoAntidumping } from '@/lib/antidumping'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')
const MODELOS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest']
const PREFIJO_IMAGENES = 'cotizaciones/imagenes/'

// ── Gemini con respaldo de modelos (mismo criterio que /api/ai/extract) ─────────
async function pedirJSON(partes: any[], schema: any, temperatura = 0.1): Promise<any> {
  const reintentable = (e: any) => /\b503\b|\b429\b|\b500\b|overloaded|unavailable|rate.limit|temporar/i.test(String(e?.message || ''))
  let ultimo: any = null
  for (const nombre of MODELOS) {
    for (let intento = 0; intento < 2; intento++) {
      try {
        const modelo = genAI.getGenerativeModel({
          model: nombre,
          generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: temperatura },
        })
        const r = await modelo.generateContent(partes)
        return JSON.parse(r.response.text())
      } catch (e: any) {
        ultimo = e
        if (!reintentable(e)) break
        await new Promise((ok) => setTimeout(ok, 700 * (intento + 1)))
      }
    }
  }
  throw ultimo || new Error('Sin respuesta del modelo')
}

// Fotos del producto: se bajan de R2 y van como imagen al modelo (hasta 3).
async function partesDeImagenes(keys: unknown): Promise<any[]> {
  const lista = Array.isArray(keys) ? keys.filter((k) => typeof k === 'string' && k.startsWith(PREFIJO_IMAGENES) && !k.includes('..')).slice(0, 3) : []
  const partes: any[] = []
  for (const key of lista) {
    try {
      const r = await fetch(await r2SignedGetUrl(key, undefined, 120))
      if (!r.ok) continue
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length > 6 * 1024 * 1024) continue
      partes.push({ inlineData: { data: buf.toString('base64'), mimeType: r.headers.get('content-type') || 'image/jpeg' } })
    } catch { /* una foto que no baja no frena la clasificación */ }
  }
  return partes
}

const S = SchemaType
const ESQUEMA_ORIENTAR: any = {
  type: S.OBJECT,
  properties: {
    producto_normalizado: { type: S.STRING },
    partidas_probables: { type: S.ARRAY, items: { type: S.STRING } },
    palabras_clave: { type: S.ARRAY, items: { type: S.STRING } },
    necesita_aclaracion: { type: S.BOOLEAN },
    preguntas: {
      type: S.ARRAY,
      items: { type: S.OBJECT, properties: { pregunta: { type: S.STRING }, opciones: { type: S.ARRAY, items: { type: S.STRING } } }, required: ['pregunta', 'opciones'] },
    },
  },
  required: ['producto_normalizado', 'partidas_probables', 'palabras_clave', 'necesita_aclaracion', 'preguntas'],
}
const ESQUEMA_ELEGIR: any = {
  type: S.OBJECT,
  properties: {
    candidatos: {
      type: S.ARRAY,
      items: {
        type: S.OBJECT,
        properties: { ncm: { type: S.STRING }, confianza: { type: S.NUMBER }, justificacion: { type: S.STRING } },
        required: ['ncm', 'confianza', 'justificacion'],
      },
    },
    iva_reducido_probable: { type: S.BOOLEAN },
    motivo_iva: { type: S.STRING },
    intervenciones_probables: {
      type: S.ARRAY,
      items: { type: S.OBJECT, properties: { organismo: { type: S.STRING }, motivo: { type: S.STRING } }, required: ['organismo', 'motivo'] },
    },
    advertencias: { type: S.ARRAY, items: { type: S.STRING } },
  },
  required: ['candidatos', 'iva_reducido_probable', 'motivo_iva', 'intervenciones_probables', 'advertencias'],
}

const REGLAS = `Sos un clasificador arancelario experto en la Nomenclatura Común del MERCOSUR (NCM) aplicada en Argentina.
Aplicás las Reglas Generales Interpretativas del Sistema Armonizado: primero los textos de partida y notas de sección y capítulo, la materia constitutiva, la función principal, el grado de elaboración y el uso. No adivines: si un dato cambia la posición, decilo.

Casos que se suelen confundir:
- Grúas sobre ruedas: si la grúa va montada sobre un chasis de vehículo automóvil apto para circular por ruta, con cabina de conducción propia (camiones grúa y grúas todo terreno, como Sany STC/SAC, XCMG QY, Zoomlion QY o Liebherr LTM), es 8705.10 (camiones grúa), no 8426. Dentro de 8705.10 decide si TODOS los ejes son direccionables (8705.10.20, menos de 100 t) y la capacidad máxima de izaje (100 t o más: 8705.10.30). 8426.41 queda para grúas autopropulsadas sobre neumáticos que no son vehículos de ruta, con una sola cabina para conducir y operar (grúas rough terrain, de patio o puerto). Si no se sabe si todos los ejes son direccionables, preguntalo.
- Autoelevadores: los que levantan la carga son 8427 (8427.10 eléctricos, 8427.20 a combustión); los tractores de arrastre y carretillas sin elevación de fábricas o puertos son 8709. Preguntá el motor y la capacidad si no se informan.
- Maquinaria vial: palas cargadoras frontales 8429.51, excavadoras con giro de 360° 8429.52, retroexcavadoras y otras 8429.59; las que se montan sobre un camión siguen la lógica de 8705.
- Grupos electrógenos (motor + generador en un conjunto) son 8502 y se abren por tipo de motor (diésel o nafta) y potencia en kVA; un generador o motor eléctrico solo es 8501.
- Compresores de aire o gas 8414 (8414.30 los de equipos frigoríficos); los equipos de aire acondicionado completos son 8415. Las bombas para líquidos son 8413.
- Iluminación LED: lámparas y tubos LED sueltos 8539.52; luminarias, reflectores y artefactos completos 9405; módulos LED 8539.51.
- Monitores y televisores: un monitor diseñado para conectarse a una computadora es 8528.52; si tiene sintonizador de TV es 8528.72.
- Partes y accesorios: una parte específica sigue a la máquina (Notas de la Sección XVI y XVII), salvo que tenga posición propia: tornillos y bulones 7318, rodamientos 8482, juntas de caucho 4016.93, filtros 8421, baterías 8507, neumáticos 4011. Las partes de vehículos de 87.01 a 87.05 sin posición propia van en 8708.
- Juegos o kits (Regla 3 b): se clasifican por el artículo que les da el carácter esencial; si no se distingue, preguntalo.
- Herramientas eléctricas de uso manual son 8467; las máquinas herramienta de banco son 8465 (madera) u 8456 a 8463 (metal).
- Bolsos, mochilas y valijas (4202) se abren por el material de la superficie exterior: cuero, plástico o textil.
- Calzado (6402 a 6405) y prendas: el calzado se decide por el material de la suela y de la parte superior; la ropa, por si es de punto (capítulo 61) o no (capítulo 62) y por la fibra. Si no se informa, preguntalo.
- Estado: si es una máquina, un vehículo, un equipo o un bien de capital, el estado (nuevo, usado o reacondicionado) cambia el régimen de importación aunque no cambie la posición. Si no se informa, preguntalo.`

// Partidas que comparten productos parecidos: si la IA orienta hacia una, se le
// muestran también las posiciones de la otra para que pueda compararlas.
const PARTIDAS_VECINAS: Record<string, string[]> = {
  '8426': ['8705.10'],
  '8705': ['8426.4'],
  '8427': ['8709'],
  '8709': ['8427'],
  '8502': ['8501'],
  '8501': ['8502'],
  '8414': ['8415', '8413'],
  '8415': ['8414'],
  '8413': ['8414'],
  '8539': ['9405'],
  '9405': ['8539.5'],
  '8528': ['8471.6'],
  '8467': ['8465'],
  '8465': ['8467'],
  '9503': ['9506'],
  '9506': ['9503'],
}
const conVecinas = (prefijos: string[]) => {
  const todos = new Set(prefijos)
  for (const pref of prefijos) {
    for (const [base, vecinas] of Object.entries(PARTIDAS_VECINAS)) {
      if (soloDigitos(pref).startsWith(base)) vecinas.forEach((v) => todos.add(v))
    }
  }
  return Array.from(todos)
}

// ── alícuotas sugeridas ─────────────────────────────────────────────────────────
type Fuente = 'biblioteca' | 'aec' | 'regla'
type Alicuota = { valor: number; fuente: Fuente }
function alicuotasSugeridas(aec: number | null, ivaReducido: boolean, lib: any | null) {
  const n = (v: any) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : null }
  const de = (campo: string, defecto: number | null, fuenteDefecto: Fuente): Alicuota | null => {
    const v = lib ? n(lib[campo]) : null
    if (v !== null) return { valor: v, fuente: 'biblioteca' }
    return defecto === null ? null : { valor: defecto, fuente: fuenteDefecto }
  }
  const ivaRegla = ivaReducido ? 10.5 : 21
  return {
    der: de('der', aec, 'aec'),
    tasa: de('tasa', 3, 'regla'),
    iva: de('iva', ivaRegla, 'regla'),
    ivaAdic: de('iva_adic', ivaRegla === 10.5 ? 10 : 20, 'regla'),
    ganancias: de('ganancias', 6, 'regla'),
    iibb: de('iibb', 2.5, 'regla'),
  }
}

export async function POST(request: Request) {
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(s) && !hasSection(s, 'cotizador')) return NextResponse.json({ error: 'Sin acceso al cotizador.' }, { status: 403 })
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: 'La IA no está configurada.' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const descripcion = String(body.descripcion || '').trim().slice(0, 1500)
  const origen = String(body.origen || '').trim().slice(0, 60)
  const respuestas = Array.isArray(body.respuestas) ? body.respuestas.slice(0, 8) : []
  const saltarPreguntas = !!body.saltarPreguntas
  if (descripcion.length < 3) return NextResponse.json({ error: 'Escribí una descripción del producto.' }, { status: 400 })

  let fuenteNomenclador: any
  try { fuenteNomenclador = await infoNomenclador() } catch {
    return NextResponse.json({ error: 'No está cargado el nomenclador oficial.' }, { status: 500 })
  }

  const fotos = await partesDeImagenes(body.imagenes)
  const aclaraciones = respuestas
    .filter((r: any) => r && r.pregunta && r.respuesta)
    .map((r: any) => `- ${String(r.pregunta).slice(0, 200)}: ${String(r.respuesta).slice(0, 200)}`)
    .join('\n')
  const contexto = [
    `Producto: ${descripcion}`,
    origen ? `País de origen: ${origen}` : '',
    aclaraciones ? `Aclaraciones del usuario:\n${aclaraciones}` : '',
    fotos.length ? `Se adjuntan ${fotos.length} foto(s) del producto.` : '',
  ].filter(Boolean).join('\n')

  try {
    // ── 1. orientar ──
    const orientacion = await pedirJSON([
      ...fotos,
      { text: `${REGLAS}

${contexto}

Tarea: orientá la clasificación.
- producto_normalizado: nombre técnico y claro del producto, como figuraría en una factura comercial bien hecha.
- partidas_probables: hasta 5 partidas (4 dígitos, ej. "8303") o subpartidas (6 dígitos, ej. "8471.30") donde podría estar.
- palabras_clave: hasta 8 palabras en castellano como las usaría el texto de la NCM (ej. "cajas de caudales", "maquinas automaticas para procesamiento de datos").
- necesita_aclaracion: true solo si falta un dato que cambia la posición y que no se deduce de la descripción ni de las fotos.
- preguntas: si necesita_aclaracion, hasta 3 preguntas cortas, cada una con 2 a 5 opciones concretas. Si no, lista vacía. Si es una máquina, un vehículo, un equipo o un bien de capital y no se sabe su estado, una de las preguntas es "¿Es nuevo o usado?" con las opciones Nuevo, Usado y Reacondicionado.` },
    ], ESQUEMA_ORIENTAR, 0.1)

    const preguntas = (orientacion.preguntas || []).filter((p: any) => p && p.pregunta && Array.isArray(p.opciones) && p.opciones.length)
    if (orientacion.necesita_aclaracion && preguntas.length && !respuestas.length && !saltarPreguntas) {
      return NextResponse.json({ ok: true, etapa: 'preguntas', producto_normalizado: orientacion.producto_normalizado, preguntas: preguntas.slice(0, 3) })
    }

    // ── 2. posiciones reales entre las que elegir ──
    const vistos = new Map<string, Posicion>()
    for (const pref of conVecinas((orientacion.partidas_probables || []).slice(0, 5))) {
      for (const p of await hijos(pref, 60)) vistos.set(soloDigitos(p.c), p)
    }
    const textoBusqueda = [descripcion, orientacion.producto_normalizado, ...(orientacion.palabras_clave || [])].join(' ')
    for (const p of await buscarPorTexto(textoBusqueda, 40)) vistos.set(soloDigitos(p.c), p)
    const lista = Array.from(vistos.values()).slice(0, 220)

    const renglones: string[] = []
    for (const p of lista) {
      const arriba = (await jerarquia(p.c)).filter((x) => x.n === 4 || x.n === 6).map((x) => x.d).join(' > ')
      renglones.push(`${p.c} | ${arriba ? arriba.slice(0, 160) + ' > ' : ''}${p.d.slice(0, 200)}`)
    }

    const eleccion = await pedirJSON([
      ...fotos,
      { text: `${REGLAS}

${contexto}
Producto normalizado: ${orientacion.producto_normalizado}

Posiciones vigentes de la NCM entre las que elegir (código | partida > descripción):
${renglones.join('\n') || '(no se encontraron posiciones por texto)'}

Tarea:
- candidatos: de 1 a 3 posiciones de 8 dígitos, la más probable primero. Elegí de la lista; solo si ninguna corresponde, proponé otro código de 8 dígitos de la NCM que conozcas. confianza de 0 a 100. justificacion breve en castellano, citando la regla o el texto de partida que la decide.
- iva_reducido_probable: true si la mercadería suele tributar IVA de 10,5 % en Argentina (por ejemplo bienes de capital o informática). motivo_iva breve.
- intervenciones_probables: organismos que suelen intervenir en la importación de este producto en Argentina (SENASA, ANMAT, INAL, INTI, Seguridad eléctrica, ENACOM, etc.) con el motivo. Si no corresponde ninguno, lista vacía.
- advertencias: datos a confirmar con el despachante (por ejemplo, si la posición depende de una medida o material no informado). Si el producto es usado o reacondicionado, avisá que los bienes usados tienen un régimen de importación propio en Argentina (requisitos y alícuotas distintos a los del bien nuevo) y que no corresponde dar por aplicable el beneficio de bien de capital sin confirmarlo con el despachante.` },
    ], ESQUEMA_ELEGIR, 0.1)

    // ── 3. validar contra el nomenclador y enriquecer ──
    let biblioteca: any[] = []
    try { biblioteca = await d1Query<any>(`SELECT * FROM ncm`) } catch { biblioteca = [] }
    const enBiblioteca = (codigo: string) => biblioteca.find((r) => soloDigitos(r.codigo).slice(0, 8) === soloDigitos(codigo).slice(0, 8)) || null

    const candidatos: any[] = []
    const usados = new Set<string>()
    for (const cand of (eleccion.candidatos || []).slice(0, 3)) {
      const propuesto = String(cand.ncm || '')
      let pos = (await existe(propuesto)) ? await buscarPosicion(propuesto) : null
      let ajustado = false
      if (!pos) { pos = await codigoMasCercano(propuesto); ajustado = !!pos }
      if (!pos || usados.has(soloDigitos(pos.c))) continue
      usados.add(soloDigitos(pos.c))
      const arriba = await jerarquia(pos.c)
      const lib = enBiblioteca(pos.c)
      const medidas = await medidasPara(pos.c, origen || null)
      // IVA de 10,5 %: las posiciones BK y BIT del nomenclador oficial lo tienen en general.
      // Si la posición no está marcada, se toma la estimación de la IA solo como aviso.
      const ivaReducido = pos.r === 'BK' || pos.r === 'BIT'
      candidatos.push({
        ncm: formatear(pos.c),
        descripcion: pos.d,
        descripcion_en_portugues: !!pos.pt,
        jerarquia: arriba.map((p) => ({ codigo: formatear(p.c), descripcion: p.d })),
        aec: pos.a,
        confianza: Math.max(0, Math.min(100, Math.round(Number(cand.confianza) || 0))),
        justificacion: String(cand.justificacion || ''),
        ajustado_desde: ajustado ? formatear(propuesto) : null,
        en_biblioteca: !!lib,
        regimen: pos.r || null,
        alicuotas: alicuotasSugeridas(pos.a, ivaReducido, lib),
        antidumping: medidas,
      })
    }

    if (!candidatos.length) {
      return NextResponse.json({ ok: false, error: 'No encontré una posición válida. Probá con una descripción más técnica: material, uso y características.' }, { status: 422 })
    }

    return NextResponse.json({
      ok: true,
      etapa: 'resultado',
      producto_normalizado: orientacion.producto_normalizado,
      candidatos,
      iva_reducido_probable: !!eleccion.iva_reducido_probable,
      motivo_iva: eleccion.motivo_iva || '',
      intervenciones_probables: eleccion.intervenciones_probables || [],
      advertencias: eleccion.advertencias || [],
      fuentes: { nomenclador: fuenteNomenclador, antidumping: await infoAntidumping() },
    })
  } catch (e: any) {
    console.error('[clasificar]', e?.message)
    return NextResponse.json({ error: 'La IA no respondió. Probá de nuevo en un momento.' }, { status: 502 })
  }
}
