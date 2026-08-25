'use client';
import { useState, useEffect, useCallback } from 'react';
import { gToast } from '../toast';

const PRIMARY = '#111827';
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const INP = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '16px', color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const LBL = { display: 'block', fontSize: '0.68rem', fontWeight: 500, color: '#9ca3af', marginBottom: 5 };
const TXTBTN = { background: 'none', border: 'none', padding: '0.4rem 0.6rem', fontSize: '0.74rem', fontWeight: 500, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' };

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
    <div style={{ background: '#fff', paddingBottom: '3rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 350, letterSpacing: '-0.02em', color: '#111827', marginBottom: '0.15rem' }}>Clientes</h2>
          <p style={{ fontSize: '0.74rem', color: '#9ca3af' }}>Directorio y datos de contacto</p>
        </div>
        <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', borderRadius: 6, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo cliente
        </button>
      </div>

      {/* Métricas */}
      <div className="cli-metrics" style={{ display: 'flex', alignItems: 'center', gap: '2.5rem', flexWrap: 'wrap', margin: '1.5rem 0 1.75rem' }}>
        {[
          [clientes.length, 'Clientes'],
          [conCuit, 'Con CUIT'],
          [conEmail, 'Con email'],
        ].map(([v, l], i) => (
          <div key={l} style={i > 0 ? { borderLeft: '1px solid #f1f5f9', paddingLeft: '2.5rem' } : undefined}>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{v}</div>
            <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Buscador */}
      <div className="cli-searchwrap" style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 420, borderBottom: '1px solid #e5e7eb', paddingBottom: 2, marginBottom: '0.5rem' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4c9d4" strokeWidth="2" style={{ flex: '0 0 auto' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, CUIT o email…" style={{ flex: 1, padding: '0.4rem 0', border: 'none', borderRadius: 0, background: 'transparent', fontSize: '16px', color: '#111827', outline: 'none', fontFamily: 'inherit' }} />
      </div>

      {/* Listado */}
      {loading ? (
        <div style={{ padding: '3.5rem 0', textAlign: 'center', color: '#9ca3af', fontSize: '0.78rem' }}>
          <div style={{ width: 28, height: 28, border: '2px solid #f1f5f9', borderTopColor: PRIMARY, borderRadius: '50%', margin: '0 auto 0.9rem', animation: 'spin 0.8s linear infinite' }} />
          Cargando…
        </div>
      ) : loadError ? (
        <div style={{ padding: '3.5rem 0', textAlign: 'center' }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.3rem' }}>No se pudieron cargar los clientes</p>
          <p style={{ fontSize: '0.74rem', color: '#9ca3af' }}>Puede ser un problema de conexión.</p>
          <button onClick={load} className="cli-txt" style={{ ...TXTBTN, marginTop: '0.75rem', fontWeight: 600, color: '#111827', textDecoration: 'underline', textUnderlineOffset: 3 }}>Reintentar</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '3.5rem 0', textAlign: 'center' }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>{search ? 'Sin resultados' : 'No hay clientes aún'}</p>
          <p style={{ fontSize: '0.74rem', color: '#9ca3af' }}>{search ? 'Probá con otro término.' : 'Agregá tu primer cliente con «Nuevo cliente».'}</p>
        </div>
      ) : (
        <div>
          {filtered.map(c => (
            <div key={c.id} className="cli-row" onClick={() => openEdit(c)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0.8rem 0.25rem', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre || '— sin nombre —'}</div>
                {(c.email || c.telefono || c.notas) && (
                  <div style={{ marginTop: 2, fontSize: '0.68rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[c.email, c.telefono, c.notas].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                {c.cuit ? (
                  <>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{c.cuit}</div>
                    <div style={{ fontSize: '0.6rem', color: '#9ca3af', marginTop: 1 }}>CUIT</div>
                  </>
                ) : (
                  <div style={{ fontSize: '0.68rem', color: '#d1d5db' }}>sin CUIT</div>
                )}
              </div>
              <div className="cli-actions" style={{ display: 'inline-flex', gap: 2, flex: '0 0 auto' }}>
                <button onClick={e => { e.stopPropagation(); openEdit(c); }} title="Editar" aria-label={`Editar ${c.nombre || 'cliente'}`} className="cli-ico" style={{ width: 28, height: 28, border: 'none', background: 'none', color: '#c4c9d4', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button onClick={e => { e.stopPropagation(); setConfirm(c.id); }} title="Eliminar" aria-label={`Eliminar ${c.nombre || 'cliente'}`} className="cli-ico" style={{ width: 28, height: 28, border: 'none', background: 'none', color: '#c4c9d4', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal nuevo / editar */}
      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setModal(null)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem 1.75rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>{modal === 'new' ? 'Nuevo cliente' : 'Editar cliente'}</h3>
              <button onClick={() => setModal(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.4rem', lineHeight: 1, padding: 0 }}>×</button>
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
                  <input value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} className="cli-inp" style={INP} placeholder={placeholder} />
                </div>
              ))}
              <div>
                <label style={LBL}>Notas</label>
                <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2} className="cli-inp" style={{ ...INP, resize: 'vertical' }} placeholder="Observaciones opcionales..." />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: '1.25rem' }}>
              <button onClick={() => setModal(null)} className="cli-txt" style={TXTBTN}>Cancelar</button>
              <button onClick={submit} disabled={saving} style={{ padding: '0.5rem 1.2rem', borderRadius: 6, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 600, fontSize: '0.78rem', cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Guardando…' : (modal === 'new' ? 'Agregar' : 'Guardar cambios')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setConfirm(null)}>
          <div style={{ background: '#fff', borderRadius: 12, maxWidth: 340, padding: '1.5rem 1.75rem', margin: '1rem', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827', marginBottom: 6 }}>¿Eliminar cliente?</p>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '1.25rem' }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
              <button onClick={() => setConfirm(null)} className="cli-txt" style={TXTBTN}>Cancelar</button>
              <button onClick={() => remove(confirm)} style={{ ...TXTBTN, fontWeight: 600, color: '#dc2626' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .cli-row:hover { background: #fafafa; }
        .cli-searchwrap:focus-within { border-bottom-color: #111827 !important; }
        .cli-searchwrap input::placeholder { color: #c4c9d4; }
        .cli-inp:focus { border-color: #111827 !important; }
        .cli-txt:hover { color: #111827 !important; }
        .cli-ico:hover { color: #6b7280 !important; }
        @media (hover: hover) {
          .cli-actions { opacity: 0; transition: opacity 0.12s; }
          .cli-row:hover .cli-actions, .cli-actions:focus-within { opacity: 1; }
        }
        @media (max-width: 640px) {
          .cli-metrics { gap: 1.25rem !important; }
          .cli-metrics > div { padding-left: 1.25rem !important; }
          .cli-metrics > div:first-child { padding-left: 0 !important; }
        }
      `}</style>
    </div>
  );
}
