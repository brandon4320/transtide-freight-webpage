'use client';
// Importar de PDF o foto: subís la factura o proforma y/o el packing list, la IA
// los lee (/api/ai/extract) y, antes de cargar, revisás y corregís lo que leyó.
// Mismas llamadas a la API y el mismo `data` hacia el cotizador (onApply).
// modo: el cotizador que está a la vista; su "Cargar en …" es el botón primario.
import { useState, useRef, useEffect, useId } from 'react';
import { Dialogo, IconoTilde } from './comun';
import { Campo, TextInput, NumInput, fmtNum } from './ui';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp';
const TIPOS_OK = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const EXT_OK = /\.(pdf|png|jpe?g|webp)$/i;

const TIPO_LABEL = {
  proforma: 'Proforma',
  packing_list: 'Packing list',
  invoice: 'Factura',
  other: 'Documento',
};

// 800 B · 340 KB · 1,2 MB
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${fmtNum(Math.round(bytes / 1024), 'decimal')} KB`;
  return `${fmtNum(Math.round((bytes / 1024 / 1024) * 10) / 10, 'decimal')} MB`;
}

// El servidor puede contestar en inglés o con detalles técnicos: en pantalla va
// siempre un mensaje en castellano que diga qué hacer.
function mensajeError(msg) {
  const m = String(msg || '');
  if (/^Se agotó|^El servicio de IA/.test(m)) return m;
  if (/unauthorized|\b401\b/i.test(m)) return 'Tu sesión venció. Volvé a entrar y probá de nuevo.';
  if (/GEMINI_API_KEY|not configured/i.test(m)) return 'La lectura con IA no está configurada en el servidor.';
  if (/supera 10\s?MB/i.test(m)) return 'Un archivo supera los 10 MB. Probá con uno más liviano.';
  if (/tipo no soportado/i.test(m)) return 'Ese tipo de archivo no se puede leer. Usá PDF, JPG, PNG o WEBP.';
  if (/no file|invalid form data/i.test(m)) return 'No llegó ningún archivo. Probá de nuevo.';
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'No hay conexión con el servidor. Revisá internet y probá de nuevo.';
  if (/Respuesta vacía/i.test(m)) return 'La IA no devolvió datos. Probá con un PDF o una foto más nítida.';
  const cod = m.match(/^Error (\d+)/);
  if (cod) return `El servidor respondió con un error (${cod[1]}). Probá de nuevo en un rato.`;
  return GENERICO;
}
const GENERICO = 'Probá de nuevo o con otro archivo.';
// El consejo sobre la calidad del archivo solo tiene sentido si la IA no pudo leerlo.
const conConsejo = (texto) => texto === GENERICO || /no devolvió datos/.test(texto);

// ¿La moneda del documento no es el dólar? (el cotizador trabaja en USD)
const otraMoneda = (m) => {
  const t = String(m || '').trim();
  return !!t && !/^(usd|us\s?\$|u\$s|u\$d|\$|d[oó]lar(es)?( estadounidenses?)?)$/i.test(t);
};

const CSS_IMPORTAR = `
.gestion-root .cz-archivos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.gestion-root .cz-archivo{display:flex;flex-direction:column;min-width:0;min-height:150px;border:1px dashed #d1d5db;border-radius:8px;background:#fff;transition:border-color 120ms ease,background-color 120ms ease}
.gestion-root .cz-archivo:hover{border-color:#9ca3af}
.gestion-root .cz-archivo.cz-archivo-sobre{border-style:solid;border-color:#111827;background:#f9fafb}
.gestion-root .cz-archivo.cz-archivo-listo{border-style:solid;border-color:#e5e7eb}
.gestion-root .cz-archivo-btn{flex:1 1 auto;display:flex;flex-direction:column;align-items:flex-start;gap:4px;width:100%;height:auto;min-height:0!important;min-width:0!important;margin:0;padding:16px!important;border:0;border-radius:8px!important;background:transparent;color:#111827;font-size:14px!important;font-weight:400;line-height:1.4;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent!important}
.gestion-root .cz-archivo-btn:focus-visible{outline:2px solid #111827!important;outline-offset:2px;border-radius:8px!important}
.gestion-root .cz-archivo-cuerpo{flex:1 1 auto;display:flex;flex-direction:column;gap:4px;min-width:0;padding:16px}
.gestion-root .cz-archivo-titulo{margin:0;font-size:14px;font-weight:600;line-height:1.35;color:#111827}
.gestion-root .cz-archivo-ayuda{margin:0;font-size:12.5px;line-height:1.45;color:#6b7280}
.gestion-root .cz-archivo-accion{margin-top:auto;padding-top:16px;font-size:13px;font-weight:500;color:#111827}
.gestion-root .cz-archivo-accion span{font-weight:400;color:#9ca3af}
.gestion-root .cz-archivo-nombre{display:flex;align-items:flex-start;gap:8px;margin:10px 0 0;font-size:13.5px;font-weight:500;line-height:1.4;color:#111827;overflow-wrap:anywhere}
.gestion-root .cz-archivo-botones{display:flex;align-items:center;gap:18px;margin-top:auto;padding-top:14px}
.gestion-root .cz-importar-nota{margin:14px 0 0;font-size:12.5px;line-height:1.5;color:#6b7280}
.gestion-root .cz-cargando{display:flex;flex-direction:column;align-items:center;gap:4px;padding:40px 0 28px;text-align:center}
.gestion-root .cz-rueda{width:28px;height:28px;margin-bottom:12px;border:2px solid #e5e7eb;border-top-color:#111827;border-radius:50%;animation:cz-girar .9s linear infinite}
@keyframes cz-girar{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.gestion-root .cz-rueda{animation-duration:2.4s}}
.gestion-root .cz-doc{margin:0 0 20px;font-size:13.5px;line-height:1.5;color:#6b7280;font-variant-numeric:tabular-nums}
.gestion-root .cz-doc strong{font-weight:600;color:#111827}
.gestion-root .cz-seccion{margin:0 0 12px;font-size:13px;font-weight:600;line-height:1.4;color:#111827}
.gestion-root .cz-seccion-sep{margin-top:28px;padding-top:20px;border-top:1px solid #f1f5f9}
.gestion-root .cz-items{margin:0;padding:0;list-style:none}
.gestion-root .cz-items-fila{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px 14px;padding:6px 0}
.gestion-root .cz-items-num{font-size:12.5px;line-height:1.4;color:#6b7280;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
@media (max-width:560px){
  .gestion-root .cz-archivos{grid-template-columns:minmax(0,1fr)}
  .gestion-root .cz-archivo{min-height:0}
  .gestion-root .cz-items-fila{grid-template-columns:minmax(0,1fr)}
  .gestion-root .cz-items-num{text-align:left}
}
@media (max-width:640px){.gestion-root .cz-archivo-btn::after{content:none}}
`;

// Una zona para un archivo: botón (o arrastrar y soltar) cuando está vacía; el
// nombre, el peso, "Cambiar" y "Quitar" cuando ya hay uno.
function FileSlot({ label, hint, file, setFile, setErr }) {
  const ref = useRef(null);
  const [over, setOver] = useState(false);
  const onPick = (files) => {
    const f = files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) { setErr(`«${f.name}» pesa ${formatSize(f.size)}: el máximo es 10 MB.`); return; }
    const tipoOk = f.type ? TIPOS_OK.includes(f.type) : EXT_OK.test(f.name || '');
    if (!tipoOk) {
      setErr(/heic|heif/i.test(`${f.type} ${f.name}`)
        ? `«${f.name}» es una foto HEIC del iPhone: exportala como JPG y subila de nuevo.`
        : `«${f.name}» no se puede leer. Usá PDF, JPG, PNG o WEBP.`);
      return;
    }
    setErr(null);
    setFile(f);
  };
  const abrir = () => ref.current?.click();
  return (
    <div
      className={['cz-archivo', over && 'cz-archivo-sobre', file && 'cz-archivo-listo'].filter(Boolean).join(' ')}
      onDragOver={(e) => { e.preventDefault(); if (!over) setOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
      onDrop={(e) => { e.preventDefault(); setOver(false); onPick(e.dataTransfer.files); }}
    >
      {file ? (
        <div className="cz-archivo-cuerpo">
          <p className="cz-archivo-titulo">{label}</p>
          <p className="cz-archivo-nombre"><IconoTilde size={16} />{file.name}</p>
          <p className="cz-archivo-ayuda">{formatSize(file.size)}</p>
          <div className="cz-archivo-botones">
            <button type="button" className="ct-btn-texto" onClick={abrir}>Cambiar</button>
            <button type="button" className="ct-btn-texto" onClick={() => setFile(null)} aria-label={`Quitar ${file.name}`}>Quitar</button>
          </div>
        </div>
      ) : (
        <button type="button" className="cz-archivo-btn" onClick={abrir}>
          <span className="cz-archivo-titulo">{label}</span>
          <span className="cz-archivo-ayuda">{hint}</span>
          <span className="cz-archivo-accion">Elegir archivo <span>o arrastralo acá</span></span>
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => { onPick(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
}

function UploadStage({ fileFactura, setFileFactura, filePacking, setFilePacking }) {
  const [localErr, setLocalErr] = useState(null);
  const hasAny = !!(fileFactura || filePacking);
  const both   = !!(fileFactura && filePacking);

  return (
    <div>
      <div className="cz-archivos">
        <FileSlot label="Factura o proforma" hint="Precios, FOB y condiciones." file={fileFactura} setFile={setFileFactura} setErr={setLocalErr} />
        <FileSlot label="Packing list" hint="Metros cúbicos, peso y bultos." file={filePacking} setFile={setFilePacking} setErr={setLocalErr} />
      </div>
      {localErr ? <p className="cz-error" role="alert" style={{ marginTop: 12 }}>{localErr}</p> : null}
      <p className="cz-importar-nota">
        {both
          ? 'La IA combina los dos documentos: la lectura sale más precisa.'
          : hasAny
            ? 'Si tenés el otro documento, sumalo: la lectura sale más precisa.'
            : 'Subí al menos uno; con los dos, mejor. PDF, JPG, PNG o WEBP de hasta 10 MB.'}
      </p>
    </div>
  );
}

function LoadingStage() {
  return (
    <div className="cz-cargando" role="status">
      <span className="cz-rueda" aria-hidden="true" />
      <p className="cz-subtitulo" style={{ fontSize: 15 }}>Leyendo los documentos…</p>
      <p className="cz-texto" style={{ fontSize: 13, color: '#6b7280' }}>Tarda entre 2 y 15 segundos.</p>
    </div>
  );
}

function ErrorStage({ error }) {
  return (
    <div role="alert">
      <p className="cz-subtitulo" style={{ fontSize: 15 }}>No pudimos leer los datos</p>
      <p className="cz-texto" style={{ marginTop: 6 }}>{error}</p>
      {conConsejo(error) ? (
        <p className="cz-texto" style={{ marginTop: 10, fontSize: 13, color: '#6b7280' }}>
          Suele andar mejor con un PDF con texto (no escaneado) o con una foto derecha y bien iluminada.
        </p>
      ) : null}
    </div>
  );
}

function PreviewStage({ data, setData }) {
  const [showAllItems, setShowAllItems] = useState(false);
  const idNotas = useId();

  const set = (patch) => setData({ ...data, ...patch });
  const aNum = (v) => (v === '' ? null : Number(v));
  const items = data.items || [];
  const visibleItems = showAllItems ? items : items.slice(0, 5);

  const updateItem = (idx, patch) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    setData({ ...data, items: next });
  };

  const encabezado = [
    TIPO_LABEL[data.documento_tipo] || 'Documento',
    data.numero ? `N.º ${data.numero}` : null,
    data.fecha || null,
  ].filter(Boolean);
  const moneda = String(data.moneda || '').trim();

  // "2 × 12.000 = 24.000": lo que leyó de cada ítem, para controlar.
  const cuentaItem = (it) => {
    const cant = it.cantidad != null && it.cantidad !== '' ? fmtNum(it.cantidad, 'decimal') : null;
    const pu = it.precio_unitario != null && it.precio_unitario !== '' ? fmtNum(it.precio_unitario, 'dinero') : null;
    const sub = it.subtotal != null && it.subtotal !== '' ? fmtNum(it.subtotal, 'dinero') : null;
    const izq = [cant, pu].filter(Boolean).join(' × ');
    return [izq, sub].filter(Boolean).join(' = ');
  };

  return (
    <div>
      <p className="cz-doc">
        <strong>{encabezado[0]}</strong>
        {encabezado.length > 1 ? ` · ${encabezado.slice(1).join(' · ')}` : ''}
      </p>

      <p className="cz-seccion">Datos principales</p>
      <div className="cz-campos">
        <div>
          <Campo label="FOB total" ayuda="Valor de la mercadería.">
            <NumInput grande prefijo="USD" value={data.total_fob ?? ''} onChange={(v) => set({ total_fob: aNum(v) })} placeholder="Sin dato" />
          </Campo>
          {otraMoneda(moneda) ? (
            <p className="cz-nota-ambar" style={{ marginTop: 6 }}>
              El documento está en {moneda} y el cotizador trabaja en dólares: pasá el FOB a USD antes de cargarlo.
            </p>
          ) : null}
        </div>
        <div className="cz-grilla-2">
          <Campo label="Volumen">
            <NumInput tipo="decimal" sufijo="m³" value={data.total_m3 ?? ''} onChange={(v) => set({ total_m3: aNum(v) })} placeholder="Sin dato" />
          </Campo>
          <Campo label="Peso bruto">
            <NumInput tipo="decimal" sufijo="kg" value={data.total_kg ?? ''} onChange={(v) => set({ total_kg: aNum(v) })} placeholder="Sin dato" />
          </Campo>
        </div>
        <Campo label="Proveedor" ayuda="Se carga en el campo Cliente del cotizador.">
          <TextInput value={data.proveedor || ''} onChange={(v) => set({ proveedor: v })} placeholder="Sin dato" />
        </Campo>
        <Campo label="Notas" htmlFor={idNotas} ayuda="Van a la descripción de la mercadería, junto con los primeros ítems.">
          <textarea
            id={idNotas}
            className="ct-input"
            rows={2}
            value={data.notas || ''}
            onChange={(e) => set({ notas: e.target.value })}
            placeholder="Observaciones, condiciones de pago, etc."
          />
        </Campo>
      </div>

      <div className="cz-seccion-sep">
        <p className="cz-seccion">Otros datos del documento</p>
        <div className="cz-grilla-2">
          <Campo label="País del proveedor">
            <TextInput value={data.proveedor_pais || ''} onChange={(v) => set({ proveedor_pais: v })} placeholder="Sin dato" />
          </Campo>
          <Campo label="Bultos">
            <NumInput tipo="decimal" value={data.total_bultos ?? ''} onChange={(v) => set({ total_bultos: aNum(v) })} placeholder="Sin dato" />
          </Campo>
          <Campo label="Moneda">
            <TextInput value={data.moneda || ''} onChange={(v) => set({ moneda: v })} placeholder="USD" />
          </Campo>
          <Campo label="Condición de venta">
            <TextInput value={data.terminos || ''} onChange={(v) => set({ terminos: v })} placeholder="FOB" />
          </Campo>
        </div>
      </div>

      {items.length > 0 && (
        <div className="cz-seccion-sep">
          <p className="cz-seccion">Ítems <span className="cz-gris">{items.length}</span></p>
          <ul className="cz-items">
            {visibleItems.map((it, idx) => {
              const cuenta = cuentaItem(it);
              return (
                <li key={idx} className="cz-items-fila">
                  <TextInput
                    value={it.descripcion || ''}
                    onChange={(v) => updateItem(idx, { descripcion: v })}
                    ariaLabel={`Descripción del ítem ${idx + 1}`}
                  />
                  {cuenta ? <span className="cz-items-num">{cuenta}</span> : null}
                </li>
              );
            })}
          </ul>
          {items.length > 5 && (
            <button type="button" className="ct-btn-texto" style={{ marginTop: 8 }} onClick={() => setShowAllItems((s) => !s)}>
              {showAllItems ? 'Ver menos' : `Ver los ${items.length} ítems`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ImportDialog({ onClose, onApply, modo = 'maritimo' }) {
  const [stage, setStage] = useState('upload');
  const [fileFactura, setFileFactura] = useState(null);
  const [filePacking, setFilePacking] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const cuerpoRef = useRef(null);
  const primeraVez = useRef(true);

  // Al cambiar de etapa el botón que tenía el foco desaparece: el foco vuelve
  // al diálogo (así Tab y Escape siguen adentro).
  useEffect(() => {
    if (primeraVez.current) { primeraVez.current = false; return; }
    const caja = cuerpoRef.current?.closest('.cz-dialogo');
    try { caja?.focus({ preventScroll: true }); } catch { /* nada */ }
  }, [stage]);

  // Un archivo soltado fuera de las zonas no tiene que abrirse en el navegador
  // (se perdería lo cargado): mientras el diálogo está abierto, se ignora.
  useEffect(() => {
    const evitar = (e) => {
      if (Array.from(e.dataTransfer?.types || []).includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', evitar);
    window.addEventListener('drop', evitar);
    return () => {
      window.removeEventListener('dragover', evitar);
      window.removeEventListener('drop', evitar);
    };
  }, []);

  const hasAny = !!(fileFactura || filePacking);

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
      console.warn('[importar] no se pudo leer el documento:', e?.message || e);
      setError(mensajeError(e?.message));
      setStage('error');
    }
  };

  const apply = (mode) => {
    if (data) onApply(mode, data);
  };

  const principal = modo === 'aereo' ? 'aereo' : 'maritimo';
  const otro = principal === 'aereo' ? 'maritimo' : 'aereo';
  const nombreModo = { maritimo: 'marítimo', aereo: 'aéreo' };

  let pie = null;
  let onEnviar;
  if (stage === 'upload') {
    onEnviar = hasAny ? analyze : undefined;
    pie = (
      <>
        <button type="button" className="ct-btn-texto" onClick={onClose}>Cancelar</button>
        <button type="button" className="ct-btn-primario cz-btn-auto" data-primario="" onClick={analyze} disabled={!hasAny}>
          Leer con IA
        </button>
      </>
    );
  } else if (stage === 'loading') {
    pie = <button type="button" className="ct-btn-texto" onClick={onClose}>Cancelar</button>;
  } else if (stage === 'error') {
    onEnviar = () => { setError(null); setStage('upload'); };
    pie = (
      <>
        <button type="button" className="ct-btn-texto" onClick={onClose}>Cancelar</button>
        <button type="button" className="ct-btn-primario cz-btn-auto" data-primario="" onClick={() => { setError(null); setStage('upload'); }}>
          Probar de nuevo
        </button>
      </>
    );
  } else if (stage === 'preview' && data) {
    onEnviar = () => apply(principal);
    pie = (
      <>
        <button type="button" className="ct-btn-texto cz-pie-izq" onClick={() => setStage('upload')}>Elegir otros archivos</button>
        <button type="button" className="ct-btn-texto" onClick={() => apply(otro)}>Cargar en {nombreModo[otro]}</button>
        <button type="button" className="ct-btn-primario cz-btn-auto" data-primario="" onClick={() => apply(principal)} title="Cmd o Ctrl + Enter">
          Cargar en {nombreModo[principal]}
        </button>
      </>
    );
  }

  const sub = stage === 'preview'
    ? 'Revisá lo que leyó la IA y corregí lo que haga falta antes de cargarlo.'
    : 'La IA lee la factura o proforma y el packing list, y carga los datos en el cotizador.';

  return (
    <Dialogo
      capa={1050}
      titulo="Importar de PDF o foto"
      sub={sub}
      onClose={onClose}
      ancho={stage === 'preview' ? 680 : 600}
      enfocar=".cz-archivo-btn"
      cerrarConFondo={stage !== 'preview'}
      pieConLinea={stage === 'preview'}
      onEnviar={onEnviar}
      pie={pie}
    >
      <style>{CSS_IMPORTAR}</style>
      <div ref={cuerpoRef}>
        {stage === 'upload' && (
          <UploadStage
            fileFactura={fileFactura}
            setFileFactura={setFileFactura}
            filePacking={filePacking}
            setFilePacking={setFilePacking}
          />
        )}
        {stage === 'loading' && <LoadingStage />}
        {stage === 'preview' && data && <PreviewStage data={data} setData={setData} />}
        {stage === 'error' && <ErrorStage error={error} />}
      </div>
    </Dialogo>
  );
}
