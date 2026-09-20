'use client';
// Cotizador: encabezado (título, pestañas Marítimo y Aéreo, acciones de texto) y
// los dos cotizadores, montados a la vez para no perder lo cargado al cambiar de
// pestaña. Desde acá se abren los paneles: guardadas, NCM e importar con IA.
// Cada parte vive en su módulo: maritimo.jsx, aereo.jsx, guardadas.jsx, ncm.jsx,
// import-dialog.jsx, comun.jsx (guardado, borrador y diálogos), ui.jsx y
// resultado.jsx (sistema visual), calculo-maritimo.js y calculo-aereo.js
// (números) e impresion.js (documento del cliente).
import { useState, useEffect, useRef, useCallback, useId, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import './cotizador.css';
import ImportDialog from './import-dialog';
import { Dialogo, avisarNcmCambiada } from './comun';
import { CotizadorMaritimo } from './maritimo';
import { CotizadorAereo } from './aereo';
import { SavedQuotesPanel } from './guardadas';
import { NcmPanel } from './ncm';

const PESTANAS = [
  { id: 'maritimo', label: 'Marítimo' },
  { id: 'aereo', label: 'Aéreo' },
];

// Estilos propios de la página. En el celular las acciones pasan arriba de las
// pestañas: así el subrayado de la pestaña activa sigue apoyado en la línea.
const CSS_PAGINA = `
@media (max-width: 640px){
  .gestion-root .cz-cab .ct-acciones{order:-1;width:100%;padding-bottom:6px}
}
`;

function CotizadorInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialMode = searchParams.get('modo') === 'aereo' ? 'aereo' : 'maritimo';
  const [mode, setMode] = useState(initialMode);
  const [importOpen, setImportOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [ncmOpen, setNcmOpen] = useState(false);
  const base = useId();
  const refsPestanas = useRef({});

  // ── cambios sin guardar (uno por modo; los dos cotizadores viven montados) ──
  const [sucios, setSucios] = useState({ maritimo: false, aereo: false });
  const suciosRef = useRef(sucios); suciosRef.current = sucios;
  const haySucio = sucios.maritimo || sucios.aereo;
  const onDirtyMar = useCallback((d) => setSucios(s => (s.maritimo === d ? s : { ...s, maritimo: d })), []);
  const onDirtyAer = useCallback((d) => setSucios(s => (s.aereo === d ? s : { ...s, aereo: d })), []);
  const [salidaPendiente, setSalidaPendiente] = useState(null); // href al que quería ir

  // Aviso del navegador al cerrar/recargar con cambios.
  useEffect(() => {
    const handler = (e) => { if (!haySucio) return; e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [haySucio]);

  // Links internos (sidebar, buscador, inicio): mismo protocolo que Operaciones.
  useEffect(() => {
    const handler = (e) => {
      const s = suciosRef.current;
      if (!s.maritimo && !s.aereo) return;
      e.preventDefault();
      setSalidaPendiente(e.detail?.href || '/gestion');
    };
    window.addEventListener('gestion:navigate', handler);
    return () => window.removeEventListener('gestion:navigate', handler);
  }, []);
  const salirIgual = () => {
    const href = salidaPendiente;
    setSalidaPendiente(null);
    suciosRef.current = { maritimo: false, aereo: false };
    router.push(href);
  };
  const textoSalida = sucios.maritimo && sucios.aereo
    ? 'Los cotizadores marítimo y aéreo tienen cambios que no guardaste.'
    : `El cotizador ${sucios.aereo ? 'aéreo' : 'marítimo'} tiene cambios que no guardaste.`;

  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (mode === 'aereo') params.set('modo', 'aereo'); else params.delete('modo');
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleApply = (targetMode, data) => {
    setMode(targetMode);
    // Defer dispatch so the target cotizador is visible/ready
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('cotizador:apply', { detail: { mode: targetMode, data } })
      );
    }, 0);
    setImportOpen(false);
  };

  const handleReactivate = (targetMode, data, meta = null) => {
    const m = targetMode === 'aereo' ? 'aereo' : 'maritimo';
    setMode(m);
    setSavedOpen(false);
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('cotizador:load', { detail: { mode: m, data, meta } })
      );
    }, 0);
  };

  // Pestañas: flechas, Inicio y Fin cambian de pestaña (patrón de tablist).
  const alTeclaPestanas = (e) => {
    const i = PESTANAS.findIndex(p => p.id === mode);
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % PESTANAS.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + PESTANAS.length) % PESTANAS.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = PESTANAS.length - 1;
    if (j === null) return;
    e.preventDefault();
    setMode(PESTANAS[j].id);
    refsPestanas.current[PESTANAS[j].id]?.focus();
  };
  const idPestana = (id) => `${base}-pestana-${id}`;
  const idPanel = (id) => `${base}-panel-${id}`;

  return (
    <div className="ct-pagina">
      <style>{CSS_PAGINA}</style>

      {/* ── encabezado ──────────────────────────────────────────────────── */}
      <div className="cz-cab">
        <h2 className="ct-titulo">Cotizador</h2>
        <div className="ct-navegacion">
          <div className="ct-pestanas" role="tablist" aria-label="Tipo de flete" onKeyDown={alTeclaPestanas}>
            {PESTANAS.map(p => {
              const activa = mode === p.id;
              return (
                <button
                  key={p.id}
                  ref={(el) => { refsPestanas.current[p.id] = el; }}
                  type="button"
                  role="tab"
                  id={idPestana(p.id)}
                  aria-selected={activa}
                  aria-controls={idPanel(p.id)}
                  tabIndex={activa ? 0 : -1}
                  className="ct-pestana"
                  onClick={() => setMode(p.id)}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="ct-acciones">
            <button type="button" className="ct-btn-texto" aria-haspopup="dialog" onClick={() => setSavedOpen(true)} title="Cotizaciones guardadas">
              Guardadas
            </button>
            <button type="button" className="ct-btn-texto" aria-haspopup="dialog" onClick={() => setNcmOpen(true)} title="Posiciones arancelarias guardadas">
              NCM
            </button>
            <button type="button" className="ct-btn-texto" aria-haspopup="dialog" onClick={() => setImportOpen(true)} title="La IA lee la factura, la proforma o el packing list y carga los datos">
              Importar de PDF o foto
            </button>
          </div>
        </div>
      </div>

      {/* Los dos montados: cambiar de pestaña no pierde lo cargado. */}
      <div role="tabpanel" id={idPanel('maritimo')} aria-labelledby={idPestana('maritimo')} style={{ display: mode === 'maritimo' ? 'block' : 'none' }}>
        <CotizadorMaritimo onDirty={onDirtyMar} />
      </div>
      <div role="tabpanel" id={idPanel('aereo')} aria-labelledby={idPestana('aereo')} style={{ display: mode === 'aereo' ? 'block' : 'none' }}>
        <CotizadorAereo onDirty={onDirtyAer} />
      </div>

      {salidaPendiente !== null && (
        <Dialogo
          titulo="¿Salir sin guardar?"
          onClose={() => setSalidaPendiente(null)}
          capa={1300}
          ancho={420}
          className="cz-dialogo-confirmar"
          enfocar="[data-primario]"
          pie={(
            <>
              <button type="button" className="ct-btn-texto cz-texto-peligro" onClick={salirIgual}>Salir igual</button>
              <button type="button" className="ct-btn-primario cz-btn-auto" data-primario="" onClick={() => setSalidaPendiente(null)}>
                Seguir editando
              </button>
            </>
          )}
        >
          <p className="cz-texto">
            {textoSalida} Quedan como borrador en este navegador, pero no se guardan en el sistema.
          </p>
        </Dialogo>
      )}

      {importOpen && (
        <ImportDialog
          modo={mode}
          onClose={() => setImportOpen(false)}
          onApply={handleApply}
        />
      )}

      {savedOpen && (
        <SavedQuotesPanel
          onClose={() => setSavedOpen(false)}
          onReactivate={handleReactivate}
        />
      )}

      {ncmOpen && (
        // Al cerrar el panel, los combobox de NCM vuelven a pedir la lista: lo
        // que se creó o se editó acá tiene que estar ahí sin recargar la página.
        <NcmPanel onClose={() => { setNcmOpen(false); avisarNcmCambiada(); }} />
      )}
    </div>
  );
}

export default function Cotizador() {
  return (
    <Suspense fallback={<div className="ct-pagina" style={{ padding: '2rem 0', fontSize: 14, color: '#9ca3af' }}>Cargando el cotizador…</div>}>
      <CotizadorInner />
    </Suspense>
  );
}
