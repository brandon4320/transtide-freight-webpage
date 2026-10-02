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

// Raíz muy simple: saca plurales y algunos sufijos para que "cajas" encuentre "caja".
function raiz(p: string): string {
  if (p.length > 5 && p.endsWith('es')) return p.slice(0, -2)
  if (p.length > 4 && p.endsWith('s')) return p.slice(0, -1)
  return p
}
export function palabras(t: string): string[] {
  return normalizar(t).split(' ').filter((p) => p.length > 2 && !VACIAS.has(p)).map(raiz)
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

// Busca ítems por palabras. Cuenta coincidencias en la descripción del ítem y, con
// menos peso, en las de su partida y capítulo (la NCM describe mucho por herencia:
// "Los demás" solo tiene sentido con lo de arriba).
export async function buscarPorTexto(texto: string, limite = 40): Promise<Array<Posicion & { puntaje: number }>> {
  const { items, normal } = await cargar()
  const buscadas = Array.from(new Set(palabras(texto)))
  if (!buscadas.length) return []
  const res: Array<Posicion & { puntaje: number }> = []
  for (const it of items) {
    const d = soloDigitos(it.c)
    const propio = ' ' + (normal.get(d) || '') + ' '
    const partida = ' ' + (normal.get(d.slice(0, 4)) || '') + ' ' + (normal.get(d.slice(0, 6)) || '') + ' '
    let puntaje = 0
    for (const p of buscadas) {
      // Palabra entera (ya vienen sin plural): "acero" no tiene que encontrar "acerola".
      if (propio.includes(' ' + p + ' ')) puntaje += 3
      else if (partida.includes(' ' + p + ' ')) puntaje += 1
    }
    if (puntaje > 0) res.push({ ...it, puntaje })
  }
  return res.sort((a, b) => b.puntaje - a.puntaje).slice(0, limite)
}

// Si la IA propone un código que no existe, el más parecido que sí existe dentro de
// la misma subpartida o partida (para no descartar una buena pista por un dígito).
export async function codigoMasCercano(codigo: string): Promise<Posicion | null> {
  const d = soloDigitos(codigo).slice(0, 8)
  if (await existe(d)) return buscarPosicion(d)
  for (const largo of [6, 4]) {
    const candidatos = await hijos(d.slice(0, largo), 200)
    if (candidatos.length) return candidatos.find((p) => /los dem/i.test(p.d)) || candidatos[0]
  }
  return null
}
