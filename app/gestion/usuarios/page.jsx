'use client'

import { useState, useEffect } from 'react'
import { gToast } from '../toast'

const INK = '#111827'
const INP = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '16px', color: INK, background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const LBL = { display: 'block', fontSize: '0.68rem', fontWeight: 500, color: '#9ca3af', marginBottom: 5 }

const SECTIONS = [
  { id: 'operaciones', label: 'Operaciones' },
  { id: 'tracking', label: 'Tracking' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'cotizador', label: 'Cotizador' },
  { id: 'comparador', label: 'Comparador' },
  { id: 'contactos', label: 'Contactos' },
  { id: 'despachante', label: 'Despachante' },
]
const ROLES = [
  { id: 'admin',  label: 'Administrador', desc: 'Acceso total + gestión de usuarios' },
  { id: 'editor', label: 'Editor',        desc: 'Ve y edita las secciones asignadas' },
  { id: 'viewer', label: 'Lectura',       desc: 'Solo ve las secciones asignadas' },
]
const roleLabel = (r) => (ROLES.find(x => x.id === r) || ROLES[1]).label

const EMPTY = { name: '', username: '', password: '', role: 'editor', sections: ['operaciones', 'tracking', 'clientes', 'cotizador'], active: 1 }

export default function UsuariosPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'new' | userObj
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [showInact, setShowInact] = useState(false) // sección de inactivos, colapsada por defecto

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/db/users')
      if (r.ok) setUsers(await r.json())
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const openNew  = () => { setForm({ ...EMPTY }); setError(null); setModal('new') }
  const openEdit = (u) => {
    setForm({ name: u.name, username: u.username, password: '', role: u.role, sections: (u.sections || '').split(',').filter(Boolean), active: u.active })
    setError(null); setModal(u)
  }

  const toggleSection = (sid) => setForm(f => ({
    ...f,
    sections: f.sections.includes(sid) ? f.sections.filter(s => s !== sid) : [...f.sections, sid],
  }))

  const save = async () => {
    setError(null); setSaving(true)
    try {
      const payload = { ...form, sections: form.role === 'admin' ? SECTIONS.map(s => s.id) : form.sections }
      let r
      if (modal === 'new') {
        r = await fetch('/api/db/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      } else {
        r = await fetch(`/api/db/users/${modal.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      }
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'Error al guardar'); return }
      await load()
      setModal(null)
      gToast.success(modal === 'new' ? 'Usuario creado.' : 'Usuario actualizado.')
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    } finally { setSaving(false) }
  }

  const del = async (id) => {
    try {
      const r = await fetch(`/api/db/users/${id}`, { method: 'DELETE' })
      if (!r.ok) { gToast.error((await r.json().catch(() => ({}))).error || 'No se pudo eliminar el usuario.'); return }
      await load()
      gToast.success('Usuario eliminado.')
    } catch {
      gToast.error('Error de conexión. Intentá de nuevo.')
    } finally { setConfirmDel(null) }
  }

  // Activos arriba; inactivos (equivalente a "cerrados") al fondo, colapsados.
  const activos = users.filter(u => u.active)
  const inactivos = users.filter(u => !u.active)
  const admins = users.filter(u => u.active && u.role === 'admin')

  // Línea de acceso: secciones como texto plano separado por ' · '.
  const accesoText = (u) => {
    if (u.role === 'admin') return 'Todo el sistema'
    const secs = (u.sections || '').split(',').filter(Boolean)
    if (secs.length === 0) return null
    return secs.map(sid => SECTIONS.find(x => x.id === sid)?.label || sid).join(' · ')
  }

  // Fila plana de usuario, misma pieza para activos e inactivos (apagada abajo).
  const userRow = (u, dim) => {
    const acceso = accesoText(u)
    return (
      <div key={u.id} className="u-row" onClick={() => openEdit(u)}
        style={{ padding: '0.8rem 0.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', opacity: dim ? 0.55 : 1 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.88rem', fontWeight: 600, color: INK }}>{u.name || u.username}</p>
          <p style={{ marginTop: 2, fontSize: '0.68rem', color: '#9ca3af' }}>
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>@{u.username}</span>
            {' · '}{roleLabel(u.role)}
            {' · '}
            {acceso || <span style={{ color: '#d97706', fontWeight: 600 }}>Sin acceso a secciones</span>}
          </p>
        </div>
        <div className="u-acts" style={{ display: 'inline-flex', gap: 6, flex: '0 0 auto' }} onClick={e => e.stopPropagation()}>
          <button onClick={() => openEdit(u)} title="Editar" aria-label={`Editar usuario ${u.name || u.username}`} style={{ border: 'none', background: 'none', color: '#c4c9d4', cursor: 'pointer', padding: 4, display: 'inline-flex', alignItems: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button onClick={() => setConfirmDel(u)} title="Eliminar" aria-label={`Eliminar usuario ${u.name || u.username}`} style={{ border: 'none', background: 'none', color: '#c4c9d4', cursor: 'pointer', padding: 4, display: 'inline-flex', alignItems: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          </button>
        </div>
      </div>
    )
  }

  const metric = (value, label, color) => (
    <div>
      <p style={{ fontSize: '1.15rem', fontWeight: 700, color: color || INK, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{value}</p>
      <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginTop: 2 }}>{label}</p>
    </div>
  )

  return (
    <div style={{ background: '#fff' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 350, letterSpacing: '-0.02em', color: INK, marginBottom: '0.15rem' }}>Usuarios y roles</h2>
          <p style={{ fontSize: '0.74rem', color: '#9ca3af' }}>Controlá quién accede a qué</p>
        </div>
        <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', borderRadius: 6, border: 'none', background: INK, color: '#fff', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo usuario
        </button>
      </div>

      {/* Métricas en línea */}
      {!loading && users.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem', margin: '1.4rem 0 0.6rem' }}>
          {metric(activos.length, 'Activos')}
          <div style={{ width: 1, alignSelf: 'stretch', background: '#f1f5f9' }} />
          {metric(admins.length, 'Administradores')}
          {inactivos.length > 0 && <>
            <div style={{ width: 1, alignSelf: 'stretch', background: '#f1f5f9' }} />
            {metric(inactivos.length, 'Inactivos')}
          </>}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3.5rem 0', textAlign: 'center', color: '#9ca3af', fontSize: '0.78rem' }}>
          <div style={{ width: 28, height: 28, border: '2px solid #f1f5f9', borderTopColor: INK, borderRadius: '50%', margin: '0 auto 0.9rem', animation: 'spin 0.8s linear infinite' }} />
          Cargando usuarios…
        </div>
      ) : users.length === 0 ? (
        <div style={{ padding: '3.5rem 0', textAlign: 'center' }}>
          <p style={{ fontWeight: 600, color: INK, fontSize: '0.85rem', marginBottom: 4 }}>Todavía no hay usuarios.</p>
          <p style={{ fontSize: '0.74rem', color: '#9ca3af' }}>Creá el primero con «Nuevo usuario».</p>
        </div>
      ) : (
        <>
          {/* Activos */}
          <div style={{ borderTop: '1px solid #f1f5f9' }}>
            {activos.map(u => userRow(u, false))}
            {activos.length === 0 && (
              <p style={{ padding: '1.5rem 0.25rem', color: '#9ca3af', fontSize: '0.74rem' }}>No hay usuarios activos.</p>
            )}
          </div>

          {/* Inactivos: al fondo, colapsados por defecto */}
          {inactivos.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <button onClick={() => setShowInact(v => !v)} className="u-ghost"
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '0.2rem 0.1rem', cursor: 'pointer', fontSize: '0.72rem', color: '#9ca3af', fontFamily: 'inherit' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: showInact ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><polyline points="9 18 15 12 9 6"/></svg>
                Inactivos · {inactivos.length}
              </button>
              {showInact && (
                <div style={{ marginTop: '0.4rem', borderTop: '1px solid #f1f5f9' }}>
                  {inactivos.map(u => userRow(u, true))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setModal(null)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem 1.75rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: INK }}>{modal === 'new' ? 'Nuevo usuario' : `Editar ${form.name}`}</h3>
              <button onClick={() => setModal(null)} aria-label="Cerrar" className="u-ghost" style={{ background: 'none', border: 'none', fontSize: '1.3rem', color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.25rem' }}>
              <div><label style={LBL}>Nombre completo</label><input className="u-inp" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={INP} placeholder="Juan Pérez" /></div>
              <div><label style={LBL}>Usuario</label><input className="u-inp" value={form.username} disabled={modal !== 'new'} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} style={{ ...INP, background: modal !== 'new' ? '#fafafa' : '#fff', color: modal !== 'new' ? '#9ca3af' : INK }} placeholder="juan" /></div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={LBL}>{modal === 'new' ? 'Contraseña' : 'Nueva contraseña (dejar vacío para no cambiar)'}</label>
                <input type="text" className="u-inp" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} style={INP} placeholder={modal === 'new' ? 'mínimo 8 caracteres' : '••••••••'} />
              </div>
            </div>

            {/* Rol */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={LBL}>Rol</label>
              <div>
                {ROLES.map(r => {
                  const sel = form.role === r.id
                  return (
                    <button key={r.id} onClick={() => setForm(f => ({ ...f, role: r.id }))} className="u-opt" style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '0.55rem 0.25rem', border: 'none', borderBottom: '1px solid #f8fafc', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <div style={{ width: 15, height: 15, borderRadius: '50%', border: `1.5px solid ${sel ? INK : '#d1d5db'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {sel && <div style={{ width: 7, height: 7, borderRadius: '50%', background: INK }} />}
                      </div>
                      <div>
                        <p style={{ fontSize: '0.8rem', fontWeight: sel ? 600 : 400, color: sel ? INK : '#6b7280' }}>{r.label}</p>
                        <p style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{r.desc}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Secciones (oculto para admin) */}
            {form.role !== 'admin' && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={LBL}>Acceso a secciones</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.1rem 1rem' }}>
                  {SECTIONS.map(s => {
                    const on = form.sections.includes(s.id)
                    return (
                      <button key={s.id} onClick={() => toggleSection(s.id)} className="u-opt" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.4rem 0.25rem', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                        <div style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${on ? INK : '#d1d5db'}`, background: on ? INK : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {on && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <span style={{ fontSize: '0.78rem', fontWeight: on ? 600 : 400, color: on ? INK : '#6b7280' }}>{s.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Estado (solo edición) */}
            {modal !== 'new' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f8fafc', paddingTop: '0.8rem', marginBottom: '1.25rem' }}>
                <div>
                  <p style={{ fontSize: '0.8rem', fontWeight: 500, color: INK }}>Usuario activo</p>
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af' }}>si lo desactivás, no puede iniciar sesión</p>
                </div>
                <button type="button" onClick={() => setForm(f => ({ ...f, active: f.active ? 0 : 1 }))} className={`g-toggle${form.active ? ' on' : ''}`} aria-pressed={!!form.active}>
                  <span className="g-toggle-knob" />
                </button>
              </div>
            )}

            {error && <p style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600, marginBottom: '1rem' }}>{error}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16 }}>
              <button onClick={() => setModal(null)} className="u-ghost" style={{ background: 'none', border: 'none', color: '#6b7280', fontWeight: 400, fontSize: '0.74rem', cursor: 'pointer', fontFamily: 'inherit', padding: '0.3rem 0.2rem' }}>Cancelar</button>
              <button onClick={save} disabled={saving} style={{ padding: '0.5rem 1.2rem', borderRadius: 6, border: 'none', background: INK, color: '#fff', fontWeight: 600, fontSize: '0.78rem', cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Guardando…' : (modal === 'new' ? 'Crear usuario' : 'Guardar')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }} onClick={() => setConfirmDel(null)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 360, padding: '1.5rem 1.75rem' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, color: INK, marginBottom: 6 }}>¿Eliminar a {confirmDel.name}?</p>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '1.25rem' }}>Perderá acceso al sistema. Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', alignItems: 'center' }}>
              <button onClick={() => setConfirmDel(null)} className="u-ghost" style={{ background: 'none', border: 'none', color: '#6b7280', fontWeight: 400, fontSize: '0.74rem', cursor: 'pointer', fontFamily: 'inherit', padding: '0.3rem 0.2rem' }}>Cancelar</button>
              <button onClick={() => del(confirmDel.id)} style={{ background: 'none', border: 'none', color: '#dc2626', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', padding: '0.3rem 0.2rem' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .u-row:hover { background: #fafafa; }
        .u-acts { opacity: 0; transition: opacity .12s; }
        .u-row:hover .u-acts, .u-acts:focus-within { opacity: 1; }
        .u-acts button:hover { color: ${INK} !important; }
        .u-ghost:hover { color: ${INK} !important; }
        .u-opt:hover { background: #fafafa; }
        .u-inp:focus { border-color: ${INK} !important; }
        @media (hover: none) { .u-acts { opacity: 1; } }
        @media (max-width: 640px) {
          .u-acts { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
