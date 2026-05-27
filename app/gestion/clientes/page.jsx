'use client';
import { useState, useEffect } from 'react';

const CARD = { background: '#fff', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.04)' };
const INP  = { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', color: '#1e293b', background: '#fff', outline: 'none', boxSizing: 'border-box' };
const LBL  = { display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' };

const emptyForm = () => ({ nombre: '', cuit: '', email: '', telefono: '', notas: '' });

export default function ClientesPage() {
  const [clientes, setClientes]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [modal,    setModal]      = useState(null); // null | 'new' | clienteObj
  const [form,     setForm]       = useState(emptyForm());
  const [search,   setSearch]     = useState('');
  const [confirm,  setConfirm]    = useState(null); // id to delete

  // Load from API
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/db/clientes');
        if (!r.ok) throw new Error('failed');
        const data = await r.json();
        if (!cancelled) setClientes(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setClientes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const openNew  = () => { setForm(emptyForm()); setModal('new'); };
  const openEdit = (c) => { setForm({ nombre: c.nombre || '', cuit: c.cuit || '', email: c.email || '', telefono: c.telefono || '', notas: c.notas || '' }); setModal(c); };

  const submit = async () => {
    if (!form.nombre.trim()) return;
    if (modal === 'new') {
      const r = await fetch('/api/db/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (r.ok) {
        const created = await r.json();
        setClientes(prev => [created, ...prev]);
      }
    } else {
      const id = modal.id;
      const r = await fetch(`/api/db/clientes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (r.ok) {
        setClientes(prev => prev.map(c => c.id === id ? { ...form, id } : c));
      }
    }
    setModal(null);
  };

  const remove = async (id) => {
    const r = await fetch(`/api/db/clientes/${id}`, { method: 'DELETE' });
    if (r.ok) setClientes(prev => prev.filter(c => c.id !== id));
    setConfirm(null);
  };

  const filtered = clientes.filter(c =>
    (c.nombre || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.cuit || '').includes(search) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ paddingBottom: '3rem' }}>

      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.2rem' }}>Clientes</h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>{clientes.length} clientes registrados</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', flex: '1 1 auto', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.45rem 0.75rem', flex: '1 1 180px', maxWidth: 360 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..." style={{ border: 'none', outline: 'none', fontSize: '0.82rem', color: '#1e293b', width: '100%', background: 'transparent' }} />
          </div>
          <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1.1rem', borderRadius: '50px', border: 'none', cursor: 'pointer', background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: '0.82rem' }}>
            + Nuevo cliente
          </button>
        </div>
      </div>

      {/* stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          ['Clientes totales', clientes.length, '#ea580c', '#fff4ee'],
          ['Con CUIT', clientes.filter(c=>c.cuit).length, '#7c3aed', '#f5f3ff'],
          ['Con email', clientes.filter(c=>c.email).length, '#059669', '#f0fdf4'],
        ].map(([lbl, val, color, bg]) => (
          <div key={lbl} style={{ ...CARD, background: bg, border: `1px solid ${color}20` }}>
            <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>{lbl}</p>
            <p style={{ fontSize: '1.8rem', fontWeight: 800, color, lineHeight: 1 }}>{val}</p>
          </div>
        ))}
      </div>

      {/* client cards grid */}
      {loading ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          <p style={{ fontSize: '0.85rem' }}>Cargando clientes...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ marginBottom: '0.75rem' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <p style={{ fontWeight: 600, marginBottom: '0.3rem' }}>{search ? 'Sin resultados' : 'No hay clientes aún'}</p>
          <p style={{ fontSize: '0.8rem' }}>{search ? 'Probá con otro término' : 'Agregá tu primer cliente'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {filtered.map(c => (
            <div key={c.id} style={{ ...CARD, borderTop: '3px solid #2563eb', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#fff4ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 800, color: '#ea580c' }}>
                  {(c.nombre || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => openEdit(c)} style={{ padding: '0.3rem 0.6rem', borderRadius: '7px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>Editar</button>
                  <button onClick={() => setConfirm(c.id)} style={{ padding: '0.3rem 0.6rem', borderRadius: '7px', border: '1px solid #fee2e2', background: '#fff', color: '#dc2626', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>×</button>
                </div>
              </div>
              <p style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem', marginBottom: '0.15rem' }}>{c.nombre}</p>
              {c.cuit && <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem' }}>CUIT {c.cuit}</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                {c.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.email}</span>
                  </div>
                )}
                {c.telefono && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.telefono}</span>
                  </div>
                )}
                {c.notas && <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.25rem', fontStyle: 'italic' }}>{c.notas}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal nuevo / editar */}
      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setModal(null)}>
          <div style={{ ...CARD, width: '100%', maxWidth: '480px', margin: '1rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>{modal === 'new' ? 'Nuevo cliente' : 'Editar cliente'}</h3>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.2rem' }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: '0.85rem' }}>
              {[
                ['nombre',   'Nombre / Razón Social', 'Ej: Franco Modulos SRL', false],
                ['cuit',     'CUIT',                   'Ej: 30-71234567-8',      false],
                ['email',    'Email',                   'Ej: info@empresa.com',   false],
                ['telefono', 'Teléfono',                'Ej: 11-4444-5555',       false],
              ].map(([field, label, placeholder]) => (
                <div key={field}>
                  <label style={LBL}>{label}</label>
                  <input value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} style={INP} placeholder={placeholder} />
                </div>
              ))}
              <div>
                <label style={LBL}>Notas</label>
                <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2} style={{ ...INP, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Observaciones opcionales..." />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button onClick={() => setModal(null)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={submit} style={{ padding: '0.5rem 1.2rem', borderRadius: '8px', border: 'none', background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                {modal === 'new' ? 'Agregar' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setConfirm(null)}>
          <div style={{ ...CARD, width: '100%', maxWidth: '360px', margin: '1rem', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </div>
            <p style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.4rem' }}>¿Eliminar cliente?</p>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1.25rem' }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button onClick={() => setConfirm(null)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => remove(confirm)} style={{ padding: '0.5rem 1.2rem', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
