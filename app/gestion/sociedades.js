// Las sociedades con las que se presentan documentos ante terceros (navieras,
// aduana, terminales). Successi Ing S.A. es la propia; cuando la importación va
// por la sociedad del cliente, la carta la firma esa otra sociedad y se carga a
// mano con su nombre y CUIT.
//
// Estos datos son el membrete: van en las cartas de garantía y en cualquier
// documento que el sistema emita a nombre de la empresa.

export const SOCIEDAD_PROPIA = {
  id: 'successi',
  nombre: 'Successi Ing S.A.',
  cuit: '30-71842801-3',
  domicilio: 'Brihuega 1257, Bahía Blanca, Buenos Aires, Argentina',
};

export const SOCIEDADES = [SOCIEDAD_PROPIA];

export const sociedadPorId = (id) => SOCIEDADES.find((s) => s.id === id) || null;

// Etiqueta corta para listados: "Successi Ing S.A. · 30-71842801-3".
export const sociedadLabel = (nombre, cuit) => [String(nombre || '').trim(), String(cuit || '').trim()].filter(Boolean).join(' · ');
