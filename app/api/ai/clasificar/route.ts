// Clasificador arancelario con IA para el Cotizador.
//
// Cómo decide, en dos pasos con Gemini:
//   1. ORIENTAR: con la descripción (y las fotos del producto, si hay) propone
//      partidas probables y palabras de búsqueda. Si falta un dato que cambia la
//      posición (material, uso, potencia...), devuelve preguntas con opciones.
//   2. ELEGIR: se le dan posiciones REALES de la NCM vigente (las que coinciden por
//      texto más las que cuelgan de esas partidas), en árbol con los textos de cada
//      nivel, y elige hasta tres.
// Después todo se valida contra el nomenclador oficial: un código que no existe
// se ajusta al de la misma subpartida (único ítem o "Los demás") o se descarta.
// Nunca se inventa.
//
// Cada candidato vuelve enriquecido con datos de fuentes oficiales: descripción y
// jerarquía de la NCM, Arancel Externo Común, medidas antidumping vigentes para el
// país de origen (CNCE) y, si la posición ya está en la biblioteca de NCM del
// sistema, sus alícuotas validadas, que mandan sobre cualquier sugerencia.
//
// POST /api/ai/clasificar
//   { descripcion, origen?, imagenes?: [r2Key], respuestas?: [{ pregunta, respuesta }],
//     sinResponder?: [pregunta], ronda?: 0..3, saltarPreguntas? }
// Las preguntas pueden venir en hasta dos rondas; el cliente reenvía siempre todo
// lo ya respondido (y lo que no supo responder) para que no se repitan.
import { NextResponse } from 'next/server'
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import { getSessionInfo, hasSection, isAdmin } from '@/lib/perms'
import { d1Query } from '@/lib/d1'
import { r2SignedGetUrl } from '@/lib/r2'
import {
  buscarPorTexto, hijos, jerarquia, buscarPosicion, codigoMasCercano, existe, formatear,
  soloDigitos, infoNomenclador, normalizar, puntuador, esResidual, type Posicion,
} from '@/lib/nomenclador'
import { medidasPara, infoAntidumping } from '@/lib/antidumping'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')
const MODELOS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest']
const PREFIJO_IMAGENES = 'cotizaciones/imagenes/'

// ── Gemini con respaldo de modelos (mismo criterio que /api/ai/extract) ─────────
// hasta: hora límite (ms) para toda la llamada. porIntento: tope de cada intento;
// si un modelo se pasa de tiempo se prueba el siguiente en vez de reintentar.
class TiempoAgotado extends Error { constructor() { super('Tiempo agotado esperando a la IA') } }
const esTiempo = (e: any) => e instanceof TiempoAgotado || e?.name === 'AbortError' || /abort|timed? ?out|deadline/i.test(String(e?.message || ''))
const esCuota = (e: any) => /\b429\b|quota|rate.limit|resource.exhausted/i.test(String(e?.message || ''))

async function pedirJSON(partes: any[], schema: any, temperatura: number, hasta: number, porIntento = 25_000): Promise<any> {
  const reintentable = (e: any) => /\b503\b|\b429\b|\b500\b|overloaded|unavailable|rate.limit|temporar/i.test(String(e?.message || ''))
  let ultimo: any = null
  for (const nombre of MODELOS) {
    for (let intento = 0; intento < 2; intento++) {
      const resta = hasta - Date.now()
      if (resta < 2500) throw ultimo && !esTiempo(ultimo) && esCuota(ultimo) ? ultimo : new TiempoAgotado()
      const tope = Math.min(resta, porIntento)
      let reloj: ReturnType<typeof setTimeout> | undefined
      try {
        const modelo = genAI.getGenerativeModel({
          model: nombre,
          generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: temperatura },
        }, { timeout: tope })
        // Además del timeout del SDK, un reloj propio: la respuesta no puede pasarse del tope.
        const r = await Promise.race([
          modelo.generateContent(partes),
          new Promise<never>((_, mal) => { reloj = setTimeout(() => mal(new TiempoAgotado()), tope + 500) }),
        ])
        return JSON.parse(r.response.text())
      } catch (e: any) {
        ultimo = e
        if (esTiempo(e) || !reintentable(e)) break
        const espera = 700 * (intento + 1)
        if (hasta - Date.now() < espera + 2500) break
        await new Promise((ok) => setTimeout(ok, espera))
      } finally {
        if (reloj) clearTimeout(reloj)
      }
    }
  }
  throw ultimo || new Error('Sin respuesta del modelo')
}

// Fotos del producto: se bajan de R2 en paralelo y van como imagen al modelo (hasta 3).
async function partesDeImagenes(keys: unknown): Promise<any[]> {
  const lista = Array.isArray(keys) ? keys.filter((k) => typeof k === 'string' && k.startsWith(PREFIJO_IMAGENES) && !k.includes('..')).slice(0, 3) : []
  const partes = await Promise.all(lista.map(async (key) => {
    try {
      const r = await fetch(await r2SignedGetUrl(key, undefined, 120), { signal: AbortSignal.timeout(8000) })
      if (!r.ok) return null
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length > 6 * 1024 * 1024) return null
      return { inlineData: { data: buf.toString('base64'), mimeType: r.headers.get('content-type') || 'image/jpeg' } }
    } catch { return null /* una foto que no baja no frena la clasificación */ }
  }))
  return partes.filter(Boolean)
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
      items: {
        type: S.OBJECT,
        properties: { pregunta: { type: S.STRING }, motivo: { type: S.STRING }, opciones: { type: S.ARRAY, items: { type: S.STRING } } },
        required: ['pregunta', 'opciones'],
      },
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
        properties: {
          ncm: { type: S.STRING },
          confianza: { type: S.NUMBER },
          justificacion: { type: S.STRING },
          datos_a_confirmar: { type: S.ARRAY, items: { type: S.STRING } },
        },
        required: ['ncm', 'confianza', 'justificacion'],
      },
    },
    estado: { type: S.STRING, format: 'enum', enum: ['nuevo', 'usado', 'reacondicionado', 'desconocido'] },
    iva_reducido_probable: { type: S.BOOLEAN },
    motivo_iva: { type: S.STRING },
    intervenciones_probables: {
      type: S.ARRAY,
      items: { type: S.OBJECT, properties: { organismo: { type: S.STRING }, motivo: { type: S.STRING } }, required: ['organismo', 'motivo'] },
    },
    advertencias: { type: S.ARRAY, items: { type: S.STRING } },
  },
  required: ['candidatos', 'estado', 'iva_reducido_probable', 'motivo_iva', 'intervenciones_probables', 'advertencias'],
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
- Estado: si es una máquina, un vehículo, un equipo o un bien de capital, el estado (nuevo, usado o reacondicionado) cambia el régimen de importación aunque no cambie la posición. Si no se informa, preguntalo.
- Excavadoras, cargadoras, topadoras y motoniveladoras por potencia: la potencia en el volante decide el ítem y el arancel. Excavadoras 360° (8429.52): hasta 40,3 kW (54 HP) 8429.52.12 (AEC 0%), 650 HP o más 8429.52.11 (0%), el resto 8429.52.19 (12,6%). Cargadoras frontales, incluidas las minicargadoras (8429.51): hasta 43,99 kW (59 HP) 8429.51.92 (0%), 399 HP o más 8429.51.91 (0%), el resto 8429.51.99 (12,6%). Topadoras sobre orugas: 520 HP o más 8429.11.10 (0%), el resto 8429.11.90 (9%). Motoniveladoras articuladas de 275 HP o más 8429.20.10 (0%), el resto 8429.20.90. Las miniexcavadoras y minicargadoras suelen caer en el ítem de 0%: pedí la potencia del motor en kW o HP, no el peso operativo. Si falta, preguntá: ¿potencia del motor? (hasta 54 HP / 55 a 398 HP / 399 a 649 HP / 650 HP o más).
- Repuestos de maquinaria vial: antes de llevar todo a 8431.49.29 (0%), fijate si la pieza tiene posición propia (Nota 2 a) de la Sección XVI). Cilindros hidráulicos 8412.21.10; motores hidráulicos de traslación o de giro 8412.29.00; bombas hidráulicas 8413.60; válvulas y comandos hidráulicos 8481.20.90; reductores y mandos finales 8483.40.10 (todos 12,6%). Lo propio de 8431: baldes y cucharas 8431.41.00, cabinas 8431.49.21 (9%), orugas 8431.49.22 (12,6%) y las demás partes 8431.49.29 (0%). Si no se sabe qué pieza es, preguntá: ¿qué pieza es? (cilindro hidráulico / bomba o motor hidráulico / válvula o comando / reductor o mando final / balde, oruga, cabina u otra pieza estructural).
- Equipos montados sobre camión: el camión hormigonero (mixer) es 8705.40.00 (20%, no BK); la hormigonera estacionaria o de arrastre es 8474.31.00 (12,6%, BK). La bomba de hormigón sobre camión (autobomba con pluma) es 8705.90.90 (20%); la bomba estacionaria o de arrastre es 8413.40.00 (12,6%, BK). El equipo perforador sobre camión es 8705.20.00 (20%); las perforadoras autopropulsadas sobre orugas o ruedas propias van en 8430.41 y las que no tienen propulsión, en 8430.49. Si no se informa, preguntá: ¿cómo se desplaza el equipo? (montado sobre chasis de camión apto para ruta / autopropulsado sobre orugas o ruedas propias, no apto para ruta / de arrastre o estacionario).
- Camiones volcadores: los volquetes fuera de ruta (dumpers mineros o de obra, rígidos o articulados, no aptos para circular por ruta) son 8704.10: 8704.10.10 si cargan 85 t o más (0%), 8704.10.90 el resto (12,6%, BK). Un camión de ruta con caja volcadora es 8704.22.20 u 8704.23.20 según el peso total (20%, no BK). Si no se informa, preguntá: ¿qué tipo de volcador es? (camión de ruta con caja volcadora / dumper fuera de ruta de menos de 85 t / dumper fuera de ruta de 85 t o más).
- Tractores: los tractores de carretera para semirremolque (tractocamiones) son 8701.21 a 8701.29 según la propulsión (20%). Los tractores agrícolas o industriales son 8701.91 a 8701.95 según la potencia (12,6%, BK). Los motocultivadores de un solo eje son 8701.10.00. Si no se informa, preguntá: ¿qué tipo de tractor es? (tractocamión para semirremolque / tractor agrícola o industrial, indicando la potencia en kW / motocultivador de un eje).
- Motores de combustión sueltos: el destino decide. Diésel para propulsar vehículos del Capítulo 87 (camiones, autos, tractores) 8408.20 (18%, no BK); diésel para maquinaria vial, grupos, bombas u otro uso industrial 8408.90.90 (12,6%, BK); estacionarios de más de 497,5 kW 8408.90.10 (0%). A nafta: los de vehículos son 8407.3 (18%), y los estacionarios, de bombas, generadores o motocultivadores, 8407.90.00 (12,6%, BK). Si no se informa, preguntá: ¿para qué equipo es el motor? (camión, auto, tractor o moto / maquinaria vial, grupo electrógeno, bomba u otro uso industrial / estacionario de más de 497,5 kW).
- Neumáticos por tipo de vehículo: auto 4011.10.00; camión u ómnibus 4011.20; agrícola o forestal 4011.70; construcción, minería o autoelevadores 4011.80. Dentro de 4011.80, los radiales de volquete fuera de ruta con ancho de 940 mm (37") o más para llanta de 1.448 mm (57") o más son 4011.80.10 (0%), los demás de 1.143 mm (45") o más de ancho y de llanta son 4011.80.20 (0%) y el resto 4011.80.90 (16%). Pedí la medida. Si falta, preguntá: ¿en qué equipo se usa? (auto o camioneta / camión u ómnibus / tractor o máquina agrícola / máquina vial, minera o autoelevador).
- Remolques y semirremolques: los de carga por ruta son 8716.39.00 y las cisternas 8716.31.00 (18%). Los agrícolas autocargadores o autodescargadores (por ejemplo, tolvas autodescargables) son 8716.20.00 (12,6%, BK). Si no se informa, preguntá: ¿para qué es el remolque? (carga general por ruta / cisterna / agrícola autocargador o autodescargador / otro uso).
- Energía solar: el panel fotovoltaico solo, con caja de conexiones o diodos, es 8541.43.00 (10,8%, BIT); las células sueltas, 8541.42. Si el panel trae microinversor y entrega corriente alterna, es 8501.80.00 (12,6%, BK). Si trae optimizador u otra electrónica y entrega continua, es 8501.72.10 (hasta 75 kW, 18%) u 8501.72.90. Las luminarias solares LED con panel y batería incorporados (farolas y reflectores solares) son 9405.41.00 (18%), no 8541. Si no se informa, preguntá: ¿qué incluye el panel? (solo el panel / con microinversor y salida en alterna / con optimizador u otra electrónica y salida en continua / es una luminaria con panel incorporado).
- Inversores, cargadores y baterías (8504.40): inversor solar o híbrido 8504.40.90 (12,6%, BK); cargador de baterías 8504.40.10 (18%, no BK); UPS 8504.40.40 (12,6%, BIT); variador de frecuencia para motores 8504.40.50 (12,6%, BK). Las baterías van aparte: litio 8507.60.00, plomo de arranque 8507.10, plomo estacionarias o de ciclo profundo 8507.20 (18%). En un sistema de almacenamiento todo en uno, aplicá la Regla 3 b) y, si no se distingue lo esencial, preguntalo. Si no se informa, preguntá: ¿cuál es la función principal? (inversor de continua a alterna / cargador de baterías / UPS / variador de velocidad / batería o banco de baterías).
- Motores eléctricos de corriente alterna: los monofásicos de hasta 15 kW son 8501.40.11 u 8501.40.19 (18%, no BK, y los de origen China tienen FOB mínimo por antidumping); los monofásicos de más de 15 kW, 8501.40.21 u 8501.40.29 (12,6%, BK). Los trifásicos son 8501.51, 8501.52 u 8501.53 según la potencia (12,6%, BK). Si no se informa, preguntá: ¿cuántas fases y qué potencia tiene? (monofásico hasta 15 kW / monofásico de más de 15 kW / trifásico, indicando kW).
- Transformadores: los secos de hasta 16 kVA son 8504.31 u 8504.32 (18%); los secos de más de 16 kVA, 8504.33.00 u 8504.34.00 (12,6%, BK); los de dieléctrico líquido (en aceite), 8504.21 a 8504.23 (12,6%, BK). Si no se informa, preguntá: ¿qué potencia y tipo tiene? (seco hasta 16 kVA / seco de más de 16 kVA / en aceite).
- Aire acondicionado por capacidad (8415): split de pared, techo o piso de hasta 30.000 frigorías/h (unos 119.000 BTU/h o 34,9 kW) 8415.10.11 (18%); de ventana o compacto de esa capacidad 8415.10.19 (20%); de más de 30.000 frigorías/h 8415.10.90 (12,6%, BK). Los equipos que no se montan en pared, ventana, techo o piso van en 8415.81 si son bomba de calor reversible (8415.81.10 hasta 30.000 frigorías/h, 18%; 8415.81.90 el resto, 12,6%, BK) o en 8415.82 si son solo frío, con el mismo corte. Las manejadoras sin equipo de frío son 8415.83.00. Ojo: 8415.10 de origen China tiene FOB mínimo. Si no se informa, preguntá: ¿qué tipo de equipo y qué capacidad tiene? (split de hasta 30.000 frigorías/h / ventana o compacto / de más de 30.000 frigorías/h / manejadora sin compresor).
- Ventiladores: los de mesa, pie, pared, techo o ventana con motor de hasta 125 W son 8414.51 (20%); los industriales, los extractores y los de más de 125 W, 8414.59.90 (12,6%, BK). Los de origen China tienen antidumping del 164% en ambas subpartidas. Si no se informa, preguntá: ¿qué potencia tiene el motor? (hasta 125 W / más de 125 W / extractor o ventilador industrial).
- Electrodomésticos de uso doméstico frente a equipos comerciales: las heladeras domésticas son 8418.10.00 u 8418.21.00 (20%); las exhibidoras, vitrinas y freezers comerciales que conservan y exhiben productos, 8418.50.10 u 8418.50.90 (12,6%, BK). Los lavarropas de hasta 10 kg de ropa seca son 8450.11.00 (20%); los de más de 10 kg, 8450.20.20 u 8450.20.90 (12,6%). Los hornos y cocinas eléctricos domésticos son 8516.60.00 (20%); los de gas domésticos, 7321.11.00 (20%); los equipos de cocina para gastronomía o industria, 8419.81.90 (12,6%, BK). Si no se informa, preguntá: ¿es de uso doméstico o comercial/industrial? y, en lavarropas, ¿cuántos kg de ropa seca carga?
- Termotanques: los eléctricos son 8516.10.00 (los de acumulación de 20 a 150 l de origen China tienen antidumping del 131%); los solares, 8419.12.00, aunque traigan una resistencia eléctrica de respaldo; los calefones a gas, 8419.11.00 (todos 20% de AEC). Si no se informa, preguntá: ¿qué fuente de energía usa principalmente? (eléctrico / solar, con o sin resistencia de respaldo / gas).
- Pantallas y cartelería: una pantalla, un videowall LED o un equipo de cartelería digital que reproduce video o imágenes desde un reproductor, un USB o una señal HDMI es 8528.59.00 (20%), no 8528.52, salvo que esté diseñado para conectarse directamente a una computadora. Los tableros indicadores LED o LCD (precios, turnos, marcadores, mensajes) son 8531.20.00 (10,8%, BIT). Los módulos y gabinetes LED sueltos para armar un videowall son 8529.90.20 (10,8%). Si tiene sintonizador de TV, es 8528.72. Si trae una computadora incorporada (tótem táctil), puede ser 8471: preguntalo. Si no se informa, preguntá: ¿qué muestra y de dónde toma la señal? (video o imágenes desde un reproductor / solo textos o números / módulos sueltos / tiene computadora incorporada / tiene sintonizador).
- Cámaras de seguridad: las cámaras de CCTV o IP (domo, bullet) son cámaras de televisión de 8525.89.1. Con sensor CMOS de más de 490 x 580 píxeles y sensibilidad menor a 0,20 lux son 8525.89.13 (12,6%, BK); si no cumplen, 8525.89.19 (20%). Las que graban en sí mismas (cámaras deportivas, dashcams) son videocámaras de 8525.89.29 (20%). Los grabadores DVR o NVR suelen ir en 8521.90.00 (20%). Si no se informa, preguntá: ¿qué sensor y qué sensibilidad mínima tiene? (CMOS de menos de 0,20 lux / 0,20 lux o más, o sin dato / graba internamente).
- Herramientas portátiles según la energía (8467): las eléctricas se abren en taladros y rotomartillos 8467.21.00, sierras 8467.22.00, amoladoras y demás 8467.29.99 (20%), y martillos demoledores o rompedores 8467.29.93 (12,6%, BK). Las neumáticas son 8467.11 u 8467.19 (12,6%, BK). Las de motor a explosión son 8467.81.00 las motosierras (9%, BK) y 8467.89.00 las demás, como desmalezadoras o cortadoras de hormigón (12,6%, BK). Las hidrolavadoras son 8424.30.90 (12,6%, BK), no 8467. Si no se informa, preguntá: ¿cómo funciona? (eléctrica, con cable o batería / neumática / a explosión) y ¿qué es? (taladro o rotomartillo / sierra / martillo demoledor / amoladora u otra).
- Elevadores y gatos de taller: los elevadores de autos que se fijan al piso del taller (de dos o cuatro columnas, o de tijera) son 8425.41.00 (12,6%, BK); los gatos hidráulicos de carro o de botella, 8425.42.00 (18%); los gatos mecánicos manuales, 8425.49.10 (16%). Si no se informa, preguntá: ¿qué equipo es? (elevador fijo de columnas o de tijera / gato hidráulico portátil / gato mecánico manual).
- Corte láser (8456.11): las de control numérico que cortan chapa metálica de más de 8 mm de espesor son 8456.11.11 (0%); las demás de control numérico, 8456.11.19; las que no son de control numérico, 8456.11.90 (12,6%). Si no se informa, preguntá: ¿cuál es el espesor máximo de corte en chapa metálica y es CNC? (CNC, más de 8 mm / CNC, hasta 8 mm o material no metálico / sin CNC).
- Construcciones modulares y contenedores: las casas contenedor y los módulos habitables u oficinas de acero son 9406.20.00 (12,6%, BK); otras prefabricadas con estructura y paredes de acero, 9406.90.20. Un contenedor marítimo ISO de transporte, aunque se use como depósito, es 8609.00.00. Las estructuras de galpón de acero sin cerramientos son 7308.90.90 (14%). Si no se informa, preguntá: ¿qué es? (módulo habitable u oficina con paneles y aberturas / contenedor marítimo ISO / estructura de galpón).
- Bolsas big bag y lonas: el big bag (FIBC) de rafia de polipropileno tejida es textil, 6305.32.00 (35%), y las bolsas comunes de rafia, 6305.33; no van en 3923.21 o 3923.29 (18%), que quedan para bolsas de film plástico. La lona confeccionada (con ojales, dobladillo y medida terminada) es 6306.12.00 (35%). En rollo, el tejido recubierto de PVC es 5903.10.00 (26%), y va en 3921.90.90 (16%) cuando el tejido actúa solo como refuerzo (Nota 2 del Capítulo 59). Si no se informa, preguntá: ¿de qué material es y cómo viene? (bolsa de rafia o tejido de tiras de polipropileno / bolsa de film / lona confeccionada / tela recubierta en rollo).
- Movilidad eléctrica: las bicicletas con pedaleo asistido y los monopatines eléctricos son 8711.60.00, no 8712 (las bicicletas sin motor, 8712.00.10, tienen FOB mínimo para origen China); los vehículos a batería para chicos son juguetes de 9503.00.10. En autos, la propulsión define la subpartida: 8703.40 (nafta y eléctrico, no enchufable), 8703.50 (diésel y eléctrico, no enchufable), 8703.60 (nafta y eléctrico, enchufable), 8703.70 (diésel y eléctrico, enchufable), 8703.80.00 (solo eléctrico). Si no se informa, preguntá: ¿cómo se propulsa? (solo eléctrico / híbrido enchufable / híbrido no enchufable / solo combustión) y, en motos y bicicletas, ¿es de pedaleo asistido, con acelerador o un juguete para chicos?`

// Partidas que comparten productos parecidos: si la IA orienta hacia una, se le
// muestran también las posiciones de la otra para que pueda compararlas.
const PARTIDAS_VECINAS: Record<string, string[]> = {
  '8426': ['8705.10'],
  '8705': ['8426.4', '8474.31', '8413.40', '8430.4'],
  '8427': ['8709', '8425'],
  '8709': ['8427'],
  '8502': ['8501'],
  '8501': ['8502', '8541.43'],
  '8414': ['8415', '8413'],
  '8415': ['8414', '8418'],
  '8413': ['8414', '8705.90'],
  '8539': ['9405'],
  '9405': ['8539.5', '8541.43'],
  '8528': ['8471.6', '8531.20', '8529.90'],
  '8467': ['8465', '8424.30'],
  '8465': ['8467'],
  '9503': ['9506', '8711.60'],
  '9506': ['9503'],
  '8474': ['8705.40'],
  '8430': ['8705.20'],
  '8431': ['8412.2', '8413.6', '8481.2', '8483.4'],
  '8412': ['8431.4'],
  '8704': ['8705'],
  '8701': ['8709'],
  '8408': ['8407'],
  '8407': ['8408'],
  '8541': ['8501.7', '8501.8', '9405.4'],
  '8504': ['8507.6'],
  '8507': ['8504.40'],
  '8418': ['8415.8'],
  '8516': ['8419.1', '8419.8', '7321.1', '8509'],
  '8419': ['8516.10', '8516.60'],
  '7321': ['8516.60'],
  '8531': ['8528.59'],
  '8529': ['8528.59'],
  '8525': ['8521.90'],
  '8521': ['8525.89'],
  '8424': ['8467'],
  '8425': ['8427'],
  '9406': ['8609', '7308.90'],
  '8609': ['9406'],
  '7308': ['9406'],
  '6305': ['3923.2'],
  '3923': ['6305.3', '4819'],
  '6306': ['5903.10', '3921.90'],
  '5903': ['6306.1', '3921.90'],
  '3921': ['5903.10', '6306.1'],
  '8711': ['8712', '9503'],
  '8712': ['8711.60'],
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
// regimen: IVA de 10,5 % porque la posición es BK o BIT en el nomenclador oficial.
// regla: valor general que no sale de la posición (no pisa lo que cargó el usuario).
type Fuente = 'biblioteca' | 'aec' | 'regimen' | 'regla'
type Alicuota = { valor: number; fuente: Fuente }
function alicuotasSugeridas(aec: number | null, ivaReducido: boolean, lib: any | null) {
  const n = (v: any) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : null }
  const de = (campo: string, defecto: number | null, fuenteDefecto: Fuente): Alicuota | null => {
    const v = lib ? n(lib[campo]) : null
    if (v !== null) return { valor: v, fuente: 'biblioteca' }
    return defecto === null ? null : { valor: defecto, fuente: fuenteDefecto }
  }
  const fuenteIva: Fuente = ivaReducido ? 'regimen' : 'regla'
  return {
    der: de('der', aec, 'aec'),
    tasa: de('tasa', 3, 'regla'),
    iva: de('iva', ivaReducido ? 10.5 : 21, fuenteIva),
    ivaAdic: de('iva_adic', ivaReducido ? 10 : 20, fuenteIva),
    ganancias: de('ganancias', 6, 'regla'),
    iibb: de('iibb', 2.5, 'regla'),
  }
}

// Avisos por el estado de la mercadería. Solo avisan: las alícuotas no se tocan.
type Estado = 'nuevo' | 'usado' | 'reacondicionado' | 'desconocido'
function avisosPorEstado(pos: Posicion, estado: Estado): string[] {
  if (estado !== 'usado' && estado !== 'reacondicionado') return []
  const d = soloDigitos(pos.c)
  const cap = parseInt(d.slice(0, 2), 10)
  const avisos: string[] = []
  if (cap >= 84 && cap <= 90) avisos.push('Usado cap. 84–90 (Decreto 273/2025): el derecho de importación se duplica, con un máximo de 35 %. No requiere CIBU; se presenta una declaración jurada en el SIM. Confirmar con el despachante.')
  if (pos.r === 'BK' || pos.r === 'BIT') avisos.push('IVA 10,5 % de bien de capital en un usado: confirmar con el despachante.')
  if (['8703', '8704', '8711'].includes(d.slice(0, 4))) avisos.push('Vehículo usado: importación prohibida salvo excepciones (Decreto 110/99). Confirmar con el despachante.')
  return avisos
}

// Lista de posiciones como árbol: cada nivel de arriba (partida, subpartidas de 5,
// 6 y 7 dígitos) una sola vez con su texto completo, y debajo los ítems elegibles.
async function arbolDePosiciones(lista: Posicion[]): Promise<string> {
  const orden = [...lista].sort((a, b) => soloDigitos(a.c).localeCompare(soloDigitos(b.c)))
  const impresos = new Set<string>()
  const renglones: string[] = []
  for (const p of orden) {
    for (const x of await jerarquia(p.c)) {
      if (x.n < 4 || x.n > 7 || impresos.has(x.c)) continue
      impresos.add(x.c)
      renglones.push(`${' '.repeat((x.n - 4) * 2)}${x.c} ${x.d.slice(0, 320)}`)
    }
    renglones.push(`          ${p.c} | ${p.d.slice(0, 200)}`)
  }
  return renglones.join('\n')
}

export async function POST(request: Request) {
  const inicio = Date.now()
  const s = await getSessionInfo()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(s) && !hasSection(s, 'cotizador')) return NextResponse.json({ error: 'Sin acceso al cotizador.' }, { status: 403 })
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: 'La IA no está configurada.' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const descripcion = String(body.descripcion || '').trim().slice(0, 1500)
  const origen = String(body.origen || '').trim().slice(0, 60)
  const respuestas = (Array.isArray(body.respuestas) ? body.respuestas : [])
    .filter((r: any) => r && r.pregunta && r.respuesta)
    .slice(0, 12)
    .map((r: any) => ({ pregunta: String(r.pregunta).slice(0, 200), respuesta: String(r.respuesta).slice(0, 200) }))
  const sinResponder: string[] = (Array.isArray(body.sinResponder) ? body.sinResponder : [])
    .filter((p: any) => typeof p === 'string' && p.trim())
    .slice(0, 12)
    .map((p: string) => p.trim().slice(0, 200))
  const ronda = Math.max(0, Math.min(3, Math.floor(Number(body.ronda) || 0)))
  const saltarPreguntas = !!body.saltarPreguntas
  if (descripcion.length < 3) return NextResponse.json({ error: 'Escribí una descripción del producto.' }, { status: 400 })

  let fuenteNomenclador: any
  try { fuenteNomenclador = await infoNomenclador() } catch {
    return NextResponse.json({ error: 'No está cargado el nomenclador oficial.' }, { status: 500 })
  }

  const fotos = await partesDeImagenes(body.imagenes)
  const aclaraciones = respuestas.map((r: any) => `- ${r.pregunta}: ${r.respuesta}`).join('\n')
  const contexto = [
    `Producto: ${descripcion}`,
    origen ? `País de origen: ${origen}` : '',
    aclaraciones ? `Aclaraciones del usuario (ya respondidas, no las vuelvas a preguntar):\n${aclaraciones}` : '',
    sinResponder.length ? `Preguntas que el usuario no supo responder (no las repitas; clasificá con lo que hay y decí qué falta confirmar):\n${sinResponder.map((p) => `- ${p}`).join('\n')}` : '',
    fotos.length ? `Se adjuntan ${fotos.length} foto(s) del producto.` : '',
  ].filter(Boolean).join('\n')

  // Tiempo total: ~55 s (maxDuration 60). Orientar no puede comerse más de ~18 s.
  const limite = inicio + 55_000

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
- necesita_aclaracion: true solo si falta un dato que cambia la posición y que no se deduce de la descripción, de las fotos ni de las aclaraciones.
- preguntas: si necesita_aclaracion, hasta 3 preguntas cortas, cada una con 2 a 5 opciones concretas y un motivo breve (qué cambia en la posición según la respuesta). No repitas lo ya respondido ni lo que el usuario no supo responder. Si no, lista vacía. Si es una máquina, un vehículo, un equipo o un bien de capital y no se sabe su estado, una de las preguntas es "¿Es nuevo o usado?" con las opciones Nuevo, Usado y Reacondicionado.` },
    ], ESQUEMA_ORIENTAR, 0.1, Math.min(limite, Date.now() + 18_000), 12_000)

    // Preguntas nuevas: las ya hechas (respondidas o no) no vuelven.
    const yaHechas = new Set([...respuestas.map((r: any) => normalizar(r.pregunta)), ...sinResponder.map(normalizar)])
    const preguntas = (orientacion.preguntas || [])
      .filter((p: any) => p && p.pregunta && Array.isArray(p.opciones) && p.opciones.length && !yaHechas.has(normalizar(p.pregunta)))
      .slice(0, 3)
      .map((p: any) => ({ pregunta: String(p.pregunta), motivo: p.motivo ? String(p.motivo) : '', opciones: p.opciones.map(String) }))
    const quiereAclaracion = !!orientacion.necesita_aclaracion && preguntas.length > 0
    if (quiereAclaracion && ronda < 2 && !saltarPreguntas) {
      return NextResponse.json({ ok: true, etapa: 'preguntas', producto_normalizado: orientacion.producto_normalizado, preguntas, ronda: ronda + 1 })
    }
    // Se clasifica con dudas abiertas: la confianza no puede ser alta.
    const conDudas = saltarPreguntas || sinResponder.length > 0 || quiereAclaracion

    // ── 2. posiciones reales entre las que elegir ──
    // Primero lo que coincide por texto (con sus hermanos de la misma subpartida),
    // después lo que cuelga de las partidas orientadas.
    const textoBusqueda = [descripcion, orientacion.producto_normalizado, ...(orientacion.palabras_clave || [])].join(' ')
    const vistos = new Map<string, Posicion>()
    const sumar = (p: Posicion) => { if (!vistos.has(soloDigitos(p.c))) vistos.set(soloDigitos(p.c), p) }
    const porTexto = await buscarPorTexto(textoBusqueda, 40)
    porTexto.forEach(sumar)
    for (const p of porTexto.slice(0, 20)) (await hijos(soloDigitos(p.c).slice(0, 6), 12)).forEach(sumar)
    const puntaje = await puntuador(textoBusqueda)
    for (const pref of conVecinas((orientacion.partidas_probables || []).slice(0, 5))) {
      let deLaPartida = await hijos(pref, 1000)
      if (deLaPartida.length > 60) {
        // Partida grande: los 60 que mejor coinciden, y siempre los residuales "Los demás".
        const mejores = new Set([...deLaPartida].sort((a, b) => puntaje(b) - puntaje(a)).slice(0, 60))
        deLaPartida = deLaPartida.filter((p) => mejores.has(p) || esResidual(p))
      }
      deLaPartida.forEach(sumar)
    }
    const lista = Array.from(vistos.values()).slice(0, 220)
    const enLista = new Set(lista.map((p) => soloDigitos(p.c)))
    const arbol = await arbolDePosiciones(lista)

    // La biblioteca se consulta mientras elige la IA.
    const bibliotecaP = d1Query<any>(`SELECT * FROM ncm`).catch(() => [] as any[])

    const eleccion = await pedirJSON([
      ...fotos,
      { text: `${REGLAS}

${contexto}
Producto normalizado: ${orientacion.producto_normalizado}

Posiciones vigentes de la NCM entre las que elegir, en árbol: la partida y las subpartidas de arriba (sin |) dan el contexto y el texto que hereda cada ítem; solo se pueden elegir los códigos de 8 dígitos marcados con |:
${arbol || '(no se encontraron posiciones por texto)'}

Tarea:
- candidatos: de 1 a 3 posiciones de 8 dígitos, la más probable primero. Elegí de la lista (solo códigos marcados con |); solo si ninguna corresponde, proponé otro código de 8 dígitos de la NCM que conozcas. confianza de 0 a 100: más de 85 solo si el texto de la NCM lo decide sin suponer nada; si dependés de un dato no informado, 70 o menos. justificacion breve en castellano, citando la regla o el texto de partida que la decide. datos_a_confirmar: los datos no informados de los que depende esa posición (lista vacía si no hay).
- estado: nuevo, usado, reacondicionado o desconocido, según la descripción, las fotos y las aclaraciones.
- iva_reducido_probable: true si la mercadería suele tributar IVA de 10,5 % en Argentina (por ejemplo bienes de capital o informática). motivo_iva breve.
- intervenciones_probables: organismos que suelen intervenir en la importación de este producto en Argentina (SENASA, ANMAT, INAL, INTI, Seguridad eléctrica, ENACOM, etc.) con el motivo. Si no corresponde ninguno, lista vacía.
- advertencias: datos a confirmar con el despachante (por ejemplo, si la posición depende de una medida o material no informado). Si el producto es usado o reacondicionado, avisá que los bienes usados tienen un régimen de importación propio en Argentina (requisitos y alícuotas distintos a los del bien nuevo) y que no corresponde dar por aplicable el beneficio de bien de capital sin confirmarlo con el despachante.` },
    ], ESQUEMA_ELEGIR, 0.1, limite, 25_000)

    const estado: Estado = ['nuevo', 'usado', 'reacondicionado'].includes(eleccion.estado) ? eleccion.estado : 'desconocido'

    // ── 3. validar contra el nomenclador y enriquecer ──
    const biblioteca: any[] = await bibliotecaP
    const enBiblioteca = (codigo: string) => biblioteca.find((r) => soloDigitos(r.codigo).slice(0, 8) === soloDigitos(codigo).slice(0, 8)) || null
    const ivaReducidoDe = (p: Posicion) => p.r === 'BK' || p.r === 'BIT'

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
      const fueraDeLista = !enLista.has(soloDigitos(propuesto).slice(0, 8))
      let confianza = Math.max(0, Math.min(100, Math.round(Number(cand.confianza) || 0)))
      if (ajustado) confianza = Math.min(confianza, 40)
      if (fueraDeLista) confianza = Math.min(confianza, 60)
      if (conDudas) confianza = Math.min(confianza, 65)
      // Hermanos: los demás ítems de la misma subpartida de 6 dígitos, para cambiar a mano.
      const hermanos = await Promise.all((await hijos(soloDigitos(pos.c).slice(0, 6), 12)).map(async (h) => ({
        ncm: formatear(h.c),
        descripcion: h.d,
        aec: h.a,
        regimen: h.r || null,
        en_biblioteca: !!enBiblioteca(h.c),
        alicuotas: alicuotasSugeridas(h.a, ivaReducidoDe(h), enBiblioteca(h.c)),
        antidumping: await medidasPara(h.c, origen || null),
        avisos: avisosPorEstado(h, estado),
      })))
      candidatos.push({
        ncm: formatear(pos.c),
        descripcion: pos.d,
        descripcion_en_portugues: !!pos.pt,
        jerarquia: arriba.map((p) => ({ codigo: formatear(p.c), descripcion: p.d })),
        aec: pos.a,
        confianza,
        justificacion: String(cand.justificacion || ''),
        datos_a_confirmar: (Array.isArray(cand.datos_a_confirmar) ? cand.datos_a_confirmar : []).map(String).filter(Boolean).slice(0, 6),
        ajustado_desde: ajustado ? formatear(propuesto) : null,
        fuera_de_lista: fueraDeLista,
        en_biblioteca: !!lib,
        regimen: pos.r || null,
        alicuotas: alicuotasSugeridas(pos.a, ivaReducidoDe(pos), lib),
        antidumping: medidas,
        avisos: avisosPorEstado(pos, estado),
        hermanos: hermanos.length > 1 ? hermanos : [],
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
      estado,
      iva_reducido_probable: !!eleccion.iva_reducido_probable,
      motivo_iva: eleccion.motivo_iva || '',
      intervenciones_probables: eleccion.intervenciones_probables || [],
      advertencias: eleccion.advertencias || [],
      fuentes: { nomenclador: fuenteNomenclador, antidumping: await infoAntidumping() },
    })
  } catch (e: any) {
    console.error('[clasificar]', e?.message)
    if (esCuota(e)) return NextResponse.json({ error: 'La IA llegó a su límite de uso. Probá de nuevo en unos minutos.' }, { status: 429 })
    if (esTiempo(e)) return NextResponse.json({ error: 'La IA tardó demasiado en responder. Probá de nuevo o acortá la descripción.' }, { status: 504 })
    return NextResponse.json({ error: 'La IA no respondió. Probá de nuevo en un momento.' }, { status: 502 })
  }
}
