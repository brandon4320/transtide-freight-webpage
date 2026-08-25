'use client';
import { useState, useEffect, useCallback } from 'react';
import { gToast } from '../toast';

const INK = '#111827';

// Input de modal: caja fina 1px, radius 6, focus oscuro via className ct-min.
const MINP = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '16px', color: INK, background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const LBL  = { display: 'block', fontSize: '0.68rem', fontWeight: 500, color: '#9ca3af', marginBottom: 5 };

const TIPOS = [
  { id: 'naviera',     label: 'Navieras',         sing: 'Naviera' },
  { id: 'terminal',    label: 'Terminales',       sing: 'Terminal' },
  { id: 'despachante', label: 'Despachantes',     sing: 'Despachante' },
  { id: 'agente',      label: 'Agentes de carga', sing: 'Agente' },
  { id: 'otro',        label: 'Otros',            sing: 'Otro' },
];

const emptyForm = () => ({ tipo: 'naviera', nombre: '', contacto: '', email: '', telefono: '', web: '', observaciones: '' });
const fmtWeb = (w) => { const s = String(w || '').trim(); if (!s) return ''; return /^https?:\/\//i.test(s) ? s : 'https://' + s; };
const webLabel = (w) => String(w || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');

export default function ContactosPage() {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [modal, setModal]     = useState(null); // null | 'new' | itemObj
  const [form, setForm]       = useState(emptyForm());
  const [saving, setSaving]   = useState(false);
  const [search, setSearch]   = useState('');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      const r = await fetch('/api/db/contactos');
      if (!r.ok) throw new Error('failed');
      const data = await r.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setLoadError(true);
      gToast.error('No se pudieron cargar los contactos.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNew  = () => { setForm(emptyForm()); setModal('new'); };
  const openEdit = (c) => { setForm({ tipo: c.tipo || 'naviera', nombre: c.nombre || '', contacto: c.contacto || '', email: c.email || '', telefono: c.telefono || '', web: c.web || '', observaciones: c.observaciones || '' }); setModal(c); };

  async function errMsg(r, fb) { try { return (await r.json())?.error || fb; } catch { return fb; } }

  const submit = async () => {
    if (!form.nombre.trim()) { gToast.error('El nombre es obligatorio.'); return; }
    if (saving) return;
    setSaving(true);
    try {
      if (modal === 'new') {
        const r = await fetch('/api/db/contactos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        if (!r.ok) { gToast.error(await errMsg(r, 'No se pudo crear el contacto.')); return; }
        const created = await r.json();
        setItems(prev => [created, ...prev]);
        gToast.success('Contacto creado.');
      } else {
        const id = modal.id;
        const r = await fetch(`/api/db/contactos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        if (!r.ok) { gToast.error(await errMsg(r, 'No se pudieron guardar los cambios.')); return; }
        setItems(prev => prev.map(c => c.id === id ? { ...c, ...form } : c));
        gToast.success('Contacto actualizado.');
      }
      setModal(null);
    } catch {
      gToast.error('Error de conexión. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      const r = await fetch(`/api/db/contactos/${id}`, { method: 'DELETE' });
      if (!r.ok) { gToast.error(await errMsg(r, 'No se pudo eliminar.')); return; }
      setItems(prev => prev.filter(c => c.id !== id));
      gToast.success('Contacto eliminado.');
    } catch {
      gToast.error('Error de conexión. Intentá de nuevo.');
    } finally {
      setConfirm(null);
    }
  };

  const s = search.trim().toLowerCase();
  const filtered = items.filter(c => {
    if (tipoFilter !== 'todos' && (c.tipo || 'otro') !== tipoFilter) return false;
    if (s && ![c.nombre, c.contacto, c.email, c.observaciones, c.web].some(v => (v || '').toLowerCase().includes(s))) return false;
    return true;
  });
  const grupos = TIPOS.map(t => ({ ...t, list: filtered.filter(c => (c.tipo || 'otro') === t.id) })).filter(g => g.list.length > 0);

  // Links de la línea de meta: mismo gris que el resto, oscurecen al hover (ct-lnk).
  const LNK = { color: '#9ca3af', textDecoration: 'none' };

  return (
    <div style={{ background: '#fff', paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 350, letterSpacing: '-0.02em', color: INK, marginBottom: '0.25rem' }}>Contactos</h2>
          <p style={{ fontSize: '0.74rem', color: '#9ca3af' }}>Navieras, terminales, despachantes y agentes · {items.length} contactos</p>
        </div>
        <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', borderRadius: 6, border: 'none', background: INK, color: '#fff', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo contacto
        </button>
      </div>

      {/* Buscador + filtros: una sola línea fina */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar contacto…"
          className="ct-in"
          style={{ flex: 1, minWidth: 200, border: 'none', borderBottom: '1px solid #e5e7eb', borderRadius: 0, background: 'transparent', padding: '0.4rem 0', fontSize: '16px', color: INK, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: '1.1rem', flexWrap: 'wrap' }}>
          {[['todos', 'Todos'], ...TIPOS.map(t => [t.id, t.label])].map(([id, label]) => {
            const active = tipoFilter === id;
            return (
              <button key={id} onClick={() => setTipoFilter(id)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 0 4px', fontSize: '0.74rem', fontFamily: 'inherit', fontWeight: active ? 600 : 400, color: active ? INK : '#9ca3af', borderBottom: active ? `2px solid ${INK}` : '2px solid transparent' }}>{label}</button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '4rem 0', textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>
          <div style={{ width: 28, height: 28, border: '2px solid #f1f5f9', borderTopColor: INK, borderRadius: '50%', margin: '0 auto 0.9rem', animation: 'spin 0.8s linear infinite' }} />
          Cargando contactos…
        </div>
      ) : loadError ? (
        <div style={{ padding: '4rem 0', textAlign: 'center' }}>
          <p style={{ fontSize: '0.88rem', fontWeight: 600, color: INK, marginBottom: '0.3rem' }}>No se pudieron cargar los contactos</p>
          <button onClick={load} className="ct-retry" style={{ marginTop: '0.6rem', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600, color: INK, borderBottom: `1px solid ${INK}`, paddingBottom: 2 }}>Reintentar</button>
        </div>
      ) : grupos.length === 0 ? (
        <div style={{ padding: '4rem 0', textAlign: 'center' }}>
          <p style={{ fontSize: '0.88rem', fontWeight: 600, color: '#6b7280', marginBottom: '0.3rem' }}>{search || tipoFilter !== 'todos' ? 'Sin resultados' : 'No hay contactos aún'}</p>
          <p style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{search || tipoFilter !== 'todos' ? 'Probá con otro filtro' : 'Agregá tu primer contacto'}</p>
        </div>
      ) : (
        <div>
          {grupos.map(g => (
            <div key={g.id}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '1.5rem 0 0.1rem' }}>
                <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{g.label}</span>
                <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{g.list.length}</span>
              </div>
              {g.list.map(c => (
                <div key={c.id} className="ct-row" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.8rem 0.25rem', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.88rem', fontWeight: 600, color: INK }}>{c.nombre}</p>
                    {(c.contacto || c.web || c.email || c.telefono) && (
                      <p style={{ marginTop: 2, fontSize: '0.68rem', color: '#9ca3af', lineHeight: 1.8 }}>
                        {[
                          c.contacto ? <span key="p">{c.contacto}</span> : null,
                          c.web ? <a key="w" href={fmtWeb(c.web)} target="_blank" rel="noopener noreferrer" className="ct-lnk" style={LNK}>{webLabel(c.web)}</a> : null,
                          c.email ? <a key="e" href={`mailto:${c.email}`} className="ct-lnk" style={LNK}>{c.email}</a> : null,
                          c.telefono ? <a key="t" href={`tel:${c.telefono}`} className="ct-lnk" style={LNK}>{c.telefono}</a> : null,
                        ].filter(Boolean).map((el, i) => (
                          <span key={i} style={{ whiteSpace: 'nowrap' }}>
                            {i > 0 && <span> · </span>}
                            {el}
                          </span>
                        ))}
                      </p>
                    )}
                    {c.observaciones && (
                      <p style={{ marginTop: '0.4rem', paddingTop: '0.35rem', borderTop: '1px solid #f8fafc', fontSize: '0.72rem', color: '#9ca3af', lineHeight: 1.45 }}>{c.observaciones}</p>
                    )}
                  </div>
                  <div className="ct-acts" style={{ display: 'inline-flex', gap: 2, flexShrink: 0, paddingTop: 2 }}>
                    <button onClick={() => openEdit(c)} title="Editar" aria-label={`Editar ${c.nombre}`} style={{ width: 26, height: 26, border: 'none', background: 'none', color: '#c4c9d4', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button onClick={() => setConfirm(c.id)} title="Eliminar" aria-label={`Eliminar ${c.nombre}`} style={{ width: 26, height: 26, border: 'none', background: 'none', color: '#c4c9d4', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Modal nuevo / editar */}
      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setModal(null)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem 1.75rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: INK }}>{modal === 'new' ? 'Nuevo contacto' : 'Editar contacto'}</h3>
              <button onClick={() => setModal(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.4rem', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: '0.8rem' }}>
              <div>
                <label style={LBL}>Tipo</label>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} className="ct-min" style={{ ...MINP, cursor: 'pointer' }}>
                  {TIPOS.map(t => <option key={t.id} value={t.id}>{t.sing}</option>)}
                </select>
              </div>
              <div><label style={LBL}>Nombre *</label><input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="ct-min" style={MINP} placeholder="Ej: MSC" autoFocus /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                <div><label style={LBL}>Persona de contacto</label><input value={form.contacto} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))} className="ct-min" style={MINP} placeholder="Ej: Juan Pérez" /></div>
                <div><label style={LBL}>Web</label><input value={form.web} onChange={e => setForm(f => ({ ...f, web: e.target.value }))} className="ct-min" style={MINP} placeholder="www.msc.com" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                <div><label style={LBL}>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="ct-min" style={MINP} placeholder="info@empresa.com" /></div>
                <div><label style={LBL}>Teléfono</label><input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} className="ct-min" style={MINP} placeholder="+54 11 ..." /></div>
              </div>
              <div><label style={LBL}>Observaciones</label><textarea value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} rows={3} className="ct-min" style={{ ...MINP, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Notas útiles para contactar (cobertura, tiempos, a quién escribir, etc.)" /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', marginTop: '1.25rem' }}>
              <button onClick={() => setModal(null)} className="ct-ghost" style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.74rem', color: '#6b7280', padding: '0.4rem 0' }}>Cancelar</button>
              <button onClick={submit} disabled={saving} style={{ padding: '0.5rem 1.1rem', borderRadius: 6, border: 'none', background: INK, color: '#fff', fontWeight: 600, fontSize: '0.78rem', cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Guardando…' : (modal === 'new' ? 'Agregar' : 'Guardar cambios')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }} onClick={() => setConfirm(null)}>
          <div style={{ background: '#fff', borderRadius: 12, maxWidth: 360, width: '100%', padding: '1.5rem 1.75rem' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: INK, marginBottom: '0.4rem' }}>¿Eliminar contacto?</p>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '1.25rem' }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', alignItems: 'center' }}>
              <button onClick={() => setConfirm(null)} className="ct-ghost" style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.74rem', color: '#6b7280', padding: '0.4rem 0' }}>Cancelar</button>
              <button onClick={() => remove(confirm)} style={{ border: 'none', background: 'none', padding: '0.4rem 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600, color: '#dc2626' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .ct-in::placeholder { color: #9ca3af; }
        .ct-in:focus { border-bottom-color: ${INK}; }
        .ct-min:focus { border-color: ${INK}; }
        .ct-row:hover { background: #fafafa; }
        .ct-lnk:hover { color: ${INK}; }
        .ct-ghost:hover { color: ${INK}; }
        .ct-acts button:hover { color: #6b7280; }
        @media (hover: hover) {
          .ct-acts { opacity: 0; transition: opacity 0.12s; }
          .ct-row:hover .ct-acts, .ct-row:focus-within .ct-acts { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
