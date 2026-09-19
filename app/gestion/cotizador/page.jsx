'use client';
// Cotizador: pestañas marítimo / aéreo, paneles de guardadas y NCM e importación con IA.
// Cada parte vive en su módulo: maritimo.jsx, aereo.jsx, guardadas.jsx, ncm.jsx,
// comun.jsx (primitivas, guardado, borrador), calculo-maritimo.js y calculo-aereo.js
// (números) e impresion.js (documento del cliente).
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import ImportDialog from './import-dialog';
import { TBTN, PBTN, ShipIcon, PlaneIcon } from './comun';
import { CotizadorMaritimo } from './maritimo';
import { CotizadorAereo } from './aereo';
import { SavedQuotesPanel } from './guardadas';
import { NcmPanel } from './ncm';

// ─── tab switcher + default export ────────────────────────────────────────────
function CotizadorInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialMode = searchParams.get('modo') === 'aereo' ? 'aereo' : 'maritimo';
  const [mode, setMode] = useState(initialMode);
  const [importOpen, setImportOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [ncmOpen, setNcmOpen] = useState(false);

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
  useEffect(() => {
    if (salidaPendiente === null) return;
    const onKey = (e) => { if (e.key === 'Escape') setSalidaPendiente(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [salidaPendiente]);
  const salirIgual = () => {
    const href = salidaPendiente;
    setSalidaPendiente(null);
    suciosRef.current = { maritimo: false, aereo: false };
    router.push(href);
  };
  const cualSucio = sucios.maritimo && sucios.aereo ? 'marítimo y el aéreo tienen' : (sucios.aereo ? 'aéreo tiene' : 'marítimo tiene');

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

  return (
    <div className="cotz" style={{ background: '#fff' }}>
      <style>{`
        .cotz input:focus, .cotz textarea:focus, .cotz select:focus { border-color: #111827 !important; outline: none !important; box-shadow: none !important; }
        .cotz .cz-tbtn:hover { color: #111827 !important; }
        .cotz .cz-iconbtn:hover { color: #111827 !important; }
        .cotz .cz-row:hover { background: #fafafa; }
        @media (max-width: 640px) {
          .cotz .cz-mid { display: none !important; }
        }
      `}</style>

      {/* ── header de página ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.75rem 1.5rem', marginBottom: '0.9rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 350, letterSpacing: '-0.02em', color: '#111827', lineHeight: 1.2 }}>Cotizador</h2>
          <p style={{ fontSize: '0.74rem', color: '#9ca3af', marginTop: 2 }}>Costo real, cotización al cliente y rentabilidad</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.4rem', flexWrap: 'wrap' }}>
          <button onClick={() => setSavedOpen(true)} className="cz-tbtn" style={{ ...TBTN, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Cotizaciones guardadas
          </button>

          <button onClick={() => setNcmOpen(true)} className="cz-tbtn" style={{ ...TBTN, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
            NCM guardadas
          </button>

          <button onClick={() => setImportOpen(true)} className="cz-tbtn" style={{ ...TBTN, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Importar de PDF/foto
            <span style={{ fontSize: '0.6rem', fontWeight: 600, color: '#9ca3af' }}>IA</span>
          </button>
        </div>
      </div>

      {/* ── switcher marítimo / aéreo — tabs de texto ─────────────────────── */}
      <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid #f1f5f9', marginBottom: '1rem' }}>
        {[
          { id: 'maritimo', icon: <ShipIcon size={14} />, label: 'Marítimo' },
          { id: 'aereo', icon: <PlaneIcon size={14} />, label: 'Aéreo' },
        ].map(t => (
          <button key={t.id} onClick={() => setMode(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0 0 0.5rem', border: 'none', cursor: 'pointer',
            borderBottom: mode === t.id ? '2px solid #111827' : '2px solid transparent',
            marginBottom: -1,
            fontSize: '0.82rem', fontWeight: mode === t.id ? 600 : 400,
            background: 'transparent',
            color: mode === t.id ? '#111827' : '#9ca3af',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Both mounted to preserve state on toggle */}
      <div style={{ display: mode === 'maritimo' ? 'block' : 'none' }}>
        <CotizadorMaritimo onDirty={onDirtyMar} />
      </div>
      <div style={{ display: mode === 'aereo' ? 'block' : 'none' }}>
        <CotizadorAereo onDirty={onDirtyAer} />
      </div>

      {salidaPendiente !== null && (
        <div onClick={() => setSalidaPendiente(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 400, padding: '1.5rem 1.75rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>Cambios sin guardar</h3>
            <p style={{ fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              El cotizador {cualSucio} cambios que no guardaste como cotización. Queda un borrador en este navegador, pero no en el sistema.
            </p>
            <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'flex-end', alignItems: 'center' }}>
              <button onClick={salirIgual} className="cz-tbtn" style={{ ...TBTN, fontSize: '0.78rem', fontWeight: 600, color: '#dc2626' }}>Salir igual</button>
              <button onClick={() => setSalidaPendiente(null)} style={PBTN}>Seguir editando</button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <ImportDialog
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
        <NcmPanel onClose={() => setNcmOpen(false)} />
      )}
    </div>
  );
}

export default function Cotizador() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: '#9ca3af', background: '#fff' }}>Cargando cotizador…</div>}>
      <CotizadorInner />
    </Suspense>
  );
}
