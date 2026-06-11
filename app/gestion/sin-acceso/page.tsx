export const metadata = { title: 'Sin acceso · Portal Transtide' }

export default function SinAccesoPage() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Sin acceso a esta sección</h2>
        <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>
          Tu usuario no tiene permiso para ver esta parte del sistema. Si creés que es un error, pedile a un administrador que te habilite el acceso.
        </p>
      </div>
    </div>
  )
}
