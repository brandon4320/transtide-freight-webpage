'use client';

// Puente con el clasificador de Aduanix (aduanix.com.ar/app/clasificador).
//
// Aduanix no tiene API pública, así que el puente es el portapapeles:
//   1. "Clasificar en Aduanix" abre la herramienta y se lleva la descripción
//      de la mercadería copiada, lista para pegar allá.
//   2. Clasificás, abrís la pestaña Tributos, seleccionás todo y copiás.
//   3. "Pegar resultado" lee ese texto y completa posición y alícuotas acá.
//
// Nada se aplica sin confirmar: primero se muestra qué se entendió.

import { useState } from 'react';
import { gToast } from '../toast';
import { leerAduanix } from './aduanix-parse';

const URL_ADUANIX = 'https://aduanix.com.ar/app/clasificador';

const TXTBTN = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 500, color: '#6b7280', fontFamily: 'inherit' };
const MINP = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.82rem', color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const pct = (v) => (v === null || v === undefined ? '—' : String(v).replace('.', ',') + ' %');

export function Aduanix({ descripcion = '', onAplicar, onGuardarNcm }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [leido, setLeido] = useState(null);
  const [guardando, setGuardando] = useState(false);

  // Abre el clasificador con la descripción ya copiada: Aduanix no acepta la
  // descripción por URL, así que se pega a mano de un Ctrl+V.
  const abrirAduanix = async () => {
    const d = String(descripcion || '').trim();
    if (d) {
      try { await navigator.clipboard.writeText(d); gToast.success('Descripción copiada: pegala en Aduanix.'); }
      catch { /* sin permiso de portapapeles: se abre igual */ }
    }
    window.open(URL_ADUANIX, '_blank', 'noopener,noreferrer');
  };

  const leer = (valor) => {
    setTexto(valor);
    setLeido(valor.trim() ? leerAduanix(valor) : null);
  };

  const aplicar = () => {
    if (!leido || !leido.sirve) return;
    onAplicar(leido);
    setAbierto(false);
    setTexto(''); setLeido(null);
    gToast.success('Cotización completada con los datos de Aduanix.');
  };

  const guardarNcm = async () => {
    if (!leido || !onGuardarNcm || guardando) return;
    setGuardando(true);
    try { await onGuardarNcm(leido); } finally { setGuardando(false); }
  };

  return (
    <>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.35rem' }}>
        <button onClick={abrirAduanix} style={TXTBTN} title="Abre el clasificador de Aduanix con la descripción copiada">
          Clasificar en Aduanix
        </button>
        <button onClick={() => setAbierto(true)} style={TXTBTN} title="Pegá el resultado de Aduanix y se completan posición y alícuotas">
          Pegar resultado
        </button>
      </div>

      {abierto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setAbierto(false)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem 1.75rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Traer de Aduanix</h3>
              <button onClick={() => setAbierto(false)} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.4rem', lineHeight: 1 }}>×</button>
            </div>
            <p style={{ fontSize: '0.74rem', color: '#9ca3af', lineHeight: 1.5, marginBottom: '0.9rem' }}>
              En Aduanix, clasificá la mercadería, abrí la pestaña <strong style={{ color: '#6b7280' }}>Tributos</strong>, seleccioná toda la pantalla y copiala. Pegá acá abajo.
            </p>

            <textarea
              value={texto}
              onChange={e => leer(e.target.value)}
              onPaste={e => { const t = e.clipboardData?.getData('text'); if (t) { e.preventDefault(); leer(t); } }}
              rows={5}
              placeholder="Pegá acá el resultado de Aduanix"
              style={{ ...MINP, resize: 'vertical', lineHeight: 1.45 }}
            />

            {leido && !leido.sirve && (
              <p style={{ fontSize: '0.76rem', color: '#d97706', marginTop: '0.7rem' }}>
                No reconocí una clasificación en ese texto. Copiá la pantalla del clasificador, no el link.
              </p>
            )}

            {leido && leido.sirve && (
              <div style={{ marginTop: '0.9rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.8rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem 1rem', fontSize: '0.78rem', color: '#6b7280' }}>
                  <span>Posición NCM <strong style={{ color: '#111827', fontFamily: 'ui-monospace, Menlo, monospace' }}>{leido.ncm || '—'}</strong></span>
                  <span>Apertura SIM <strong style={{ color: '#111827', fontFamily: 'ui-monospace, Menlo, monospace' }}>{leido.sim || '—'}</strong></span>
                  <span>Derechos <strong style={{ color: '#111827' }}>{pct(leido.der)}</strong></span>
                  <span>Tasa estadística <strong style={{ color: '#111827' }}>{pct(leido.tasa)}</strong></span>
                  <span>IVA <strong style={{ color: '#111827' }}>{pct(leido.iva)}</strong></span>
                  <span>IVA adicional <strong style={{ color: '#111827' }}>{pct(leido.ivaAdic)}</strong></span>
                  <span>Perc. Ganancias <strong style={{ color: '#111827' }}>{pct(leido.ganancias)}</strong></span>
                  <span>Perc. IIBB <strong style={{ color: '#111827' }}>{pct(leido.iibb)}</strong></span>
                </div>

                {leido.falta.length > 0 && (
                  <p style={{ fontSize: '0.72rem', color: '#d97706', marginTop: '0.6rem', lineHeight: 1.5 }}>
                    Falta {leido.falta.join(', ')}. Si no abriste la pestaña Tributos en Aduanix, volvé, abrila y copiá de nuevo. Lo que falte no se toca acá.
                  </p>
                )}

                {leido.intervenciones.length > 0 && (
                  <p style={{ fontSize: '0.72rem', color: '#d97706', marginTop: '0.6rem', lineHeight: 1.5 }}>
                    Intervenciones detectadas: {leido.intervenciones.join(' · ')}
                  </p>
                )}
                {leido.dumping && !/sin\s+medidas/i.test(leido.dumping) && (
                  <p style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: '0.4rem' }}>Antidumping: {leido.dumping}</p>
                )}

                <p style={{ fontSize: '0.68rem', color: '#c4c9d4', marginTop: '0.6rem', lineHeight: 1.45 }}>
                  Orientativo: Aduanix aclara que lo valida un despachante habilitado.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginTop: '1.4rem' }}>
              <div>
                {leido && leido.sirve && leido.ncm && onGuardarNcm && (
                  <button onClick={guardarNcm} disabled={guardando} style={{ ...TXTBTN, fontSize: '0.76rem' }}>
                    {guardando ? 'Guardando…' : 'Guardar en mis NCM'}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '1.1rem', alignItems: 'center' }}>
                <button onClick={() => setAbierto(false)} style={{ ...TXTBTN, fontSize: '0.8rem' }}>Cancelar</button>
                <button
                  onClick={aplicar}
                  disabled={!leido || !leido.sirve}
                  style={{ background: '#111827', color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 1.1rem', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit', cursor: (leido && leido.sirve) ? 'pointer' : 'default', opacity: (leido && leido.sirve) ? 1 : 0.45 }}
                >
                  Completar la cotización
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Vuelca lo leído en los campos del cotizador. Solo pisa lo que Aduanix trajo:
// si una alícuota no vino, queda la que ya estaba cargada.
export function aplicarAduanix(d, setters) {
  const { setClasificacion, setPDer, setPTas, setPIva, setPIvaA, setPGan, setPIIBB, setDescripcion } = setters;
  if (d.ncm && setClasificacion) setClasificacion(d.ncm);
  if (d.der !== null && setPDer) setPDer(d.der);
  if (d.tasa !== null && setPTas) setPTas(d.tasa);
  if (d.iva !== null && setPIva) setPIva(d.iva);
  if (d.ivaAdic !== null && setPIvaA) setPIvaA(d.ivaAdic);
  if (d.ganancias !== null && setPGan) setPGan(d.ganancias);
  if (d.iibb !== null && setPIIBB) setPIIBB(d.iibb);
  // La descripción del producto solo se completa si el campo está vacío.
  if (d.producto && setDescripcion) setDescripcion((prev) => (String(prev || '').trim() ? prev : d.producto));
}

// Guarda lo leído en la biblioteca de NCM del sistema para la próxima vez.
// La ruta hace ON CONFLICT sobre el código: si ya existe, lo actualiza.
export async function guardarNcmDesdeAduanix(d, productoActual) {
  const num = (v) => (v === null || v === undefined ? '' : String(v));
  const r = await fetch('/api/db/ncm', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      codigo: d.ncm,
      producto: String(productoActual || '').trim() || d.producto || '',
      der: num(d.der), tasa: num(d.tasa), iva: num(d.iva), iva_adic: num(d.ivaAdic),
      ganancias: num(d.ganancias), iibb: num(d.iibb),
      notas: [d.sim ? `Apertura SIM ${d.sim}` : '', d.intervenciones.join(' · ')].filter(Boolean).join(' — ') || '',
    }),
  });
  if (!r.ok) { gToast.error('No se pudo guardar la NCM.'); return false; }
  gToast.success(`NCM ${d.ncm} guardada en tu biblioteca.`);
  return true;
}

export default Aduanix;
