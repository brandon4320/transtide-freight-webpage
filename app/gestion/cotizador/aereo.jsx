'use client';
// Cotizador aéreo — "Cotizador en tres pasos".
// Formulario a la izquierda (1 Mercadería · 2 Carga y gastos · 3 Cierre) y el
// resultado a la derecha (PanelResultado; en pantallas angostas va debajo y se
// suma la BarraMovil). Los números salen de calcularAereo (calculo-aereo.js) con
// el COBRO AUTOMÁTICO: lo que se le cobra al cliente por un gasto, si queda
// vacío, es tu costo más el recargo. El documento del cliente sale de
// htmlClienteAereo y el panel, de resultadoAereo.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { gToast } from '../toast';
import { n, qDiaMas, LEYENDA_AER } from './impresion';
import {
  KG_PER_M3, calcularAereo, htmlClienteAereo, migrarSnapshotAereo, efectivosAereo, resultadoAereo, conRecargo,
} from './calculo-aereo';
import { printHTML, SaveQuoteModal, applyNcm, ncmParaGuardar, useNcmList, avisarNcmCambiada, useBorrador, AvisoBorrador, sinModo } from './comun';
import {
  Paso, Campo, NumInput, TextInput, Segmentado, SiNo, LineaResumen, Revelar, Combobox,
  TablaGastos, FilaGasto, useSiguienteConEnter, useAtajos, fmtNum, fmtPct, fmtUSD,
} from './ui';
import { PanelResultado, BarraMovil } from './resultado';

const MODOS = [
  { id: 'cliente', label: 'Para cliente' },
  { id: 'personal', label: 'Importación personal' },
];
const SOCIEDADES = [
  { id: false, label: 'Sociedad de Transtide' },
  { id: true, label: 'Sociedad del cliente' },
];

// ¿El campo tiene algo cargado? ('0' cuenta: es un valor).
const hayValor = (v) => !(v === undefined || v === null || String(v).trim() === '');
// Kilos para leer: un decimal y miles agrupados ('417,5', '1.500').
const kilos = (v) => fmtNum(Math.round(v * 10) / 10, 'dinero');
const dias = (v) => `${fmtNum(v, 'decimal') || '0'} ${v === 1 ? 'día' : 'días'}`;
// ¿El foco está en una pestaña a la que se llegó con el teclado? (:focus-visible;
// un navegador que no lo entiende tira error: se toma como que no).
const pestanaConTeclado = (el) => {
  try { return !!el?.matches?.('[role="tab"]:focus-visible'); } catch { return false; }
};

// Una percepción: rótulo, porcentaje y si aplica (Sí/No). Con "No" el porcentaje
// no juega en ninguna punta y el campo queda apagado.
function FilaPercepcion({ label, valor, onValor, cobra, onCobra, paga, onPaga }) {
  const id = useId();
  const usada = cobra || paga;
  return (
    <div className="ct-percepcion">
      <label htmlFor={id} className="ct-linea-label">{label}</label>
      <NumInput id={id} tipo="pct" sufijo="%" value={valor} onChange={onValor} disabled={!usada} />
      <SiNo valor={cobra} onChange={onCobra} ariaLabel={`¿Le cobrás ${label} al cliente?`} />
      <SiNo valor={paga} onChange={onPaga} ariaLabel={`¿Pagás ${label}?`} />
    </div>
  );
}

// Encabezado de la tabla de percepciones: qué significa cada columna de Sí/No.
function EncabezadoPercepciones() {
  return (
    <div className="ct-percepcion ct-percepcion-cab" aria-hidden="true">
      <span />
      <span />
      <span>Se la cobrás</span>
      <span>La pagás vos</span>
    </div>
  );
}

// ─── vista previa de la cotización al cliente ────────────────────────────────
// Lo mismo que el documento que se imprime (mismos importes efectivos de `c`),
// para leer en pantalla. "Imprimir o guardar PDF" abre el documento real.
const VP = {
  fondo: { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  caja: { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto', overscrollBehavior: 'contain' },
  cab: { position: 'sticky', top: 0, zIndex: 1, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '16px 24px', borderBottom: '1px solid #f1f5f9', borderRadius: '12px 12px 0 0' },
  cuerpo: { padding: '20px 24px 24px' },
  seccion: { margin: '22px 0 4px', fontSize: 13, fontWeight: 600, color: '#111827' },
  fila: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13.5, lineHeight: 1.4, color: '#4b5563' },
  valor: { color: '#111827', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
};
const usd2 = (v) => fmtUSD(v, { dec: 2 });

function FilaVista({ label, valor, fuerte, sub }) {
  return (
    <div style={{ ...VP.fila, ...(fuerte ? { color: '#111827', fontWeight: 600 } : null), ...(sub ? { color: '#9ca3af' } : null) }}>
      <span>{label}</span>
      <span style={{ ...VP.valor, ...(sub ? { color: '#6b7280' } : null) }}>{usd2(valor)}</span>
    </div>
  );
}

function VistaCliente({ s, c, onImprimir, onCerrar }) {
  const idTitulo = useId();
  const cajaRef = useRef(null);
  const imprimirRef = useRef(null);
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;

  // Foco adentro al abrir, Escape cierra, Tab no se escapa del diálogo y al
  // cerrar el foco vuelve a donde estaba ("Ver cotización al cliente").
  useEffect(() => {
    const previo = document.activeElement;
    imprimirRef.current?.focus();
    const alTecla = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); cerrarRef.current(); return; }
      if (e.key !== 'Tab' || !cajaRef.current) return;
      const focos = Array.from(cajaRef.current.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
      if (!focos.length) return;
      const primero = focos[0];
      const ultimo = focos[focos.length - 1];
      if (e.shiftKey && (document.activeElement === primero || !cajaRef.current.contains(document.activeElement))) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && (document.activeElement === ultimo || !cajaRef.current.contains(document.activeElement))) { e.preventDefault(); primero.focus(); }
    };
    document.addEventListener('keydown', alTecla);
    return () => {
      document.removeEventListener('keydown', alTecla);
      if (previo && previo.isConnected && typeof previo.focus === 'function') previo.focus();
    };
  }, []);

  const propia = !!s.usaSociedadPropia;
  const hoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const gastos = [
    ['AWB', c.awbC], ['Handling', c.handC], ['Terminal aérea', c.terC], ['Despachante', c.desC], ['Transporte interno', c.traC],
  ].filter(([, v]) => v > 0);

  return (
    <div style={VP.fondo} onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={cajaRef} className="cz-modal" role="dialog" aria-modal="true" aria-labelledby={idTitulo} style={VP.caja}>
        <div style={VP.cab}>
          <div>
            <p style={{ margin: 0, fontSize: 12.5, color: '#9ca3af' }}>Vista previa</p>
            <h3 id={idTitulo} style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 600, color: '#111827' }}>Cotización aérea al cliente</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <button type="button" onClick={onCerrar} className="ct-btn-texto">Cerrar</button>
            <button type="button" ref={imprimirRef} onClick={onImprimir} className="ct-btn-primario" style={{ width: 'auto' }}>Imprimir o guardar PDF</button>
          </div>
        </div>

        <div style={VP.cuerpo}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111827' }}>Transtide Freight</p>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#9ca3af' }}>Gestión logística e importaciones</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: 12.5, color: '#9ca3af' }}>Fecha de cotización</p>
              <p style={{ margin: '2px 0 0', fontSize: 13.5, fontWeight: 500, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{hoy}</p>
            </div>
          </div>

          <div style={{ margin: '18px 0 0', paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111827' }}>
              Cotización de importación aérea{s.cliente ? <span style={{ fontWeight: 400, color: '#6b7280' }}>{` · ${s.cliente}`}</span> : null}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
              {`Peso cobrable ${kilos(c.chargeable)} kg (${fmtNum(n(s.m3Input), 'decimal') || '0'} m³ · ${kilos(n(s.pesoReal))} kg reales)`}
              {s.descripcion ? ` · ${s.descripcion}` : ''}
              {s.clasificacion ? ` · NCM ${s.clasificacion}` : ''}
            </p>
          </div>

          <p style={VP.seccion}>Base de la importación</p>
          <FilaVista label="Valor de la mercadería (FOB)" valor={c.fobC} />
          <FilaVista label={`Flete aéreo (${kilos(c.chargeable)} kg cobrables)`} valor={c.fleteC} />
          <FilaVista label="Seguro (1 % del FOB)" valor={c.segC} />
          {c.fobDC !== c.fobC ? <FilaVista label="FOB declarado (base de los aranceles)" valor={c.fobDC} sub /> : null}
          <FilaVista label="CIF, base de los aranceles" valor={c.cifC} fuerte />

          <p style={VP.seccion}>Aranceles aduaneros</p>
          <FilaVista label={`Derechos de importación (${fmtPct(s.pDer)})`} valor={c.derC} />
          {n(s.pTas) > 0 ? <FilaVista label={`Tasa estadística (${fmtPct(s.pTas)})`} valor={c.tasC} /> : null}
          <FilaVista label={`IVA (${fmtPct(s.pIva)})`} valor={c.ivaC} />
          {c.ivaAC > 0 ? <FilaVista label={`IVA adicional (${fmtPct(s.pIvaA)})`} valor={c.ivaAC} /> : null}
          {c.ganC > 0 ? <FilaVista label={`Percepción de Ganancias (${fmtPct(s.pGan)})`} valor={c.ganC} /> : null}
          {c.iibbC > 0 ? <FilaVista label={`Percepción de IIBB (${fmtPct(s.pIIBB)})`} valor={c.iibbC} /> : null}

          {gastos.length ? (
            <>
              <p style={VP.seccion}>Gastos locales</p>
              {gastos.map(([label, v]) => <FilaVista key={label} label={label} valor={v} />)}
            </>
          ) : null}

          <p style={VP.seccion}>Servicio de Transtide</p>
          <FilaVista label="Costo total (mercadería, flete, aranceles y gastos)" valor={c.totConC} fuerte />
          <FilaVista label={c.honMinAplica ? 'Honorarios (mínimo)' : `Honorarios (${fmtPct(s.pHon)})`} valor={c.honorarios} />
          {!propia ? <FilaVista label={`Gastos de facturación (${fmtPct(s.pFac)})`} valor={c.gastFac} /> : null}

          <div style={{ display: 'grid', gridTemplateColumns: propia ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 16, marginTop: 24 }}>
            <div>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 500, color: '#4b5563' }}>{propia ? 'Precio final' : 'Precio final con factura'}</p>
              <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>{usd2(c.precioConF)}</p>
            </div>
            {!propia ? (
              <div>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 500, color: '#4b5563' }}>Precio final sin factura</p>
                <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>{usd2(c.precioSinF)}</p>
              </div>
            ) : null}
          </div>

          <p style={{ margin: '24px 0 0', paddingTop: 12, borderTop: '1px solid #f1f5f9', fontSize: 12, lineHeight: 1.55, color: '#9ca3af' }}>{LEYENDA_AER}</p>
        </div>
      </div>
    </div>
  );
}

// ─── cotizador aéreo ─────────────────────────────────────────────────────────
function CotizadorAereo({ onDirty }) {
  // mercadería
  const [cliente, setCliente] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [clasificacion, setClasificacion] = useState('');
  // Plazos para las fechas del cronograma. Aéreo regular: 5-10 días de tránsito.
  const [diasProd, setDiasProd] = useState('15');
  const [diasTransito, setDiasTransito] = useState('7');

  // ── clientes y NCM guardados (sugerencias de los combobox) ──
  const [clientesList, setClientesList] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/db/clientes');
        if (!r.ok) throw new Error('failed');
        const data = await r.json();
        if (!cancelled) setClientesList(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setClientesList([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  // La biblioteca de NCM se recarga sola cuando algo la cambia (ver useNcmList).
  const ncmList = useNcmList();

  // carga: el agente nos pasa m³ y peso real, no diferenciamos por bulto
  const [m3Input,  setM3Input]  = useState('');
  const [pesoReal, setPesoReal] = useState('');

  // lo que se cobra (vacío = cobro automático: el costo con el recargo)
  const [fobCliente, setFobCliente] = useState('');
  const [fobDecCli, setFobDecCli] = useState('');
  const [fleteCliInput, setFleteCliInput] = useState('');
  const [awbCli, setAwbCli] = useState('');
  const [handCli, setHandCli] = useState('');
  const [terCli, setTerCli] = useState('');
  const [desCli, setDesCli] = useState('');
  const [traCli, setTraCli] = useState('');
  const [markup, setMarkup] = useState(''); // "Recargo sobre costos %"

  // lo que cuesta (fobReal vacío = el FOB cliente)
  const [fobReal, setFobReal] = useState('');
  const [fobDecReal, setFobDecReal] = useState('');
  const [fleteRealInput, setFleteRealInput] = useState('');
  const [awbReal, setAwbReal] = useState('');
  const [handReal, setHandReal] = useState('');
  const [terReal, setTerReal] = useState('');
  const [desReal, setDesReal] = useState('');
  const [traReal, setTraReal] = useState('');

  // aranceles y percepciones
  const [pDer, setPDer] = useState(35);
  const [pTas, setPTas] = useState(0);
  const [pIva, setPIva] = useState(21);    const [pagaIva, setPagaIva] = useState(true);
  const [pIvaA, setPIvaA] = useState(20);  const [pagaIvaA, setPagaIvaA] = useState(true);
  const [pGan, setPGan] = useState(6);     const [pagaGan, setPagaGan] = useState(true);
  const [pIIBB, setPIIBB] = useState(2.5); const [pagaIIBB, setPagaIIBB] = useState(true);
  // Las percepciones tienen dos puntas: qué le COBRÁS al cliente y qué PAGÁS vos.
  // IVA adicional, Ganancias e IIBB se suelen cobrar sin pagarlos (se recuperan):
  // esa diferencia es ganancia tuya y se ve en el panel.
  const [cobraIvaA, setCobraIvaA] = useState(true);
  const [cobraGan, setCobraGan] = useState(true);
  const [cobraIIBB, setCobraIIBB] = useState(true);

  // cierre
  const [pHon, setPHon] = useState(4);
  const [pHonMin, setPHonMin] = useState(500); // piso de honorarios en USD; vacío/0 = sin mínimo
  const [pFac, setPFac] = useState(8);
  const [pMrg, setPMrg] = useState(20);
  const [usaSociedadPropia, setUsaSociedadPropia] = useState(false);

  // pantalla
  const [mode, setMode] = useState('cliente'); // 'cliente' | 'personal'
  const [showClienteView, setShowClienteView] = useState(false);
  const [showSave, setShowSave] = useState(false);
  // Cotización cargada desde "guardadas" (para poder actualizarla en vez de duplicar).
  const [loadedQuote, setLoadedQuote] = useState(null);
  // "¿Te cuesta o declarás otro valor?": null = automático (abierto si hay algo cargado).
  const [fobAltManual, setFobAltManual] = useState(null);
  // La fecha de llegada se calcula recién en el navegador (evita diferencias con el servidor).
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);

  // Impo personal = SIEMPRE con sociedad Transtide (la pregunta de sociedad
  // del cliente solo existe cuando cotizás para un cliente).
  const switchMode = (m) => {
    setMode(m);
    setFobAltManual(null);
    if (m === 'personal') setUsaSociedadPropia(false);
  };

  // ── estado crudo, cálculo y serialize ──
  // `c` se calcula del estado crudo (sin `efectivos`); serialize() le suma los
  // efectivos de ese cálculo para el servidor (convertir a operación).
  const estadoCrudo = () => ({
    mode, // 'cliente' | 'personal'
    cliente, descripcion, clasificacion, m3Input, pesoReal,
    diasProd, diasTransito, // los usa el cronograma del documento del cliente
    fobCliente, fobDecCli, fleteCliInput, awbCli, handCli, terCli, desCli, traCli,
    fobReal, fobDecReal, fleteRealInput, awbReal, handReal, terReal, desReal, traReal,
    pDer, pTas, pIva, pagaIva, pIvaA, pagaIvaA, pGan, pagaGan, pIIBB, pagaIIBB,
    cobraIvaA, cobraGan, cobraIIBB,
    pHon, pHonMin, pFac, pMrg, usaSociedadPropia,
    // v3: cada percepción tiene su cobro y su pago por separado (antes, un solo
    // interruptor movía las dos puntas juntas).
    arancelToggles: 'v3',
    cobroAuto: 1, // cobro vacío = costo con recargo (ver calculo-aereo.js)
    markup,
  });
  const s = estadoCrudo();
  const c = calcularAereo(s);
  const snapshot = { ...s, efectivos: efectivosAereo(c) };
  const serialize = () => {
    const crudo = estadoCrudo();
    return { ...crudo, efectivos: efectivosAereo(calcularAereo(crudo)) };
  };

  // Aplica un snapshot (cotización guardada o borrador) sobre el formulario.
  // Lo de antes del cobro automático se migra: sus cobros vacíos valían 0 y así
  // siguen, para que el precio no cambie al abrirlo.
  const aplicarSnapshot = (d0) => {
    const d = migrarSnapshotAereo(d0 || {});
    if (d.mode === 'cliente' || d.mode === 'personal') setMode(d.mode);
    if (d.cliente !== undefined) setCliente(d.cliente);
    if (d.descripcion !== undefined) setDescripcion(d.descripcion);
    if (d.clasificacion !== undefined) setClasificacion(d.clasificacion);
    if (d.m3Input !== undefined) setM3Input(d.m3Input);
    if (d.pesoReal !== undefined) setPesoReal(d.pesoReal);
    if (d.diasProd !== undefined) setDiasProd(d.diasProd);
    if (d.diasTransito !== undefined) setDiasTransito(d.diasTransito);
    if (d.fobCliente !== undefined) setFobCliente(d.fobCliente);
    if (d.fobDecCli !== undefined) setFobDecCli(d.fobDecCli);
    if (d.fleteCliInput !== undefined) setFleteCliInput(d.fleteCliInput);
    if (d.awbCli !== undefined) setAwbCli(d.awbCli);
    if (d.handCli !== undefined) setHandCli(d.handCli);
    if (d.terCli !== undefined) setTerCli(d.terCli);
    if (d.desCli !== undefined) setDesCli(d.desCli);
    if (d.traCli !== undefined) setTraCli(d.traCli);
    if (d.fobReal !== undefined) setFobReal(d.fobReal);
    if (d.fobDecReal !== undefined) setFobDecReal(d.fobDecReal);
    if (d.fleteRealInput !== undefined) setFleteRealInput(d.fleteRealInput);
    if (d.awbReal !== undefined) setAwbReal(d.awbReal);
    if (d.handReal !== undefined) setHandReal(d.handReal);
    if (d.terReal !== undefined) setTerReal(d.terReal);
    if (d.desReal !== undefined) setDesReal(d.desReal);
    if (d.traReal !== undefined) setTraReal(d.traReal);
    if (d.pDer !== undefined) setPDer(d.pDer);
    if (d.pTas !== undefined) setPTas(d.pTas);
    if (d.pIva !== undefined) setPIva(d.pIva);
    if (d.pagaIva !== undefined) setPagaIva(d.pagaIva);
    if (d.pIvaA !== undefined) setPIvaA(d.pIvaA);
    // Percepciones al restaurar. Lo guardado puede venir de tres épocas:
    //  v3 → trae cobro y pago por separado, se usan tal cual.
    //  v2 → un solo interruptor movía las dos puntas: se cobraba lo que se pagaba.
    //  v1 (sin marca) → al cliente se le cobraba toda percepción con % > 0 y el
    //  interruptor decía solo si la pagabas vos. Restaurarlo así conserva el
    //  precio Y el margen con los que se hizo esa cotización.
    const v1 = d.arancelToggles !== 'v2' && d.arancelToggles !== 'v3';
    const restaurar = (pctGuardado, pagaGuardado, cobraGuardado, setPaga, setCobra) => {
      const paga = pagaGuardado === undefined ? true : !!pagaGuardado;
      if (pagaGuardado !== undefined) setPaga(paga);
      if (cobraGuardado !== undefined) setCobra(!!cobraGuardado);
      else if (pagaGuardado !== undefined || pctGuardado !== undefined) setCobra(v1 ? n(pctGuardado) > 0 : paga);
    };
    restaurar(d.pIvaA, d.pagaIvaA, d.cobraIvaA, setPagaIvaA, setCobraIvaA);
    if (d.pGan !== undefined) setPGan(d.pGan);
    restaurar(d.pGan, d.pagaGan, d.cobraGan, setPagaGan, setCobraGan);
    if (d.pIIBB !== undefined) setPIIBB(d.pIIBB);
    restaurar(d.pIIBB, d.pagaIIBB, d.cobraIIBB, setPagaIIBB, setCobraIIBB);
    if (d.pHon !== undefined) setPHon(d.pHon);
    // Cotizaciones guardadas ANTES del mínimo: sin pHonMin → '' (no cambia el número guardado).
    setPHonMin(d.pHonMin !== undefined ? d.pHonMin : '');
    if (d.pFac !== undefined) setPFac(d.pFac);
    if (d.pMrg !== undefined) setPMrg(d.pMrg);
    if (d.usaSociedadPropia !== undefined) setUsaSociedadPropia(d.usaSociedadPropia);
    // Sin recargo guardado (cotizaciones anteriores) no hay recargo.
    setMarkup(d.markup !== undefined && d.markup !== null ? d.markup : '');
    setFobAltManual(null);
  };

  const borrador = useBorrador({ modo: 'aereo', snapshot, aplicar: aplicarSnapshot, loadedQuote, setLoadedQuote, onDirty });
  const borradorRef = useRef(borrador); borradorRef.current = borrador;

  useEffect(() => {
    const handler = (e) => {
      if (!e.detail || e.detail.mode !== 'aereo') return;
      setLoadedQuote(e.detail.meta || null);
      borradorRef.current.cargarGuardada(e.detail.data || {});
    };
    window.addEventListener('cotizador:load', handler);
    return () => window.removeEventListener('cotizador:load', handler);
  }, []);

  // ── importación con IA (PDF o foto) ──
  // El FOB entra solo como FOB cliente: el que te cuesta, vacío, vale lo mismo.
  useEffect(() => {
    const handler = (e) => {
      if (!e.detail || e.detail.mode !== 'aereo') return;
      setLoadedQuote(e.detail.meta || null);
      const d = e.detail.data || {};
      if (d.proveedor) setCliente(d.proveedor);
      const desc = [
        d.notas,
        d.items && d.items.length
          ? `Ítems: ${d.items.slice(0, 5).map((it) => it.descripcion).filter(Boolean).join(', ')}${d.items.length > 5 ? '…' : ''}`
          : null,
      ].filter(Boolean).join(' — ');
      if (desc) setDescripcion(desc);
      if (d.total_m3 != null) setM3Input(String(d.total_m3));
      if (d.total_kg != null) setPesoReal(String(d.total_kg));
      if (d.total_fob != null) {
        setFobCliente(String(d.total_fob));
        setFobReal(''); // vacío = el FOB importado (antes se copiaba el mismo valor)
      }
    };
    window.addEventListener('cotizador:apply', handler);
    return () => window.removeEventListener('cotizador:apply', handler);
  }, []);

  const personal = mode === 'personal';
  const r = resultadoAereo(s, c);

  // ─── documento del cliente ─────────────────────────────────────────────────
  const printClienteQuote = () => {
    try {
      printHTML(htmlClienteAereo({ s: serialize(), c }));
    } catch (e) {
      console.error('print build failed', e);
      gToast.error('No se pudo armar el documento: ' + (e.message || e));
    }
  };
  const abrirGuardar = () => setShowSave(true);
  const abrirVista = () => { if (r.listo) setShowClienteView(true); };

  // ─── teclado y foco ────────────────────────────────────────────────────────
  // Enter pasa al siguiente campo; Cmd/Ctrl + S guarda; Cmd/Ctrl + Enter abre la
  // cotización al cliente (useAtajos aprieta el botón visible de este cotizador).
  const formRef = useRef(null);
  useSiguienteConEnter(formRef);
  const raizRef = useRef(null);
  const refAtajos = useAtajos({ onGuardar: abrirGuardar, onVerCliente: personal ? undefined : abrirVista });
  const refRaiz = useCallback((el) => { raizRef.current = el; refAtajos(el); }, [refAtajos]);

  // Con la pantalla vacía, el foco va al primer campo (Cliente) cuando el
  // cotizador aparece: al entrar a la página o al pasar a la pestaña Aéreo. En
  // pantallas táctiles no, para no abrir el teclado sin que lo pidan; tampoco si
  // se llegó con las flechas del teclado a la pestaña (la próxima flecha tiene
  // que seguir cambiando de pestaña).
  const vacioInicial = useRef(null);
  if (vacioInicial.current === null) vacioInicial.current = sinModo(snapshot);
  const formVacioRef = useRef(true);
  // Con un borrador sin decidir tampoco: la primera tecla lo hace desaparecer y
  // a los 800 ms el autoguardado lo pisa, sin que nadie haya elegido Descartar.
  formVacioRef.current = sinModo(snapshot) === vacioInicial.current && !borrador.aviso;
  useEffect(() => {
    const raiz = raizRef.current;
    if (!raiz || typeof IntersectionObserver === 'undefined') return undefined;
    const tactil = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;
    let visible = false;
    const io = new IntersectionObserver((entradas) => {
      const ahora = entradas.some((en) => en.isIntersecting);
      if (ahora && !visible && !tactil && formVacioRef.current) {
        const act = document.activeElement;
        const ocupado = act && act !== document.body && (act.matches?.('input, textarea, select, [contenteditable="true"]') || act.closest?.('[role="dialog"], .cz-modal') || pestanaConTeclado(act));
        if (!ocupado) formRef.current?.querySelector('input:not([disabled])')?.focus({ preventScroll: true });
      }
      visible = ahora;
    });
    io.observe(raiz);
    return () => io.disconnect();
  }, []);

  // ─── textos calculados ─────────────────────────────────────────────────────
  const opcionesClientes = clientesList
    .filter((cl) => cl && cl.nombre)
    .map((cl) => ({ id: cl.id, label: cl.nombre, sub: cl.cuit || '' }));
  const opcionesNcm = ncmList
    .filter((nc) => nc && nc.codigo)
    .map((nc) => ({ id: nc.id, label: nc.codigo, sub: nc.producto || '', ncm: nc }));
  const elegirNcm = (o) => applyNcm(o.ncm, { setClasificacion, setDescripcion, setPDer, setPTas, setPIva, setPIvaA, setPGan, setPIIBB });

  const resumenAranceles = `Derechos ${fmtPct(pDer)} · Tasa estadística ${fmtPct(pTas)} · IVA ${fmtPct(pIva)}`;
  const resumenHonorarios = [
    fmtPct(pHon),
    n(pHonMin) > 0 ? `mínimo ${fmtUSD(n(pHonMin))}` : 'sin mínimo',
    usaSociedadPropia ? null : `facturación ${fmtPct(pFac)}`,
  ].filter(Boolean).join(' · ');
  // Resumen de una percepción: el porcentaje y, cuando las dos puntas no
  // coinciden, de qué lado juega ("solo al cliente" es la que te deja ganancia).
  const percepcion = (label, v, cobra, paga) => {
    if (!cobra && !paga) return `${label} no aplica`;
    const detalle = cobra && paga ? '' : (cobra ? ' solo al cliente' : ' solo tu costo');
    return `${label} ${fmtPct(v)}${detalle}`;
  };
  const resumenPercepciones = [
    percepcion('IVA adicional', pIvaA, cobraIvaA, pagaIvaA),
    percepcion('Ganancias', pGan, cobraGan, pagaGan),
    percepcion('IIBB', pIIBB, cobraIIBB, pagaIIBB),
  ].join(' · ');
  const dProd = Math.max(0, n(diasProd));
  const dTran = Math.max(0, n(diasTransito));
  const llega = montado
    ? qDiaMas(dProd + dTran).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '')
    : null;
  const resumenPlazos = `producción ${dias(dProd)} · tránsito ${dias(dTran)}${llega ? ` · llega el ${llega}` : ''}`;

  // FOB alternativos: abiertos si alguno tiene algo cargado (o si los abrís vos).
  const hayFobAlt = personal
    ? hayValor(fobDecReal) || hayValor(fobDecCli)
    : hayValor(fobReal) || hayValor(fobDecCli) || hayValor(fobDecReal);
  const fobAltAbierto = fobAltManual ?? hayFobAlt;

  // Peso cobrable: volumétrico contra real.
  const pesoRealN = n(pesoReal);
  const porQue = c.usaVolumetrico
    ? (pesoRealN > 0 ? 'Se cobra por volumen: el volumétrico supera al peso real.' : 'Se cobra por volumen.')
    : (c.pesoVol > 0 && pesoRealN > c.pesoVol ? 'Se cobra por peso real: supera al volumétrico.'
      : c.pesoVol > 0 ? 'Se cobra por peso real: es igual al volumétrico.' : 'Se cobra por peso real.');

  // Gastos: en el aéreo "Tu costo" se carga a mano (lo pasa el agente).
  const hayRecargo = n(markup) !== 0;
  const gastos = [
    { id: 'flete', concepto: 'Flete aéreo', costo: fleteRealInput, onCosto: setFleteRealInput, valor: fleteCliInput, onChange: setFleteCliInput },
    { id: 'awb', concepto: 'AWB', costo: awbReal, onCosto: setAwbReal, valor: awbCli, onChange: setAwbCli },
    { id: 'hand', concepto: 'Handling', costo: handReal, onCosto: setHandReal, valor: handCli, onChange: setHandCli },
    { id: 'ter', concepto: 'Terminal aérea', costo: terReal, onCosto: setTerReal, valor: terCli, onChange: setTerCli },
    { id: 'des', concepto: 'Despachante', costo: desReal, onCosto: setDesReal, valor: desCli, onChange: setDesCli },
    { id: 'tra', concepto: 'Transporte interno', costo: traReal, onCosto: setTraReal, valor: traCli, onChange: setTraCli },
  ];

  // Avisos en ámbar del panel. Recién cuando hay un precio que mirar: con la
  // pantalla vacía no tiene sentido avisar de algo que todavía no se cargó.
  const notas = [];
  if (r.listo && !String(clasificacion || '').trim()) {
    const arancelesDeSiempre = n(pDer) === 35 && n(pTas) === 0 && n(pIva) === 21;
    notas.push(arancelesDeSiempre
      ? 'Sin NCM: se usan los aranceles por defecto.'
      : 'Sin NCM: revisá que los aranceles sean los de esta mercadería.');
  }
  if (r.listo && !((personal ? c.fleteR : c.fleteC) > 0)) notas.push('Sin flete aéreo: el precio todavía no lo incluye.');
  const nota = notas.length ? notas.join(' ') : null;

  const precioLabel = personal ? 'Precio de venta' : 'Precio al cliente';
  const subPrecio = personal
    ? `con IVA ${fmtPct(pIva)} · margen ${fmtPct(pMrg)} sobre el costo sin IVA`
    : usaSociedadPropia ? 'sociedad del cliente · sin gastos de facturación' : 'con factura · sociedad de Transtide';
  const precioAlt = personal
    ? { label: 'Sin IVA', valor: c.ventaNeta }
    : r.precioSinFactura !== null ? { label: 'Sin factura', valor: r.precioSinFactura } : null;

  return (
    <div ref={refRaiz}>
      <div style={{ padding: '20px 0 24px' }}>
        <Segmentado chico ariaLabel="Tipo de cotización" opciones={MODOS} valor={mode} onChange={switchMode} />
      </div>

      <AvisoBorrador b={borrador} />

      <div className="ct-grid">
        <div className="ct-form" ref={formRef}>

          {/* ── 1. Mercadería ─────────────────────────────────────────────── */}
          <Paso n={1} titulo="Mercadería">
            {personal ? (
              <Campo label="Referencia">
                <TextInput value={cliente} onChange={setCliente} placeholder="Referencia de la importación" />
              </Campo>
            ) : (
              <Campo label="Cliente">
                <Combobox
                  value={cliente}
                  onChange={setCliente}
                  opciones={opcionesClientes}
                  placeholder="Nombre o razón social"
                />
              </Campo>
            )}
            <Campo label="Descripción">
              <TextInput value={descripcion} onChange={setDescripcion} placeholder="Ej.: componentes electrónicos" />
            </Campo>
            <Campo label="NCM" ayuda={ncmList.length ? 'Buscá una guardada por código o descripción, o escribí la posición.' : 'Escribí la posición arancelaria.'}>
              <Combobox
                mono
                value={clasificacion}
                onChange={setClasificacion}
                opciones={opcionesNcm}
                onElegir={elegirNcm}
                placeholder="8456.11.00"
                vacio="No hay una NCM guardada así: queda la posición que escribiste."
              />
            </Campo>
            <LineaResumen label="Aranceles" resumen={resumenAranceles}>
              <div className="ct-fila-3">
                <Campo label="Derechos"><NumInput tipo="pct" sufijo="%" value={pDer} onChange={setPDer} /></Campo>
                <Campo label="Tasa estadística"><NumInput tipo="pct" sufijo="%" value={pTas} onChange={setPTas} /></Campo>
                <Campo label="IVA"><NumInput tipo="pct" sufijo="%" value={pIva} onChange={setPIva} /></Campo>
              </div>
            </LineaResumen>

            {personal ? (
              <Campo label="FOB de la mercadería" ayuda="Lo que pagás por la mercadería.">
                <NumInput grande prefijo="USD" value={fobReal} onChange={setFobReal} placeholder={c.fobC > 0 ? fmtNum(c.fobC) : ''} />
              </Campo>
            ) : (
              <Campo label="FOB de la mercadería" ayuda="Lo que paga el cliente por la mercadería.">
                <NumInput grande prefijo="USD" value={fobCliente} onChange={setFobCliente} />
              </Campo>
            )}
            {personal ? (
              <Revelar label="¿Declarás otro valor?" abierto={fobAltAbierto} onToggle={(v) => setFobAltManual(v)}>
                <div className="ct-fila">
                  <Campo label="FOB declarado" ayuda="Base de los aranceles. Vacío: el FOB de la mercadería.">
                    <NumInput prefijo="USD" value={fobDecReal} onChange={setFobDecReal} placeholder={c.fobDR > 0 ? fmtNum(c.fobDR) : ''} />
                  </Campo>
                </div>
              </Revelar>
            ) : (
              <Revelar label="¿Te cuesta o declarás otro valor?" abierto={fobAltAbierto} onToggle={(v) => setFobAltManual(v)}>
                <div className="ct-fila-3">
                  <Campo label="FOB que te cuesta">
                    <NumInput prefijo="USD" value={fobReal} onChange={setFobReal} placeholder={c.fobC > 0 ? fmtNum(c.fobC) : ''} />
                  </Campo>
                  <Campo label="FOB declarado al cliente">
                    <NumInput prefijo="USD" value={fobDecCli} onChange={setFobDecCli} placeholder={c.fobC > 0 ? fmtNum(c.fobC) : ''} />
                  </Campo>
                  <Campo label="FOB declarado real">
                    <NumInput prefijo="USD" value={fobDecReal} onChange={setFobDecReal} placeholder={c.fobDR > 0 ? fmtNum(c.fobDR) : ''} />
                  </Campo>
                </div>
                <p className="ct-ayuda">Vacíos valen el FOB de la mercadería. Los declarados son la base de los aranceles: el del cliente para la cotización y el real para tu costo.</p>
              </Revelar>
            )}
          </Paso>

          {/* ── 2. Carga y gastos ─────────────────────────────────────────── */}
          <Paso n={2} titulo="Carga y gastos" ayuda="Los costos te los pasa el agente de carga.">
            <div className="ct-fila">
              <Campo label="Metros cúbicos" ayuda={`1 m³ = ${KG_PER_M3} kg volumétricos`}>
                <NumInput tipo="decimal" sufijo="m³" value={m3Input} onChange={setM3Input} />
              </Campo>
              <Campo label="Peso real" ayuda="Peso bruto de la carga">
                <NumInput tipo="peso" sufijo="kg" value={pesoReal} onChange={setPesoReal} />
              </Campo>
            </div>
            {c.chargeable > 0 ? (
              <p className="ct-calculado">
                Peso volumétrico{' '}
                {c.pesoVol > 0 ? <strong>{kilos(c.pesoVol)} kg</strong> : <span className="ct-vacio">—</span>}
                {' · '}cobrable <strong>{kilos(c.chargeable)} kg</strong>
                <br />
                {porQue}
              </p>
            ) : (
              <p className="ct-calculado" style={{ color: '#9ca3af' }}>Con los metros cúbicos o el peso se calcula el peso cobrable.</p>
            )}

            <TablaGastos
              ocultarCobro={personal}
              intro={personal ? null : (
                <>
                  <div style={{ maxWidth: 220 }}>
                    <Campo label="Recargo sobre costos" ayuda="Se suma en las filas sin cobro.">
                      <NumInput tipo="pct" sufijo="%" value={markup} onChange={setMarkup} placeholder="0" />
                    </Campo>
                  </div>
                  <p style={{ margin: 0 }}>
                    {hayRecargo
                      ? `Si no escribís nada, cobrás tu costo más el ${fmtPct(markup)} de recargo.`
                      : 'Si no escribís nada, cobrás tu costo.'}
                  </p>
                </>
              )}
              pie={personal ? null : <p style={{ margin: 0 }}>Enter baja al costo siguiente; con Tab llegás a “Cobrás”.</p>}
            >
              {gastos.map((g) => (
                <FilaGasto
                  key={g.id}
                  concepto={g.concepto}
                  costo={g.costo}
                  onCosto={g.onCosto}
                  valor={g.valor}
                  onChange={g.onChange}
                  sugerido={hayRecargo ? conRecargo(n(g.costo), markup) : undefined}
                  ocultarCobro={personal}
                  // Los seis costos del agente se cargan de corrido: el Enter no
                  // para en "Cobrás", que casi siempre queda vacío.
                  cobroFueraDelEnter
                />
              ))}
            </TablaGastos>
          </Paso>

          {/* ── 3. Cierre ─────────────────────────────────────────────────── */}
          <Paso n={3} titulo="Cierre">
            {personal ? (
              <div style={{ maxWidth: 220 }}>
                <Campo label="Margen de ganancia" ayuda="Sobre el costo sin IVA; el IVA se suma al vender.">
                  <NumInput tipo="pct" sufijo="%" value={pMrg} onChange={setPMrg} />
                </Campo>
              </div>
            ) : (
              <>
                <Campo
                  label="Sociedad"
                  ayuda={usaSociedadPropia ? 'Sin gastos de facturación: los aranceles los paga el cliente.' : 'Se suman los gastos de facturación.'}
                >
                  <Segmentado opciones={SOCIEDADES} valor={!!usaSociedadPropia} onChange={(v) => setUsaSociedadPropia(!!v)} />
                </Campo>
                <LineaResumen label="Honorarios" resumen={resumenHonorarios}>
                  <div className="ct-fila-3">
                    <Campo label="Honorarios" ayuda="Sobre el costo con IVA.">
                      <NumInput tipo="pct" sufijo="%" value={pHon} onChange={setPHon} />
                    </Campo>
                    <Campo
                      label="Mínimo"
                      ayuda={c.honMinAplica ? `Aplica: el ${fmtPct(pHon)} da ${fmtUSD(c.totConC * (n(pHon) / 100))}.` : null}
                    >
                      <NumInput prefijo="USD" value={pHonMin} onChange={setPHonMin} placeholder="Sin mínimo" />
                    </Campo>
                    {usaSociedadPropia ? null : (
                      <Campo label="Facturación" ayuda="Con la sociedad de Transtide.">
                        <NumInput tipo="pct" sufijo="%" value={pFac} onChange={setPFac} />
                      </Campo>
                    )}
                  </div>
                </LineaResumen>
              </>
            )}
            <LineaResumen label="Percepciones" resumen={resumenPercepciones}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <EncabezadoPercepciones />
                <FilaPercepcion label="IVA adicional" valor={pIvaA} onValor={setPIvaA} cobra={!!cobraIvaA} onCobra={setCobraIvaA} paga={!!pagaIvaA} onPaga={setPagaIvaA} />
                <FilaPercepcion label="Ganancias" valor={pGan} onValor={setPGan} cobra={!!cobraGan} onCobra={setCobraGan} paga={!!pagaGan} onPaga={setPagaGan} />
                <FilaPercepcion label="IIBB" valor={pIIBB} onValor={setPIIBB} cobra={!!cobraIIBB} onCobra={setCobraIIBB} paga={!!pagaIIBB} onPaga={setPagaIIBB} />
                <p className="ct-ayuda" style={{ margin: 0 }}>IVA adicional, Ganancias e IIBB se recuperan: si se las cobrás al cliente y no las pagás, quedan de ganancia.</p>
              </div>
            </LineaResumen>
            {personal ? null : (
              <LineaResumen label="Plazos" resumen={resumenPlazos}>
                <div className="ct-fila">
                  <Campo label="Días de producción">
                    <NumInput tipo="decimal" sufijo="días" value={diasProd} onChange={setDiasProd} />
                  </Campo>
                  <Campo label="Días de tránsito" ayuda="Aéreo regular: de 5 a 10 días.">
                    <NumInput tipo="decimal" sufijo="días" value={diasTransito} onChange={setDiasTransito} />
                  </Campo>
                </div>
                <p className="ct-ayuda">Arman las fechas del cronograma de pagos que ve el cliente.</p>
              </LineaResumen>
            )}
          </Paso>
        </div>

        <PanelResultado
          listo={r.listo}
          falta={r.falta}
          nota={nota}
          titulo={precioLabel}
          precio={r.precio}
          subPrecio={subPrecio}
          precioAlt={precioAlt}
          ganancia={r.ganancia}
          gananciaPct={r.gananciaPct}
          gananciaLabel={personal ? 'Ganancia neta' : 'Tu ganancia'}
          gananciaPctLabel={personal ? 'sobre el costo' : 'del precio'}
          costo={r.costo}
          costoLabel={personal ? 'Costo real sin IVA' : 'Tu costo'}
          desglose={r.desglose}
          rentabilidad={r.rentabilidad}
          costosPorConcepto={r.costosPorConcepto}
          ivaCredito={r.ivaCredito}
          onVerCliente={personal ? undefined : abrirVista}
          onGuardar={abrirGuardar}
        />
      </div>

      <BarraMovil
        label={precioLabel}
        precio={r.listo ? r.precio : null}
        listo={r.listo}
        onVerCliente={personal ? undefined : abrirVista}
      />

      {showClienteView && !personal ? (
        <VistaCliente s={s} c={c} onImprimir={printClienteQuote} onCerrar={() => setShowClienteView(false)} />
      ) : null}

      {showSave && (
        <SaveQuoteModal
          modo="aereo"
          defaultCliente={cliente}
          getPayload={() => ({
            // El mismo número que muestra el panel: en Importación personal es
            // el precio de venta, no el precio al cliente (que ahí no existe).
            total_usd: String(Math.round(r.precio)),
            // Línea de la lista de guardadas, en es-AR: "FOB USD 12.000 · 418 kg · USD 20.345 final".
            resumen: `FOB ${fmtUSD(personal ? c.fobR : c.fobC)} · ${fmtNum(Math.round(c.chargeable), 'dinero') || '0'} kg · ${fmtUSD(r.precio)} final`,
            data: serialize(),
          })}
          ncmPayload={() => ncmParaGuardar({
            codigo: clasificacion, descripcion, ncmList,
            der: pDer, tasa: pTas, iva: pIva, ivaAdic: pIvaA, ganancias: pGan, iibb: pIIBB,
          })}
          loadedQuote={loadedQuote}
          onSaved={(meta) => { setLoadedQuote(meta); borrador.marcarGuardado(); avisarNcmCambiada(); }}
          onClose={() => setShowSave(false)}
        />
      )}
    </div>
  );
}

export { CotizadorAereo };
export default CotizadorAereo;
