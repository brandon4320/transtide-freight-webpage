'use client';
// Cotizador marítimo (pantalla): estado, formulario y resultados. Los números salen
// de calcularMaritimo (calculo-maritimo.js) y el documento del cliente de
// htmlClienteMaritimo.
import { useState, useEffect, useRef } from 'react';
import { gToast } from '../toast';
import { n } from './impresion';
import { PRESETS, PRESET_M3, PRESET_COSTS, calcularMaritimo, htmlClienteMaritimo } from './calculo-maritimo';
import {
  usd, printHTML, SaveQuoteModal, SaveQuoteButton, applyNcm, NcmPicker, LBL, INP, SECL,
  TBTN, PBTN, F, NI, TI, CostStack, SummaryChip, Pill, Card, RRow, useBorrador,
  AvisoBorrador,
} from './comun';

// ─── maritime component (existing logic) ──────────────────────────────────────
function CotizadorMaritimo({ onDirty }) {

  // mode & tab
  const [mode, setMode] = useState('cliente');   // 'cliente' | 'personal'
  const [tab, setTab] = useState('cliente_fob'); // varies per mode

  // ── container config ──
  const [contType, setContType] = useState('40hq');
  const [contM3, setContM3] = useState(() => ({ ...PRESET_M3 }));
  const [contCosts, setContCosts] = useState(() => ({ ...PRESET_COSTS }));

  const setCost = (type, field, val) =>
    setContCosts(prev => ({ ...prev, [type]: { ...prev[type], [field]: val } }));
  const setM3 = (type, val) =>
    setContM3(prev => ({ ...prev, [type]: val }));

  const curM3 = contM3[contType];
  const curCosts = contCosts[contType];

  // ── identification ──
  const [cliente, setCliente] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [clasificacion, setClasificacion] = useState('');
  // Plazos para las fechas del cronograma que ve el cliente. Un solo criterio para
  // todas: 15 días de producción y 50 de tránsito (el marítimo desde China va de 45
  // a 60). Si en una operación es distinto, se ajusta acá y las fechas se recalculan.
  const [diasProd, setDiasProd] = useState('15');
  const [diasTransito, setDiasTransito] = useState('50');

  // ── clientes (autocomplete) ──
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

  // ── NCM library (picker + autocomplete) ──
  const [ncmList, setNcmList] = useState([]);
  useEffect(() => {
    fetch('/api/db/ncm').then(r => r.ok ? r.json() : []).then(d => setNcmList(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // ── LADO CLIENTE ──
  const [fobCliente, setFobCliente] = useState('');       // lo que cobro por la mercadería
  const [fobDecCli, setFobDecCli] = useState('');         // lo que le digo que voy a declarar
  const [fleteCli, setFleteCli] = useState('');           // flete cobrado
  const [gDes, setGDes] = useState('');                   // gastos locales cobrados
  const [gTer, setGTer] = useState('');
  const [gNav, setGNav] = useState('');
  const [gLog, setGLog] = useState('');
  const [markup, setMarkup] = useState('');               // markup % opcional para derivar lo que cobrás

  // ── LADO REAL ──
  const [fobReal, setFobReal] = useState('');             // lo que me costó a mí
  const [fobDecReal, setFobDecReal] = useState('');       // lo que realmente declaro
  const [fleteRealInput, setFleteRealInput] = useState(''); // si está vacío, se calcula del prorrateo
  const [m3Merch, setM3Merch] = useState('');             // m³ de mi mercadería en el contenedor

  // ── ARANCELES ──
  const [pDer, setPDer] = useState(35);
  const [pTas, setPTas] = useState(0);
  const [pIva, setPIva] = useState(21);    const [pagaIva, setPagaIva] = useState(true);
  const [pIvaA, setPIvaA] = useState(20);  const [pagaIvaA, setPagaIvaA] = useState(true);
  const [pGan, setPGan] = useState(6);     const [pagaGan, setPagaGan] = useState(true);
  const [pIIBB, setPIIBB] = useState(2.5); const [pagaIIBB, setPagaIIBB] = useState(true);

  // ── CIERRE ──
  const [pHon, setPHon] = useState(4);
  const [pHonMin, setPHonMin] = useState(500); // piso de honorarios en USD; vacío/0 = sin mínimo
  const [pFac, setPFac] = useState(8);
  const [pMrg, setPMrg] = useState(20); // solo modo personal

  // ── SOCIEDAD ──
  const [usaSociedadPropia, setUsaSociedadPropia] = useState(false); // true = cliente usa su propia sociedad

  // ── UI ──
  const [showClienteView, setShowClienteView] = useState(false);
  const [showSave, setShowSave] = useState(false);
  // Cotización cargada desde "guardadas" (para poder actualizarla en vez de duplicar).
  const [loadedQuote, setLoadedQuote] = useState(null);

  // ── serialize / restore (saved quotes) ──
  const serialize = () => ({
    mode, // 'cliente' | 'personal' — para reactivar con el formato elegido
    contType, contM3, contCosts, cliente, descripcion, clasificacion,
    diasProd, diasTransito,
    fobCliente, fobDecCli, fleteCli, gDes, gTer, gNav, gLog,
    fobReal, fobDecReal, fleteRealInput, m3Merch,
    pDer, pTas, pIva, pagaIva, pIvaA, pagaIvaA, pGan, pagaGan, pIIBB, pagaIIBB,
    pHon, pHonMin, pFac, pMrg, usaSociedadPropia,
    arancelToggles: 'v2', // v2: percepciones con toggle afectan cobro Y costo real
  });

  // Aplica un snapshot (cotización guardada o borrador) sobre el formulario.
  const aplicarSnapshot = (d) => {
    if (d.mode === 'cliente' || d.mode === 'personal') {
      setMode(d.mode);
      setTab(d.mode === 'cliente' ? 'cliente_fob' : 'real_fob');
    }
    if (d.contType !== undefined) setContType(d.contType);
    if (d.diasProd !== undefined) setDiasProd(d.diasProd);
    if (d.diasTransito !== undefined) setDiasTransito(d.diasTransito);
    // Cotización guardada antes de que existiera un tipo: completa los que falten.
    if (d.contM3 !== undefined) setContM3({ ...PRESET_M3, ...d.contM3 });
    if (d.contCosts !== undefined) setContCosts({ ...PRESET_COSTS, ...d.contCosts });
    if (d.cliente !== undefined) setCliente(d.cliente);
    if (d.descripcion !== undefined) setDescripcion(d.descripcion);
    if (d.clasificacion !== undefined) setClasificacion(d.clasificacion);
    if (d.fobCliente !== undefined) setFobCliente(d.fobCliente);
    if (d.fobDecCli !== undefined) setFobDecCli(d.fobDecCli);
    if (d.fleteCli !== undefined) setFleteCli(d.fleteCli);
    if (d.gDes !== undefined) setGDes(d.gDes);
    if (d.gTer !== undefined) setGTer(d.gTer);
    if (d.gNav !== undefined) setGNav(d.gNav);
    if (d.gLog !== undefined) setGLog(d.gLog);
    if (d.fobReal !== undefined) setFobReal(d.fobReal);
    if (d.fobDecReal !== undefined) setFobDecReal(d.fobDecReal);
    if (d.fleteRealInput !== undefined) setFleteRealInput(d.fleteRealInput);
    if (d.m3Merch !== undefined) setM3Merch(d.m3Merch);
    if (d.pDer !== undefined) setPDer(d.pDer);
    if (d.pTas !== undefined) setPTas(d.pTas);
    if (d.pIva !== undefined) setPIva(d.pIva);
    if (d.pagaIva !== undefined) setPagaIva(d.pagaIva);
    if (d.pIvaA !== undefined) setPIvaA(d.pIvaA);
    // Migración pre-v2: el cliente pagaba toda percepción con % > 0 (el toggle
    // solo tocaba el costo real) — restaurar "aplica" preserva el precio guardado.
    if (d.pagaIvaA !== undefined) setPagaIvaA(d.arancelToggles === 'v2' ? d.pagaIvaA : (d.pagaIvaA || n(d.pIvaA) > 0));
    if (d.pGan !== undefined) setPGan(d.pGan);
    if (d.pagaGan !== undefined) setPagaGan(d.arancelToggles === 'v2' ? d.pagaGan : (d.pagaGan || n(d.pGan) > 0));
    if (d.pIIBB !== undefined) setPIIBB(d.pIIBB);
    if (d.pagaIIBB !== undefined) setPagaIIBB(d.arancelToggles === 'v2' ? d.pagaIIBB : (d.pagaIIBB || n(d.pIIBB) > 0));
    if (d.pHon !== undefined) setPHon(d.pHon);
    // Cotizaciones guardadas ANTES del mínimo: sin pHonMin → '' (no cambia el número guardado).
    setPHonMin(d.pHonMin !== undefined ? d.pHonMin : '');
    if (d.pFac !== undefined) setPFac(d.pFac);
    if (d.pMrg !== undefined) setPMrg(d.pMrg);
    if (d.usaSociedadPropia !== undefined) setUsaSociedadPropia(d.usaSociedadPropia);
  };

  const borrador = useBorrador({ modo: 'maritimo', snapshot: serialize(), aplicar: aplicarSnapshot, loadedQuote, setLoadedQuote, onDirty });
  const borradorRef = useRef(borrador); borradorRef.current = borrador;

  useEffect(() => {
    const handler = (e) => {
      if (!e.detail || e.detail.mode !== 'maritimo') return;
      setLoadedQuote(e.detail.meta || null);
      borradorRef.current.cargarGuardada(e.detail.data || {});
    };
    window.addEventListener('cotizador:load', handler);
    return () => window.removeEventListener('cotizador:load', handler);
  }, []);

  // ── AI import event listener ──
  useEffect(() => {
    const handler = (e) => {
      if (!e.detail || e.detail.mode !== 'maritimo') return;
      setLoadedQuote(e.detail.meta || null);
      const d = e.detail.data || {};
      if (d.proveedor) setCliente(d.proveedor);
      const desc = [
        d.notas,
        d.items && d.items.length
          ? `Items: ${d.items.slice(0, 5).map((it) => it.descripcion).filter(Boolean).join(', ')}${d.items.length > 5 ? '…' : ''}`
          : null,
      ].filter(Boolean).join(' — ');
      if (desc) setDescripcion(desc);
      if (d.total_m3 != null) setM3Merch(String(d.total_m3));
      if (d.total_fob != null) {
        setFobCliente(String(d.total_fob));
        setFobReal(String(d.total_fob));
      }
    };
    window.addEventListener('cotizador:apply', handler);
    return () => window.removeEventListener('cotizador:apply', handler);
  }, []);

  // ─── calculations ─────────────────────────────────────────────────────────
  const c = calcularMaritimo(serialize());

  // ─── tabs per mode ────────────────────────────────────────────────────────
  const tabs = mode === 'cliente'
    ? [['cliente_fob','Cotización cliente'],['real_fob','Mis costos reales'],['aranceles','Aranceles'],['cierre','Cierre']]
    : [['real_fob','Mis costos'],['aranceles','Aranceles'],['venta','Precio de venta']];

  // reset tab when switching mode
  // Impo personal = SIEMPRE con sociedad Transtide.
  const switchMode = (m) => { setMode(m); setTab(m === 'cliente' ? 'cliente_fob' : 'real_fob'); if (m === 'personal') setUsaSociedadPropia(false); };

  // ─── print client quote ───────────────────────────────────────────────────
  const printClienteQuote = () => {
    try {
      const html = htmlClienteMaritimo({ s: serialize(), c });
      printHTML(html);
    } catch (e) {
      console.error('print build failed', e);
      gToast.error('No se pudo armar el documento: ' + (e.message || e));
    }
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={{ paddingBottom: '3rem' }}>
      <AvisoBorrador b={borrador} />

      {/* ══ HEADER (modo + acciones, una sola fila) ═══════════════════════════ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'inline-flex', gap: '1.4rem' }}>
          <Pill active={mode === 'cliente'} onClick={() => switchMode('cliente')}>Para Cliente</Pill>
          <Pill active={mode === 'personal'} onClick={() => switchMode('personal')}>Importación Personal</Pill>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem' }}>
          <SaveQuoteButton onClick={() => setShowSave(true)} />
          {mode === 'cliente' && (
            <button onClick={() => setShowClienteView(true)} style={{ ...PBTN, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Ver cotización al cliente
            </button>
          )}
        </div>
      </div>

      {/* ══ RESUMEN PEGAJOSO — línea de métricas, sin cajas ═══════════════════ */}
      <div style={{ position: 'sticky', top: 0, zIndex: 30, marginBottom: '0.5rem', background: '#fff', borderBottom: '1px solid #f1f5f9', padding: '0.55rem 0 0.65rem', display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
        {mode === 'personal' ? (<>
          <SummaryChip label="Costo real (sin IVA)" val={usd(c.totSinR)} />
          <SummaryChip label={`Ganancia neta (${pMrg}%)`} val={usd(c.gananciaNeta)} color="#059669" />
          <SummaryChip label="Precio venta final" val={usd(c.precioVentaFinal)} />
        </>) : (<>
          <SummaryChip label="Costo real" val={usd(c.totConR)} />
          <SummaryChip label="A cobrar al cliente" val={usd(c.totConC)} />
          <SummaryChip label="Margen / ganancia" val={usd(c.ganTotal)} color={c.ganTotal >= 0 ? '#059669' : '#dc2626'} />
        </>)}
      </div>

      {/* ══ MAIN GRID — 2 columnas: datos (izq) · números (der, fijo) ═══════════ */}
      <div className="cot-main-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 400px', gap: '1.1rem', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 }}>

      {/* fila superior: Contenedor (izq, angosto) + Identificación (der) */}
      <div className="cot-top-row" style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '0.75rem', alignItems: 'start' }}>

      {/* ── Contenedor + Mi carga (primera sección de datos) ── */}
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>

          {/* controles: contenedor + m³ mercadería + ratio en una sola fila */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.25rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px', minWidth: 220 }}>
              <label style={LBL}>Contenedor</label>
              <div style={{ display: 'flex', gap: '1.25rem', paddingBottom: 2 }}>
                {Object.entries(PRESETS).map(([key, p]) => {
                  const on = contType === key;
                  return (
                    <button key={key} onClick={() => setContType(key)} style={{ padding: '0.3rem 0 4px', border: 'none', borderBottom: on ? '2px solid #111827' : '2px solid transparent', cursor: 'pointer', fontSize: '0.76rem', fontWeight: on ? 600 : 400, background: 'transparent', color: on ? '#111827' : '#9ca3af' }}>
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label style={LBL}>M³ de mi mercadería</label>
              <input type="number" inputMode="decimal" step="any" min="0" placeholder="0" value={m3Merch} onChange={e => setM3Merch(e.target.value)} onWheel={e => e.currentTarget.blur()} style={{ ...INP, width: '120px' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: '0.45rem' }}>
              <span style={{ fontSize: '0.62rem', color: '#9ca3af' }}>Ratio de prorrateo</span>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: c.ratio > 0 ? '#111827' : '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{c.ratio.toFixed(3)}</span>
              <span style={{ fontSize: '0.62rem', color: '#d1d5db' }}>({n(m3Merch)}/{c.curM3} m³)</span>
            </div>
          </div>

          {/* ajustar contenedor: m³ contenedor + costos de referencia (colapsado) */}
          <details className="cot-collapse">
            <summary style={{ ...SECL, margin: '0 0 0.3rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="cot-chev" style={{ fontSize: '0.7rem', color: '#9ca3af' }}>▸</span> Ajustar contenedor y costos de referencia</span>
              <span style={{ fontSize: '0.6rem', color: '#9ca3af', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{PRESETS[contType]?.label} · {contM3[contType]}m³</span>
            </summary>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.85rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
              <div>
                <label style={{ ...LBL, fontSize: '0.6rem' }}>M³ del contenedor</label>
                <input type="number" inputMode="decimal" step="any" min="1" value={contM3[contType]} onChange={e => setM3(contType, e.target.value)} onWheel={e => e.currentTarget.blur()} style={{ ...INP, width: '100px' }} />
              </div>
              {[['Flete','flete'],['Despachante','despachante'],['Terminal','terminal'],['Naviera','naviera'],['Logística','logistica']].map(([label, key]) => (
                <div key={key}>
                  <label style={{ ...LBL, fontSize: '0.6rem' }}>{label}</label>
                  <input type="number" inputMode="decimal" step="any" min="0" value={contCosts[contType][key]} onChange={e => setCost(contType, key, e.target.value)} onWheel={e => e.currentTarget.blur()} style={{ ...INP, width: '100px' }} />
                </div>
              ))}
            </div>
          </details>

          {/* charges — filas planas. La columna "lo que cobrás" solo aplica para cliente */}
          <div>
              <div className="cot-charges-header" style={{ display: 'grid', gridTemplateColumns: mode === 'cliente' ? '1fr 1fr 1.4fr' : '1fr 1.2fr', padding: '0 0 0.3rem', borderBottom: '1px solid #f1f5f9', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>Concepto</span>
                <span className="cot-charges-prorated" style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', textAlign: 'right' }}>Tu costo prorrateado</span>
                {mode === 'cliente' && <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', textAlign: 'right' }}>Lo que cobrás al cliente</span>}
              </div>
              {[
                ['Flete', c.fleteR, fleteCli, setFleteCli],
                ['Despachante', c.desR, gDes, setGDes],
                ['Terminal', c.terR, gTer, setGTer],
                ['Naviera', c.navR, gNav, setGNav],
                ['Logística', c.logR, gLog, setGLog],
              ].map(([label, prorated, val, setVal], i, arr) => (
                <div key={label} className="cot-charges-row" style={{ display: 'grid', gridTemplateColumns: mode === 'cliente' ? '1fr 1fr 1.4fr' : '1fr 1.2fr', alignItems: 'center', padding: '0.35rem 0', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{label}</span>
                  <span className="cot-charges-prorated" style={{ fontSize: '0.78rem', color: c.ratio > 0 ? '#111827' : '#d1d5db', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(prorated)}</span>
                  {mode === 'cliente' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginLeft: 'auto', width: '120px', borderBottom: '1px solid #e5e7eb', padding: '0.15rem 0' }}>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>$</span>
                      <input type="number" inputMode="decimal" step="any" min="0" placeholder="0" value={val} onChange={e => setVal(e.target.value)} onWheel={e => e.currentTarget.blur()} style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', textAlign: 'right', fontSize: '0.78rem', color: '#111827', fontVariantNumeric: 'tabular-nums', padding: 0 }} />
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      </Card>

          {/* identification */}
          <Card>
            <p style={{ ...SECL, margin: '0 0 0.6rem' }}>Identificación del embarque</p>
            {/* NCM primero: elegir una guardada autocompleta posición + las 6 alícuotas de un saque */}
            {ncmList.length > 0 && (
              <F label="NCM guardada (autocompleta posición y aranceles)">
                <NcmPicker ncmList={ncmList} onPick={(nc) => applyNcm(nc, { setClasificacion, setDescripcion, setPDer, setPTas, setPIva, setPIvaA, setPGan, setPIIBB })} />
              </F>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
              <F label={mode === 'cliente' ? 'Cliente' : 'Cliente / Referencia'}>
                <input type="text" list="clientes-list-mar" value={cliente} onChange={e => setCliente(e.target.value)} placeholder={mode === 'cliente' ? 'Nombre del cliente' : 'Referencia de la importación'} style={INP} />
                <datalist id="clientes-list-mar">
                  {clientesList.map(cl => <option key={cl.id} value={cl.nombre} />)}
                </datalist>
              </F>
              <F label="Posición arancelaria">
                <input type="text" list="ncm-codes-mar" value={clasificacion} onChange={e => setClasificacion(e.target.value)} placeholder="8456.11.00" style={{ ...INP, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
                <datalist id="ncm-codes-mar">
                  {ncmList.map(nc => <option key={nc.id} value={nc.codigo}>{nc.producto}</option>)}
                </datalist>
              </F>
            </div>
            <F label="Descripción de la mercadería"><TI value={descripcion} onChange={setDescripcion} placeholder="Ej: Máquinas cortadoras láser 1000W" /></F>
            {/* Alimentan las fechas estimadas del cronograma que ve el cliente. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.6rem' }}>
              <F label="Días de producción"><input type="number" inputMode="numeric" min="0" value={diasProd} onChange={e => setDiasProd(e.target.value)} onWheel={e => e.currentTarget.blur()} style={INP} /></F>
              <F label="Días de tránsito"><input type="number" inputMode="numeric" min="0" value={diasTransito} onChange={e => setDiasTransito(e.target.value)} onWheel={e => e.currentTarget.blur()} style={INP} /></F>
            </div>

            {/* FOB — la distinción real vs cliente va solo en el color del texto */}
            <div style={{ marginTop: '0.9rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: mode === 'cliente' ? '1fr 1fr' : '1fr', gap: '0.9rem' }}>
                <div>
                  <label style={{ ...LBL, color: '#059669', fontWeight: 600 }}>FOB real (lo que pagás)</label>
                  <NI value={fobReal} onChange={setFobReal} />
                </div>
                {mode === 'cliente' && (
                  <div>
                    <label style={{ ...LBL, color: '#d97706', fontWeight: 600 }}>FOB cliente (lo que cobrás)</label>
                    <NI value={fobCliente} onChange={setFobCliente} />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem 1.1rem', flexWrap: 'wrap', marginTop: '0.7rem' }}>
                <details className="cot-collapse">
                  <summary style={{ ...SECL, margin: 0, padding: 0, color: '#059669', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <span className="cot-chev" style={{ fontSize: '0.7rem' }}>▸</span> FOB declarado real (si difiere)
                  </summary>
                  <div style={{ marginTop: '0.35rem' }}><NI value={fobDecReal} onChange={setFobDecReal} placeholder="= FOB real si no difiere" /></div>
                </details>
                {mode === 'cliente' && (
                  <details className="cot-collapse">
                    <summary style={{ ...SECL, margin: 0, padding: 0, color: '#d97706', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <span className="cot-chev" style={{ fontSize: '0.7rem' }}>▸</span> FOB declarado cliente (si difiere)
                    </summary>
                    <div style={{ marginTop: '0.35rem' }}><NI value={fobDecCli} onChange={setFobDecCli} placeholder="= FOB cliente si no difiere" /></div>
                  </details>
                )}
                <details className="cot-collapse">
                  <summary style={{ ...SECL, margin: 0, padding: 0, color: '#059669', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <span className="cot-chev" style={{ fontSize: '0.7rem' }}>▸</span> Flete real (si difiere del prorrateo)
                  </summary>
                  <div style={{ marginTop: '0.35rem' }}><NI value={fleteRealInput} onChange={setFleteRealInput} placeholder={`auto: ${usd(curCosts.flete * c.ratio)}`} /></div>
                </details>
              </div>
            </div>
          </Card>
      </div>

          {/* secciones de entrada: aranceles (izq) · honorarios/cierre (der) */}
          <Card className="cot-sections-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem 2.5rem', alignItems: 'start' }}>

            {/* ── Aranceles ── */}
            {(
              <div>
                <p style={{ ...SECL, margin: '0 0 0.9rem' }}>Configuración arancelaria</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.9rem', marginBottom: '1rem' }}>
                  <F label="Derechos de Importación %">
                    <input type="number" inputMode="decimal" step="any" min="0" value={pDer} onChange={e => setPDer(e.target.value)} style={INP} />
                  </F>
                  <F label="Tasa Estadística %">
                    <input type="number" inputMode="decimal" step="any" min="0" value={pTas} onChange={e => setPTas(e.target.value)} style={INP} />
                  </F>
                  <F label="IVA %">
                    <input type="number" inputMode="decimal" step="any" min="0" value={pIva} onChange={e => setPIva(e.target.value)} style={INP} />
                  </F>
                </div>

                <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '0.65rem' }}>Percepciones — ¿aplican en esta importación? Con SÍ se cobran en la cotización y cuentan en el costo real; con NO, en ninguno.</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1.5rem' }}>
                  {[
                    ['IVA Adicional %', pIvaA, setPIvaA, pagaIvaA, setPagaIvaA],
                    ['Perc. Ganancias %', pGan, setPGan, pagaGan, setPagaGan],
                    ['Perc. IIBB %', pIIBB, setPIIBB, pagaIIBB, setPagaIIBB],
                  ].map(([lbl, val, setVal, paga, setPaga]) => (
                    <div key={lbl} style={{ minWidth: 0 }}>
                      <label style={{ ...LBL, marginBottom: '0.12rem' }}>{lbl}</label>
                      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #e5e7eb', maxWidth: '100%' }}>
                        <input type="number" inputMode="decimal" step="any" min="0" value={val} onChange={e => setVal(e.target.value)} onWheel={e => e.currentTarget.blur()} style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', padding: '0.35rem 0.05rem', fontSize: '0.84rem', color: paga ? '#111827' : '#d1d5db', fontVariantNumeric: 'tabular-nums' }} />
                        <button onClick={() => setPaga(!paga)} title="¿Aplica en esta importación? Afecta la cotización al cliente y tu costo real" style={{ border: 'none', background: 'transparent', padding: '0 0.1rem 0 0.6rem', cursor: 'pointer', fontSize: '0.66rem', fontWeight: 700, color: paga ? '#059669' : '#dc2626' }}>
                        {paga ? 'SÍ' : 'NO'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Honorarios & cierre ── */}
            {mode === 'cliente' && (
              <div>
                <p style={{ ...SECL, margin: '0 0 0.9rem' }}>Honorarios &amp; cierre</p>

                {/* ── Toggle: Sociedad ── */}
                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: '0.45rem' }}>¿Qué sociedad usa el cliente para importar?</p>
                  <div style={{ display: 'flex', gap: '1.4rem' }}>
                    <button onClick={() => setUsaSociedadPropia(true)} style={{ padding: '0 0 4px', border: 'none', borderBottom: usaSociedadPropia ? '2px solid #111827' : '2px solid transparent', cursor: 'pointer', fontSize: '0.78rem', fontWeight: usaSociedadPropia ? 600 : 400, background: 'transparent', color: usaSociedadPropia ? '#111827' : '#9ca3af' }}>
                      Sociedad del cliente
                    </button>
                    <button onClick={() => setUsaSociedadPropia(false)} style={{ padding: '0 0 4px', border: 'none', borderBottom: !usaSociedadPropia ? '2px solid #111827' : '2px solid transparent', cursor: 'pointer', fontSize: '0.78rem', fontWeight: !usaSociedadPropia ? 600 : 400, background: 'transparent', color: !usaSociedadPropia ? '#111827' : '#9ca3af' }}>
                      Sociedad de Transtide
                    </button>
                  </div>
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '0.35rem' }}>
                    {usaSociedadPropia ? 'Sin gastos de facturación.' : 'Se suman gastos de facturación.'}
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem' }}>
                  <F label={`Honorarios % (s/ costo CON IVA)`}>
                    <input type="number" inputMode="decimal" step="any" min="0" value={pHon} onChange={e => setPHon(e.target.value)} style={INP} />
                  </F>
                  <F label={`Honorarios mínimos (USD)`}>
                    <input type="number" inputMode="decimal" step="any" min="0" value={pHonMin} onChange={e => setPHonMin(e.target.value)} style={INP} placeholder="Sin mínimo" />
                  </F>
                </div>
                {c.honMinAplica && (
                  <p style={{ fontSize: '0.78rem', color: '#6b7280', borderLeft: '2px solid #d97706', paddingLeft: 12, marginTop: '0.45rem' }}>
                    Aplica el mínimo: {pHon}% = <span style={{ color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{usd(c.totConC * (n(pHon) / 100))}</span> &lt; <span style={{ color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{usd(n(pHonMin))}</span>
                  </p>
                )}

                {!usaSociedadPropia && (
                  <F label={`Gastos de Facturación % — sociedad Transtide`}>
                    <input type="number" inputMode="decimal" step="any" min="0" value={pFac} onChange={e => setPFac(e.target.value)} style={INP} />
                  </F>
                )}

                <div style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.38rem 0', borderBottom: '1px solid #f1f5f9', color: '#6b7280' }}>
                    <span>Costo Total CON IVA</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(c.totConC)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.38rem 0', borderBottom: '1px solid #f1f5f9', color: '#6b7280' }}>
                    <span>+ Honorarios ({c.honMinAplica ? 'mín. USD' : `${pHon}%`})</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(c.honorarios)}</span>
                  </div>
                  {!usaSociedadPropia && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.38rem 0', borderBottom: '1px solid #f1f5f9', color: '#6b7280' }}>
                      <span>+ Gastos de Facturación ({pFac}%)</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(c.gastFac)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.55rem 0', fontWeight: 700, color: '#111827' }}>
                    <span>= Precio final</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(c.precioConF)}</span>
                  </div>
                  {usaSociedadPropia && (
                    <p style={{ fontSize: '0.68rem', color: '#059669', marginTop: '0.25rem' }}>
                      Sin gastos de facturación — sociedad del cliente
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Precio de venta (personal) ── */}
            {mode === 'personal' && (
              <div>
                <p style={{ ...SECL, margin: '0 0 0.9rem' }}>Precio de venta estimado</p>
                <F label="Margen de ganancia deseado %">
                  <input type="number" inputMode="decimal" step="any" min="0" value={pMrg} onChange={e => setPMrg(e.target.value)} style={INP} />
                </F>
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '0 0 0.6rem' }}>El IVA del import es crédito fiscal recuperable: el margen se calcula sobre el costo sin IVA, y el IVA se suma recién al vender.</p>
                <div style={{ marginTop: '0.4rem' }}>
                  {[
                    ['Costo real (sin IVA)', c.totSinR, false, false],
                    [`+ Margen (${pMrg}%) — ganancia neta`, c.gananciaNeta, false, 'profit'],
                    ['= Precio de venta neto', c.ventaNeta, true, false],
                    [`+ IVA (${pIva}%) sobre la venta`, c.ivaVentaMonto, false, false],
                    ['= Precio de venta final (con IVA)', c.precioVentaFinal, 'final', false],
                  ].map(([lbl, val, emph, kind], i, arr) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: emph === 'final' ? '0.92rem' : '0.8rem', padding: '0.4rem 0', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none', fontWeight: emph ? 700 : 400, color: emph === 'final' ? '#059669' : kind === 'profit' ? '#059669' : emph ? '#111827' : '#6b7280' }}>
                      <span>{lbl}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </Card>
        </div>

        {/* ── resultado: columna de números fija a la derecha ──────────────── */}
        <div className="cot-right-rail" style={{ position: 'sticky', top: '1rem', maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* ══ MODO CLIENTE ════════════════════════════════════════════════ */}
          {mode === 'cliente' && (<>

            <Card>
              <p style={{ ...SECL, margin: '0 0 0.2rem' }}>Precio final al cliente</p>
              <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: '0.8rem' }}>
                {usaSociedadPropia ? 'Sociedad del cliente — sin gastos de facturación' : 'Sociedad Transtide — incluye gastos de facturación'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: usaSociedadPropia ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>
                <div>
                  <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#059669', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.precioConF)}</p>
                  <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginTop: '0.2rem' }}>
                    {usaSociedadPropia ? 'Precio final' : 'Con factura'}
                  </p>
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '0.15rem', fontVariantNumeric: 'tabular-nums' }}>
                    Hon. {usd(c.honorarios)}{!usaSociedadPropia ? ` + Fac. ${usd(c.gastFac)}` : ''}
                  </p>
                </div>
                {!usaSociedadPropia && (
                  <div>
                    <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#d97706', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.precioSinF)}</p>
                    <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginTop: '0.2rem' }}>Sin factura</p>
                    <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '0.15rem', fontVariantNumeric: 'tabular-nums' }}>Ahorro del cliente: {usd(c.gastFac)}</p>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '2.5rem', marginTop: '0.9rem', paddingTop: '0.7rem', borderTop: '1px solid #f1f5f9' }}>
                <div>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{usd(c.totConC)}</p>
                  <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>Costo total con IVA</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{usd(c.totSinC)}</p>
                  <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>Costo total sin IVA</p>
                </div>
              </div>
              <div style={{ marginTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>FOB dec. cliente · CIF aranceles</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{usd(c.fobDC)} · {usd(c.cifC)}</span>
              </div>
            </Card>

            {/* Cascada: de qué se compone TU costo real (para comparar contra lo que cobrás) */}
            <Card>
              <p style={{ ...SECL, margin: '0 0 0.6rem' }}>¿De qué se compone tu costo?</p>
              <CostStack
                segments={[
                  { label: 'FOB (mercadería)', value: c.fobR, color: '#378ADD' },
                  { label: 'Flete + seguro', value: c.fleteR + c.segR, color: '#1D9E75' },
                  { label: 'Aranceles', value: c.derR + c.tasR + c.ganR + c.iibbR, color: '#BA7517' },
                  { label: 'Gastos locales', value: c.desR + c.terR + c.navR + c.logR, color: '#7F77DD' },
                ]}
                total={c.totSinR}
                totalLabel="Tu costo real (sin IVA)"
              />
            </Card>

            <Card>
              <details className="cot-collapse">
                <summary style={{ ...SECL, margin: '0 0 0.3rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, cursor: 'pointer' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="cot-chev" style={{ fontSize: '0.7rem', color: '#9ca3af' }}>▸</span> Rentabilidad por concepto</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: c.ganTotal >= 0 ? '#059669' : '#dc2626', textTransform: 'none', letterSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>{usd(c.ganTotal)}</span>
                </summary>
                <div style={{ marginTop: '0.4rem' }}>
                  {[
                    ['Margen FOB', c.mFOB],
                    ['Margen Flete', c.mFlet],
                    [usaSociedadPropia ? 'Margen Aranceles — los paga el cliente (su sociedad)' : 'Margen Aranceles', c.mArancEff],
                    ['Margen Gastos Locales', c.mGas],
                    ['Honorarios', c.honorarios],
                  ].map(([lbl, val]) => {
                    const pctFob = c.fobR > 0 ? ((val / c.fobR) * 100).toFixed(1) + '%' : '';
                    const barW = c.ganTotal > 0 ? Math.max(0, Math.min(100, (val / c.ganTotal) * 100)) : 0;
                    return (
                      <div key={lbl} style={{ marginBottom: '0.55rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.18rem' }}>
                          <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{lbl}</span>
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: val >= 0 ? '#059669' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                            {usd(val)} {pctFob && <span style={{ fontSize: '0.66rem', color: '#9ca3af', fontWeight: 400 }}>({pctFob})</span>}
                          </span>
                        </div>
                        {barW > 0 && barW < 100 && (
                          <div style={{ height: '3px', background: '#f1f5f9' }}>
                            <div style={{ height: '100%', width: `${barW}%`, background: val >= 0 ? '#059669' : '#dc2626', transition: 'width 0.3s' }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '0.75rem', paddingTop: '0.7rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#111827' }}>Ganancia total</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.15rem', fontWeight: 700, color: c.ganTotal >= 0 ? '#059669' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{usd(c.ganTotal)}</div>
                      {c.fobR > 0 && <div style={{ fontSize: '0.66rem', color: '#9ca3af' }}>{((c.ganTotal / c.fobR) * 100).toFixed(1)}% s/ FOB real</div>}
                    </div>
                  </div>
                </div>
              </details>
            </Card>

            <Card>
              <details className="cot-collapse">
                <summary style={{ ...SECL, margin: '0 0 0.3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="cot-chev" style={{ fontSize: '0.7rem', color: '#9ca3af' }}>▸</span> Detalle real vs cobrado</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: c.ganTotal >= 0 ? '#059669' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{usd(c.ganTotal)}</span>
                </summary>
                <div style={{ marginTop: '0.4rem' }}>
              <div className="cot-detalle-header" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: '0.35rem', paddingBottom: '0.3rem', borderBottom: '1px solid #f1f5f9' }}>
                <span>Concepto</span><span style={{ textAlign: 'right' }}>Costo real</span><span style={{ textAlign: 'right' }}>Cobro</span><span className="cot-detalle-margen" style={{ textAlign: 'right' }}>Margen</span>
              </div>
              {[
                ['FOB Mercadería', c.fobR, c.fobC, c.mFOB],
                ['FOB Declarado', c.fobDR, c.fobDC, null],
                ['Flete', c.fleteR, n(fleteCli), c.mFlet],
                ['Seguro', c.segR, c.segC, c.segC - c.segR],
                ['Derechos', c.derR, c.derC, c.mDer],
                ['Tasa Estadística', c.tasR, c.tasC, c.mTas],
                ['IVA', c.ivaR, c.ivaC, c.mIva],
                ['IVA Adicional', c.ivaAR, c.ivaAC, c.mIvaA],
                ['Perc. Ganancias', c.ganR, c.ganC, c.mGan],
                ['Perc. IIBB', c.iibbR, c.iibbC, c.mIIBB],
                ['Despachante', c.desR, c.desC, c.desC - c.desR],
                ['Terminal', c.terR, c.terC, c.terC - c.terR],
                ['Naviera', c.navR, c.navC, c.navC - c.navR],
                ['Logística', c.logR, c.logC, c.logC - c.logR],
              ].map(([lbl, real, cobro, diff]) => (
                <div key={lbl} className="cot-detalle-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '0.3rem 0', borderBottom: '1px solid #f1f5f9', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{lbl}</span>
                  <span style={{ fontSize: '0.78rem', color: '#6b7280', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(real)}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#111827', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(cobro)}</span>
                  <span className="cot-detalle-margen" style={{ fontSize: '0.74rem', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: diff === null ? '#d1d5db' : diff > 0 ? '#059669' : diff < 0 ? '#dc2626' : '#9ca3af' }}>
                    {diff === null ? '—' : (diff > 0 ? '+' : '') + (usd(diff))}
                  </span>
                </div>
              ))}
              <div className="cot-detalle-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '0.5rem 0', borderTop: '1px solid #f1f5f9', marginTop: '0.4rem', fontWeight: 700, fontSize: '0.84rem', fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: '#111827' }}>TOTAL</span>
                <span style={{ textAlign: 'right', color: '#6b7280' }}>{usd(c.totConR)}</span>
                <span style={{ textAlign: 'right', color: '#111827' }}>{usd(c.totConC)}</span>
                <span className="cot-detalle-margen" style={{ textAlign: 'right', color: c.ganTotal >= 0 ? '#059669' : '#dc2626' }}>{c.ganTotal >= 0 ? '+' : ''}{usd(c.ganTotal)}</span>
              </div>
                </div>
              </details>
            </Card>

          </>)}

          {/* ══ MODO PERSONAL ═══════════════════════════════════════════════ */}
          {mode === 'personal' && (<>

            <Card>
              <p style={{ ...SECL, margin: '0 0 0.7rem' }}>Costo real de importación (sin IVA)</p>
              <p style={{ fontSize: '1.7rem', fontWeight: 700, color: '#111827', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.totSinR)}</p>
              <p style={{ fontSize: '0.76rem', color: '#9ca3af', marginTop: '0.3rem' }}>Con IVA pagás {usd(c.totConR)} · el IVA es crédito fiscal recuperable</p>
              {c.ventaNeta > 0 && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>Ganancia neta ({pMrg}%)</span>
                    <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>{usd(c.gananciaNeta)}</span>
                  </div>
                  <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: '0.15rem' }}>
                    Precio de venta neto (sin IVA)
                  </p>
                  <p style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.ventaNeta)}</p>
                  <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', margin: '0.6rem 0 0.15rem' }}>
                    Precio de venta final (con IVA {pIva}%)
                  </p>
                  <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#059669', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.precioVentaFinal)}</p>
                  <p style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: '0.2rem' }}>incluye {usd(c.ivaVentaMonto)} de IVA</p>
                </div>
              )}
              <div style={{ marginTop: '0.75rem', paddingTop: '0.55rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>FOB declarado · CIF declarado</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{usd(c.fobDR)} · {usd(c.cifR)}</span>
              </div>
              <p style={{ marginTop: '0.55rem', fontSize: '0.7rem', color: '#9ca3af' }}>Importación personal — siempre con sociedad Transtide</p>
            </Card>

            {/* Cascada: de qué se compone el costo real (sin IVA) */}
            <Card>
              <p style={{ ...SECL, margin: '0 0 0.6rem' }}>¿De qué se compone tu costo?</p>
              <CostStack
                segments={[
                  { label: 'FOB (mercadería)', value: c.fobR, color: '#378ADD' },
                  { label: 'Flete + seguro', value: c.fleteR + c.segR, color: '#1D9E75' },
                  { label: 'Aranceles', value: c.derR + c.tasR + c.ganR + c.iibbR, color: '#BA7517' },
                  { label: 'Gastos locales', value: c.desR + c.terR + c.navR + c.logR, color: '#7F77DD' },
                ]}
                total={c.totSinR}
                totalLabel="Costo real (sin IVA)"
              />
            </Card>

            <Card>
              <details className="cot-collapse">
                <summary style={{ ...SECL, margin: '0 0 0.3rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <span className="cot-chev" style={{ fontSize: '0.7rem', color: '#9ca3af' }}>▸</span>
                  Desglose de costos reales
                </summary>
                <div style={{ marginTop: '0.3rem' }}>
                  <RRow label="FOB Real" val={c.fobR} />
                  <RRow label="Flete prorrateado" val={c.fleteR} />
                  <RRow label="Seguro (1%)" val={c.segR} />
                  <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', margin: '0.5rem 0 0.25rem' }}>Aranceles pagados</p>
                  <RRow label={`Derechos (${pDer}%)`} val={c.derR} />
                  <RRow label={`Tasa Estadística (${pTas}%)`} val={c.tasR} />
                  <RRow label={`IVA (${pIva}%)`} val={c.ivaR} dimmed={!pagaIva} />
                  <RRow label={`IVA Adicional (${pIvaA}%)`} val={c.ivaAR} dimmed={!pagaIvaA} />
                  <RRow label={`Perc. Ganancias (${pGan}%)`} val={c.ganR} dimmed={!pagaGan} />
                  <RRow label={`Perc. IIBB (${pIIBB}%)`} val={c.iibbR} dimmed={!pagaIIBB} />
                  <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', margin: '0.5rem 0 0.25rem' }}>Gastos locales</p>
                  <RRow label="Despachante" val={c.desR} />
                  <RRow label="Terminal" val={c.terR} />
                  <RRow label="Naviera" val={c.navR} />
                  <RRow label="Logística Interna" val={c.logR} />
                </div>
              </details>
              <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '0.6rem', paddingTop: '0.6rem', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#111827' }}>Total CON IVA</span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{usd(c.totConR)}</span>
              </div>
            </Card>

          </>)}

        </div>
      </div>


      {/* ══ MODAL: VISTA COTIZACIÓN CLIENTE ═════════════════════════════════ */}
      {showClienteView && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowClienteView(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div className="cz-modal" style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto' }}>

            {/* modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.2rem 1.75rem', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: '#fff', borderRadius: '12px 12px 0 0', zIndex: 10 }}>
              <div>
                <p style={{ fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: '0.1rem' }}>Vista previa</p>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Cotización al Cliente</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button onClick={printClienteQuote} style={{ ...PBTN, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Imprimir / PDF
                </button>
                <button onClick={() => setShowClienteView(false)} className="cz-tbtn" style={{ ...TBTN, fontSize: '1.05rem', lineHeight: 1 }}>×</button>
              </div>
            </div>

            {/* modal body — quote preview */}
            <div style={{ padding: '1.5rem 1.75rem' }}>

              {/* brand + date */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.2rem' }}>
                <div>
                  <p style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>TRANSTIDE FREIGHT</p>
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Gestión Logística & Importaciones</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '0.66rem', color: '#9ca3af' }}>Fecha de cotización</p>
                  <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                </div>
              </div>

              {/* title */}
              <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.7rem', marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827' }}>Cotización de importación{cliente ? <span style={{ color: '#6b7280', fontWeight: 400 }}> · {cliente}</span> : ''}</p>
              </div>

              {/* client info */}
              {(descripcion || clasificacion) && (
                <div style={{ marginBottom: '1.2rem', display: 'grid', gap: '0.35rem' }}>
                  {descripcion && <div style={{ display: 'flex', gap: '1rem' }}><span style={{ fontSize: '0.7rem', color: '#9ca3af', minWidth: '130px' }}>Descripción</span><span style={{ fontSize: '0.8rem', color: '#111827' }}>{descripcion}</span></div>}
                  {clasificacion && <div style={{ display: 'flex', gap: '1rem' }}><span style={{ fontSize: '0.7rem', color: '#9ca3af', minWidth: '130px' }}>Pos. Arancelaria</span><span style={{ fontSize: '0.8rem', color: '#111827', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{clasificacion}</span></div>}
                </div>
              )}

              {/* desglose — filas planas por sección */}
              <div style={{ marginBottom: '1rem' }}>

                {/* base importación */}
                <p style={{ ...SECL, margin: '0 0 0.2rem' }}>Base de la Importación</p>
                {[
                  ['Valor de Mercadería (FOB)', usd(c.fobC)],
                  ['Flete Internacional', usd(n(fleteCli))],
                  ['Seguro Marítimo (1% FOB)', usd(c.segC)],
                  ...(c.fobDC !== c.fobC ? [['FOB Declarado (base arancelaria)', usd(c.fobDC)]] : []),
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.8rem', color: '#6b7280' }}>
                    <span>{l}</span><span style={{ color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.84rem', fontWeight: 700, color: '#111827' }}>
                  <span>CIF — Base Arancelaria</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(c.cifC)}</span>
                </div>

                {/* aranceles */}
                <p style={{ ...SECL, margin: '1.1rem 0 0.2rem' }}>Aranceles Aduaneros</p>
                {[
                  [`Derechos de Importación (${pDer}%)`, usd(c.derC)],
                  ...(pTas > 0 ? [[`Tasa Estadística (${pTas}%)`, usd(c.tasC)]] : []),
                  ['Base IVA', usd(c.bivC), true],
                  [`IVA (${pIva}%)`, usd(c.ivaC)],
                  ...(c.ivaAC > 0 ? [[`IVA Adicional (${pIvaA}%)`, usd(c.ivaAC)]] : []),
                  ...(c.ganC > 0 ? [[`Percepción Ganancias (${pGan}%)`, usd(c.ganC)]] : []),
                  ...(c.iibbC > 0 ? [[`Percepción IIBB (${pIIBB}%)`, usd(c.iibbC)]] : []),
                ].map(([l, v, sub]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.8rem', color: sub ? '#9ca3af' : '#6b7280' }}>
                    <span>{l}</span><span style={{ color: sub ? '#9ca3af' : '#111827', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                  </div>
                ))}

                {/* gastos locales */}
                {(c.desC > 0 || c.terC > 0 || c.navC > 0 || c.logC > 0) && (<>
                  <p style={{ ...SECL, margin: '1.1rem 0 0.2rem' }}>Gastos Locales</p>
                  {[
                    ['Despachante de Aduana', c.desC],
                    ['Terminal Portuaria', c.terC],
                    ['Naviera', c.navC],
                    ['Logística Interna', c.logC],
                  ].filter(([, v]) => v > 0).map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.8rem', color: '#6b7280' }}>
                      <span>{l}</span><span style={{ color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{usd(v)}</span>
                    </div>
                  ))}
                </>)}

                {/* totales */}
                <p style={{ ...SECL, margin: '1.1rem 0 0.2rem' }}>Resumen</p>
                {[
                  ['Costo Total CON IVA', usd(c.totConC), false, true],
                  ['Costo Total SIN IVA', usd(c.totSinC), true, false],
                  [c.honMinAplica ? 'Honorarios del Servicio' : `Honorarios del Servicio (${pHon}%)`, usd(c.honorarios), false, false],
                  ...(c.gastFac > 0 ? [[`Gastos de Facturación (${pFac}%)`, usd(c.gastFac), true, false]] : []),
                ].map(([l, v, sub, bold]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: sub ? '0.78rem' : bold ? '0.86rem' : '0.8rem', fontWeight: bold ? 700 : 400, color: sub ? '#9ca3af' : bold ? '#111827' : '#6b7280' }}>
                    <span>{l}</span><span style={{ fontVariantNumeric: 'tabular-nums', color: sub ? '#9ca3af' : '#111827' }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* final prices */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', margin: '1.2rem 0', paddingTop: '0.9rem', borderTop: '1px solid #f1f5f9' }}>
                <div>
                  <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: '4px' }}>Precio Final CON Factura</p>
                  <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#059669', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.precioConF)}</p>
                  <p style={{ fontSize: '0.66rem', color: '#9ca3af', marginTop: '5px', fontVariantNumeric: 'tabular-nums' }}>Hon. {usd(c.honorarios)} + Gs.Fac. {usd(c.gastFac)}</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: '4px' }}>Precio Final SIN Factura</p>
                  <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#d97706', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{usd(c.precioSinF)}</p>
                  <p style={{ fontSize: '0.66rem', color: '#9ca3af', marginTop: '5px', fontVariantNumeric: 'tabular-nums' }}>Ahorro del cliente: {usd(c.gastFac)}</p>
                </div>
              </div>

              {/* disclaimer */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', lineHeight: 1.6 }}>
                  * Cotización de carácter estimativo y no final, expresada en USD. Los valores se calculan con tarifas, tipo de cambio y normativa vigentes a la fecha de emisión; el importe definitivo se confirma al momento del despacho y puede variar según el tipo de cambio oficial, el flete internacional (ajustable hasta la fecha efectiva de embarque), actualizaciones arancelarias o normativas, condiciones del proveedor en origen y contingencias aduaneras ajenas a Transtide (canal rojo/naranja, verificaciones, escaneos, almacenajes, estadías o demoras). Las diferencias se trasladan al costo final con documentación respaldatoria. No constituye una oferta en firme. Validez: 7 días hábiles; servicios no incluidos se cotizan por separado.
                </p>
              </div>

            </div>
          </div>
        </div>
      )}

      {showSave && (
        <SaveQuoteModal
          modo="maritimo"
          defaultCliente={cliente}
          getPayload={() => ({
            total_usd: String(Math.round(usaSociedadPropia ? c.precioSinF : c.precioConF)),
            resumen: `FOB ${Math.round(c.fobC)} · ${n(m3Merch)}m³ · USD ${(Math.round((usaSociedadPropia ? c.precioSinF : c.precioConF)) / 1000).toFixed(1)}k final`,
            data: serialize(),
          })}
          ncmPayload={() => clasificacion.trim() ? ({ codigo: clasificacion.trim(), producto: descripcion, der: String(pDer), tasa: String(pTas), iva: String(pIva), iva_adic: String(pIvaA), ganancias: String(pGan), iibb: String(pIIBB) }) : null}
          loadedQuote={loadedQuote}
          onSaved={(meta) => { setLoadedQuote(meta); borrador.marcarGuardado(); }}
          onClose={() => setShowSave(false)}
        />
      )}

    </div>
  );
}

export { CotizadorMaritimo };
export default CotizadorMaritimo;
