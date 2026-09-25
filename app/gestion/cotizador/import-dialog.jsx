'use client';

import { useState, useRef } from 'react';

const ACCENT = '#f97316';
const DARK = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const SOFT = '#f8fafc';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp';

const TIPO_LABEL = {
  proforma: 'Proforma',
  packing_list: 'Packing list',
  invoice: 'Invoice',
  other: 'Documento',
};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const inputStyle = {
  width: '100%',
  padding: '0.5rem 0.65rem',
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  fontSize: '0.82rem',
  color: DARK,
  background: '#fff',
  outline: 'none',
  fontFamily: 'inherit',
};

const labelStyle = {
  display: 'block',
  fontSize: '0.68rem',
  fontWeight: 700,
  color: MUTED,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: 4,
};

function Field({ label, children, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function NumberCard({ label, value, onChange, unit }) {
  return (
    <div style={{ padding: '0.7rem 0.8rem', background: SOFT, border: `1px solid ${BORDER}`, borderRadius: 10 }}>
      <div style={{ fontSize: '0.66rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          placeholder="—"
          style={{
            ...inputStyle,
            padding: '0.25rem 0.4rem',
            fontSize: '1rem',
            fontWeight: 700,
            color: DARK,
            background: '#fff',
            border: `1px solid ${BORDER}`,
          }}
        />
        {unit && <span style={{ fontSize: '0.72rem', color: MUTED, fontWeight: 600 }}>{unit}</span>}
      </div>
    </div>
  );
}

function FileSlot({ label, hint, accent, file, setFile, setErr }) {
  const ref = useRef(null);
  const [over, setOver] = useState(false);
  const onPick = (files) => {
    const f = files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) { setErr(`"${label}" muy grande (${formatSize(f.size)}). Máx 10 MB.`); return; }
    setErr(null);
    setFile(f);
  };
  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onPick(e.dataTransfer.files); }}
      style={{
        flex: 1,
        border: `2px dashed ${file ? accent : (over ? accent : BORDER)}`,
        background: file ? `${accent}10` : (over ? `${accent}10` : SOFT),
        borderRadius: 12,
        padding: '1.4rem 1rem',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.15s',
        position: 'relative',
        minHeight: 170,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ position: 'absolute', top: 10, left: 12, fontSize: '0.6rem', fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      {file ? (
        <>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" style={{ marginBottom: 6 }}>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <div style={{ fontWeight: 700, color: DARK, fontSize: '0.82rem', marginBottom: 2, wordBreak: 'break-word', padding: '0 0.5rem' }}>{file.name}</div>
          <div style={{ fontSize: '0.7rem', color: MUTED }}>{formatSize(file.size)}</div>
          <button onClick={(e) => { e.stopPropagation(); setFile(null); }} style={{ marginTop: 8, background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>Quitar</button>
        </>
      ) : (
        <>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" style={{ marginBottom: 8 }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <div style={{ fontWeight: 600, color: DARK, fontSize: '0.78rem', marginBottom: 4 }}>Subir o arrastrar</div>
          <div style={{ fontSize: '0.68rem', color: MUTED }}>{hint}</div>
        </>
      )}
      <input
        ref={ref}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={(e) => onPick(e.target.files)}
      />
    </div>
  );
}

function UploadStage({ file, setFile, fileFactura, setFileFactura, filePacking, setFilePacking, onAnalyze }) {
  const [localErr, setLocalErr] = useState(null);
  const hasAny = !!(fileFactura || filePacking);
  const both   = !!(fileFactura && filePacking);

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
        <FileSlot label="📄 Factura / Proforma" hint="precios, FOB, términos" accent="#0284c7" file={fileFactura} setFile={setFileFactura} setErr={setLocalErr} />
        <FileSlot label="📦 Packing list"        hint="m³, peso, bultos"    accent="#059669" file={filePacking} setFile={setFilePacking} setErr={setLocalErr} />
      </div>

      <p style={{ fontSize: '0.72rem', color: MUTED, textAlign: 'center', marginBottom: 12 }}>
        {both ? '✓ La IA combina la info de ambos documentos para máxima precisión.' : (hasAny ? 'Podés agregar el otro documento para mejorar la extracción.' : 'Subí al menos uno. Si tenés los dos, mejor.')}
      </p>

      {localErr && (
        <div style={{ marginBottom: 12, padding: '0.6rem 0.8rem', background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: '0.78rem' }}>
          {localErr}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          onClick={onAnalyze}
          disabled={!hasAny}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '0.65rem 1.25rem',
            borderRadius: 10, border: 'none',
            background: hasAny ? DARK : '#cbd5e1',
            color: '#fff',
            fontWeight: 700, fontSize: '0.85rem',
            cursor: hasAny ? 'pointer' : 'not-allowed',
            boxShadow: hasAny ? '0 2px 10px rgba(15,23,42,0.15)' : 'none',
          }}
        >
          Analizar con IA
          <span style={{ fontSize: '0.62rem', background: '#3b82f6', padding: '0.1rem 0.45rem', borderRadius: 99, fontWeight: 700 }}>IA</span>
        </button>
      </div>
    </div>
  );
}

function LoadingStage() {
  return (
    <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
      <div
        style={{
          width: 44, height: 44, margin: '0 auto 1rem',
          border: `3px solid ${BORDER}`,
          borderTopColor: ACCENT,
          borderRadius: '50%',
          animation: 'spin 0.9s linear infinite',
        }}
      />
      <div style={{ fontWeight: 700, color: DARK, fontSize: '0.95rem' }}>Analizando documento…</div>
      <div style={{ fontSize: '0.75rem', color: MUTED, marginTop: 4 }}>
        Esto puede tardar entre 2 y 15 segundos.
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorStage({ error, onRetry }) {
  return (
    <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
      <div style={{ fontWeight: 700, color: DARK, fontSize: '0.95rem', marginBottom: 4 }}>No pudimos extraer los datos</div>
      <div style={{ fontSize: '0.78rem', color: '#b91c1c', background: '#fef2f2', padding: '0.6rem 0.8rem', borderRadius: 8, margin: '0.75rem auto', maxWidth: 420 }}>
        {error}
      </div>
      <button
        onClick={onRetry}
        style={{
          marginTop: '0.5rem',
          padding: '0.55rem 1.1rem', borderRadius: 10, border: `1px solid ${BORDER}`,
          background: '#fff', color: DARK, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
        }}
      >
        Probar de nuevo
      </button>
    </div>
  );
}

function PreviewStage({ data, setData, onApply, onBack }) {
  const [showAllItems, setShowAllItems] = useState(false);

  const set = (patch) => setData({ ...data, ...patch });
  const items = data.items || [];
  const visibleItems = showAllItems ? items : items.slice(0, 5);

  const updateItem = (idx, patch) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    setData({ ...data, items: next });
  };

  return (
    <div>
      {/* Tipo + número */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, padding: '0.25rem 0.65rem',
          background: '#fff7ed', color: '#c2410c', borderRadius: 99, border: '1px solid #fed7aa',
          textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
          {TIPO_LABEL[data.documento_tipo] || 'Documento'}
        </span>
        {data.numero && <span style={{ fontSize: '0.78rem', color: MUTED }}>N° {data.numero}</span>}
        {data.fecha && <span style={{ fontSize: '0.78rem', color: MUTED }}>· {data.fecha}</span>}
      </div>

      {/* Proveedor */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1rem' }}>
        <Field label="Proveedor">
          <input style={inputStyle} value={data.proveedor || ''} onChange={(e) => set({ proveedor: e.target.value })} placeholder="—" />
        </Field>
        <Field label="País">
          <input style={inputStyle} value={data.proveedor_pais || ''} onChange={(e) => set({ proveedor_pais: e.target.value })} placeholder="—" />
        </Field>
      </div>

      {/* Carga */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: '1rem' }}>
        <NumberCard label="Volumen" value={data.total_m3} onChange={(v) => set({ total_m3: v })} unit="m³" />
        <NumberCard label="Peso bruto" value={data.total_kg} onChange={(v) => set({ total_kg: v })} unit="kg" />
        <NumberCard label="Bultos" value={data.total_bultos} onChange={(v) => set({ total_bultos: v })} unit="" />
      </div>

      {/* FOB + moneda + términos */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: '1rem' }}>
        <Field label="Total FOB">
          <input
            type="number"
            inputMode="decimal"
            step="any"
            style={inputStyle}
            value={data.total_fob ?? ''}
            onChange={(e) => set({ total_fob: e.target.value === '' ? null : Number(e.target.value) })}
            placeholder="—"
          />
        </Field>
        <Field label="Moneda">
          <input style={inputStyle} value={data.moneda || ''} onChange={(e) => set({ moneda: e.target.value })} placeholder="USD" />
        </Field>
        <Field label="Términos">
          <input style={inputStyle} value={data.terminos || ''} onChange={(e) => set({ terminos: e.target.value })} placeholder="FOB" />
        </Field>
      </div>

      {/* Items */}
      {items.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ ...labelStyle, marginBottom: 8 }}>Items ({items.length})</div>
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
            {visibleItems.map((it, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 70px 90px 90px',
                  gap: 8,
                  padding: '0.55rem 0.7rem',
                  borderBottom: idx === visibleItems.length - 1 ? 'none' : `1px solid ${BORDER}`,
                  alignItems: 'center',
                  background: idx % 2 ? SOFT : '#fff',
                }}
              >
                <input
                  style={{ ...inputStyle, padding: '0.3rem 0.45rem', fontSize: '0.78rem' }}
                  value={it.descripcion || ''}
                  onChange={(e) => updateItem(idx, { descripcion: e.target.value })}
                />
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  style={{ ...inputStyle, padding: '0.3rem 0.45rem', fontSize: '0.78rem', textAlign: 'right' }}
                  value={it.cantidad ?? ''}
                  onChange={(e) => updateItem(idx, { cantidad: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="cant."
                />
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  style={{ ...inputStyle, padding: '0.3rem 0.45rem', fontSize: '0.78rem', textAlign: 'right' }}
                  value={it.precio_unitario ?? ''}
                  onChange={(e) => updateItem(idx, { precio_unitario: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="P/U"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  style={{ ...inputStyle, padding: '0.3rem 0.45rem', fontSize: '0.78rem', textAlign: 'right', fontWeight: 700 }}
                  value={it.subtotal ?? ''}
                  onChange={(e) => updateItem(idx, { subtotal: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="subt."
                />
              </div>
            ))}
          </div>
          {items.length > 5 && (
            <button
              onClick={() => setShowAllItems((s) => !s)}
              style={{
                marginTop: 8, background: 'none', border: 'none',
                color: ACCENT, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', padding: 0,
              }}
            >
              {showAllItems ? '— Mostrar menos' : `+ Ver todos los ${items.length}`}
            </button>
          )}
        </div>
      )}

      {/* Notas */}
      <Field label="Notas">
        <textarea
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }}
          value={data.notas || ''}
          onChange={(e) => set({ notas: e.target.value })}
          placeholder="Observaciones, condiciones de pago, etc."
        />
      </Field>

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: '1.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={onBack}
          style={{
            padding: '0.6rem 1rem', borderRadius: 10, border: `1px solid ${BORDER}`,
            background: '#fff', color: MUTED, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
          }}
        >
          ← Otro archivo
        </button>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => onApply('aereo')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '0.7rem 1.25rem', borderRadius: 10, border: 'none',
              background: '#0ea5e9', color: '#fff',
              fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(14,165,233,0.25)',
            }}
          >
            Cargar en Aéreo ✈️
          </button>
          <button
            onClick={() => onApply('maritimo')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '0.7rem 1.25rem', borderRadius: 10, border: 'none',
              background: ACCENT, color: '#fff',
              fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(249,115,22,0.25)',
            }}
          >
            Cargar en Marítimo 🚢
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ImportDialog({ onClose, onApply }) {
  const [stage, setStage] = useState('upload');
  const [fileFactura, setFileFactura] = useState(null);
  const [filePacking, setFilePacking] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const analyze = async () => {
    if (!fileFactura && !filePacking) return;
    setStage('loading');
    setError(null);
    try {
      const formData = new FormData();
      if (fileFactura) formData.append('factura', fileFactura);
      if (filePacking) formData.append('packing', filePacking);
      const res = await fetch('/api/ai/extract', { method: 'POST', body: formData });
      if (!res.ok) {
        let msg = `Error ${res.status}`;
        try {
          const j = await res.json();
          msg = j.error || msg;
        } catch {}
        throw new Error(msg);
      }
      const json = await res.json();
      if (!json.data) throw new Error('Respuesta vacía');
      setData(json.data);
      setStage('preview');
    } catch (e) {
      setError(e.message || 'Error desconocido');
      setStage('error');
    }
  };

  const apply = (mode) => {
    if (data) onApply(mode, data);
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,23,42,0.5)',
          zIndex: 200,
          animation: 'fadeIn 0.15s ease-out',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(720px, 94vw)',
          maxHeight: '90vh', overflowY: 'auto',
          background: '#fff', borderRadius: 14, zIndex: 210,
          padding: '1.5rem',
          boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: DARK, margin: 0 }}>
              Importar documento
              <span style={{ marginLeft: 8, fontSize: '0.62rem', background: '#3b82f6', color: '#fff', padding: '0.15rem 0.5rem', borderRadius: 99, fontWeight: 700, verticalAlign: 'middle' }}>IA</span>
            </h2>
            <p style={{ fontSize: '0.72rem', color: MUTED, marginTop: 2, marginBottom: 0 }}>
              Extrae datos de proformas, packing lists e invoices con Gemini.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: 1,
              color: MUTED, cursor: 'pointer', padding: 0,
            }}
          >
            ×
          </button>
        </div>

        {stage === 'upload' && <UploadStage fileFactura={fileFactura} setFileFactura={setFileFactura} filePacking={filePacking} setFilePacking={setFilePacking} onAnalyze={analyze} />}
        {stage === 'loading' && <LoadingStage />}
        {stage === 'preview' && data && (
          <PreviewStage
            data={data}
            setData={setData}
            onApply={apply}
            onBack={() => setStage('upload')}
          />
        )}
        {stage === 'error' && <ErrorStage error={error} onRetry={() => { setError(null); setStage('upload'); }} />}

        <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      </div>
    </>
  );
}
