'use client'

import { useState, useEffect } from 'react'
import { gToast } from '../toast'

const CARD = { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf1', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }
const INP = { width: '100%', padding: '0.55rem 0.7rem', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '16px', color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const LBL = { display: 'block', fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }
const PRIMARY = '#0f172a'

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

  // Línea de acceso: rol · secciones, todo como texto plano.
  const accesoText = (u) => {
    if (u.role === 'admin') return 'Todo el sistema'
    const secs = (u.sections || '').split(',').filter(Boolean)
    if (secs.length === 0) return null
    return secs.map(sid => SECTIONS.find(x => x.id === sid)?.label || sid).join(' · ')
  }

  // Card de usuario, misma pieza para activos e inactivos (compacta/apagada abajo).
  const userCard = (u, dim) => {
    const acceso = accesoText(u)
    return (
      <div key={u.id} onClick={() => openEdit(u)}
        style={{ ...CARD, padding: dim ? '0.6rem 1.1rem' : '0.9rem 1.1rem', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', opacity: dim ? 0.6 : 1 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>{u.name || u.username}</span>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>@{u.username}</span>
          </div>
          <p style={{ marginTop: 3, fontSize: '0.72rem', color: '#64748b' }}>
            {roleLabel(u.role)}
            <span style={{ color: '#cbd5e1' }}> · </span>
            {acceso || <span style={{ color: '#b45309', fontWeight: 600 }}>Sin acceso a secciones</span>}
          </p>
        </div>
        <div style={{ display: 'inline-flex', gap: 2, flex: '0 0 auto' }} onClick={e => e.stopPropagation()}>
          <button onClick={() => openEdit(u)} title="Editar" aria-label={`Editar usuario ${u.name || u.username}`} style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button onClick={() => setConfirmDel(u)} title="Eliminar" aria-label={`Eliminar usuario ${u.name || u.username}`} style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.2rem' }}>Usuarios y roles</h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Controlá quién accede a qué · {users.length} usuarios</p>
        </div>
        <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 1.1rem', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo usuario
        </button>
      </div>

      {loading ? (
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ width: 34, height: 34, border: '3px solid #e8ecf1', borderTopColor: PRIMARY, borderRadius: '50%', margin: '0 auto 1rem', animation: 'spin 0.8s linear infinite' }} />
          Cargando usuarios…
        </div>
      ) : users.length === 0 ? (
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          <p style={{ fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Todavía no hay usuarios.</p>
          <p style={{ fontSize: '0.8rem' }}>Creá el primero con «Nuevo usuario».</p>
        </div>
      ) : (
        <>
          {/* Activos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {activos.map(u => userCard(u, false))}
            {activos.length === 0 && (
              <div style={{ ...CARD, padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>No hay usuarios activos.</div>
            )}
          </div>

          {/* Inactivos: al fondo, colapsados por defecto */}
          {inactivos.length > 0 && (
            <div style={{ marginTop: '1.25rem' }}>
              <button onClick={() => setShowInact(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', padding: '0.2rem 0.1rem', cursor: 'pointer' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" style={{ transform: showInact ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><polyline points="9 18 15 12 9 6"/></svg>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inactivos · {inactivos.length}</span>
              </button>
              {showInact && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                  {inactivos.map(u => userCard(u, true))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setModal(null)}>
          <div style={{ ...CARD, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{modal === 'new' ? 'Nuevo usuario' : `Editar ${form.name}`}</h3>
              <button onClick={() => setModal(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: '#94a3b8', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div><label style={LBL}>Nombre completo</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={INP} placeholder="Juan Pérez" /></div>
              <div><label style={LBL}>Usuario</label><input value={form.username} disabled={modal !== 'new'} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} style={{ ...INP, background: modal !== 'new' ? '#f8fafc' : '#fff', color: modal !== 'new' ? '#94a3b8' : '#0f172a' }} placeholder="juan" /></div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={LBL}>{modal === 'new' ? 'Contraseña' : 'Nueva contraseña (dejar vacío para no cambiar)'}</label>
                <input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} style={INP} placeholder={modal === 'new' ? 'mínimo 8 caracteres' : '••••••••'} />
              </div>
            </div>

            {/* Rol */}
            <label style={LBL}>Rol</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {ROLES.map(r => {
                const sel = form.role === r.id
                return (
                  <button key={r.id} onClick={() => setForm(f => ({ ...f, role: r.id }))} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0.8rem', borderRadius: 8, border: `1.5px solid ${sel ? PRIMARY : '#e2e8f0'}`, background: sel ? '#f8fafc' : '#fff', cursor: 'pointer' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${sel ? PRIMARY : '#cbd5e1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {sel && <div style={{ width: 8, height: 8, borderRadius: '50%', background: PRIMARY }} />}
                    </div>
                    <div>
                      <p style={{ fontSize: '0.82rem', fontWeight: 700, color: sel ? PRIMARY : '#1e293b' }}>{r.label}</p>
                      <p style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{r.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Secciones (oculto para admin) */}
            {form.role !== 'admin' && (
              <>
                <label style={LBL}>Acceso a secciones</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                  {SECTIONS.map(s => {
                    const on = form.sections.includes(s.id)
                    return (
                      <button key={s.id} onClick={() => toggleSection(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.55rem 0.7rem', borderRadius: 7, border: `1px solid ${on ? '#cbd5e1' : '#e2e8f0'}`, background: on ? '#f8fafc' : '#fff', cursor: 'pointer' }}>
                        <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${on ? PRIMARY : '#cbd5e1'}`, background: on ? PRIMARY : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {on && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: on ? '#0f172a' : '#64748b' }}>{s.label}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* Estado (solo edición) */}
            {modal !== 'new' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.8rem', background: '#f8fafc', borderRadius: 8, border: '1px solid #e8ecf1', marginBottom: 16 }}>
                <div>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>Usuario activo</p>
                  <p style={{ fontSize: '0.68rem', color: '#94a3b8' }}>si lo desactivás, no puede iniciar sesión</p>
                </div>
                <button type="button" onClick={() => setForm(f => ({ ...f, active: f.active ? 0 : 1 }))} className={`g-toggle${form.active ? ' on' : ''}`} aria-pressed={!!form.active}>
                  <span className="g-toggle-knob" />
                </button>
              </div>
            )}

            {error && <p style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600, marginBottom: 14 }}>{error}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setModal(null)} style={{ padding: '0.55rem 1.1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={save} disabled={saving} style={{ padding: '0.55rem 1.3rem', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Guardando…' : (modal === 'new' ? 'Crear usuario' : 'Guardar')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={() => setConfirmDel(null)}>
          <div style={{ ...CARD, maxWidth: 360, padding: '1.75rem', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>¿Eliminar a {confirmDel.name}?</p>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1.25rem' }}>Perderá acceso al sistema. Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => setConfirmDel(null)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => del(confirmDel.id)} style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
