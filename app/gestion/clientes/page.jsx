'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { gToast } from '../toast';
import { cuitValido, cuitNormalizado } from '../cuit';
import { MenuFila, ConfirmacionTipada } from '../acciones-fila';

const PRIMARY = '#111827';
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const INP = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '16px', color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const LBL = { display: 'block', fontSize: '0.68rem', fontWeight: 500, color: '#9ca3af', marginBottom: 5 };
const TXTBTN = { background: 'none', border: 'none', padding: '0.4rem 0.6rem', fontSize: '0.74rem', fontWeight: 500, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' };
const AYUDA = { margin: '5px 0 0', fontSize: '0.7rem', lineHeight: 1.45 };

const emptyForm = () => ({ nombre: '', cuit: '', email: '', telefono: '', notas: '' });
const esActivo = (c) => (c?.activo == null || c.activo === '' ? true : Number(c.activo) === 1);
const digitos = (s) => String(s || '').replace(/\D/g, '');
const porNombre = (a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });

// Nombre "de comparación" para avisar duplicados mientras se escribe: sin
// acentos, sin puntos, sin el tipo societario (S.A., SA, S.R.L., SAS…) y en
// minúsculas, así "Belén S.A." y "belen sa" caen en lo mismo.
function nombreNorm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .replace(/\b(s\s?a\s?s?|s\s?r\s?l|sociedad anonima|ltda|inc|llc|corp|cia)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parecidos(nombre, lista, excluirId) {
  const n = nombreNorm(nombre);
  if (n.length < 3) return [];
  return lista
    .filter(c => c.id !== excluirId)
    .filter(c => {
      const m = nombreNorm(c.nombre);
      if (!m) return false;
      if (m === n) return true;
      return n.length >= 4 && m.length >= 4 && (m.includes(n) || n.includes(m));
    })
    .slice(0, 3);
}

export default function ClientesPage() {
  const [clientes, setClientes]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [modal,    setModal]      = useState(null); // null | 'new' | clienteObj
  const [form,     setForm]       = useState(emptyForm());
  const [cuitBlur, setCuitBlur]   = useState(false);
  const [dupCuit,  setDupCuit]    = useState(null); // { id, nombre } del 409
  const [search,   setSearch]     = useState('');
  const [confirmDel, setConfirmDel] = useState(null); // cliente a eliminar (confirmación tipada)
  const [bloqueo,  setBloqueo]    = useState(null); // { cliente, operaciones } cuando no se puede eliminar
  const [busyFila, setBusyFila]   = useState(null); // id con una acción en curso
  const [saving,   setSaving]     = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showInactivos, setShowInactivos] = useState(false);

  // Se piden todos (activos e inactivos): los inactivos van a la sección del fondo.
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const r = await fetch('/api/db/clientes?todos=1');
      if (!r.ok) throw new Error('failed');
      const data = await r.json();
      setClientes(Array.isArray(data) ? data : []);
      return Array.isArray(data) ? data : [];
    } catch {
      setLoadError(true);
      gToast.error('No se pudieron cargar los clientes. Revisá tu conexión.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew  = () => { setForm(emptyForm()); setCuitBlur(false); setDupCuit(null); setModal('new'); };
  const openEdit = (c) => {
    setForm({ nombre: c.nombre || '', cuit: c.cuit || '', email: c.email || '', telefono: c.telefono || '', notas: c.notas || '' });
    setCuitBlur(false); setDupCuit(null); setModal(c);
  };
  const cerrarModal = () => { if (!saving) setModal(null); };

  async function leerJson(r) { try { return await r.json(); } catch { return null; } }
  async function errMsg(r, fallback) { const j = await leerJson(r); return j?.error || fallback; }

  // ── Validación del CUIT mientras se escribe ──
  const cuitVacio = form.cuit.trim() === '';
  const cuitOk = !cuitVacio && cuitValido(form.cuit);
  // Se marca rojo recién cuando ya hay 11 dígitos o el usuario salió del campo:
  // marcar error a los 3 dígitos tipeados molesta sin aportar nada.
  const cuitError = !cuitVacio && !cuitOk && (cuitBlur || digitos(form.cuit).length >= 11);

  const editandoId = modal && modal !== 'new' ? modal.id : null;
  const nombresParecidos = useMemo(
    () => (modal === null ? [] : parecidos(form.nombre, clientes, editandoId)),
    [modal, form.nombre, clientes, editandoId]
  );

  const submit = async () => {
    if (!form.nombre.trim()) { gToast.error('El nombre es obligatorio.'); return; }
    if (!cuitVacio && !cuitOk) { setCuitBlur(true); gToast.error('El CUIT no es válido.'); return; }
    if (saving) return;
    setSaving(true);
    setDupCuit(null);
    const payload = { ...form, nombre: form.nombre.trim(), cuit: cuitVacio ? '' : cuitNormalizado(form.cuit) };
    try {
      if (modal === 'new') {
        const r = await fetch('/api/db/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (r.status === 409) { const j = await leerJson(r); setDupCuit({ id: j?.id, nombre: j?.nombre }); return; }
        if (!r.ok) { gToast.error(await errMsg(r, 'No se pudo crear el cliente.')); return; }
        const created = await r.json();
        setClientes(prev => [created, ...prev]);
        gToast.success('Cliente creado.');
      } else {
        const id = modal.id;
        const r = await fetch(`/api/db/clientes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (r.status === 409) { const j = await leerJson(r); setDupCuit({ id: j?.id, nombre: j?.nombre }); return; }
        if (!r.ok) { gToast.error(await errMsg(r, 'No se pudieron guardar los cambios.')); return; }
        const guardado = await leerJson(r);
        setClientes(prev => prev.map(c => c.id === id ? { ...c, ...(guardado || payload), id } : c));
        gToast.success('Cliente actualizado.');
      }
      setModal(null);
    } catch {
      gToast.error('Error de conexión. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  // "Abrir el existente" tras un 409 por CUIT: cierra este form y abre el otro cliente.
  const abrirExistente = async () => {
    if (!dupCuit?.id) return;
    let c = clientes.find(x => x.id === dupCuit.id);
    if (!c) { const lista = await load(); c = (lista || []).find(x => x.id === dupCuit.id); }
    if (!c) { gToast.error('No se encontró el cliente existente.'); return; }
    openEdit(c);
  };

  // ── Activar / desactivar (PUT parcial) ──
  const setActivo = async (c, activo) => {
    if (busyFila) return;
    setBusyFila(c.id);
    try {
      const r = await fetch(`/api/db/clientes/${c.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: activo ? 1 : 0 }) });
      if (!r.ok) { gToast.error(await errMsg(r, activo ? 'No se pudo reactivar el cliente.' : 'No se pudo desactivar el cliente.')); return false; }
      const guardado = await leerJson(r);
      const esperado = activo ? 1 : 0;
      // Si la base no admite la columna todavía, el servidor devuelve activo=1 igual: no se finge.
      const persistido = guardado && guardado.activo != null ? Number(guardado.activo) : esperado;
      if (persistido !== esperado) { gToast.error('La base todavía no admite clientes inactivos. Probá más tarde.'); return false; }
      setClientes(prev => prev.map(x => x.id === c.id ? { ...x, ...(guardado || {}), activo: esperado } : x));
      gToast.success(activo ? 'Cliente reactivado.' : 'Cliente desactivado. Ya no aparece en los selectores.');
      return true;
    } catch {
      gToast.error('Error de conexión. Intentá de nuevo.');
      return false;
    } finally {
      setBusyFila(null);
    }
  };

  // ── Eliminar: primero se mira si tiene operaciones; si tiene, se ofrece desactivar ──
  const pedirEliminar = async (c) => {
    if (busyFila) return;
    setBusyFila(c.id);
    try {
      const r = await fetch(`/api/db/clientes/${c.id}`);
      const j = r.ok ? await leerJson(r) : null;
      const n = Number(j?.operaciones || 0);
      if (n > 0) setBloqueo({ cliente: c, operaciones: n });
      else setConfirmDel(c);
    } catch {
      // Sin red para consultar: se pide la confirmación igual, el DELETE vuelve a verificar.
      setConfirmDel(c);
    } finally {
      setBusyFila(null);
    }
  };

  const remove = async () => {
    const c = confirmDel;
    if (!c) return;
    setBusyFila(c.id);
    try {
      const r = await fetch(`/api/db/clientes/${c.id}`, { method: 'DELETE' });
      if (r.status === 409) {
        const j = await leerJson(r);
        setConfirmDel(null);
        setBloqueo({ cliente: c, operaciones: Number(j?.operaciones || 0) });
        return;
      }
      if (!r.ok) { gToast.error(await errMsg(r, 'No se pudo eliminar el cliente.')); return; }
      setClientes(prev => prev.filter(x => x.id !== c.id));
      gToast.success('Cliente eliminado.');
      setConfirmDel(null);
    } catch {
      gToast.error('Error de conexión. Intentá de nuevo.');
    } finally {
      setBusyFila(null);
    }
  };

  const desactivarDesdeBloqueo = async () => {
    const c = bloqueo?.cliente;
    if (!c) return;
    const ok = await setActivo(c, 0);
    if (ok) setBloqueo(null);
  };

  // ── Listado ──
  const q = search.trim().toLowerCase();
  const qd = digitos(q); // dígitos tipeados: si no hay, la búsqueda por CUIT no aplica
  const coincide = (c) => !q || (c.nombre || '').toLowerCase().includes(q) || (qd !== '' && digitos(c.cuit).includes(qd)) || (c.cuit || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);

  const activos   = useMemo(() => clientes.filter(esActivo).sort(porNombre), [clientes]);
  const inactivos = useMemo(() => clientes.filter(c => !esActivo(c)).sort(porNombre), [clientes]);
  const activosVisibles   = activos.filter(coincide);
  const inactivosVisibles = inactivos.filter(coincide);
  const inactivosOpen = showInactivos || q !== '';

  const conCuit  = activos.filter(c => c.cuit).length;
  const conEmail = activos.filter(c => c.email).length;

  const renderRow = (c, inactivo) => (
    <div key={c.id} className="cli-row" onClick={() => openEdit(c)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0.8rem 0.25rem', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', opacity: busyFila === c.id ? 0.5 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: inactivo ? '#9ca3af' : '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre || '— sin nombre —'}</div>
        {(c.email || c.telefono || c.notas) && (
          <div style={{ marginTop: 2, fontSize: '0.68rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[c.email, c.telefono, c.notas].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
        {c.cuit ? (
          <>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: inactivo ? '#9ca3af' : '#111827', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{cuitNormalizado(c.cuit) || c.cuit}</div>
            <div style={{ fontSize: '0.6rem', color: '#9ca3af', marginTop: 1 }}>CUIT</div>
          </>
        ) : (
          <div style={{ fontSize: '0.68rem', color: '#d1d5db' }}>sin CUIT</div>
        )}
      </div>
      <MenuFila
        ariaLabel={`Acciones de ${c.nombre || 'cliente'}`}
        items={[
          { label: 'Editar', onClick: () => openEdit(c) },
          inactivo
            ? { label: 'Reactivar', onClick: () => setActivo(c, 1), disabled: busyFila === c.id }
            : { label: 'Desactivar', onClick: () => setActivo(c, 0), disabled: busyFila === c.id },
          { label: 'Eliminar', peligro: true, onClick: () => pedirEliminar(c), disabled: busyFila === c.id },
        ]}
      />
    </div>
  );

  const nadaQueMostrar = activosVisibles.length === 0 && inactivosVisibles.length === 0;

  return (
    <div style={{ background: '#fff', paddingBottom: '3rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 350, letterSpacing: '-0.02em', color: '#111827', marginBottom: '0.15rem' }}>Clientes</h2>
          <p style={{ fontSize: '0.74rem', color: '#9ca3af' }}>Directorio y datos de contacto{inactivos.length > 0 ? ` · ${inactivos.length} ${inactivos.length === 1 ? 'inactivo' : 'inactivos'}` : ''}</p>
        </div>
        <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', borderRadius: 6, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo cliente
        </button>
      </div>

      {/* Métricas (sobre activos) */}
      <div className="cli-metrics" style={{ display: 'flex', alignItems: 'center', gap: '2.5rem', flexWrap: 'wrap', margin: '1.5rem 0 1.75rem' }}>
        {[
          [activos.length, 'Clientes'],
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
      ) : nadaQueMostrar ? (
        <div style={{ padding: '3.5rem 0', textAlign: 'center' }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>{q ? 'Sin resultados' : 'No hay clientes aún'}</p>
          <p style={{ fontSize: '0.74rem', color: '#9ca3af' }}>{q ? 'Probá con otro término.' : 'Agregá tu primer cliente con «Nuevo cliente».'}</p>
        </div>
      ) : (
        <div>
          {activosVisibles.length === 0 ? (
            <div style={{ padding: '1.5rem 0.25rem', fontSize: '0.74rem', color: '#9ca3af' }}>{q ? 'Ningún cliente activo coincide.' : 'No hay clientes activos.'}</div>
          ) : activosVisibles.map(c => renderRow(c, false))}

          {/* Inactivos: al fondo, colapsados por defecto (la búsqueda los abre) */}
          {inactivosVisibles.length > 0 && (
            <div style={{ marginTop: '2rem' }}>
              <button onClick={() => setShowInactivos(s => !s)} className="cli-txt" style={{ ...TXTBTN, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#9ca3af' }} aria-expanded={inactivosOpen}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: inactivosOpen ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}><polyline points="9 18 15 12 9 6"/></svg>
                Inactivos · {inactivosVisibles.length}
              </button>
              {inactivosOpen && (
                <div style={{ marginTop: '0.1rem' }}>
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '0.5rem 0.25rem 0.25rem' }}>No aparecen en los selectores de operaciones ni cotizaciones. Las operaciones que ya los tienen conservan el vínculo.</p>
                  {inactivosVisibles.map(c => renderRow(c, true))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal nuevo / editar */}
      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={cerrarModal}>
          <div role="dialog" aria-modal="true" style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem 1.75rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>{modal === 'new' ? 'Nuevo cliente' : 'Editar cliente'}</h3>
              <button onClick={cerrarModal} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.4rem', lineHeight: 1, padding: 0 }}>×</button>
            </div>

            {modal !== 'new' && !esActivo(modal) && (
              <p style={{ ...AYUDA, margin: '-0.6rem 0 1rem', color: '#d97706' }}>
                Cliente inactivo: no aparece en los selectores.{' '}
                <button type="button" onClick={async () => { const ok = await setActivo(modal, 1); if (ok) setModal(m => (m && m !== 'new' ? { ...m, activo: 1 } : m)); }} disabled={busyFila === modal.id} style={{ ...TXTBTN, padding: 0, fontSize: '0.7rem', fontWeight: 600, color: '#111827', textDecoration: 'underline', textUnderlineOffset: 3 }}>Reactivar</button>
              </p>
            )}

            <div style={{ display: 'grid', gap: '0.85rem' }}>
              <div>
                <label style={LBL}>Nombre / Razón Social</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="cli-inp" style={INP} placeholder="Ej: Franco Modulos SRL" autoFocus />
                {nombresParecidos.length > 0 && (
                  <p role="status" style={{ ...AYUDA, color: '#d97706' }}>
                    Parecido a: {nombresParecidos.map(c => c.nombre).join(', ')}
                  </p>
                )}
              </div>

              <div>
                <label style={LBL}>CUIT</label>
                <input
                  value={form.cuit}
                  onChange={e => { const v = e.target.value; setForm(f => ({ ...f, cuit: v })); setDupCuit(null); }}
                  onBlur={() => setCuitBlur(true)}
                  inputMode="numeric"
                  autoComplete="off"
                  className="cli-inp"
                  style={{ ...INP, fontVariantNumeric: 'tabular-nums', borderColor: cuitError || dupCuit ? '#dc2626' : '#e5e7eb' }}
                  placeholder="Ej: 30-71234567-8"
                />
                {cuitError && (
                  <p role="alert" style={{ ...AYUDA, color: '#dc2626' }}>
                    {digitos(form.cuit).length !== 11 ? 'El CUIT tiene que tener 11 dígitos.' : 'El CUIT no es válido: el dígito verificador no cierra.'}
                  </p>
                )}
                {dupCuit && (
                  <p role="alert" style={{ ...AYUDA, color: '#dc2626' }}>
                    Ya existe un cliente con ese CUIT{dupCuit.nombre ? `: ${dupCuit.nombre}` : ''}.{' '}
                    <button type="button" onClick={abrirExistente} style={{ ...TXTBTN, padding: 0, fontSize: '0.7rem', fontWeight: 600, color: '#111827', textDecoration: 'underline', textUnderlineOffset: 3 }}>Abrir el existente</button>
                  </p>
                )}
                {!cuitError && !dupCuit && cuitOk && cuitNormalizado(form.cuit) !== form.cuit.trim() && (
                  <p style={{ ...AYUDA, color: '#9ca3af' }}>Se guarda como <span style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{cuitNormalizado(form.cuit)}</span></p>
                )}
              </div>

              {[
                ['email',    'Email',    'Ej: info@empresa.com'],
                ['telefono', 'Teléfono', 'Ej: 11-4444-5555'],
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
              <button onClick={cerrarModal} className="cli-txt" style={TXTBTN}>Cancelar</button>
              <button onClick={submit} disabled={saving} style={{ padding: '0.5rem 1.2rem', borderRadius: 6, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 600, fontSize: '0.78rem', cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Guardando…' : (modal === 'new' ? 'Agregar' : 'Guardar cambios')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación tipada para eliminar (solo clientes sin operaciones) */}
      <ConfirmacionTipada
        abierto={!!confirmDel}
        titulo={`Eliminar a ${confirmDel?.nombre || 'este cliente'}`}
        detalle="Se saca del directorio. Si más adelante lo necesitás de nuevo, se puede restaurar desde la papelera. Si solo querés que deje de aparecer en los selectores, conviene desactivarlo."
        palabra="ELIMINAR"
        confirmar="Eliminar"
        busy={!!confirmDel && busyFila === confirmDel.id}
        onConfirm={remove}
        onCancel={() => setConfirmDel(null)}
      />

      {/* No se puede eliminar: tiene operaciones → ofrecer desactivar */}
      {bloqueo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }} onClick={() => { if (!busyFila) setBloqueo(null); }}>
          <div role="dialog" aria-modal="true" style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 420, padding: '1.5rem 1.75rem', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '1.02rem', fontWeight: 600, color: '#111827', margin: 0, lineHeight: 1.3 }}>No se puede eliminar</h2>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '6px 0 0', lineHeight: 1.5 }}>
              <b style={{ color: '#111827', fontWeight: 600 }}>{bloqueo.cliente.nombre || 'Este cliente'}</b> tiene{' '}
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#111827' }}>{bloqueo.operaciones}</span>{' '}
              {bloqueo.operaciones === 1 ? 'operación vinculada' : 'operaciones vinculadas'}.
              {esActivo(bloqueo.cliente)
                ? ' Podés desactivarlo: deja de aparecer en los selectores y las operaciones conservan el cliente.'
                : ' Ya está desactivado: no aparece en los selectores y las operaciones conservan el cliente.'}
            </p>
            <div style={{ display: 'flex', gap: 22, justifyContent: 'flex-end', alignItems: 'center', marginTop: '1.25rem' }}>
              <button type="button" onClick={() => setBloqueo(null)} disabled={!!busyFila} style={{ ...TXTBTN, padding: 0, fontSize: '0.78rem' }}>
                {esActivo(bloqueo.cliente) ? 'Cancelar' : 'Cerrar'}
              </button>
              {esActivo(bloqueo.cliente) && (
                <button type="button" onClick={desactivarDesdeBloqueo} disabled={!!busyFila} style={{ ...TXTBTN, padding: 0, fontSize: '0.78rem', fontWeight: 600, color: '#111827' }}>
                  {busyFila ? 'Un momento…' : 'Desactivar'}
                </button>
              )}
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
        @media (max-width: 640px) {
          .cli-metrics { gap: 1.25rem !important; }
          .cli-metrics > div { padding-left: 1.25rem !important; }
          .cli-metrics > div:first-child { padding-left: 0 !important; }
        }
      `}</style>
    </div>
  );
}
