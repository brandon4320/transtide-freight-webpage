'use client';
import { useState, useEffect, useCallback } from 'react';
import { gToast } from '../toast';

const CARD = { background: '#fff', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', border: '1px solid #e8ecf1' };
const INP  = { width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #e8ecf1', borderRadius: '8px', fontSize: '16px', color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box' };
const LBL  = { display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' };

const ESTADOS = {
  cotizando: { label: 'Cotizando', color: '#d97706', bg: '#fffbeb' },
  decidido:  { label: 'Decidido',  color: '#0284c7', bg: '#eff6ff' },
  cerrado:   { label: 'Cerrado',   color: '#059669', bg: '#f0fdf4' },
};
const estadoMeta = (e) => ESTADOS[e] || ESTADOS.cotizando;

const PROV_FIELDS = ['nombre','contacto','producto','moneda','precio_unitario','cantidad','moq','precio_total','lead_time','incoterm','puerto','m3','peso_kg','validez','notas'];
const emptyProv = () => ({ nombre:'', contacto:'', producto:'', moneda:'USD', precio_unitario:'', cantidad:'', moq:'', precio_total:'', lead_time:'', incoterm:'FOB', puerto:'', m3:'', peso_kg:'', validez:'', notas:'' });
const provFrom = (p) => { const o = emptyProv(); for (const f of PROV_FIELDS) o[f] = p[f] != null ? String(p[f]) : (f === 'moneda' || f === 'incoterm' ? o[f] : ''); return o; };

// Parse a number out of a string. Handles es-AR "1.234,56" and plain "1234.5".
function numOf(str) {
  if (str == null) return NaN;
  let s = String(str).trim();
  if (!s) return NaN;
  // keep only the first numeric-ish chunk (incl . , and leading -)
  const m = s.match(/-?[\d.,]+/);
  if (!m) return NaN;
  s = m[0];
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // es-AR: dot = thousands, comma = decimal -> "1.234,56"
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // comma is decimal -> "1234,56"
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

const MAX_SIZE = 10 * 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp';
const ALLOWED_MIME = ['application/pdf','image/png','image/jpeg','image/jpg','image/webp'];
const fmtSize = (b) => b == null ? '' : b < 1024 ? `${b} B` : b < 1024*1024 ? `${(b/1024).toFixed(0)} KB` : `${(b/1024/1024).toFixed(1)} MB`;

export default function ComparadorPage() {
  // ----- list state -----
  const [compras, setCompras] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listErr, setListErr] = useState('');
  const [newModal, setNewModal] = useState(false);
  const [newForm, setNewForm] = useState({ nombre: '', descripcion: '' });
  const [savingNew, setSavingNew] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // compra id

  // ----- detail state -----
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailErr, setDetailErr] = useState('');
  const [savingHeader, setSavingHeader] = useState(false);

  // proveedor modal
  const [provModal, setProvModal] = useState(null); // null | 'new' | provObj
  const [provForm, setProvForm] = useState(emptyProv());
  const [savingProv, setSavingProv] = useState(false);
  const [aiState, setAiState] = useState(''); // '', 'loading', error string
  const [confirmProvDel, setConfirmProvDel] = useState(null);

  // docs in modal
  const [docTipo, setDocTipo] = useState('Invoice');
  const [docFile, setDocFile] = useState(null);
  const [docErr, setDocErr] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const [converting, setConverting] = useState(false);

  // ---- load list ----
  const loadList = useCallback(async () => {
    setLoadingList(true); setListErr('');
    try {
      const r = await fetch('/api/db/compras');
      if (!r.ok) throw new Error('No se pudieron cargar los proyectos');
      const data = await r.json();
      setCompras(Array.isArray(data) ? data : []);
    } catch (e) {
      setListErr(e.message || 'Error al cargar');
      setCompras([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  // ---- load detail ----
  const loadDetail = useCallback(async (id) => {
    setLoadingDetail(true); setDetailErr('');
    try {
      const r = await fetch(`/api/db/compras/${id}`);
      if (!r.ok) throw new Error('No se pudo cargar el proyecto');
      const data = await r.json();
      if (!Array.isArray(data.proveedores)) data.proveedores = [];
      if (!Array.isArray(data.docs)) data.docs = [];
      setDetail(data);
    } catch (e) {
      setDetailErr(e.message || 'Error al cargar');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const openDetail = (id) => { setSelectedId(id); setDetail(null); loadDetail(id); };
  const closeDetail = () => { setSelectedId(null); setDetail(null); loadList(); };

  // ---- create project ----
  const createCompra = async () => {
    if (!newForm.nombre.trim() || savingNew) return;
    setSavingNew(true);
    try {
      const r = await fetch('/api/db/compras', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: newForm.nombre.trim(), descripcion: newForm.descripcion.trim() || undefined }),
      });
      if (!r.ok) throw new Error('No se pudo crear el proyecto');
      const created = await r.json();
      setNewModal(false); setNewForm({ nombre: '', descripcion: '' });
      setCompras(prev => [created, ...prev]);
      gToast.success('Proyecto creado.');
      openDetail(created.id);
    } catch (e) {
      gToast.error(e.message || 'Error al crear el proyecto.');
    } finally {
      setSavingNew(false);
    }
  };

  const deleteCompra = async (id) => {
    try {
      const r = await fetch(`/api/db/compras/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('No se pudo eliminar');
      setCompras(prev => prev.filter(c => c.id !== id));
      gToast.success('Proyecto eliminado.');
    } catch (e) {
      gToast.error(e.message || 'Error al eliminar el proyecto.');
    } finally {
      setConfirmDel(null);
    }
  };

  // ---- header edits (PUT then reload) ----
  const putCompra = async (patch) => {
    if (!detail) return;
    setSavingHeader(true);
    const body = {
      nombre: detail.nombre, descripcion: detail.descripcion ?? null,
      estado: detail.estado, notas: detail.notas ?? null,
      proveedor_elegido_id: detail.proveedor_elegido_id ?? null,
      ...patch,
    };
    try {
      const r = await fetch(`/api/db/compras/${detail.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('No se pudo guardar');
      setDetail(d => d ? { ...d, ...patch } : d);
    } catch (e) {
      gToast.error(e.message || 'Error al guardar.');
      loadDetail(detail.id);
    } finally {
      setSavingHeader(false);
    }
  };

  // ---- proveedor modal ----
  const openNewProv = () => { setProvForm(emptyProv()); setAiState(''); resetDocInputs(); setProvModal('new'); };
  const openEditProv = (p) => { setProvForm(provFrom(p)); setAiState(''); resetDocInputs(); setProvModal(p); };
  const resetDocInputs = () => { setDocTipo('Invoice'); setDocFile(null); setDocErr(''); };
  const setPF = (field, val) => setProvForm(f => ({ ...f, [field]: val }));

  const saveProv = async () => {
    if (!provForm.nombre.trim() || savingProv || !detail) return;
    setSavingProv(true);
    const payload = {}; for (const f of PROV_FIELDS) payload[f] = provForm[f];
    try {
      if (provModal === 'new') {
        const r = await fetch(`/api/db/compras/${detail.id}/proveedores`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error('No se pudo guardar el proveedor');
        // Update optimista con la fila devuelta (evita recargar todo el proyecto).
        const created = await r.json().catch(() => null);
        if (created && created.id) setDetail(d => d ? { ...d, proveedores: [...(d.proveedores || []), created] } : d);
        else await loadDetail(detail.id);
        gToast.success('Proveedor agregado.');
      } else {
        const r = await fetch(`/api/db/compras/${detail.id}/proveedores/${provModal.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error('No se pudo guardar el proveedor');
        setDetail(d => d ? { ...d, proveedores: (d.proveedores || []).map(p => p.id === provModal.id ? { ...p, ...payload } : p) } : d);
        gToast.success('Proveedor actualizado.');
      }
      setProvModal(null);
    } catch (e) {
      gToast.error(e.message || 'Error al guardar el proveedor.');
    } finally {
      setSavingProv(false);
    }
  };

  const elegirProv = async (p) => {
    if (!detail) return;
    const payload = {}; for (const f of PROV_FIELDS) payload[f] = p[f] != null ? p[f] : '';
    payload.elegido = true;
    try {
      const r = await fetch(`/api/db/compras/${detail.id}/proveedores/${p.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error('No se pudo elegir el proveedor');
      // Tiene efecto cascada server-side (pone elegido=0 al resto): recargamos para reflejarlo.
      await loadDetail(detail.id);
      gToast.success(`Elegiste a ${p.nombre || 'el proveedor'}.`);
    } catch (e) {
      gToast.error(e.message || 'No se pudo elegir el proveedor.');
    }
  };

  const deleteProv = async (provId) => {
    if (!detail) return;
    try {
      const r = await fetch(`/api/db/compras/${detail.id}/proveedores/${provId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('No se pudo eliminar');
      setDetail(d => d ? {
        ...d,
        proveedores: (d.proveedores || []).filter(p => p.id !== provId),
        docs: (d.docs || []).filter(doc => doc.proveedor_id !== provId),
      } : d);
      gToast.success('Proveedor eliminado.');
    } catch (e) {
      gToast.error(e.message || 'Error al eliminar el proveedor.');
    } finally {
      setConfirmProvDel(null);
    }
  };

  // ---- AI extract in modal ----
  const onAiFile = async (file) => {
    if (!file) return;
    if (file.size > MAX_SIZE) { setAiState('El archivo supera los 10MB'); return; }
    setAiState('loading');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/ai/extract', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'No se pudo analizar el documento');
      const d = j.data || {};
      setProvForm(f => ({
        ...f,
        nombre:       d.proveedor != null ? String(d.proveedor) : f.nombre,
        precio_total: d.total_fob != null ? String(d.total_fob) : f.precio_total,
        m3:           d.total_m3 != null ? String(d.total_m3) : f.m3,
        peso_kg:      d.total_kg != null ? String(d.total_kg) : f.peso_kg,
        incoterm:     d.terminos != null && String(d.terminos).trim() ? String(d.terminos) : f.incoterm,
        moneda:       d.moneda != null && String(d.moneda).trim() ? String(d.moneda) : f.moneda,
        notas:        d.notas != null ? String(d.notas) : f.notas,
      }));
      setAiState('');
    } catch (e) {
      setAiState(e.message || 'Error al analizar');
    }
  };

  // ---- upload doc (modal, edit mode) ----
  const onPickDoc = (file) => {
    setDocErr('');
    if (!file) { setDocFile(null); return; }
    if (file.size > MAX_SIZE) { setDocErr('El archivo supera los 10MB'); setDocFile(null); return; }
    if (file.type && !ALLOWED_MIME.includes(file.type)) { setDocErr('Tipo no permitido (PDF, PNG, JPG, WEBP)'); setDocFile(null); return; }
    setDocFile(file);
  };

  const uploadDoc = async () => {
    if (!docFile || !detail || provModal === 'new' || uploadingDoc) return;
    setUploadingDoc(true); setDocErr('');
    try {
      const fd = new FormData();
      fd.append('file', docFile);
      fd.append('tipo', docTipo);
      fd.append('proveedor_id', provModal.id);
      const r = await fetch(`/api/db/compras/${detail.id}/docs`, { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'No se pudo subir el archivo');
      setDocFile(null);
      await loadDetail(detail.id);
      gToast.success('Documento subido.');
    } catch (e) {
      setDocErr(e.message || 'Error al subir');
    } finally {
      setUploadingDoc(false);
    }
  };

  const deleteDoc = async (docId) => {
    if (!detail) return;
    try {
      const r = await fetch(`/api/db/compras/${detail.id}/docs/${docId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('No se pudo eliminar');
      setDetail(d => d ? { ...d, docs: (d.docs || []).filter(doc => doc.id !== docId) } : d);
      gToast.success('Documento eliminado.');
    } catch (e) {
      gToast.error(e.message || 'Error al eliminar el documento.');
    }
  };

  // Subida rápida desde la TABLA de comparación (sin abrir el modal de edición).
  const [quickDocProv, setQuickDocProv] = useState(null); // provId subiendo
  const quickDoc = async (provId, file) => {
    if (!detail || !file || quickDocProv) return;
    if (file.size > MAX_SIZE) { gToast.error('El archivo supera los 10MB'); return; }
    setQuickDocProv(provId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('tipo', 'cotizacion');
      fd.append('proveedor_id', provId);
      const r = await fetch(`/api/db/compras/${detail.id}/docs`, { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'No se pudo subir el archivo');
      setDetail(d => d ? { ...d, docs: [...(d.docs || []), j] } : d);
      gToast.success('Archivo adjuntado.');
    } catch (e) {
      gToast.error(e.message || 'Error al subir el archivo');
    } finally {
      setQuickDocProv(null);
    }
  };

  // ---- convertir ----
  const convertir = async () => {
    if (!detail || converting) return;
    setConverting(true);
    try {
      const r = await fetch(`/api/db/compras/${detail.id}/convertir`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || 'No se pudo convertir');
      const opId = j.operationId;
      gToast.success(j.alreadyConverted ? 'Ya existía la operación. Abriéndola…' : 'Operación creada. Abriéndola…');
      if (opId) { window.location.href = '/gestion/operaciones?op=' + opId; return; }
      await loadDetail(detail.id);
    } catch (e) {
      gToast.error(e.message || 'Error al convertir.');
    } finally {
      setConverting(false);
    }
  };

  // ===================== RENDER =====================
  if (selectedId) {
    return (
      <DetailView
        detail={detail} loading={loadingDetail} err={detailErr} savingHeader={savingHeader}
        onBack={closeDetail} onReload={() => loadDetail(selectedId)}
        onPutCompra={putCompra}
        onNewProv={openNewProv} onEditProv={openEditProv} onElegir={elegirProv}
        onAskDelProv={setConfirmProvDel}
        onConvert={convertir} converting={converting}
        provModal={provModal} provForm={provForm} setPF={setPF} setProvForm={setProvForm}
        onCloseProv={() => setProvModal(null)} onSaveProv={saveProv} savingProv={savingProv}
        aiState={aiState} onAiFile={onAiFile}
        docTipo={docTipo} setDocTipo={setDocTipo} docFile={docFile} onPickDoc={onPickDoc}
        docErr={docErr} uploadingDoc={uploadingDoc} onUploadDoc={uploadDoc} onDeleteDoc={deleteDoc}
        onQuickDoc={quickDoc} quickDocProv={quickDocProv}
        confirmProvDel={confirmProvDel} onCancelDelProv={() => setConfirmProvDel(null)} onDelProv={deleteProv}
      />
    );
  }

  // ---------- LIST VIEW ----------
  return (
    <div style={{ paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.2rem' }}>Comparador de proveedores</h2>
          <p style={{ fontSize: '0.82rem', color: '#64748b' }}>Compará cotizaciones de proveedores antes de importar</p>
        </div>
        <button onClick={() => { setNewForm({ nombre: '', descripcion: '' }); setNewModal(true); }} style={{ padding: '0.55rem 1.1rem', borderRadius: '50px', border: 'none', cursor: 'pointer', background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: '0.82rem' }}>
          + Nuevo proyecto
        </button>
      </div>

      {listErr && (
        <div style={{ ...CARD, borderColor: '#fecaca', background: '#fef2f2', color: '#dc2626', marginBottom: '1rem', fontSize: '0.85rem' }}>{listErr}</div>
      )}

      {loadingList ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '3rem', color: '#64748b' }}>
          <Spinner /><p style={{ fontSize: '0.85rem', marginTop: '0.75rem' }}>Cargando proyectos...</p>
        </div>
      ) : compras.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '3rem', color: '#64748b' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.3rem', color: '#0f172a' }}>No hay proyectos de compra todavía</p>
          <p style={{ fontSize: '0.82rem' }}>Creá tu primer proyecto para empezar a comparar proveedores.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {compras.map(c => {
            const m = estadoMeta(c.estado);
            return (
              <div key={c.id} onClick={() => openDetail(c.id)} style={{ ...CARD, padding: '1rem 1.25rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>{c.nombre || 'Sin nombre'}</span>
                    <Badge meta={m} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', fontSize: '0.75rem', color: '#64748b' }}>
                    <span>{c.n_proveedores ?? 0} proveedores</span>
                    {c.created_at && <span>{fmtDate(c.created_at)}</span>}
                    {c.created_by && <span>{c.created_by}</span>}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setConfirmDel(c.id); }} aria-label={`Eliminar proyecto ${c.nombre || ''}`} title="Eliminar" style={{ padding: '0.3rem 0.6rem', borderRadius: '7px', border: '1px solid #fee2e2', background: '#fff', color: '#dc2626', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>×</button>
              </div>
            );
          })}
        </div>
      )}

      {/* New project modal */}
      {newModal && (
        <Modal onClose={() => !savingNew && setNewModal(false)} maxWidth={460}>
          <ModalHead title="Nuevo proyecto de compra" onClose={() => !savingNew && setNewModal(false)} />
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            <div>
              <label style={LBL}>Nombre *</label>
              <input value={newForm.nombre} onChange={e => setNewForm(f => ({ ...f, nombre: e.target.value }))} style={INP} placeholder="Ej: Compresores Atlas Q2" autoFocus />
            </div>
            <div>
              <label style={LBL}>Descripción</label>
              <textarea value={newForm.descripcion} onChange={e => setNewForm(f => ({ ...f, descripcion: e.target.value }))} rows={2} style={{ ...INP, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Opcional..." />
            </div>
          </div>
          <ModalActions>
            <BtnGhost onClick={() => setNewModal(false)} disabled={savingNew}>Cancelar</BtnGhost>
            <BtnPrimary onClick={createCompra} disabled={savingNew || !newForm.nombre.trim()}>{savingNew ? 'Creando...' : 'Crear'}</BtnPrimary>
          </ModalActions>
        </Modal>
      )}

      {/* Confirm delete project */}
      {confirmDel && (
        <Modal onClose={() => setConfirmDel(null)} maxWidth={360}>
          <p style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.4rem', textAlign: 'center' }}>¿Eliminar proyecto?</p>
          <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1.25rem', textAlign: 'center' }}>Se borran sus proveedores y documentos. No se puede deshacer.</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <BtnGhost onClick={() => setConfirmDel(null)}>Cancelar</BtnGhost>
            <BtnDanger onClick={() => deleteCompra(confirmDel)}>Eliminar</BtnDanger>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================ DETAIL VIEW ============================
function DetailView(props) {
  const {
    detail, loading, err, savingHeader, onBack, onPutCompra,
    onNewProv, onEditProv, onElegir, onAskDelProv, onConvert, converting,
    provModal, provForm, setPF, onCloseProv, onSaveProv, savingProv,
    aiState, onAiFile, docTipo, setDocTipo, docFile, onPickDoc, docErr, uploadingDoc, onUploadDoc, onDeleteDoc,
    onQuickDoc, quickDocProv,
    confirmProvDel, onCancelDelProv, onDelProv,
  } = props;

  const [nombreDraft, setNombreDraft] = useState('');
  useEffect(() => { if (detail) setNombreDraft(detail.nombre || ''); }, [detail?.id, detail?.nombre]);

  const provs = detail?.proveedores || [];
  const docs = detail?.docs || [];
  const hasElegido = provs.some(p => p.elegido);

  // best metrics
  const best = (key) => {
    let bestVal = Infinity, bestId = null;
    for (const p of provs) {
      const n = numOf(p[key]);
      if (!isNaN(n) && n > 0 && n < bestVal) { bestVal = n; bestId = p.id; }
    }
    return bestId;
  };
  const bestTotal = best('precio_total');
  const bestUnit = best('precio_unitario');
  const bestLead = best('lead_time');

  return (
    <div style={{ paddingBottom: '3rem' }}>
      {/* header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'rgba(248,250,252,0.92)', backdropFilter: 'blur(6px)', paddingBottom: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid #e8ecf1' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', padding: '0.35rem 0', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>← Volver</button>
        {loading && !detail ? (
          <div style={{ padding: '0.5rem 0', color: '#64748b' }}><Spinner /></div>
        ) : err && !detail ? (
          <div style={{ color: '#dc2626', fontSize: '0.85rem', padding: '0.5rem 0' }}>{err}</div>
        ) : detail ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
            <input
              value={nombreDraft}
              onChange={e => setNombreDraft(e.target.value)}
              onBlur={() => { const v = nombreDraft.trim(); if (v && v !== detail.nombre) onPutCompra({ nombre: v }); else setNombreDraft(detail.nombre || ''); }}
              style={{ ...INP, width: 'auto', flex: '1 1 240px', fontWeight: 700, fontSize: '1.1rem', maxWidth: 460 }}
            />
            <select value={detail.estado || 'cotizando'} onChange={e => onPutCompra({ estado: e.target.value })} style={{ ...INP, width: 'auto', fontWeight: 600 }}>
              <option value="cotizando">Cotizando</option>
              <option value="decidido">Decidido</option>
              <option value="cerrado">Cerrado</option>
            </select>
            {savingHeader && <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Guardando...</span>}
            {detail.operation_id && (
              <a href={`/gestion/operaciones?op=${detail.operation_id}`} style={{ marginLeft: 'auto', color: '#059669', fontWeight: 700, fontSize: '0.82rem', textDecoration: 'none', padding: '0.45rem 0.85rem', border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: '8px' }}>Ver operación →</a>
            )}
          </div>
        ) : null}
      </div>

      {detail && (
        <>
          {/* actions bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
            <button onClick={onNewProv} style={{ padding: '0.5rem 1rem', borderRadius: '50px', border: 'none', cursor: 'pointer', background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: '0.8rem' }}>+ Agregar proveedor</button>
            <button onClick={onConvert} disabled={!hasElegido || converting}
              title={hasElegido ? 'Convertir en operación' : 'Elegí un proveedor primero'}
              style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #bbf7d0', cursor: hasElegido && !converting ? 'pointer' : 'not-allowed', background: hasElegido ? '#f0fdf4' : '#f8fafc', color: hasElegido ? '#059669' : '#94a3b8', fontWeight: 700, fontSize: '0.8rem', opacity: converting ? 0.6 : 1 }}>
              {converting ? 'Convirtiendo...' : 'Convertir en operación'}
            </button>
          </div>

          {/* comparison table */}
          <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
            {provs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                <p style={{ fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>Sin proveedores</p>
                <p style={{ fontSize: '0.82rem' }}>Agregá tu primer proveedor para empezar a comparar.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', color: '#64748b', textAlign: 'left' }}>
                      {['Proveedor','Producto','Precio unit.','Cant./MOQ','Precio total','Lead time','Incoterm','m³','Peso','Docs','Elegido',''].map((h, i) => (
                        <th key={i} style={{ padding: '0.6rem 0.7rem', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', borderBottom: '1px solid #e8ecf1' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {provs.map(p => {
                      const numCell = { padding: '0.55rem 0.7rem', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid #f1f5f9' };
                      const txtCell = { padding: '0.55rem 0.7rem', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' };
                      const goodBg = '#f0fdf4';
                      return (
                        <tr key={p.id} style={{ borderLeft: p.elegido ? '3px solid #059669' : '3px solid transparent', background: p.elegido ? '#f6fef9' : '#fff' }}>
                          <td style={{ ...txtCell, fontWeight: 700, color: '#0f172a' }}>
                            {p.nombre || '—'}
                            {p.contacto ? <span style={{ display: 'block', fontWeight: 400, fontSize: '0.7rem', color: '#94a3b8' }}>{p.contacto}</span> : null}
                          </td>
                          <td style={{ ...txtCell, whiteSpace: 'normal', minWidth: 170, maxWidth: 260 }}>
                            {p.producto || '—'}
                            {p.notas ? <span title={p.notas} style={{ display: 'block', fontSize: '0.68rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 250 }}>{p.notas}</span> : null}
                          </td>
                          <td style={{ ...numCell, background: bestUnit === p.id ? goodBg : undefined, fontWeight: bestUnit === p.id ? 700 : 400 }}>{joinMoney(p.moneda, p.precio_unitario)}</td>
                          <td style={numCell}>{p.cantidad || '—'}{p.moq ? <span style={{ color: '#94a3b8' }}> / MOQ {p.moq}</span> : null}</td>
                          <td style={{ ...numCell, background: bestTotal === p.id ? goodBg : undefined, fontWeight: bestTotal === p.id ? 700 : 400, color: bestTotal === p.id ? '#059669' : undefined }}>{joinMoney(p.moneda, p.precio_total)}</td>
                          <td style={{ ...numCell, background: bestLead === p.id ? goodBg : undefined, fontWeight: bestLead === p.id ? 700 : 400 }}>{p.lead_time || '—'}</td>
                          <td style={txtCell}>{p.incoterm || '—'}</td>
                          <td style={numCell}>{p.m3 || '—'}</td>
                          <td style={numCell}>{p.peso_kg ? `${p.peso_kg} kg` : '—'}</td>
                          <td style={{ ...txtCell, whiteSpace: 'normal', minWidth: 120, maxWidth: 190 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                              {docs.filter(d => d.proveedor_id === p.id).map(d => (
                                <a key={d.id} href={`/api/db/compras/${detail.id}/docs/${d.id}`} target="_blank" rel="noreferrer" title={`${d.filename} — abrir`}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, maxWidth: 130, padding: '0.12rem 0.45rem', borderRadius: 5, border: '1px solid #e0f2fe', background: '#f0f9ff', color: '#0369a1', fontSize: '0.64rem', fontWeight: 600, textDecoration: 'none' }}>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ flexShrink: 0 }}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.filename}</span>
                                </a>
                              ))}
                              <label title="Adjuntar archivo a este proveedor (cotización, ficha técnica, fotos)" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '0.12rem 0.45rem', borderRadius: 5, border: '1px dashed #cbd5e1', background: '#fff', color: quickDocProv === p.id ? '#94a3b8' : '#64748b', fontSize: '0.64rem', fontWeight: 700, cursor: quickDocProv ? 'wait' : 'pointer' }}>
                                {quickDocProv === p.id ? 'Subiendo…' : '+ archivo'}
                                <input type="file" disabled={!!quickDocProv} onChange={e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) onQuickDoc(p.id, f); }} style={{ display: 'none' }} />
                              </label>
                            </div>
                          </td>
                          <td style={{ ...txtCell, textAlign: 'center' }}>
                            {p.elegido ? (
                              <span title="Elegido" style={{ color: '#059669', fontSize: '1rem' }}>★</span>
                            ) : (
                              <button onClick={() => onElegir(p)} title="Elegir como ganador" style={{ background: 'none', border: '1px solid #e8ecf1', borderRadius: '6px', padding: '0.15rem 0.45rem', cursor: 'pointer', color: '#94a3b8', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>☆ Elegir</button>
                            )}
                          </td>
                          <td style={{ ...txtCell, textAlign: 'right' }}>
                            <button onClick={() => onEditProv(p)} aria-label={`Editar ${p.nombre || 'proveedor'}`} style={{ padding: '0.25rem 0.55rem', borderRadius: '6px', border: '1px solid #e8ecf1', background: '#fff', color: '#64748b', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', marginRight: '0.35rem' }}>Editar</button>
                            <button onClick={() => onAskDelProv(p.id)} aria-label={`Eliminar ${p.nombre || 'proveedor'}`} title="Eliminar" style={{ padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #fee2e2', background: '#fff', color: '#dc2626', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {docs.length > 0 && (
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.75rem' }}>
              {docs.length} documento{docs.length === 1 ? '' : 's'} adjunto{docs.length === 1 ? '' : 's'} · clic en el chip para abrirlo · se eliminan desde "Editar"
            </p>
          )}
        </>
      )}

      {/* proveedor modal */}
      {provModal && detail && (
        <ProvModal
          mode={provModal === 'new' ? 'new' : 'edit'} prov={provModal === 'new' ? null : provModal}
          form={provForm} setPF={setPF} onClose={onCloseProv} onSave={onSaveProv} saving={savingProv}
          aiState={aiState} onAiFile={onAiFile}
          docs={(detail.docs || []).filter(d => provModal !== 'new' && d.proveedor_id === provModal.id)}
          compraId={detail.id}
          docTipo={docTipo} setDocTipo={setDocTipo} docFile={docFile} onPickDoc={onPickDoc}
          docErr={docErr} uploadingDoc={uploadingDoc} onUploadDoc={onUploadDoc} onDeleteDoc={onDeleteDoc}
        />
      )}

      {/* confirm delete proveedor */}
      {confirmProvDel && (
        <Modal onClose={onCancelDelProv} maxWidth={360}>
          <p style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.4rem', textAlign: 'center' }}>¿Eliminar proveedor?</p>
          <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1.25rem', textAlign: 'center' }}>Esta acción no se puede deshacer.</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <BtnGhost onClick={onCancelDelProv}>Cancelar</BtnGhost>
            <BtnDanger onClick={() => onDelProv(confirmProvDel)}>Eliminar</BtnDanger>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================ PROVEEDOR MODAL ============================
function ProvModal({ mode, form, setPF, onClose, onSave, saving, aiState, onAiFile, docs, docTipo, setDocTipo, docFile, onPickDoc, docErr, uploadingDoc, onUploadDoc, onDeleteDoc, compraId }) {
  const num = (field, label, ph) => (
    <div>
      <label style={LBL}>{label}</label>
      <input value={form[field]} onChange={e => setPF(field, e.target.value)} inputMode="decimal" style={INP} placeholder={ph} />
    </div>
  );
  const txt = (field, label, ph) => (
    <div>
      <label style={LBL}>{label}</label>
      <input value={form[field]} onChange={e => setPF(field, e.target.value)} style={INP} placeholder={ph} />
    </div>
  );

  return (
    <Modal onClose={() => !saving && onClose()} maxWidth={640}>
      <ModalHead title={mode === 'new' ? 'Nuevo proveedor' : 'Editar proveedor'} onClose={() => !saving && onClose()} />

      {/* AI import */}
      <div style={{ border: '1px dashed #fdba74', background: '#fff7ed', borderRadius: '10px', padding: '0.85rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontWeight: 700, color: '#9a3412', fontSize: '0.82rem' }}>Importar de PDF (IA)</p>
            <p style={{ fontSize: '0.72rem', color: '#9a3412', opacity: 0.85 }}>Subí el invoice/packing y la IA completa los campos · o cargá a mano</p>
          </div>
          <label style={{ padding: '0.4rem 0.85rem', borderRadius: '8px', border: '1px solid #fdba74', background: '#fff', color: '#ea580c', fontWeight: 700, fontSize: '0.78rem', cursor: aiState === 'loading' ? 'wait' : 'pointer' }}>
            {aiState === 'loading' ? 'Analizando…' : 'Elegir archivo'}
            <input type="file" accept={ACCEPT} disabled={aiState === 'loading'} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; onAiFile(f); }} style={{ display: 'none' }} />
          </label>
        </div>
        {aiState && aiState !== 'loading' && <p style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: '0.5rem' }}>{aiState}</p>}
      </div>

      <div style={{ display: 'grid', gap: '1rem' }}>
        <Section title="Identidad">
          <Grid>
            {txt('nombre', 'Nombre *', 'Ej: Shenzhen XYZ Co.')}
            {txt('contacto', 'Contacto', 'Ej: Lucy / WeChat')}
            {txt('producto', 'Producto', 'Ej: Compresor 40kVA')}
          </Grid>
        </Section>

        <Section title="Precio">
          <Grid>
            <div>
              <label style={LBL}>Moneda</label>
              <select value={form.moneda} onChange={e => setPF('moneda', e.target.value)} style={INP}>
                {['USD','CNY','EUR'].includes(form.moneda) ? null : <option value={form.moneda}>{form.moneda}</option>}
                <option value="USD">USD</option>
                <option value="CNY">CNY</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            {num('precio_unitario', 'Precio unitario', 'Ej: 1200')}
            {num('cantidad', 'Cantidad', 'Ej: 10')}
            {num('moq', 'MOQ', 'Ej: 5')}
            {num('precio_total', 'Precio total', 'Ej: 12000')}
          </Grid>
        </Section>

        <Section title="Logística">
          <Grid>
            {txt('lead_time', 'Lead time', 'Ej: 25 días')}
            <div>
              <label style={LBL}>Incoterm</label>
              <input list="incoterm-list" value={form.incoterm} onChange={e => setPF('incoterm', e.target.value)} style={INP} placeholder="FOB" />
              <datalist id="incoterm-list">
                <option value="FOB" /><option value="EXW" /><option value="CIF" /><option value="DDP" />
              </datalist>
            </div>
            {txt('puerto', 'Puerto', 'Ej: Shenzhen')}
            {num('m3', 'm³', 'Ej: 12.5')}
            {num('peso_kg', 'Peso (kg)', 'Ej: 3200')}
            {txt('validez', 'Validez', 'Ej: 30 días')}
          </Grid>
        </Section>

        <div>
          <label style={LBL}>Notas</label>
          <textarea value={form.notas} onChange={e => setPF('notas', e.target.value)} rows={2} style={{ ...INP, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Observaciones..." />
        </div>

        {/* Documentos (edit mode only) */}
        {mode === 'edit' && (
          <Section title="Documentos">
            {docs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
                {docs.map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0.6rem', border: '1px solid #e8ecf1', borderRadius: '8px', fontSize: '0.78rem' }}>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '5px', background: '#eff6ff', color: '#0284c7', textTransform: 'uppercase' }}>{d.tipo || 'Doc'}</span>
                    <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0f172a' }}>{d.filename}</span>
                    <span style={{ color: '#94a3b8', flexShrink: 0 }}>{fmtSize(d.size)}</span>
                    <a href={`/api/db/compras/${compraId}/docs/${d.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#ea580c', fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>Ver</a>
                    <button onClick={() => onDeleteDoc(d.id)} aria-label={`Eliminar documento ${d.filename || ''}`} title="Eliminar" style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700, flexShrink: 0 }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={docTipo} onChange={e => setDocTipo(e.target.value)} style={{ ...INP, width: 'auto' }}>
                <option value="Invoice">Invoice</option>
                <option value="Packing">Packing</option>
                <option value="Otro">Otro</option>
              </select>
              <label style={{ padding: '0.5rem 0.85rem', borderRadius: '8px', border: '1px solid #e8ecf1', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
                {docFile ? docFile.name : 'Elegir archivo'}
                <input type="file" accept={ACCEPT} onChange={e => onPickDoc(e.target.files?.[0])} style={{ display: 'none' }} />
              </label>
              <button onClick={onUploadDoc} disabled={!docFile || uploadingDoc} style={{ padding: '0.5rem 0.95rem', borderRadius: '8px', border: 'none', background: !docFile || uploadingDoc ? '#cbd5e1' : '#0f172a', color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: !docFile || uploadingDoc ? 'not-allowed' : 'pointer' }}>{uploadingDoc ? 'Subiendo...' : 'Subir'}</button>
            </div>
            {docErr && <p style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: '0.5rem' }}>{docErr}</p>}
          </Section>
        )}
      </div>

      <ModalActions>
        <BtnGhost onClick={onClose} disabled={saving}>Cancelar</BtnGhost>
        <BtnPrimary onClick={onSave} disabled={saving || !form.nombre.trim()}>{saving ? 'Guardando...' : (mode === 'new' ? 'Agregar proveedor' : 'Guardar cambios')}</BtnPrimary>
      </ModalActions>
    </Modal>
  );
}

// ============================ small UI helpers ============================
function Spinner() {
  return (
    <span style={{ display: 'inline-block', width: 22, height: 22, border: '3px solid #e8ecf1', borderTopColor: '#ea580c', borderRadius: '50%', animation: 'cmpspin 0.7s linear infinite' }}>
      <style>{`@keyframes cmpspin{to{transform:rotate(360deg)}}`}</style>
    </span>
  );
}
function Badge({ meta }) {
  return <span style={{ fontSize: '0.66rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '20px', background: meta.bg, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{meta.label}</span>;
}
function Modal({ children, onClose, maxWidth = 480 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={onClose}>
      <div style={{ ...CARD, width: '100%', maxWidth, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
function ModalHead({ title, onClose }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>{title}</h3>
      <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.2rem' }}>×</button>
    </div>
  );
}
function ModalActions({ children }) {
  return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>{children}</div>;
}
function Section({ title, children }) {
  return (
    <div>
      <p style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.55rem' }}>{title}</p>
      {children}
    </div>
  );
}
function Grid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>{children}</div>;
}
function BtnPrimary({ children, onClick, disabled }) {
  return <button onClick={onClick} disabled={disabled} style={{ padding: '0.5rem 1.2rem', borderRadius: '8px', border: 'none', background: disabled ? '#fdba74' : '#ea580c', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: disabled ? 'not-allowed' : 'pointer' }}>{children}</button>;
}
function BtnGhost({ children, onClick, disabled }) {
  return <button onClick={onClick} disabled={disabled} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #e8ecf1', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}>{children}</button>;
}
function BtnDanger({ children, onClick }) {
  return <button onClick={onClick} style={{ padding: '0.5rem 1.2rem', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>{children}</button>;
}

function joinMoney(moneda, val) {
  if (val == null || String(val).trim() === '') return '—';
  const m = (moneda || '').trim();
  return m ? `${m} ${val}` : String(val);
}
function fmtDate(s) {
  try {
    const d = new Date(String(s).includes('T') || String(s).includes(' ') ? s : s + 'T00:00:00');
    if (isNaN(d.getTime())) return String(s);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return String(s); }
}
