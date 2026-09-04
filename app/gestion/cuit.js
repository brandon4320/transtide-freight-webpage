// Validación de CUIT/CUIL (AFIP). Sin esto, Clientes acepta cualquier cosa y los
// duplicados ("Belén SA" con dos CUIT tipeados distinto) se cuelan en la
// facturación. Se acepta con o sin guiones/puntos/espacios porque cada uno lo
// copia de donde puede (constancia de AFIP, factura, WhatsApp).

// Pesos del algoritmo de módulo 11 de AFIP, uno por cada uno de los 10 primeros dígitos.
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

const soloDigitos = (str) => String(str ?? '').replace(/[\s.-]/g, '')

// Dígito verificador esperado para los 10 primeros dígitos. Cuando el cálculo da
// 10, AFIP no emite ese CUIT (cambia el prefijo) pero en la práctica los sistemas
// argentinos lo aceptan como 9; se sigue esa convención para no rechazar reales.
function digitoVerificador(diez) {
  const suma = PESOS.reduce((acc, p, i) => acc + p * Number(diez[i]), 0)
  const dv = 11 - (suma % 11)
  if (dv === 11) return 0
  if (dv === 10) return 9
  return dv
}

/** true si tiene 11 dígitos y el dígito verificador cierra. */
export function cuitValido(str) {
  const d = soloDigitos(str)
  if (!/^\d{11}$/.test(d)) return false
  return digitoVerificador(d.slice(0, 10)) === Number(d[10])
}

/** '30718428013' → '30-71842801-3'. Devuelve '' si no es un CUIT válido, así el
 *  que guarda no tiene que volver a validar. */
export function cuitNormalizado(str) {
  if (!cuitValido(str)) return ''
  const d = soloDigitos(str)
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d[10]}`
}
