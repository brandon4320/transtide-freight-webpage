// Medidas antidumping vigentes en Argentina por posición NCM y país de origen,
// tomadas del último informe semestral que la CNCE presenta a la OMC.
// Ver data/antidumping.json. Lo que se dictó después de la fecha de corte del
// informe no está: por eso el aviso siempre manda a verificar.

export type Medida = {
  ncm: string; producto: string; pais: string; tipo: string; medida: string
  desde: string | null; hasta: string | null; norma?: string | null
}
type Datos = { fuente: string; informe: string; generado: string; corte?: string; medidas: Medida[]; investigaciones?: any[] }

let cache: Promise<Datos | null> | null = null
const digitos = (c: string) => String(c || '').replace(/[^0-9]/g, '')
const norm = (t: string) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

async function cargar(): Promise<Datos | null> {
  if (!cache) {
    cache = (async () => {
      try {
        const mod: any = await import('@/data/antidumping.json')
        return (mod.default || mod) as Datos
      } catch {
        return null // sin archivo de medidas: el clasificador funciona igual, sin este aviso
      }
    })()
  }
  return cache
}

export async function infoAntidumping() {
  const d = await cargar()
  return d ? { informe: d.informe, fuente: d.fuente, corte: d.corte || null, medidas: d.medidas.length } : null
}

// Medidas que alcanzan a una posición: la del informe puede venir a 4, 6 u 8
// dígitos y funciona como prefijo. Si hay país de origen, filtra por él; si no,
// devuelve las de todos los países (sirve como alerta).
// Las medidas duran 5 años salvo prórroga. El informe no da el vencimiento, así que
// las que tienen su última determinación hace más de 5 años se marcan para revisar.
export async function medidasPara(codigo: string, pais?: string | null): Promise<Array<Medida & { revisar: boolean }>> {
  const d = await cargar()
  if (!d) return []
  const c = digitos(codigo)
  const p = pais ? norm(pais) : ''
  const hoy = new Date().toISOString().slice(0, 10)
  return d.medidas.filter((m) => {
    const pref = digitos(m.ncm)
    if (!pref || !c.startsWith(pref)) return false
    if (m.hasta && m.hasta < hoy) return false
    if (p && norm(m.pais) !== p && !norm(m.pais).includes(p) && !p.includes(norm(m.pais))) return false
    return true
  }).map((m) => {
    const limite = new Date(); limite.setFullYear(limite.getFullYear() - 5)
    return { ...m, revisar: !m.hasta && !!m.desde && m.desde < limite.toISOString().slice(0, 10) }
  })
}
