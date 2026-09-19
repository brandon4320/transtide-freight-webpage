'use client';
// Biblioteca de NCM guardadas: alta, edición y baja de posiciones arancelarias.
import { useState, useEffect } from 'react';
import { gToast } from '../toast';
import { LBL, INP, TBTN, PBTN } from './comun';

// ─── NCM library panel (manage saved NCM codes) ────────────────────────────────
const NCM_FIELDS = [
  ['codigo', 'Código NCM *', '8456.11.00'],
  ['producto', 'Producto / descripción', 'Ej: Máquinas láser'],
  ['der', 'DER %', '35'],
  ['tasa', 'Tasa Estadística %', '0'],
  ['iva', 'IVA %', '21'],
  ['iva_adic', 'IVA Adicional %', '20'],
  ['ganancias', 'Perc. Ganancias %', '6'],
  ['iibb', 'Perc. IIBB %', '2.5'],
];

function NcmForm({ initial, onCancel, onSaved }) {
  const empty = { codigo: '', producto: '', der: '', tasa: '', iva: '', iva_adic: '', ganancias: '', iibb: '', notas: '' };
  const [form, setForm] = useState({ ...empty, ...(initial || {}) });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.codigo.trim()) { setErr('El código NCM es obligatorio.'); return; }
    setSaving(true); setErr('');
    const body = {
      codigo: form.codigo.trim(), producto: form.producto, der: form.der, tasa: form.tasa,
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
      setErr(e.message || 'Error al guardar');
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '0.9rem 0 1.1rem', borderBottom: '1px solid #f1f5f9' }}>
      <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827', marginBottom: '0.8rem' }}>{initial && initial.id ? 'Editar NCM' : 'Nueva NCM'}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem 1.5rem' }}>
        {NCM_FIELDS.map(([key, label, ph]) => (
          <div key={key} style={key === 'codigo' || key === 'producto' ? { gridColumn: '1 / -1' } : {}}>
            <label style={LBL}>{label}</label>
            <input
              type={['der','tasa','iva','iva_adic','ganancias','iibb'].includes(key) ? 'number' : 'text'}
              inputMode={['der','tasa','iva','iva_adic','ganancias','iibb'].includes(key) ? 'decimal' : undefined}
              step="any"
              value={form[key] ?? ''}
              onChange={e => set(key, e.target.value)}
              placeholder={ph}
              style={{ ...INP, fontFamily: key === 'codigo' ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit' }}
            />
          </div>
        ))}
      </div>
      <div style={{ marginTop: '0.6rem' }}>
        <label style={LBL}>Notas</label>
        <textarea value={form.notas ?? ''} onChange={e => set('notas', e.target.value)} placeholder="Opcional" rows={2} style={{ ...INP, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>
      {err && <p style={{ fontSize: '0.78rem', color: '#dc2626', marginTop: '0.5rem' }}>{err}</p>}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', alignItems: 'center', marginTop: '0.75rem' }}>
        <button onClick={onCancel} className="cz-tbtn" style={TBTN}>Cancelar</button>
        <button onClick={save} disabled={saving} style={{ ...PBTN, background: saving ? '#9ca3af' : '#111827', cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Guardando…' : 'Guardar'}</button>
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
      setErr(e.message || 'Error al cargar');
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
      gToast.error('No se pudo eliminar la NCM');
    } finally {
      setBusyId(null);
    }
  };

  const onSaved = () => { setEditing(null); load(); };

  const s = search.trim().toLowerCase();
  const visible = list.filter(nc =>
    !s || (nc.codigo || '').toLowerCase().includes(s) || (nc.producto || '').toLowerCase().includes(s)
  );

  // arma "DER 35% · IVA 21% · …" omitiendo vacíos/cero
  const ratesLine = (nc) => {
    const parts = [];
    const add = (lbl, v) => { const num = parseFloat(v); if (v != null && v !== '' && !isNaN(num) && num !== 0) parts.push(`${lbl} ${v}%`); };
    add('DER', nc.der); add('Tasa', nc.tasa); add('IVA', nc.iva);
    add('IVA ad.', nc.iva_adic); add('Gan.', nc.ganancias); add('IIBB', nc.iibb);
    return parts.join(' · ');
  };

  return (
    <>
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1050, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
      <div className="cz-modal" style={{ background: '#fff', width: '100%', maxWidth: '560px', height: '100%', overflowY: 'auto', borderLeft: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column' }}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.1rem 1.5rem', borderBottom: '1px solid #f1f5f9', background: '#fff', position: 'sticky', top: 0, zIndex: 10 }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>NCM guardadas</h3>
            <p style={{ fontSize: '0.74rem', color: '#9ca3af' }}>{list.length} posición{list.length === 1 ? '' : 'es'} arancelaria{list.length === 1 ? '' : 's'}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="cz-tbtn" style={{ ...TBTN, fontSize: '1.05rem', lineHeight: 1 }}>×</button>
        </div>

        {/* search + new */}
        <div style={{ padding: '0.9rem 1.5rem', background: '#fff', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: '64px', zIndex: 9, display: 'flex', gap: '1.1rem', alignItems: 'center' }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por código o producto…" style={{ ...INP, flex: 1 }} />
          <button onClick={() => setEditing({})} style={{ ...PBTN, flexShrink: 0, whiteSpace: 'nowrap' }}>
            + Nueva NCM
          </button>
        </div>

        {/* body */}
        <div style={{ padding: '0.5rem 1.5rem 1.25rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
          {editing && (
            <NcmForm initial={editing.id ? editing : null} onCancel={() => setEditing(null)} onSaved={onSaved} />
          )}

          {loading && <p style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '0.75rem 0' }}>Cargando…</p>}
          {err && <p style={{ color: '#dc2626', fontSize: '0.85rem', padding: '0.75rem 0' }}>{err}</p>}
          {!loading && !err && visible.length === 0 && !editing && <p style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '0.75rem 0' }}>No hay NCM que coincidan. Creá una con “+ Nueva NCM”.</p>}

          {visible.map(nc => {
            const busy = busyId === nc.id;
            const rl = ratesLine(nc);
            return (
              <div key={nc.id} className="cz-row" style={{ padding: '0.8rem 0.25rem', borderBottom: '1px solid #f1f5f9', opacity: busy ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.2rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '0.88rem', fontWeight: 600, color: '#111827', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{nc.codigo}</p>
                    {nc.producto && <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.1rem' }}>{nc.producto}</p>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexShrink: 0 }}>
                    <button onClick={() => setEditing(nc)} disabled={busy} className="cz-tbtn" style={{ ...TBTN, fontSize: '0.72rem', cursor: busy ? 'default' : 'pointer' }}>Editar</button>
                    <button onClick={() => remove(nc)} disabled={busy} title="Eliminar" aria-label="Eliminar" className="cz-iconbtn" style={{ border: 'none', cursor: busy ? 'default' : 'pointer', background: 'none', color: '#c4c9d4', padding: 2, display: 'inline-flex' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                    </button>
                  </div>
                </div>
                {rl && <p style={{ fontSize: '0.72rem', color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{rl}</p>}
                {nc.notas && <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.2rem' }}>{nc.notas}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>

    {confirmDel && (
      <div onClick={() => setConfirmDel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '1.5rem 1.75rem', maxWidth: 360 }}>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', marginBottom: '0.4rem' }}>¿Eliminar NCM?</p>
          <p style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '1.25rem' }}>Se borra la posición “<span style={{ color: '#dc2626' }}>{confirmDel.codigo}</span>”. No se puede deshacer.</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button onClick={() => setConfirmDel(null)} className="cz-tbtn" style={TBTN}>Cancelar</button>
            <button onClick={() => doRemove(confirmDel)} style={{ ...TBTN, fontSize: '0.78rem', fontWeight: 600, color: '#dc2626' }}>Eliminar</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export { NCM_FIELDS, NcmForm, NcmPanel };
export default NcmPanel;
