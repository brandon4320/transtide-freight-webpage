// Nomenclatura Común del MERCOSUR con el Arancel Externo Común, armada desde
// fuentes oficiales descargables (InfoLEG, Decreto 557/2023 Anexo I, y la planilla
// vigente de la TEC publicada por el MDIC de Brasil). Ver data/nomenclador.json.
//
// Sirve al clasificador con IA para dos cosas:
//   1. Darle al modelo posiciones REALES entre las que elegir (no inventa códigos).
//   2. Validar y enriquecer lo que propone: descripción oficial, jerarquía y AEC.
//
// Se carga una vez por instancia del servidor y queda en memoria.

// r: 'BK' (bien de capital) o 'BIT' (informática y telecomunicaciones), del Anexo I
// del Decreto 557/2023. baja: código que existía en 2022 y ya no está vigente.
export type Posicion = { c: string; d: string; a: number | null; n: number; pt?: boolean; r?: 'BK' | 'BIT'; baja?: boolean }
type Datos = { version: string; fuentes: string[]; generado: string; posiciones: Posicion[] }

let cache: Promise<{ datos: Datos; porCodigo: Map<string, Posicion>; items: Posicion[]; normal: Map<string, string> }> | null = null

// "8303.00.00", "83030000", "8303 00 00" → "83030000"
export const soloDigitos = (codigo: string) => String(codigo || '').replace(/[^0-9]/g, '')

// "83030000" → "8303.00.00"; también acepta 2, 4 y 6 dígitos.
export function formatear(codigo: string): string {
  const d = soloDigitos(codigo)
  if (d.length <= 4) return d
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`
}

// Texto comparable: minúsculas, sin acentos ni signos.
export function normalizar(t: string): string {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Palabras vacías del castellano y de las descripciones de la NCM.
const VACIAS = new Set(('de del la las el los y o en con para por sin a al un una unos unas su sus que se como ' +
  'otros otras demas los demas las demas incluso excepto partes accesorios articulos productos materias ' +
  'tipo uso clase cualquier mismo misma etc').split(' '))

// Raíz muy simple para que singular y plural coincidan: "cables"/"cable" → "cabl",
// "luces"/"luz" → "luc", "redes"/"red" → "red", "motores"/"motor" → "motor".
export function raiz(p: string): string {
  let r = p
  if (r.length > 3 && r.endsWith('s')) r = r.slice(0, -1)
  if (r.length > 3 && r.endsWith('e')) r = r.slice(0, -1)
  if (r.length > 3 && r.endsWith('s')) r = r.slice(0, -1)   // "envases" → "envas" → "enva", igual que "envase"
  if (r.endsWith('z')) r = r.slice(0, -1) + 'c'             // "luz" → "luc", como "luces" → "luc"
  return r
}
// Las vacías se comparan antes y después de sacar la raíz ("otras" → "otra").
const VACIAS_RAIZ = new Set(Array.from(VACIAS).map(raiz))
export function palabras(t: string): string[] {
  return normalizar(t).split(' ')
    .filter((p) => p.length > 2 && !VACIAS.has(p))
    .map(raiz)
    .filter((p) => !VACIAS_RAIZ.has(p))
}

async function cargar() {
  if (!cache) {
    cache = (async () => {
      const mod: any = await import('@/data/nomenclador.json')
      const datos: Datos = mod.default || mod
      const porCodigo = new Map<string, Posicion>()
      const normal = new Map<string, string>()
      for (const p of datos.posiciones) {
        porCodigo.set(soloDigitos(p.c), p)
        normal.set(soloDigitos(p.c), palabras(p.d).join(' '))
      }
      // Los códigos dados de baja quedan para mostrar jerarquía, pero no se proponen.
      const items = datos.posiciones.filter((p) => p.n === 8 && !p.baja)
      return { datos, porCodigo, items, normal }
    })().catch((e) => { cache = null; throw e })
  }
  return cache
}

export async function infoNomenclador() {
  const { datos, items } = await cargar()
  return { version: datos.version, fuentes: datos.fuentes, generado: datos.generado, items: items.length }
}

export async function existe(codigo: string): Promise<boolean> {
  const { porCodigo } = await cargar()
  const p = porCodigo.get(soloDigitos(codigo).slice(0, 8))
  return !!p && p.n === 8 && !p.baja
}

export async function buscarPosicion(codigo: string): Promise<Posicion | null> {
  const { porCodigo } = await cargar()
  return porCodigo.get(soloDigitos(codigo).slice(0, 8)) || null
}

// Capítulo, partida y subpartidas por encima del ítem, de mayor a menor.
export async function jerarquia(codigo: string): Promise<Posicion[]> {
  const { porCodigo } = await cargar()
  const d = soloDigitos(codigo).slice(0, 8)
  const salida: Posicion[] = []
  for (const largo of [2, 4, 5, 6, 7]) {
    const p = porCodigo.get(d.slice(0, largo))
    if (p && p.n === largo) salida.push(p)
  }
  return salida
}

// Ítems de 8 dígitos que cuelgan de un prefijo (partida o subpartida).
export async function hijos(prefijo: string, limite = 80): Promise<Posicion[]> {
  const { items } = await cargar()
  const pref = soloDigitos(prefijo)
  if (pref.length < 4) return []
  return items.filter((p) => soloDigitos(p.c).startsWith(pref)).slice(0, limite)
}

// Puntaje de un ítem contra las palabras buscadas. Cuenta coincidencias en la
// descripción del ítem y, con menos peso, en las de su partida y subpartidas (la
// NCM describe mucho por herencia: "Los demás" solo tiene sentido con lo de arriba).
export async function puntuador(texto: string): Promise<(p: Posicion) => number> {
  const { normal } = await cargar()
  const buscadas = Array.from(new Set(palabras(texto)))
  return (it: Posicion) => {
    if (!buscadas.length) return 0
    const d = soloDigitos(it.c)
    const propio = ' ' + (normal.get(d) || '') + ' '
    const partida = ' ' + [4, 5, 6, 7].map((n) => normal.get(d.slice(0, n)) || '').join(' ') + ' '
    let puntaje = 0
    for (const p of buscadas) {
      // Palabra entera (ya vienen sin plural): "acero" no tiene que encontrar "acerola".
      if (propio.includes(' ' + p + ' ')) puntaje += 3
      else if (partida.includes(' ' + p + ' ')) puntaje += 1
    }
    return puntaje
  }
}

// Busca ítems por palabras, de mayor a menor puntaje.
export async function buscarPorTexto(texto: string, limite = 40): Promise<Array<Posicion & { puntaje: number }>> {
  const { items } = await cargar()
  const puntaje = await puntuador(texto)
  const res: Array<Posicion & { puntaje: number }> = []
  for (const it of items) {
    const p = puntaje(it)
    if (p > 0) res.push({ ...it, puntaje: p })
  }
  return res.sort((a, b) => b.puntaje - a.puntaje).slice(0, limite)
}

// "Los demás" / "Las demás": el ítem residual de una subpartida.
export const esResidual = (p: Posicion) => /^l[oa]s dem[aá]s\b/i.test(String(p.d || '').trim())

// Si la IA propone un código que no existe, el que sí existe dentro de la misma
// subpartida (7 o 6 dígitos): el único ítem que tenga, o su residual "Los demás".
// Nunca se cae a la partida entera: eso sería cambiar de producto, no corregir un dígito.
export async function codigoMasCercano(codigo: string): Promise<Posicion | null> {
  const d = soloDigitos(codigo).slice(0, 8)
  if (await existe(d)) return buscarPosicion(d)
  for (const largo of [7, 6]) {
    if (d.length < largo) continue
    const candidatos = await hijos(d.slice(0, largo), 200)
    if (!candidatos.length) continue
    if (candidatos.length === 1) return candidatos[0]
    return candidatos.find(esResidual) || null
  }
  return null
}
