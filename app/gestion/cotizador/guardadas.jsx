'use client';
// Panel lateral de cotizaciones guardadas: filtros, agrupación, reactivar, convertir
// en operación y eliminar.
import { useState, useEffect } from 'react';
import { gToast } from '../toast';
import { ESTADOS, estadoMeta, INP, TBTN, PBTN } from './comun';

// ─── saved-quotes panel ─────────────────────────────────────────────────────────
function SavedQuotesPanel({ onClose, onReactivate }) {
  const [quotes, setQuotes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');
  const [filter, setFilter]   = useState('todas');
  const [search, setSearch]   = useState('');
  const [agrupar, setAgrupar] = useState('estado'); // estado | cliente | fecha | valor
  const [busyId, setBusyId]   = useState(null);
  const [confirmConv, setConfirmConv] = useState(null); // cotización a convertir
  const [confirmDel, setConfirmDel]   = useState(null); // cotización a eliminar
  const [showCerradas, setShowCerradas] = useState(false); // sección "Cerradas" colapsada por defecto

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const res = await fetch('/api/db/cotizaciones');
      if (!res.ok) throw new Error('Error al cargar');
      const json = await res.json();
      setQuotes(Array.isArray(json) ? json : (json.data || json.rows || []));
    } catch (e) {
      setErr(e.message || 'Error al cargar');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const reactivate = async (q) => {
    setBusyId(q.id);
    try {
      const res = await fetch(`/api/db/cotizaciones/${q.id}`);
      if (!res.ok) throw new Error('Error al abrir');
      const full = await res.json();
      const data = full.data || {};
      onReactivate(q.modo, data, { id: q.id, nombre: q.nombre, cliente: q.cliente, estado: q.estado, notas: full.notas || '' });
    } catch (e) {
      gToast.error(e.message || 'Error al abrir la cotización');
      setBusyId(null);
    }
  };

  const changeEstado = async (q, estado) => {
    setBusyId(q.id);
    try {
      const res = await fetch(`/api/db/cotizaciones/${q.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onlyEstado: true, estado }),
      });
      if (!res.ok) throw new Error('Error');
      setQuotes(qs => qs.map(x => x.id === q.id ? { ...x, estado } : x));
    } catch (e) {
      gToast.error('No se pudo cambiar el estado');
    } finally {
      setBusyId(null);
    }
  };

  // Si ya está convertida, va directo a la operación; si no, abre el modal de confirmación.
  const convertir = (q) => {
    if (q.operation_id) { window.location.href = '/gestion/operaciones?op=' + q.operation_id; return; }
    setConfirmConv(q);
  };
  const doConvertir = async (q) => {
    setConfirmConv(null);
    setBusyId(q.id);
    try {
      const res = await fetch(`/api/db/cotizaciones/${q.id}/convertir`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Error al convertir');
      gToast.success('Operación creada. Abriéndola…');
      window.location.href = '/gestion/operaciones?op=' + j.operationId;
    } catch (e) {
      gToast.error(e.message || 'No se pudo convertir');
      setBusyId(null);
    }
  };

  const remove = (q) => setConfirmDel(q);
  const doRemove = async (q) => {
    setConfirmDel(null);
    setBusyId(q.id);
    try {
      const res = await fetch(`/api/db/cotizaciones/${q.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error');
      setQuotes(qs => qs.filter(x => x.id !== q.id));
      gToast.success('Cotización eliminada.');
    } catch (e) {
      gToast.error('No se pudo eliminar');
    } finally {
      setBusyId(null);
    }
  };

  const s = search.trim().toLowerCase();
  const visible = quotes.filter(q => {
    if (filter !== 'todas' && q.estado !== filter) return false;
    if (s && !((q.nombre || '').toLowerCase().includes(s) || (q.cliente || '').toLowerCase().includes(s))) return false;
    return true;
  });

  // "Cerrada" = ya no requiere trabajo: rechazada, o aprobada ya convertida en operación.
  const isCerrada = (q) => q.estado === 'rechazada' || (q.estado === 'aprobada' && q.operation_id);
  const activas  = visible.filter(q => !isCerrada(q));
  const cerradas = visible.filter(isCerrada);
  // Si el filtro o la búsqueda apuntan a cerradas, la sección se muestra sola.
  const cerradasAbiertas = showCerradas || filter === 'rechazada' || filter === 'aprobada' || (!!s && cerradas.length > 0);

  const fmtDate = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Agrupación / orden de la lista para poder trabajar (no todo apilado suelto).
  // Solo las ACTIVAS se agrupan acá; las cerradas van todas juntas al fondo.
  const byDateDesc = (a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
  let groups;
  if (agrupar === 'cliente') {
    const m = {};
    activas.forEach(q => { const k = ((q.cliente || '').trim()) || 'Sin cliente'; (m[k] = m[k] || []).push(q); });
    groups = Object.keys(m).sort((a, b) => a.localeCompare(b, 'es')).map(k => ({ key: k, label: k, count: m[k].length, items: m[k].sort(byDateDesc) }));
  } else if (agrupar === 'valor') {
    groups = [{ key: 'all', items: [...activas].sort((a, b) => Number(b.total_usd || 0) - Number(a.total_usd || 0)) }];
  } else if (agrupar === 'fecha') {
    groups = [{ key: 'all', items: [...activas].sort(byDateDesc) }];
  } else { // estado (default): en orden de pipeline
    groups = ESTADOS.map(e => ({ key: e.id, label: e.label, dot: e.fg, count: 0, items: activas.filter(q => q.estado === e.id).sort(byDateDesc) })).filter(g => g.items.length);
  }

  return (
    <>
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1050, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
      <div className="cz-modal" style={{ background: '#fff', width: '100%', maxWidth: '560px', height: '100%', overflowY: 'auto', borderLeft: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column' }}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.1rem 1.5rem', borderBottom: '1px solid #f1f5f9', background: '#fff', position: 'sticky', top: 0, zIndex: 10 }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Cotizaciones guardadas</h3>
            <p style={{ fontSize: '0.74rem', color: '#9ca3af' }}>{quotes.length} guardada{quotes.length === 1 ? '' : 's'}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="cz-tbtn" style={{ ...TBTN, fontSize: '1.05rem', lineHeight: 1 }}>×</button>
        </div>

        {/* filters */}
        <div style={{ padding: '0.9rem 1.5rem', background: '#fff', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: '64px', zIndex: 9 }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o cliente…" style={{ ...INP, marginBottom: '0.7rem' }} />
          <div style={{ display: 'flex', gap: '1.1rem', flexWrap: 'wrap' }}>
            {[['todas', 'Todas'], ...ESTADOS.map(e => [e.id, e.label])].map(([id, label]) => {
              const active = filter === id;
              return (
                <button key={id} onClick={() => setFilter(id)} style={{ padding: '0 0 4px', border: 'none', borderBottom: active ? '2px solid #111827' : '2px solid transparent', cursor: 'pointer', fontSize: '0.74rem', fontWeight: active ? 600 : 400, background: 'transparent', color: active ? '#111827' : '#9ca3af' }}>
                  {label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.7rem' }}>
            <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Agrupar por</span>
            <select value={agrupar} onChange={e => setAgrupar(e.target.value)} style={{ padding: '0.15rem 0.1rem', border: 'none', borderBottom: '1px solid #e5e7eb', borderRadius: 0, fontSize: '0.76rem', fontWeight: 500, color: '#111827', background: 'transparent', cursor: 'pointer', outline: 'none' }}>
              <option value="estado">Estado</option>
              <option value="cliente">Cliente</option>
              <option value="fecha">Más recientes</option>
              <option value="valor">Mayor valor</option>
            </select>
          </div>
        </div>

        {/* list */}
        <div style={{ padding: '0.5rem 1.5rem 1.25rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
          {loading && <p style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '0.75rem 0' }}>Cargando…</p>}
          {err && <p style={{ color: '#dc2626', fontSize: '0.85rem', padding: '0.75rem 0' }}>{err}</p>}
          {!loading && !err && visible.length === 0 && <p style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '0.75rem 0' }}>No hay cotizaciones que coincidan.</p>}
          {/* Alertas de seguimiento: cotizaciones frías y aprobadas sin convertir */}
          {!loading && !err && (() => {
            const now = Date.now()
            const dias = (v) => { const d = new Date(v || 0); return isNaN(d.getTime()) ? 0 : Math.floor((now - d.getTime()) / 86400000) }
            const frias = quotes.filter(q => ['enviada', 'negociacion'].includes(q.estado) && dias(q.updated_at || q.created_at) >= 5)
            const sinConv = quotes.filter(q => q.estado === 'aprobada' && !q.operation_id)
            if (!frias.length && !sinConv.length) return null
            return (
              <div style={{ borderLeft: '2px solid #d97706', paddingLeft: 12, margin: '0.6rem 0' }}>
                <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Seguimiento</p>
                {sinConv.slice(0, 3).map(q => (
                  <p key={q.id} style={{ fontSize: '0.78rem', color: '#6b7280', padding: '0.08rem 0' }}><b style={{ color: '#111827' }}>{q.nombre}</b> está aprobada — convertila en operación</p>
                ))}
                {frias.slice(0, 4).map(q => (
                  <p key={q.id} style={{ fontSize: '0.78rem', color: '#6b7280', padding: '0.08rem 0' }}><b style={{ color: '#111827' }}>{q.nombre}</b> sin respuesta hace <span style={{ color: '#d97706' }}>{dias(q.updated_at || q.created_at)} días</span> — hacé follow-up{q.cliente ? ` a ${q.cliente}` : ''}</p>
                ))}
              </div>
            )
          })()}
          {!loading && !err && groups.map(g => (
            <div key={g.key}>
              {g.label && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, margin: '1.5rem 0 0.1rem' }}>
                  <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{g.label}</span>
                  <span style={{ fontSize: '0.64rem', fontWeight: 500, color: '#9ca3af' }}>{g.items.length}</span>
                </div>
              )}
              <div>
                {g.items.map(q => {
                  const busy = busyId === q.id;
                  return (
                    <div key={q.id} className="cz-row" style={{ padding: '0.8rem 0.25rem', borderBottom: '1px solid #f1f5f9', opacity: busy ? 0.6 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.6rem' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ fontSize: '0.88rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.nombre}</p>
                          <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 2 }}>
                            {[q.cliente, q.modo === 'aereo' ? 'Aéreo' : 'Marítimo', fmtDate(q.updated_at || q.created_at)].filter(Boolean).join(' · ')}
                          </p>
                          {q.resumen && <p className="cz-mid" style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 2 }}>{q.resumen}</p>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {q.total_usd && (<>
                            <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>USD {Number(q.total_usd).toLocaleString('es-AR')}</p>
                            <p style={{ fontSize: '0.6rem', color: '#9ca3af' }}>total cotizado</p>
                          </>)}
                          <select value={q.estado} onChange={e => changeEstado(q, e.target.value)} disabled={busy} title="Cambiar estado" style={{ marginTop: 3, padding: 0, border: 'none', fontSize: '0.68rem', fontWeight: 600, color: q.estado === 'aprobada' ? '#059669' : q.estado === 'rechazada' ? '#dc2626' : '#6b7280', background: 'transparent', cursor: 'pointer', textAlign: 'right', outline: 'none' }}>
                            {ESTADOS.map(e => <option key={e.id} value={e.id} style={{ color: '#111827', background: '#fff' }}>{e.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', marginTop: '0.45rem' }}>
                        <button onClick={() => reactivate(q)} disabled={busy} className="cz-tbtn" style={{ ...TBTN, fontSize: '0.72rem', cursor: busy ? 'default' : 'pointer' }}>
                          Reactivar
                        </button>
                        <button onClick={() => convertir(q)} disabled={busy} title={q.operation_id ? 'Ya convertida — ir a la operación' : 'Crear operación desde esta cotización'} className="cz-tbtn" style={{ ...TBTN, fontSize: '0.72rem', cursor: busy ? 'default' : 'pointer', color: q.operation_id ? '#059669' : '#6b7280' }}>
                          {q.operation_id ? 'Ver operación' : 'Convertir'}
                        </button>
                        <button onClick={() => remove(q)} disabled={busy} aria-label="Eliminar" title="Eliminar" className="cz-iconbtn" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: busy ? 'default' : 'pointer', background: 'none', color: '#c4c9d4', padding: 2 }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Cerradas: rechazadas y aprobadas ya convertidas — todas al fondo, colapsadas */}
          {!loading && !err && cerradas.length > 0 && (
            <div style={{ marginTop: '1.25rem' }}>
              <button onClick={() => setShowCerradas(v => !v)} className="cz-tbtn" style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', background: 'none', border: 'none', padding: '0.15rem 0', cursor: 'pointer', textAlign: 'left', fontSize: '0.72rem', color: '#9ca3af' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: cerradasAbiertas ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><polyline points="9 18 15 12 9 6"/></svg>
                <span style={{ fontWeight: 600 }}>Cerradas · {cerradas.length}</span>
              </button>
              {cerradasAbiertas && (
                <div style={{ marginTop: '0.2rem' }}>
                  {[...cerradas].sort(byDateDesc).map(q => {
                    const busy = busyId === q.id;
                    return (
                      <div key={q.id} className="cz-row" style={{ padding: '0.6rem 0.25rem', borderBottom: '1px solid #f1f5f9', opacity: busy ? 0.4 : 0.55 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.nombre}</p>
                            <p style={{ fontSize: '0.66rem', color: '#9ca3af', marginTop: 1 }}>
                              {[estadoMeta(q.estado).label, q.cliente, q.modo === 'aereo' ? 'Aéreo' : 'Marítimo', q.total_usd ? `USD ${Number(q.total_usd).toLocaleString('es-AR')}` : '', fmtDate(q.updated_at || q.created_at)].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          {q.operation_id && (
                            <button onClick={() => convertir(q)} disabled={busy} title="Ir a la operación" className="cz-tbtn" style={{ ...TBTN, fontSize: '0.7rem', cursor: busy ? 'default' : 'pointer' }}>Ver operación</button>
                          )}
                          <button onClick={() => reactivate(q)} disabled={busy} className="cz-tbtn" style={{ ...TBTN, fontSize: '0.7rem', cursor: busy ? 'default' : 'pointer' }}>Reactivar</button>
                          <button onClick={() => remove(q)} disabled={busy} aria-label="Eliminar" title="Eliminar" className="cz-iconbtn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: busy ? 'default' : 'pointer', background: 'none', color: '#c4c9d4', padding: 2 }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {confirmConv && (
      <div onClick={() => setConfirmConv(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '1.5rem 1.75rem', maxWidth: 380 }}>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', marginBottom: '0.4rem' }}>¿Convertir en operación?</p>
          <p style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '1.25rem' }}>Se creará una operación con el cliente, contenedor, m³ y FOB precargados desde “{confirmConv.nombre}”.</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button onClick={() => setConfirmConv(null)} className="cz-tbtn" style={TBTN}>Cancelar</button>
            <button onClick={() => doConvertir(confirmConv)} style={PBTN}>Convertir</button>
          </div>
        </div>
      </div>
    )}

    {confirmDel && (
      <div onClick={() => setConfirmDel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '1.5rem 1.75rem', maxWidth: 360 }}>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', marginBottom: '0.4rem' }}>¿Eliminar cotización?</p>
          <p style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '1.25rem' }}>Se borra “<span style={{ color: '#dc2626' }}>{confirmDel.nombre}</span>”. No se puede deshacer.</p>
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

export { SavedQuotesPanel };
export default SavedQuotesPanel;
