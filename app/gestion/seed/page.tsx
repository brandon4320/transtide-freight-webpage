'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const DATA: Record<string, unknown> = {
  'transtide-operaciones': [
    {
      id: 'op-1778001221397',
      nombre: 'FRANCO MODULOS 2 + VARIOS',
      contenedor: '40HQ',
      bl: 'APU184338',
      eta: '05/04/2026',
      m3: '60',
      proveedores: '',
      estado: 'Entregado',
      fecha: '01/03/2026',
    },
  ],

  'transtide-clientes': [
    { id: 'c1778072031183', nombre: 'Alex SACOA / LEGS CORP S A', cuit: '33708307209', email: 'Elsaroxarango@gmail.com', telefono: '', notas: '' },
    { id: 'c1778072054667', nombre: 'Franco Bianchini', cuit: '', email: '', telefono: '', notas: '' },
    { id: 'c1778077821261', nombre: 'Manuel Schonhoff ', cuit: '', email: '', telefono: '', notas: '' },
  ],

  'transtide-checklist-op-1778001221397': [
    'cg', 'ncm', 'afip', 'alta', 'bl', 'inv', 'legajo', 'fnav', 'lib', 'facts', 'flete', 'costs', 'devol', 'desp', 'drive',
  ],

  'transtide-checklist-franco-modulos': [],

  'transtide-opdetail-op-1778001221397': {
    puertoOrigen: '',
    naviera: [
      { id: 1778072315113.848,      desc: 'MAERKS',                    factura: '', usd: '',     tc: '',     pesos: '1169889' },
      { id: 1778073435010.7876,     desc: 'MAERKS',                    factura: '', usd: '',     tc: '',     pesos: '84246'   },
    ],
    terminal: [
      { id: 1778072315113.037,      desc: 'TERMINAL 4',                factura: '', usd: '',     tc: '',     pesos: '2278972' },
    ],
    aduana: [
      { id: 1778072315113.608,      desc: '',                           factura: '', usd: '',     tc: '',     pesos: '12500000' },
    ],
    transporte: [
      { id: 1778072315113.2808,     desc: 'LOGISTICA BUENOS AIRES BAHIA', factura: '', usd: '', tc: '',     pesos: '4235000' },
      { id: 1778073566241.4438,     desc: 'BAJADA DE HIDROGRUA ',      factura: '', usd: '',     tc: '',     pesos: '500000'  },
    ],
    despachante: [
      { id: 1778072315113.1477,     desc: 'HONORARIOS ',               factura: '', usd: '2000', tc: '1420', pesos: '' },
      { id: 1778073782907.3716,     desc: 'GASTOS EXTRAS',             factura: '', usd: '300',  tc: '1420', pesos: '' },
    ],
    admin: [
      { id: 1778072315113.3809,     desc: 'gastos administrativos',    factura: '', usd: '',     tc: '',     pesos: '300000'  },
    ],
    fleteIntl: [
      { id: 1778072315113.7334,     desc: 'Flete maritimo',            factura: '', usd: '3500', tc: '1420', pesos: '' },
    ],
    proveedores: [
      { id: 1778072315113.8271,   nombre: 'Gimnasio Marce',       tipo: 'Propio',   clienteId: '',               m3: '2.10', fobUSD: '1638',  gastosOrigenUSD: '', tributosUSD: '1163', tributosTC: '1420' },
      { id: 1778072656434.8625,   nombre: 'Rulemanes',            tipo: 'Cliente',  clienteId: '',               m3: '0.2',  fobUSD: '1768',  gastosOrigenUSD: '', tributosUSD: '824',  tributosTC: '1420' },
      { id: 1778072689344.1775,   nombre: 'Modulos',              tipo: 'Cliente',  clienteId: 'c1778072054667', m3: '35',   fobUSD: '6000',  gastosOrigenUSD: '', tributosUSD: '1359', tributosTC: '1420' },
      { id: 1778072763858.133,    nombre: 'portones montepietra', tipo: 'Cliente',  clienteId: '',               m3: '7',    fobUSD: '2740',  gastosOrigenUSD: '', tributosUSD: '1207', tributosTC: '1420' },
      { id: 1778072803342.0352,   nombre: 'caja de seguridad',   tipo: 'Cliente',  clienteId: 'c1778077821261', m3: '0.4',  fobUSD: '3021',  gastosOrigenUSD: '', tributosUSD: '1408', tributosTC: '1420' },
      { id: 1778072839174.3914,   nombre: 'motor cummins',       tipo: 'Propio',   clienteId: '',               m3: '1.57', fobUSD: '8200',  gastosOrigenUSD: '', tributosUSD: '1812', tributosTC: '1420' },
      { id: 1778073279878.3972,   nombre: 'kartings',            tipo: 'Cliente',  clienteId: '',               m3: '7',    fobUSD: '19220', gastosOrigenUSD: '', tributosUSD: '1190', tributosTC: '1420' },
      { id: 1778073345211.0547,   nombre: 'inverter',            tipo: 'Cliente',  clienteId: 'c1778072031183', m3: '0.2',  fobUSD: '1200',  gastosOrigenUSD: '', tributosUSD: '300',  tributosTC: '1420' },
    ],
    cobrar: [
      { tc: '1420', honorarios: false, despAdic: '',     cobrado: false,  fechaCobro: '' },  // Gimnasio Marce
      { tc: '1420', honorarios: false, despAdic: ''                                      },  // Rulemanes
      { tc: '1420', honorarios: false, despAdic: '800'                                   },  // Modulos
      { tc: '1420', honorarios: false, despAdic: '500',  cobrado: true,   fechaCobro: '19/5/2026' }, // portones montepietra
      { tc: '1420', honorarios: false, despAdic: '',     cobrado: false,  fechaCobro: '' },  // caja de seguridad
      { tc: '1420', honorarios: false, despAdic: ''                                      },  // motor cummins
      { tc: '1420', honorarios: false, despAdic: '4500'                                  },  // kartings
      { tc: '1420', honorarios: false, despAdic: ''                                      },  // inverter
    ],
  },
}

export default function SeedPage() {
  const router = useRouter()

  useEffect(() => {
    Object.entries(DATA).forEach(([key, value]) => {
      localStorage.setItem(key, JSON.stringify(value))
    })
    router.replace('/gestion/operaciones')
  }, [router])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #ea580c', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Importando datos…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
