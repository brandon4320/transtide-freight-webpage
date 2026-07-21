'use client'

// ─── Flujo macro de una importación (patrón Serviwhite, adaptado) ─────────────
// Inicio → Pago exterior → Embarque → Arribo → Aduana → Entrega → Cobranza → Cierre
// La posición NO se setea a mano: se DERIVA de los datos reales (estado de la
// operación + embarque en Tracking + despacho + cobranzas). El estado manual de
// la operación y los datos duros se combinan tomando el máximo avance.

export const FLOW_STEPS = [
  { key: 'inicio',   label: 'Inicio' },
  { key: 'giro',     label: 'Pago ext.' },   // opcional: giro de divisas (o paga el cliente)
  { key: 'embarque', label: 'Embarque' },
  { key: 'arribo',   label: 'Arribo' },
  { key: 'aduana',   label: 'Aduana' },
  { key: 'entrega',  label: 'Entrega' },
  { key: 'cobranza', label: 'Cobranza' },
  { key: 'cierre',   label: 'Cierre' },
]

// Rank del estado manual de la operación dentro del viaje físico.
const ESTADO_RANK = {
  'Consolidando': 0, 'En tránsito': 1, 'Arribado': 2, 'En aduana': 3,
  'Listo p/ retiro': 4, 'En tránsito local': 5, 'Entregado': 6, 'Liquidado': 7,
}

const pastDate = (iso) => {
  if (!iso) return false
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return false
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return d.getTime() <= today.getTime()
}

// Deriva el estado del flujo. Todos los argumentos son opcionales: con más
// datos, más precisión (la lista usa menos que el expediente).
//  op:        { estado }                        — operación
//  ship:      embarque de Tracking (por B/L)    — etd/eta/status
//  desp:      despacho de aduana (por B/L)      — estado
//  cobranza:  { cobrados, total }               — solo en el expediente
//  giro:      'aplica' | 'hecho' | 'no-aplica' | undefined
//  lockEntrega: bool — hay candado 🔒 exigir pago antes de entregar
export function importFlowState({ op, ship, desp, cobranza, giro, lockEntrega } = {}) {
  if (op?.estado === 'Cancelado') return { currentIndex: 0, cancelled: 'Operación cancelada', done: [], skipped: [] }
  const rank = ESTADO_RANK[op?.estado] ?? -1
  const st = ship?.status || ''

  const embarcado = rank >= 1 || /transit|deliver|paid|customs/i.test(st) || pastDate(ship?.etd)
  const arribado  = rank >= 2 || /deliver|paid|customs/i.test(st) || pastDate(ship?.eta)
  const aduanaOk  = rank >= 4 || desp?.estado === 'Terminada'
  const entregado = rank >= 6 || /deliver/i.test(st)
  const cobrado   = cobranza ? (cobranza.total > 0 && cobranza.cobrados >= cobranza.total) : rank >= 7
  const cerrado   = rank >= 7

  const giroDone = giro === 'hecho' || giro === 'no-aplica'
  const done = {
    inicio: true,
    giro: giroDone || embarcado,   // si ya embarcó, el pago exterior quedó atrás
    embarque: embarcado,
    arribo: arribado,
    aduana: aduanaOk,
    entrega: entregado,
    cobranza: cobrado,
    cierre: cerrado,
  }
  const skipped = giro === 'no-aplica' ? ['giro'] : []

  let currentIndex = FLOW_STEPS.length - 1
  for (let i = 0; i < FLOW_STEPS.length; i++) {
    if (!done[FLOW_STEPS[i].key]) { currentIndex = i; break }
  }
  const allDone = FLOW_STEPS.every(s => done[s.key])
  return { currentIndex, done, skipped, allDone, lockEntrega: !!lockEntrega, cobranza }
}

const C = { done: '#059669', current: '#0f172a', todo: '#cbd5e1', cancel: '#dc2626', lock: '#dc2626' }

function stepStatus(i, key, fs) {
  if (fs.cancelled) return i === 0 ? 'cancelled' : 'todo'
  if (fs.done?.[key]) return 'done'
  if (i === fs.currentIndex && !fs.allDone) return 'current'
  return 'todo'
}

// Timeline completa — para el expediente (detalle de la operación).
export function FlowTimeline({ state: fs }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 10, padding: '0.8rem 1.1rem 0.65rem', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      {fs.cancelled && <p style={{ fontSize: '0.7rem', fontWeight: 700, color: C.cancel, marginBottom: 6 }}>{fs.cancelled}</p>}
      <ol style={{ display: 'flex', alignItems: 'flex-start', listStyle: 'none', margin: 0, padding: 0 }}>
        {FLOW_STEPS.map((s, i) => {
          const st = stepStatus(i, s.key, fs)
          const skipped = fs.skipped?.includes(s.key)
          const lock = s.key === 'entrega' && fs.lockEntrega && st !== 'done'
          const isLast = i === FLOW_STEPS.length - 1
          const lineOn = (side) => (side === 'l' ? i > 0 && (fs.done?.[FLOW_STEPS[i - 1].key]) : !isLast && fs.done?.[s.key])
          let label = s.label
          if (s.key === 'cobranza' && fs.cobranza && fs.cobranza.total > 0 && !fs.done?.cobranza) label = `Cobranza ${fs.cobranza.cobrados}/${fs.cobranza.total}`
          return (
            <li key={s.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <span style={{ height: 2, flex: 1, background: i === 0 ? 'transparent' : (lineOn('l') ? C.done : '#e8ecf1') }} />
                <span title={skipped ? 'No aplica en esta importación' : lock ? 'Entrega bloqueada: exigir pago antes de entregar' : undefined}
                  style={{
                    width: 20, height: 20, borderRadius: '50%', flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.6rem', fontWeight: 800, color: '#fff',
                    background: st === 'done' ? C.done : st === 'current' ? C.current : st === 'cancelled' ? C.cancel : '#fff',
                    border: st === 'todo' ? `2px solid ${skipped ? '#eef2f7' : C.todo}` : 'none',
                    opacity: skipped ? 0.45 : 1,
                    boxShadow: st === 'current' ? '0 0 0 4px rgba(15,23,42,0.12)' : 'none',
                  }}>
                  {lock ? '🔒' : st === 'done' ? '✓' : st === 'cancelled' ? '✕' : ''}
                </span>
                <span style={{ height: 2, flex: 1, background: isLast ? 'transparent' : (lineOn('r') ? C.done : '#e8ecf1') }} />
              </div>
              <span style={{
                marginTop: 5, fontSize: '0.62rem', lineHeight: 1.15, textAlign: 'center', whiteSpace: 'nowrap',
                fontWeight: st === 'current' ? 800 : 600,
                color: st === 'current' ? '#0f172a' : st === 'done' ? '#475569' : '#94a3b8',
                opacity: skipped ? 0.5 : 1,
              }}>{label}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// Mini-pipeline de puntitos — para las filas de la lista de operaciones.
export function MiniFlow({ state: fs }) {
  if (fs.cancelled) return <span style={{ fontSize: '0.62rem', fontWeight: 700, color: C.cancel }}>Cancelada</span>
  return (
    <span title={`Etapa: ${FLOW_STEPS[fs.currentIndex]?.label || '—'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {FLOW_STEPS.map((s, i) => {
        const st = stepStatus(i, s.key, fs)
        const skipped = fs.skipped?.includes(s.key)
        return (
          <span key={s.key} style={{
            width: st === 'current' ? 8 : 6, height: st === 'current' ? 8 : 6, borderRadius: '50%', flex: '0 0 auto',
            background: st === 'done' ? C.done : st === 'current' ? C.current : C.todo,
            opacity: skipped ? 0.35 : 1,
          }} />
        )
      })}
      <span style={{ marginLeft: 5, fontSize: '0.6rem', fontWeight: 700, color: fs.allDone ? C.done : '#64748b', whiteSpace: 'nowrap' }}>
        {fs.allDone ? 'Completa ✓' : FLOW_STEPS[fs.currentIndex]?.label}
      </span>
    </span>
  )
}
