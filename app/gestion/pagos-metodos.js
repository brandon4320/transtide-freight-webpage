// Métodos de pago del ledger (pagos_registro), compartidos por Forwarding,
// Despachante y la ficha del B/L — una sola fuente para que las etiquetas no
// se desincronicen entre pantallas.
//
// 'usa' = giro desde la cuenta de Estados Unidos: así se le paga a los agentes
// del exterior (Bruce, Shaina, Yachao). El despachante es local, así que su
// modal solo ofrece transferencia/efectivo (además su total se divide en las
// columnas pago_transferencia / pago_cash).
export const METODOS_PAGO = [
  ['usa', 'Cuenta USA'],
  ['transferencia', 'Transferencia'],
  ['cash', 'Efectivo'],
]

export const METODO_DEFAULT_AGENTE = 'usa'

// Los pagos viejos guardaron el valor crudo; si no está en el catálogo se
// muestra tal cual en vez de romper el historial.
export const metodoLabel = (m) => {
  const f = METODOS_PAGO.find(([v]) => v === m)
  return f ? f[1] : (m ? String(m) : 'Transferencia')
}
