// Lee el resultado del clasificador de Aduanix (aduanix.com.ar/app/clasificador)
// tal como queda al seleccionar la pantalla y copiarla, y devuelve lo que el
// cotizador necesita: posición NCM, apertura SIM y las alícuotas.
//
// No hay API pública, así que el puente es el portapapeles: el texto llega con
// el menú lateral, los títulos y la tabla de tributos, en cualquier orden y con
// tabulaciones o saltos de línea entre el rótulo y el valor. Por eso se lee
// línea por línea y con tolerancia, en vez de esperar un formato fijo.

// '16.00%' → 16 · '2,5 %' → 2.5 · '0.00%' → 0
function aNumero(txt) {
  const limpio = String(txt || '').replace(/\s|%/g, '');
  if (!limpio) return null;
  // Si tiene coma decimal (formato argentino) o punto decimal, queda igual:
  // los valores de Aduanix nunca llevan separador de miles.
  const n = parseFloat(limpio.replace(',', '.'));
  return isFinite(n) ? n : null;
}

// Rótulos de la tabla de tributos. El orden importa: 'IVA adicional' se prueba
// antes que 'IVA' para que no se lo lleve el más corto.
const TRIBUTOS = [
  ['ivaAdic', /iva\s*adicional|percepci[oó]n\s*(de\s*)?iva/i],
  ['iva', /^iva\b|\biva\b(?!\s*adicional)/i],
  ['ganancias', /ganancias/i],
  ['iibb', /iibb|ingresos\s*brutos/i],
  ['tasa', /tasa\s*estad/i],
  ['der', /extrazona|\bdie\b/i],
  ['aec', /arancel\s*externo|\baec\b/i],
  ['dii', /intrazona|\bdii\b/i],
];

const RE_SIM = /\b\d{4}\.\d{2}\.\d{2}\.\d{3}[A-Z]\b/;
const RE_NCM = /\b\d{4}\.\d{2}\.\d{2}\b/;
const RE_PCT = /(-?[\d]+(?:[.,]\d+)?)\s*%/;

export function leerAduanix(texto) {
  const crudo = String(texto || '');
  const lineas = crudo.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const salida = {
    ncm: '', sim: '', producto: '', confianza: null,
    der: null, tasa: null, iva: null, ivaAdic: null, ganancias: null, iibb: null,
    aec: null, dii: null,
    intervenciones: [], dumping: '',
    encontrado: [], falta: [],
  };

  // ── posición y apertura ──
  const sim = crudo.match(RE_SIM);
  if (sim) salida.sim = sim[0];
  const ncm = crudo.match(RE_NCM);
  if (ncm) salida.ncm = ncm[0];

  // ── producto y confianza: vienen debajo de su rótulo ──
  const debajoDe = (re) => {
    const i = lineas.findIndex(l => re.test(l));
    return i >= 0 && lineas[i + 1] ? lineas[i + 1] : '';
  };
  const prod = debajoDe(/^producto$/i);
  if (prod && !RE_NCM.test(prod)) salida.producto = prod;
  const conf = (debajoDe(/^confianza$/i) || '').match(RE_PCT);
  if (conf) salida.confianza = aNumero(conf[1]);

  // ── tributos ──
  // Cada valor puede estar en la misma línea que su rótulo (separado por tab o
  // espacios) o en la línea siguiente. Se toma el primero que aparezca para
  // cada concepto: Aduanix no repite tributos.
  const tomar = (clave, valor) => {
    if (valor === null || salida[clave] !== null) return;
    salida[clave] = valor;
  };
  lineas.forEach((linea, i) => {
    const enLinea = linea.match(RE_PCT);
    const soloValor = /^-?[\d]+(?:[.,]\d+)?\s*%$/.test(linea);
    if (soloValor) return; // se resuelve desde el rótulo de la línea anterior
    const siguiente = lineas[i + 1] || '';
    const valorTxt = enLinea ? enLinea[1] : (/^-?[\d]+(?:[.,]\d+)?\s*%$/.test(siguiente) ? siguiente : null);
    if (valorTxt === null) return;
    const rotulo = linea.replace(RE_PCT, '');
    for (const [clave, re] of TRIBUTOS) {
      if (re.test(rotulo)) { tomar(clave, aNumero(valorTxt)); break; }
    }
  });
  // Sin extrazona, el arancel externo común es el mismo derecho.
  if (salida.der === null && salida.aec !== null) salida.der = salida.aec;

  // ── intervenciones y antidumping ──
  // Las intervenciones salen como "ORGANISMO — Trámite"; se toman las líneas
  // que arrancan con un organismo conocido o traen guion largo después de siglas.
  lineas.forEach((l) => {
    if (/^(senasa|inal|anmat|inti|inv|renar|smc|secretar[ií]a|ministerio|aduana|inase|sedronar|ansv)\b/i.test(l)
      || /^[A-ZÁÉÍÓÚÑ]{3,}\s+—/.test(l)) {
      if (!/sin\s+(medidas|intervenciones)/i.test(l) && !salida.intervenciones.includes(l)) salida.intervenciones.push(l);
    }
  });
  const iDump = lineas.findIndex(l => /^antidumping$/i.test(l));
  if (iDump >= 0 && lineas[iDump + 1]) salida.dumping = lineas[iDump + 1];

  // ── qué se encontró y qué falta, para avisar en pantalla ──
  const campos = [
    ['posición NCM', salida.ncm], ['derechos', salida.der], ['tasa estadística', salida.tasa],
    ['IVA', salida.iva], ['IVA adicional', salida.ivaAdic], ['percepción Ganancias', salida.ganancias],
    ['percepción IIBB', salida.iibb],
  ];
  campos.forEach(([nombre, valor]) => {
    if (valor === null || valor === '') salida.falta.push(nombre); else salida.encontrado.push(nombre);
  });
  salida.sirve = !!salida.ncm || salida.der !== null;
  return salida;
}

export default leerAduanix;
