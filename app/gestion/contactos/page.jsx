'use client';
import { useState, useEffect, useCallback } from 'react';
import { gToast } from '../toast';

const CARD = { background: '#fff', borderRadius: 10, padding: '0.9rem 1.1rem', border: '1px solid #e8ecf1', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' };
const INP  = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '16px', color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const LBL  = { display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#64748b', letterSpacing: 0, marginBottom: 5 };
const PRIMARY = '#0f172a';

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

  // Estilo compartido de los links de contacto (web/email/teléfono): texto plano slate.
  const LNK = { color: '#475569', textDecoration: 'none' };

  return (
    <div style={{ paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.2rem' }}>Contactos</h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Navieras, terminales, despachantes y agentes · {items.length} contactos</p>
        </div>
        <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 1.1rem', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo contacto
        </button>
      </div>

      {/* Controls: búsqueda + filtro por tipo */}
      <div style={{ display: 'flex', gap: 10, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar contacto…" style={{ ...INP, paddingLeft: '2.2rem' }} />
        </div>
        <div style={{ display: 'flex', gap: 3, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 9, padding: 3, flexWrap: 'wrap' }}>
          {[['todos', 'Todos'], ...TIPOS.map(t => [t.id, t.label])].map(([id, label]) => (
            <button key={id} onClick={() => setTipoFilter(id)} style={{ padding: '0.4rem 0.85rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600, background: tipoFilter === id ? PRIMARY : 'transparent', color: tipoFilter === id ? '#fff' : '#64748b' }}>{label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #e8ecf1', borderTopColor: PRIMARY, borderRadius: '50%', margin: '0 auto 1rem', animation: 'spin 0.8s linear infinite' }} />
          Cargando contactos…
        </div>
      ) : loadError ? (
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontWeight: 600, color: '#b91c1c', marginBottom: '0.3rem' }}>No se pudieron cargar los contactos</p>
          <button onClick={load} style={{ marginTop: '0.6rem', padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Reintentar</button>
        </div>
      ) : grupos.length === 0 ? (
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          <p style={{ fontWeight: 600, color: '#64748b', marginBottom: '0.3rem' }}>{search || tipoFilter !== 'todos' ? 'Sin resultados' : 'No hay contactos aún'}</p>
          <p style={{ fontSize: '0.82rem' }}>{search || tipoFilter !== 'todos' ? 'Probá con otro filtro' : 'Agregá tu primer contacto'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {grupos.map(g => (
            <div key={g.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 0.55rem 0.1rem' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{g.label}</span>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>· {g.list.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.6rem' }}>
                {g.list.map(c => (
                  <div key={c.id} style={CARD}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.6rem' }}>
                      <p style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem', minWidth: 0 }}>{c.nombre}</p>
                      <div style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
                        <button onClick={() => openEdit(c)} title="Editar" aria-label={`Editar ${c.nombre}`} style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={() => setConfirm(c.id)} title="Eliminar" aria-label={`Eliminar ${c.nombre}`} style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                        </button>
                      </div>
                    </div>
                    {/* Una línea de meta: persona · web · email · teléfono */}
                    {(c.contacto || c.web || c.email || c.telefono) && (
                      <p style={{ marginTop: 4, fontSize: '0.74rem', color: '#64748b', lineHeight: 1.8 }}>
                        {[
                          c.contacto ? <span key="p">{c.contacto}</span> : null,
                          c.web ? <a key="w" href={fmtWeb(c.web)} target="_blank" rel="noopener noreferrer" style={LNK}>{webLabel(c.web)}</a> : null,
                          c.email ? <a key="e" href={`mailto:${c.email}`} style={LNK}>{c.email}</a> : null,
                          c.telefono ? <a key="t" href={`tel:${c.telefono}`} style={LNK}>{c.telefono}</a> : null,
                        ].filter(Boolean).map((el, i) => (
                          <span key={i} style={{ whiteSpace: 'nowrap' }}>
                            {i > 0 && <span style={{ color: '#cbd5e1' }}>  ·  </span>}
                            {el}
                          </span>
                        ))}
                      </p>
                    )}
                    {c.observaciones && (
                      <p style={{ marginTop: '0.55rem', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9', fontSize: '0.74rem', color: '#94a3b8', lineHeight: 1.45 }}>{c.observaciones}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal nuevo / editar */}
      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setModal(null)}>
          <div style={{ ...CARD, width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto', padding: '1.35rem 1.5rem', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem' }}>
              <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>{modal === 'new' ? 'Nuevo contacto' : 'Editar contacto'}</h3>
              <button onClick={() => setModal(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.4rem', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: '0.8rem' }}>
              <div>
                <label style={LBL}>Tipo</label>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={{ ...INP, cursor: 'pointer' }}>
                  {TIPOS.map(t => <option key={t.id} value={t.id}>{t.sing}</option>)}
                </select>
              </div>
              <div><label style={LBL}>Nombre *</label><input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} style={INP} placeholder="Ej: MSC" autoFocus /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                <div><label style={LBL}>Persona de contacto</label><input value={form.contacto} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))} style={INP} placeholder="Ej: Juan Pérez" /></div>
                <div><label style={LBL}>Web</label><input value={form.web} onChange={e => setForm(f => ({ ...f, web: e.target.value }))} style={INP} placeholder="www.msc.com" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                <div><label style={LBL}>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={INP} placeholder="info@empresa.com" /></div>
                <div><label style={LBL}>Teléfono</label><input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} style={INP} placeholder="+54 11 ..." /></div>
              </div>
              <div><label style={LBL}>Observaciones</label><textarea value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} rows={3} style={{ ...INP, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Notas útiles para contactar (cobertura, tiempos, a quién escribir, etc.)" /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.25rem' }}>
              <button onClick={() => setModal(null)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={submit} disabled={saving} style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Guardando…' : (modal === 'new' ? 'Agregar' : 'Guardar cambios')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={() => setConfirm(null)}>
          <div style={{ ...CARD, maxWidth: 360, padding: '1.75rem', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.4rem' }}>¿Eliminar contacto?</p>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1.25rem' }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => setConfirm(null)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => remove(confirm)} style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
