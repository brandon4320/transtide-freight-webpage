'use client';
import { useState, useEffect, useCallback } from 'react';
import { gToast } from '../toast';

const CARD = { background: '#fff', borderRadius: '14px', padding: '1rem 1.1rem', boxShadow: '0 1px 4px rgba(15,23,42,0.05)', border: '1px solid #e8ecf1' };
const INP  = { width: '100%', padding: '0.5rem 0.7rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', color: '#1e293b', background: '#fff', outline: 'none', boxSizing: 'border-box' };
const LBL  = { display: 'block', fontSize: '0.64rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' };

const TIPOS = [
  { id: 'naviera',     label: 'Navieras',     sing: 'Naviera',     c: '#0284c7', bg: '#eff6ff', border: '#bfdbfe' },
  { id: 'terminal',    label: 'Terminales',   sing: 'Terminal',    c: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
  { id: 'despachante', label: 'Despachantes', sing: 'Despachante', c: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  { id: 'agente',      label: 'Agentes de carga', sing: 'Agente',  c: '#ea580c', bg: '#fff4ee', border: '#fed7aa' },
  { id: 'otro',        label: 'Otros',        sing: 'Otro',        c: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
];
const tipoMeta = (t) => TIPOS.find(x => x.id === t) || TIPOS[TIPOS.length - 1];

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

  return (
    <div style={{ paddingBottom: '3rem' }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.2rem' }}>Contactos</h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Navieras, terminales, despachantes y agentes · {items.length} contactos</p>
        </div>
        <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', flexWrap: 'wrap', flex: '1 1 auto', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.45rem 0.75rem', flex: '1 1 180px', maxWidth: 340 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar contacto…" style={{ border: 'none', outline: 'none', fontSize: '0.82rem', color: '#1e293b', width: '100%', background: 'transparent' }} />
          </div>
          <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', borderRadius: '50px', border: 'none', cursor: 'pointer', background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: '0.82rem' }}>+ Nuevo contacto</button>
        </div>
      </div>

      {/* tipo filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[['todos', 'Todos'], ...TIPOS.map(t => [t.id, t.label])].map(([id, label]) => {
          const sel = tipoFilter === id;
          return (
            <button key={id} onClick={() => setTipoFilter(id)} style={{ padding: '0.4rem 0.9rem', borderRadius: 50, cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700, border: `1.5px solid ${sel ? '#0f172a' : '#e2e8f0'}`, background: sel ? '#0f172a' : '#fff', color: sel ? '#fff' : '#64748b' }}>{label}</button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Cargando contactos…</div>
      ) : loadError ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontWeight: 600, color: '#b91c1c', marginBottom: '0.3rem' }}>No se pudieron cargar los contactos</p>
          <button onClick={load} style={{ marginTop: '0.6rem', padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Reintentar</button>
        </div>
      ) : grupos.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          <p style={{ fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>{search || tipoFilter !== 'todos' ? 'Sin resultados' : 'No hay contactos aún'}</p>
          <p style={{ fontSize: '0.82rem' }}>{search || tipoFilter !== 'todos' ? 'Probá con otro filtro' : 'Agregá tu primer contacto'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {grupos.map(g => (
            <div key={g.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.7rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: g.c, background: g.bg, border: `1px solid ${g.border}`, padding: '0.18rem 0.65rem', borderRadius: 6 }}>{g.label}</span>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{g.list.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.85rem' }}>
                {g.list.map(c => (
                  <div key={c.id} style={{ ...CARD, borderTop: `3px solid ${c.tipo === 'otro' || !c.tipo ? '#cbd5e1' : tipoMeta(c.tipo).c}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.45rem' }}>
                      <p style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{c.nombre}</p>
                      <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                        <button onClick={() => openEdit(c)} aria-label={`Editar ${c.nombre}`} style={{ padding: '0.25rem 0.55rem', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>Editar</button>
                        <button onClick={() => setConfirm(c.id)} aria-label={`Eliminar ${c.nombre}`} title="Eliminar" style={{ padding: '0.25rem 0.5rem', borderRadius: 7, border: '1px solid #fee2e2', background: '#fff', color: '#dc2626', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>×</button>
                      </div>
                    </div>
                    {c.contacto && <p style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '0.3rem' }}>{c.contacto}</p>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.78rem' }}>
                      {c.web && (
                        <a href={fmtWeb(c.web)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                          {webLabel(c.web)}
                        </a>
                      )}
                      {c.email && <a href={`mailto:${c.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#475569', textDecoration: 'none' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>{c.email}</a>}
                      {c.telefono && <a href={`tel:${c.telefono}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#475569', textDecoration: 'none' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>{c.telefono}</a>}
                    </div>
                    {c.observaciones && (
                      <div style={{ marginTop: '0.6rem', paddingTop: '0.55rem', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 7 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        <p style={{ fontSize: '0.76rem', color: '#64748b', lineHeight: 1.45 }}>{c.observaciones}</p>
                      </div>
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
          <div style={{ ...CARD, width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{modal === 'new' ? 'Nuevo contacto' : 'Editar contacto'}</h3>
              <button onClick={() => setModal(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.3rem' }}>×</button>
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button onClick={() => setModal(null)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={submit} disabled={saving} style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: saving ? '#fdba74' : '#ea580c', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Guardando…' : (modal === 'new' ? 'Agregar' : 'Guardar cambios')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={() => setConfirm(null)}>
          <div style={{ ...CARD, maxWidth: 360, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.4rem' }}>¿Eliminar contacto?</p>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1.25rem' }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button onClick={() => setConfirm(null)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => remove(confirm)} style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
