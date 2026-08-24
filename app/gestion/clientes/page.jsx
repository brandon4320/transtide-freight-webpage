'use client';
import { useState, useEffect, useCallback } from 'react';
import { gToast } from '../toast';

const CARD = { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf1', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' };
const INP  = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '16px', color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const LBL  = { display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#64748b', letterSpacing: 0, marginBottom: 5 };
const PRIMARY = '#0f172a';

const emptyForm = () => ({ nombre: '', cuit: '', email: '', telefono: '', notas: '' });

export default function ClientesPage() {
  const [clientes, setClientes]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [modal,    setModal]      = useState(null); // null | 'new' | clienteObj
  const [form,     setForm]       = useState(emptyForm());
  const [search,   setSearch]     = useState('');
  const [confirm,  setConfirm]    = useState(null); // id to delete
  const [saving,   setSaving]     = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Load from API
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const r = await fetch('/api/db/clientes');
      if (!r.ok) throw new Error('failed');
      const data = await r.json();
      setClientes(Array.isArray(data) ? data : []);
    } catch {
      setLoadError(true);
      gToast.error('No se pudieron cargar los clientes. Revisá tu conexión.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew  = () => { setForm(emptyForm()); setModal('new'); };
  const openEdit = (c) => { setForm({ nombre: c.nombre || '', cuit: c.cuit || '', email: c.email || '', telefono: c.telefono || '', notas: c.notas || '' }); setModal(c); };

  async function errMsg(r, fallback) {
    try { const j = await r.json(); return j?.error || fallback; } catch { return fallback; }
  }

  const submit = async () => {
    if (!form.nombre.trim()) { gToast.error('El nombre es obligatorio.'); return; }
    if (saving) return;
    setSaving(true);
    try {
      if (modal === 'new') {
        const r = await fetch('/api/db/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        if (!r.ok) { gToast.error(await errMsg(r, 'No se pudo crear el cliente.')); return; }
        const created = await r.json();
        setClientes(prev => [created, ...prev]);
        gToast.success('Cliente creado.');
      } else {
        const id = modal.id;
        const r = await fetch(`/api/db/clientes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        if (!r.ok) { gToast.error(await errMsg(r, 'No se pudieron guardar los cambios.')); return; }
        setClientes(prev => prev.map(c => c.id === id ? { ...form, id } : c));
        gToast.success('Cliente actualizado.');
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
      const r = await fetch(`/api/db/clientes/${id}`, { method: 'DELETE' });
      if (!r.ok) { gToast.error(await errMsg(r, 'No se pudo eliminar el cliente.')); return; }
      setClientes(prev => prev.filter(c => c.id !== id));
      gToast.success('Cliente eliminado.');
    } catch {
      gToast.error('Error de conexión. Intentá de nuevo.');
    } finally {
      setConfirm(null);
    }
  };

  const filtered = clientes.filter(c =>
    (c.nombre || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.cuit || '').includes(search) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const conCuit  = clientes.filter(c => c.cuit).length;
  const conEmail = clientes.filter(c => c.email).length;

  return (
    <div style={{ paddingBottom: '3rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.2rem' }}>Clientes</h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>{clientes.length} clientes · {conCuit} con CUIT · {conEmail} con email</p>
        </div>
        <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 1.1rem', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo cliente
        </button>
      </div>

      {/* Buscador */}
      <div style={{ position: 'relative', marginBottom: '1rem', maxWidth: 420 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, CUIT o email…" style={{ ...INP, paddingLeft: '2.2rem' }} />
      </div>

      {/* Listado */}
      {loading ? (
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #e8ecf1', borderTopColor: PRIMARY, borderRadius: '50%', margin: '0 auto 1rem', animation: 'spin 0.8s linear infinite' }} />
          Cargando…
        </div>
      ) : loadError ? (
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.3rem', color: '#b91c1c' }}>No se pudieron cargar los clientes</p>
          <p style={{ fontSize: '0.8rem' }}>Puede ser un problema de conexión.</p>
          <button onClick={load} style={{ marginTop: '0.6rem', padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Reintentar</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          <p style={{ fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{search ? 'Sin resultados' : 'No hay clientes aún'}</p>
          <p style={{ fontSize: '0.8rem' }}>{search ? 'Probá con otro término.' : 'Agregá tu primer cliente con «Nuevo cliente».'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(c => (
            <div key={c.id} style={{ ...CARD, padding: '0.9rem 1.1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div onClick={() => openEdit(c)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>{c.nombre || '— sin nombre —'}</span>
                    {c.cuit && <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>CUIT {c.cuit}</span>}
                  </div>
                  {(c.email || c.telefono) && (
                    <p style={{ marginTop: 2, fontSize: '0.72rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[c.email, c.telefono].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {c.notas && <p style={{ marginTop: 2, fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.notas}</p>}
                </div>
                <div style={{ display: 'inline-flex', gap: 2, flex: '0 0 auto' }}>
                  <button onClick={() => openEdit(c)} title="Editar" aria-label={`Editar ${c.nombre || 'cliente'}`} style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button onClick={() => setConfirm(c.id)} title="Eliminar" aria-label={`Eliminar ${c.nombre || 'cliente'}`} style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal nuevo / editar */}
      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setModal(null)}>
          <div style={{ ...CARD, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: '1.35rem 1.5rem', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>{modal === 'new' ? 'Nuevo cliente' : 'Editar cliente'}</h3>
              <button onClick={() => setModal(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.4rem', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: '0.85rem' }}>
              {[
                ['nombre',   'Nombre / Razón Social', 'Ej: Franco Modulos SRL'],
                ['cuit',     'CUIT',                   'Ej: 30-71234567-8'],
                ['email',    'Email',                   'Ej: info@empresa.com'],
                ['telefono', 'Teléfono',                'Ej: 11-4444-5555'],
              ].map(([field, label, placeholder]) => (
                <div key={field}>
                  <label style={LBL}>{label}</label>
                  <input value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} style={INP} placeholder={placeholder} />
                </div>
              ))}
              <div>
                <label style={LBL}>Notas</label>
                <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2} style={{ ...INP, resize: 'vertical' }} placeholder="Observaciones opcionales..." />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.25rem' }}>
              <button onClick={() => setModal(null)} style={{ padding: '0.55rem 1.1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={submit} disabled={saving} style={{ padding: '0.55rem 1.3rem', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: saving ? 'wait' : 'pointer' }}>
                {saving ? 'Guardando…' : (modal === 'new' ? 'Agregar' : 'Guardar cambios')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setConfirm(null)}>
          <div style={{ ...CARD, maxWidth: 340, padding: '1.75rem', margin: '1rem', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>¿Eliminar cliente?</p>
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
