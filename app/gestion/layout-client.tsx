'use client'

import './gestion.css'
import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { GestionToaster } from './toast'

const NAV_ITEMS = [
  {
    section: 'Principal',
    items: [
      {
        href: '/gestion/operaciones',
        label: 'Operaciones',
        sectionKey: 'operaciones',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 6 12 2 21 6 21 16 12 20 3 16 3 6"/>
            <line x1="12" y1="22" x2="12" y2="12"/>
            <line x1="21" y1="6" x2="12" y2="12"/>
            <line x1="3" y1="6" x2="12" y2="12"/>
          </svg>
        ),
      },
      {
        href: '/gestion/tracking',
        label: 'Tracking',
        sectionKey: 'tracking',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 3h15v13H1z"/>
            <path d="M16 8h4l3 3v5h-7V8z"/>
            <circle cx="5.5" cy="18.5" r="2.5"/>
            <circle cx="18.5" cy="18.5" r="2.5"/>
          </svg>
        ),
      },
    ],
  },
  {
    section: 'Gestión',
    items: [
      {
        href: '/gestion/clientes',
        label: 'Clientes',
        sectionKey: 'clientes',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        ),
      },
      {
        href: '/gestion/cotizador',
        label: 'Cotizador',
        sectionKey: 'cotizador',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        ),
      },
      {
        href: '/gestion/comparador',
        label: 'Comparador',
        sectionKey: 'comparador',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
        ),
      },
    ],
  },
  {
    section: 'Administración',
    adminOnly: true,
    items: [
      {
        href: '/gestion/usuarios',
        label: 'Usuarios',
        sectionKey: 'usuarios',
        adminOnly: true,
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M22 11h-6"/><path d="M19 8v6"/>
          </svg>
        ),
      },
    ],
  },
]

const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', editor: 'Editor', viewer: 'Lectura' }

export default function GestionLayoutClient({
  children,
  userName,
  role = 'editor',
  sections = [],
  logoutAction,
}: {
  children: React.ReactNode
  userName: string
  role?: string
  sections?: string[]
  logoutAction: () => Promise<void>
}) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  // Filtrar nav según permisos del usuario
  const navGroups = NAV_ITEMS
    .filter((g: any) => !g.adminOnly || isAdmin)
    .map((g: any) => ({
      ...g,
      items: g.items.filter((it: any) => {
        if (it.adminOnly) return isAdmin
        if (!it.sectionKey) return true
        return isAdmin || sections.includes(it.sectionKey)
      }),
    }))
    .filter((g: any) => g.items.length > 0)

  const initial = userName.trim().charAt(0).toUpperCase() || 'U'

  // close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // close sidebar drawer when route changes
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  // prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [sidebarOpen])

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    const event = new CustomEvent('gestion:navigate', { detail: { href }, cancelable: true })
    const cancelled = !window.dispatchEvent(event)
    if (cancelled) e.preventDefault()
    else setSidebarOpen(false)
  }

  return (
    <div className={`gestion-root${sidebarOpen ? ' sidebar-open' : ''}`}>
      <div className="app-container">

        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />

        <aside className="sidebar">
          <div className="sidebar-logo">
            <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 900, fontSize: '1.2rem', letterSpacing: '0.06em', color: '#0f172a', lineHeight: 1 }}>
              TRANSTIDE<span style={{ color: '#ea580c' }}>.</span>
            </span>
          </div>

          <Link href="/" className="sidebar-back">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Volver al sitio
          </Link>

          <nav style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {navGroups.map(({ section, items }: any) => (
              <div key={section}>
                <p className="nav-section-label" style={{ marginTop: section === 'Principal' ? 0 : undefined }}>{section}</p>
                {items.map(({ href, label, icon }: any) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={(e) => handleNavClick(e, href)}
                    className={`nav-item${pathname === href || pathname.startsWith(href + '/') ? ' active' : ''}`}
                  >
                    {icon}
                    {label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <main className="main-content">
          <header className="top-header">
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1 }}>
              <button
                type="button"
                className="mobile-menu-toggle"
                onClick={() => setSidebarOpen(true)}
                aria-label="Abrir menú"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <line x1="3" y1="12" x2="21" y2="12"/>
                  <line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
              <div style={{ minWidth: 0 }}>
                <h1>Portal de Gestión</h1>
                <p className="muted">Sistema interno · Transtide Freight</p>
              </div>
              <span className="mobile-brand">TRANSTIDE<span className="dot">.</span></span>
            </div>
            <div className="user-profile" ref={menuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setMenuOpen(o => !o)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px',
                  borderRadius: 8, transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                aria-label="Menú de usuario"
              >
                <div className="avatar">{initial}</div>
                <span className="username-text" style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {userName}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </span>
              </button>

              {menuOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 180,
                  background: '#fff', borderRadius: 10, boxShadow: '0 12px 32px rgba(15,23,42,0.12)',
                  border: '1px solid #e8ecf1', overflow: 'hidden', zIndex: 100,
                }}>
                  <div style={{ padding: '0.7rem 0.85rem', borderBottom: '1px solid #f1f5f9' }}>
                    <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>{userName}</p>
                    <p style={{ fontSize: '0.66rem', color: '#94a3b8', marginTop: 1 }}>{ROLE_LABEL[role] || 'Editor'}</p>
                  </div>
                  <form action={logoutAction} style={{ margin: 0 }}>
                    <button
                      type="submit"
                      style={{
                        width: '100%', textAlign: 'left', padding: '0.6rem 0.85rem',
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        fontSize: '0.78rem', color: '#dc2626', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                        <polyline points="16 17 21 12 16 7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                      Cerrar sesión
                    </button>
                  </form>
                </div>
              )}
            </div>
          </header>

          {children}
        </main>
      </div>
      <GestionToaster />
    </div>
  )
}
