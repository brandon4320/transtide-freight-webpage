'use client'

import { useState } from 'react'

export default function MigrarPage() {
  const [json, setJson] = useState('')
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const [keys, setKeys] = useState<string[]>([])

  function handleImport() {
    try {
      const data = JSON.parse(json)
      if (typeof data !== 'object' || Array.isArray(data)) throw new Error('El JSON debe ser un objeto')
      const imported: string[] = []
      Object.entries(data).forEach(([key, value]) => {
        localStorage.setItem(key, value as string)
        imported.push(key)
      })
      setKeys(imported)
      setStatus('success')
      setMsg(`${imported.length} claves importadas correctamente.`)
    } catch (e: any) {
      setStatus('error')
      setMsg(e.message || 'JSON inválido')
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '2rem 0' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.35rem' }}>
        Migrar datos desde sistema anterior
      </h2>
      <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.75rem' }}>
        Exportá tus datos desde{' '}
        <a
          href="https://transtide-freight-gestion.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#ea580c', textDecoration: 'underline' }}
        >
          transtide-freight-gestion.vercel.app
        </a>{' '}
        y pegá el JSON acá.
      </p>

      {/* Step 1 */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '1.25rem 1.5rem', marginBottom: '1rem' }}>
        <p style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.6rem', fontSize: '0.9rem' }}>
          <span style={{ background: '#0f172a', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, marginRight: '0.5rem' }}>1</span>
          Abrí la consola en el sistema viejo y ejecutá esto
        </p>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.85rem 1rem', fontFamily: 'monospace', fontSize: '0.78rem', color: '#0f172a', position: 'relative' }}>
          <CopyBlock text={`copy(JSON.stringify(Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>[localStorage.key(i),localStorage.getItem(localStorage.key(i))]))))`} />
        </div>
        <p style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '0.5rem' }}>
          Esto copia automáticamente el JSON a tu portapapeles.
        </p>
      </div>

      {/* Step 2 */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
        <p style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
          <span style={{ background: '#0f172a', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, marginRight: '0.5rem' }}>2</span>
          Pegá el JSON acá y presioná Importar
        </p>
        <textarea
          value={json}
          onChange={e => { setJson(e.target.value); setStatus('idle') }}
          placeholder='{"transtide-operaciones":"[...]","transtide-clientes":"[...]",...}'
          style={{
            width: '100%',
            minHeight: 140,
            fontFamily: 'monospace',
            fontSize: '0.78rem',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '0.75rem',
            color: '#0f172a',
            background: '#f8fafc',
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        <button
          onClick={handleImport}
          disabled={!json.trim()}
          style={{
            marginTop: '0.85rem',
            background: json.trim() ? '#ea580c' : '#cbd5e1',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '0.65rem 1.5rem',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: json.trim() ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s',
          }}
        >
          Importar datos
        </button>
      </div>

      {/* Result */}
      {status === 'success' && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1rem' }}>
          <p style={{ fontWeight: 700, color: '#15803d', marginBottom: '0.4rem' }}>✅ {msg}</p>
          <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#166534', fontSize: '0.82rem' }}>
            {keys.map(k => <li key={k}>{k}</li>)}
          </ul>
          <a
            href="/gestion/operaciones"
            style={{ display: 'inline-block', marginTop: '1rem', background: '#ea580c', color: '#fff', padding: '0.55rem 1.25rem', borderRadius: 8, fontWeight: 700, fontSize: '0.875rem', textDecoration: 'none' }}
          >
            Ir a Operaciones →
          </a>
        </div>
      )}

      {status === 'error' && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '1rem 1.25rem' }}>
          <p style={{ fontWeight: 700, color: '#dc2626', margin: 0 }}>❌ Error: {msg}</p>
        </div>
      )}
    </div>
  )
}

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <code style={{ wordBreak: 'break-all', display: 'block', paddingRight: '3.5rem' }}>{text}</code>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          background: copied ? '#dcfce7' : '#e2e8f0',
          border: 'none',
          borderRadius: 6,
          padding: '0.25rem 0.6rem',
          fontSize: '0.72rem',
          fontWeight: 700,
          cursor: 'pointer',
          color: copied ? '#15803d' : '#475569',
          fontFamily: 'inherit',
        }}
      >
        {copied ? 'Copiado!' : 'Copiar'}
      </button>
    </div>
  )
}
