'use client'

import { useState, useEffect } from 'react'

const CARD = { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf1', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }
const INP = { width: '100%', padding: '0.55rem 0.7rem', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '16px', color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const LBL = { display: 'block', fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }

const SECTIONS = [
  { id: 'operaciones', label: 'Operaciones' },
  { id: 'tracking', label: 'Tracking' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'cotizador', label: 'Cotizador' },
]
const ROLES = [
  { id: 'admin',  label: 'Administrador', desc: 'Acceso total + gestión de usuarios', c: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  { id: 'editor', label: 'Editor',        desc: 'Ve y edita las secciones asignadas', c: '#ea580c', bg: '#fff4ee', border: '#fed7aa' },
  { id: 'viewer', label: 'Lectura',       desc: 'Solo ve las secciones asignadas',    c: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
]
const roleStyle = (r) => ROLES.find(x => x.id === r) || ROLES[1]

const EMPTY = { name: '', username: '', password: '', role: 'editor', sections: ['operaciones', 'tracking', 'clientes', 'cotizador'], active: 1 }

export default function UsuariosPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'new' | userObj
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

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
      if (!r.ok) { setError((await r.json()).error || 'Error al guardar'); return }
      await load()
      setModal(null)
    } finally { setSaving(false) }
  }

  const del = async (id) => {
    const r = await fetch(`/api/db/users/${id}`, { method: 'DELETE' })
    if (!r.ok) { alert((await r.json()).error || 'No se pudo eliminar') }
    else await load()
    setConfirmDel(null)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.2rem' }}>Usuarios y roles</h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>{users.length} usuarios · controlá quién accede a qué</p>
        </div>
        <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 1.1rem', borderRadius: 50, border: 'none', background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>+ Nuevo usuario</button>
      </div>

      {loading ? (
        <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ width: 34, height: 34, border: '3px solid #e8ecf1', borderTopColor: '#ea580c', borderRadius: '50%', margin: '0 auto 1rem', animation: 'spin 0.8s linear infinite' }} />
          Cargando usuarios…
        </div>
      ) : (
        <div style={{ ...CARD, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Usuario', 'Rol', 'Acceso a', 'Estado', ''].map(h => (
                    <th key={h} style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.7rem', textAlign: 'left', borderBottom: '1px solid #e8ecf1' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const rs = roleStyle(u.role)
                  const secs = (u.sections || '').split(',').filter(Boolean)
                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', opacity: u.active ? 1 : 0.5 }}
                      onClick={() => openEdit(u)}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '0.7rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #ea580c, #c2410c)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>{(u.name || u.username || '?').charAt(0).toUpperCase()}</div>
                          <div>
                            <p style={{ fontWeight: 700, color: '#1e293b' }}>{u.name}</p>
                            <p style={{ fontSize: '0.72rem', color: '#94a3b8' }}>@{u.username}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '0.7rem' }}>
                        <span style={{ display: 'inline-block', background: rs.bg, color: rs.c, border: `1px solid ${rs.border}`, fontSize: '0.68rem', fontWeight: 700, padding: '0.18rem 0.6rem', borderRadius: 5 }}>{rs.label}</span>
                      </td>
                      <td style={{ padding: '0.7rem' }}>
                        {u.role === 'admin' ? (
                          <span style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600 }}>Todo el sistema</span>
                        ) : secs.length === 0 ? (
                          <span style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>Sin acceso</span>
                        ) : (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {secs.map(sid => (
                              <span key={sid} style={{ fontSize: '0.64rem', background: '#f1f5f9', color: '#475569', padding: '0.1rem 0.45rem', borderRadius: 4, fontWeight: 600 }}>
                                {SECTIONS.find(x => x.id === sid)?.label || sid}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.7rem' }}>
                        {u.active ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669' }} />Activo</span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#cbd5e1' }} />Inactivo</span>
                        )}
                      </td>
                      <td style={{ padding: '0.7rem', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setConfirmDel(u)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #fee2e2', background: '#fff', color: '#dc2626', fontSize: '0.9rem', cursor: 'pointer' }}>×</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setModal(null)}>
          <div style={{ ...CARD, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{modal === 'new' ? 'Nuevo usuario' : `Editar ${form.name}`}</h3>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: '#94a3b8', cursor: 'pointer' }}>×</button>
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
                  <button key={r.id} onClick={() => setForm(f => ({ ...f, role: r.id }))} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0.8rem', borderRadius: 8, border: `1.5px solid ${sel ? r.c : '#e2e8f0'}`, background: sel ? r.bg : '#fff', cursor: 'pointer' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${sel ? r.c : '#cbd5e1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {sel && <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.c }} />}
                    </div>
                    <div>
                      <p style={{ fontSize: '0.82rem', fontWeight: 700, color: sel ? r.c : '#1e293b' }}>{r.label}</p>
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
                      <button key={s.id} onClick={() => toggleSection(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.55rem 0.7rem', borderRadius: 7, border: `1px solid ${on ? '#bbf7d0' : '#e2e8f0'}`, background: on ? '#f0fdf4' : '#fff', cursor: 'pointer' }}>
                        <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${on ? '#059669' : '#cbd5e1'}`, background: on ? '#059669' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {on && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: on ? '#065f46' : '#475569' }}>{s.label}</span>
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

            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: '0.55rem 0.75rem', fontSize: '0.78rem', color: '#dc2626', fontWeight: 500, marginBottom: 14 }}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setModal(null)} style={{ padding: '0.55rem 1.1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={save} disabled={saving} style={{ padding: '0.55rem 1.3rem', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Guardando…' : (modal === 'new' ? 'Crear usuario' : 'Guardar')}</button>
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
