'use client'

import './gestion.css'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'

const NAV_ITEMS = [
  {
    section: 'Principal',
    items: [
      {
        href: '/gestion/operaciones',
        label: 'Operaciones',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 6 12 2 21 6 21 16 12 20 3 16 3 6"/>
            <line x1="12" y1="22" x2="12" y2="12"/>
            <line x1="21" y1="6" x2="12" y2="12"/>
            <line x1="3" y1="6" x2="12" y2="12"/>
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
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        ),
      },
    ],
  },
]

export default function GestionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    // Fire a custom event so the active page can intercept if it has unsaved changes
    const event = new CustomEvent('gestion:navigate', { detail: { href }, cancelable: true })
    const cancelled = !window.dispatchEvent(event)
    if (cancelled) {
      e.preventDefault()
    }
  }

  return (
    <div className="gestion-root">
      <div className="app-container">

        {/* ── Sidebar ── */}
        <aside className="sidebar">
          {/* Logo */}
          <div className="sidebar-logo">
            <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 900, fontSize: '1.2rem', letterSpacing: '0.06em', color: '#0f172a', lineHeight: 1 }}>
              TRANSTIDE<span style={{ color: '#ea580c' }}>.</span>
            </span>
          </div>

          {/* Back to site */}
          <Link href="/" className="sidebar-back">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Volver al sitio
          </Link>

          {/* Nav */}
          <nav style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {NAV_ITEMS.map(({ section, items }) => (
              <div key={section}>
                <p className="nav-section-label" style={{ marginTop: section === 'Principal' ? 0 : undefined }}>{section}</p>
                {items.map(({ href, label, icon }) => (
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

        {/* ── Main ── */}
        <main className="main-content">
          <header className="top-header">
            <div>
              <h1>Portal de Gestión</h1>
              <p className="muted">Sistema interno · Transtide Freight</p>
            </div>
            <div className="user-profile">
              <div className="avatar">B</div>
            </div>
          </header>

          {children}
        </main>
      </div>
    </div>
  )
}
