'use client';
// Biblioteca de NCM guardadas: alta, edición y baja de posiciones arancelarias.
// Panel lateral con buscador. El formulario se abre en el lugar (arriba para una
// nueva, en la misma fila para editar) y su "Guardar" es el único botón primario.
// Mismas llamadas a la API de siempre.
import { useState, useEffect, useRef, useId } from 'react';
import { gToast } from '../toast';
import { Dialogo, Confirmar, IconoPapelera, IconoMas } from './comun';
import { Campo, TextInput, NumInput, useSiguienteConEnter, fmtPct } from './ui';

// ─── NCM library panel (manage saved NCM codes) ────────────────────────────────
// [clave, rótulo, placeholder]. Una tasa vacía vale 0 % al aplicarla en el
// cotizador: por eso el placeholder es 0.
const NCM_FIELDS = [
  ['codigo', 'Código NCM', '8456.11.00'],
  ['producto', 'Producto o descripción', 'Ej.: máquinas de corte láser'],
  ['der', 'Derechos', '0'],
  ['tasa', 'Tasa estadística', '0'],
  ['iva', 'IVA', '0'],
  ['iva_adic', 'IVA adicional', '0'],
  ['ganancias', 'Percepción de Ganancias', '0'],
  ['iibb', 'Percepción de IIBB', '0'],
];
const TASAS = NCM_FIELDS.slice(2);
const ROTULO_CORTO = { der: 'Derechos', tasa: 'Tasa estadística', iva: 'IVA', iva_adic: 'IVA adicional', ganancias: 'Ganancias', iibb: 'IIBB' };

const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const soloCodigo = (s) => normalizar(s).replace(/[^a-z0-9]/g, '');
const esTactil = () => {
  try { return !!window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches; } catch { return false; }
};

// "Derechos 35 % · IVA 21 % · …", sin las vacías (un 0 cargado sí se muestra:
// "Derechos 0 %" es un dato).
function lineaTasas(nc) {
  return TASAS
    .filter(([k]) => nc[k] != null && String(nc[k]).trim() !== '' && !isNaN(parseFloat(nc[k])))
    .map(([k]) => `${ROTULO_CORTO[k]} ${fmtPct(nc[k])}`)
    .join(' · ');
}

function NcmForm({ initial, onCancel, onSaved }) {
  const empty = { codigo: '', producto: '', der: '', tasa: '', iva: '', iva_adic: '', ganancias: '', iibb: '', notas: '' };
  const [form, setForm] = useState({ ...empty, ...(initial || {}) });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [faltaCodigo, setFaltaCodigo] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const caja = useRef(null);
  const enCurso = useRef(false); // evita un doble envío (Enter + click)
  const idNotas = useId();
  const editando = !!(initial && initial.id);
  useSiguienteConEnter(caja);

  // Al abrir: a la vista y con el foco en el código (en pantallas táctiles no,
  // para no abrir el teclado sin que lo pidan).
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    try { el.scrollIntoView({ block: 'nearest' }); } catch { /* nada */ }
    if (!esTactil()) el.querySelector('input')?.focus({ preventScroll: true });
  }, []);

  const save = async () => {
    if (enCurso.current) return;
    if (!String(form.codigo ?? '').trim()) {
      setFaltaCodigo(true); setErr('');
      caja.current?.querySelector('input')?.focus();
      return;
    }
    enCurso.current = true;
    setSaving(true); setErr(''); setFaltaCodigo(false);
    const body = {
      codigo: String(form.codigo).trim(), producto: form.producto, der: form.der, tasa: form.tasa,
      iva: form.iva, iva_adic: form.iva_adic, ganancias: form.ganancias, iibb: form.iibb, notas: form.notas,
    };
    try {
      let res;
      if (initial && initial.id) {
        res = await fetch(`/api/db/ncm/${initial.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        res = await fetch('/api/db/ncm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      if (!res.ok) throw new Error('Error al guardar');
      onSaved();
    } catch (e) {
      setErr('No se pudo guardar la NCM. Revisá la conexión y probá de nuevo.');
      setSaving(false);
      enCurso.current = false;
    }
  };

  // Escape cierra el formulario (no el panel); Cmd/Ctrl + Enter o S guarda.
  const alTecla = (e) => {
    if (e.nativeEvent?.isComposing) return;
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      onCancel();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'Enter' || e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      if (!e.repeat) save();
    }
  };

  const [cCodigo, cProducto] = NCM_FIELDS;
  const ultimaTasa = TASAS[TASAS.length - 1][0];

  return (
    <div className="cz-form" ref={caja} onKeyDown={alTecla} role="group" aria-label={editando ? `Editar la NCM ${initial.codigo}` : 'Nueva NCM'}>
      <p className="cz-form-titulo">
        {editando ? <>Editar <span className="cz-mono">{initial.codigo}</span></> : 'Nueva NCM'}
      </p>
      <div className="cz-campos">
        <div className="cz-grilla-codigo">
          <Campo label={cCodigo[1]} error={faltaCodigo ? 'Escribí el código NCM.' : null}>
            <TextInput
              mono
              value={form.codigo ?? ''}
              onChange={(v) => { set('codigo', v); if (faltaCodigo && v.trim()) setFaltaCodigo(false); }}
              placeholder={cCodigo[2]}
            />
          </Campo>
          <Campo label={cProducto[1]}>
            <TextInput value={form.producto ?? ''} onChange={(v) => set('producto', v)} placeholder={cProducto[2]} />
          </Campo>
        </div>
        <div>
          <div className="cz-grilla-3">
            {TASAS.map(([key, label, ph]) => (
              <Campo key={key} label={label}>
                <NumInput
                  tipo="pct"
                  sufijo="%"
                  value={form[key]}
                  onChange={(v) => set(key, v)}
                  placeholder={ph}
                  onEnter={key === ultimaTasa ? () => save() : undefined}
                />
              </Campo>
            ))}
          </div>
          <p className="ct-ayuda" style={{ marginTop: 8 }}>Vacías valen 0 %. Al elegir esta NCM en el cotizador se copian estas tasas.</p>
        </div>
        <Campo label="Notas" htmlFor={idNotas} ayuda="Opcional.">
          <textarea id={idNotas} className="ct-input" rows={2} value={form.notas ?? ''} onChange={e => set('notas', e.target.value)} />
        </Campo>
        {err ? <p className="cz-error" role="alert">{err}</p> : null}
      </div>
      <div className="cz-form-acciones">
        <button type="button" className="ct-btn-texto" onClick={onCancel}>Cancelar</button>
        <button type="button" className="ct-btn-primario cz-btn-auto" onClick={save} disabled={saving} title="Guardar (Cmd o Ctrl + Enter)">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

function NcmPanel({ onClose }) {
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');
  const [search, setSearch]   = useState('');
  const [editing, setEditing] = useState(null); // null = none, {} = new, {id,...} = edit
  const [busyId, setBusyId]   = useState(null);
  const [confirmDel, setConfirmDel] = useState(null); // NCM a eliminar

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const res = await fetch('/api/db/ncm');
      if (!res.ok) throw new Error('Error al cargar');
      const json = await res.json();
      setList(Array.isArray(json) ? json : []);
    } catch (e) {
      setErr('No se pudieron cargar las NCM.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const remove = (nc) => setConfirmDel(nc);
  const doRemove = async (nc) => {
    setConfirmDel(null);
    setBusyId(nc.id);
    try {
      const res = await fetch(`/api/db/ncm/${nc.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error');
      setList(xs => xs.filter(x => x.id !== nc.id));
      gToast.success('NCM eliminada.');
    } catch {
      gToast.error('No se pudo eliminar la NCM.');
    } finally {
      setBusyId(null);
    }
  };

  // Al cerrar el formulario el foco vuelve al botón que lo abrió ("Editar" de
  // esa fila o "Nueva NCM"), no se pierde fuera del panel.
  const focoPendiente = useRef(null);
  useEffect(() => {
    if (editing || !focoPendiente.current) return;
    const sel = focoPendiente.current;
    focoPendiente.current = null;
    const el = document.querySelector(sel) || document.querySelector('[data-ncm-nueva]');
    try { el?.focus({ preventScroll: true }); } catch { /* nada */ }
  }, [editing]);
  const cerrarForm = () => {
    const e = editing;
    focoPendiente.current = e && e.id != null ? `[data-ncm-editar="${CSS.escape(String(e.id))}"]` : '[data-ncm-nueva]';
    setEditing(null);
  };
  const onSaved = () => { cerrarForm(); gToast.success('NCM guardada.'); load(); };

  // Busca por código (también sin puntos: 84561100) o por producto, sin acentos.
  const s = normalizar(search.trim());
  const sc = soloCodigo(search);
  const visible = list.filter(nc =>
    !s || normalizar(nc.codigo).includes(s) || normalizar(nc.producto).includes(s) || (!!sc && soloCodigo(nc.codigo).includes(sc))
  );
  const pareceCodigo = /^[\d.\s]+$/.test(search.trim()) && /\d{4}/.test(search);

  const cantidad = list.length;
  const primeraCarga = loading && cantidad === 0;
  const sub = primeraCarga || (err && cantidad === 0) ? null
    : cantidad === 0 ? 'Todavía no hay ninguna.'
      : `${cantidad} ${cantidad === 1 ? 'posición arancelaria' : 'posiciones arancelarias'}`;
  const nueva = editing && !editing.id;

  const fijo = (
    <div className="cz-barra">
      <div className="cz-barra-busca">
        <TextInput value={search} onChange={setSearch} placeholder="Buscar por código o producto" ariaLabel="Buscar por código o producto" />
      </div>
      <div className="cz-barra-lado">
        <button type="button" className="ct-btn-texto cz-texto-fuerte" data-ncm-nueva="" onClick={() => setEditing({})} disabled={nueva}>
          <IconoMas />
          Nueva NCM
        </button>
      </div>
    </div>
  );

  return (
    <>
      <Dialogo
        lateral
        capa={1050}
        ancho={580}
        titulo="NCM guardadas"
        sub={sub}
        fijo={fijo}
        enfocar="input"
        onClose={onClose}
      >
        {nueva ? (
          <NcmForm initial={editing} onCancel={cerrarForm} onSaved={onSaved} />
        ) : null}

        {primeraCarga ? <p className="cz-estado-vacio" role="status">Cargando las NCM…</p> : null}

        {!loading && err ? (
          <div className="cz-estado-vacio" role="alert">
            <p className="cz-error">{err}</p>
            <button type="button" className="ct-btn-texto cz-texto-fuerte" onClick={load} style={{ marginTop: 8 }}>Reintentar</button>
          </div>
        ) : null}

        {!primeraCarga && !err && cantidad === 0 && !nueva ? (
          <p className="cz-estado-vacio">
            Todavía no hay NCM guardadas. Creá una con «Nueva NCM». También se guardan solas cuando guardás una cotización con NCM.
          </p>
        ) : null}

        {!primeraCarga && !err && cantidad > 0 && visible.length === 0 ? (
          <div className="cz-estado-vacio">
            <p style={{ margin: 0 }}>Ninguna NCM coincide con «{search.trim()}».</p>
            {pareceCodigo && !nueva ? (
              <button type="button" className="ct-btn-texto cz-texto-fuerte" style={{ marginTop: 8 }} onClick={() => setEditing({ codigo: search.trim() })}>
                <IconoMas />
                Crear la NCM <span className="cz-mono">{search.trim()}</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {!primeraCarga && !err && visible.length > 0 ? (
          <ul className="cz-lista">
            {visible.map(nc => {
              if (editing && editing.id === nc.id) {
                return (
                  <li key={nc.id}>
                    <NcmForm initial={nc} onCancel={cerrarForm} onSaved={onSaved} />
                  </li>
                );
              }
              const busy = busyId === nc.id;
              const tasas = lineaTasas(nc);
              return (
                <li key={nc.id} className="cz-item" aria-busy={busy || undefined}>
                  <div className="cz-item-cab">
                    <div className="cz-item-textos">
                      <p className="cz-item-nombre cz-mono">{nc.codigo}</p>
                      {nc.producto ? <p className="cz-item-meta">{nc.producto}</p> : null}
                      <p className="cz-item-meta">{tasas || <span className="cz-gris">Sin tasas cargadas</span>}</p>
                      {nc.notas ? <p className="cz-item-extra">{nc.notas}</p> : null}
                    </div>
                    <div className="cz-item-derecha" style={{ gap: 10 }}>
                      <button type="button" className="ct-btn-texto" data-ncm-editar={nc.id} onClick={() => setEditing(nc)} disabled={busy}>Editar</button>
                      <button type="button" className="cz-icono cz-icono-peligro" onClick={() => remove(nc)} disabled={busy} aria-label={`Eliminar la NCM ${nc.codigo}`} title="Eliminar">
                        <IconoPapelera />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Dialogo>

      {confirmDel ? (
        <Confirmar
          titulo="¿Eliminar la NCM?"
          confirmar="Eliminar"
          peligro
          onConfirmar={() => doRemove(confirmDel)}
          onCancelar={() => setConfirmDel(null)}
        >
          Se borra la posición <strong className="cz-mono">{confirmDel.codigo}</strong> de la biblioteca. Las cotizaciones que ya la usan no cambian. No se puede deshacer.
        </Confirmar>
      ) : null}
    </>
  );
}

export { NCM_FIELDS, NcmForm, NcmPanel };
export default NcmPanel;
