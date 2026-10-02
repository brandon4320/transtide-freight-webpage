'use client';

// "Clasificar con IA": propone la posición NCM desde la descripción y las fotos
// del producto, con datos de fuentes oficiales (nomenclador MERCOSUR, AEC,
// antidumping de la CNCE) y lo que ya está validado en la biblioteca de NCM.
// Nada se aplica sin confirmar: primero se ve qué propone y de dónde sale cada
// número. Ver app/api/ai/clasificar/route.ts.

import { useEffect, useRef, useState } from 'react';
import { gToast } from '../toast';
import { aplicarAduanix, guardarNcmDesdeAduanix } from './aduanix';

const PAISES = ['China', 'Estados Unidos', 'India', 'Vietnam', 'Turquía', 'Taiwán', 'Corea del Sur', 'Japón', 'Alemania', 'Italia', 'España', 'Brasil', 'Otro'];
// regla: valor general que no sale de la posición; no pisa lo cargado al aplicar.
const FUENTE = { biblioteca: 'tu biblioteca', aec: 'AEC MERCOSUR', regimen: 'BK/BIT', regla: 'regla general' };
const COLOR_FUENTE = { biblioteca: '#059669', aec: '#111827', regimen: '#2563eb', regla: '#9ca3af' };
const CAMPOS = [['Derechos de importación', 'der'], ['Tasa estadística', 'tasa'], ['IVA', 'iva'], ['IVA adicional', 'ivaAdic'], ['Perc. Ganancias', 'ganancias'], ['Perc. IIBB', 'iibb']];
const AMBAR = { marginTop: '0.7rem', border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 8, padding: '0.55rem 0.75rem' };
const HIST_VACIO = { texto: '', respuestas: [], sinResponder: [] };
const digitos = (c) => String(c || '').replace(/[^0-9]/g, '');

const TXTBTN = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, color: '#111827', fontFamily: 'inherit' };
const MINP = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.82rem', color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const PRIM = (activo) => ({ background: '#111827', color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 1.1rem', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit', cursor: activo ? 'pointer' : 'default', opacity: activo ? 1 : 0.45 });
const pct = (v) => (v === null || v === undefined ? '—' : String(v).replace('.', ',') + ' %');

export function ClasificadorIA({ descripcion = '', imagenes = [], setters, onNcmGuardada }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [origen, setOrigen] = useState('China');
  const [cargando, setCargando] = useState(false);
  const [preguntas, setPreguntas] = useState(null);   // [{ pregunta, motivo, opciones }]
  const [respuestas, setRespuestas] = useState({});   // { índice: respuesta } de la ronda actual
  const [ronda, setRonda] = useState(0);
  // Lo respondido (y lo que no se supo) en rondas anteriores, para este texto.
  const [historial, setHistorial] = useState(HIST_VACIO);
  const [resultado, setResultado] = useState(null);
  const [elegido, setElegido] = useState(0);
  const [variantes, setVariantes] = useState({});     // { índice de candidato: ncm del hermano elegido }
  const [guardando, setGuardando] = useState(false);
  const descPrevia = useRef(null);

  const reiniciar = () => {
    setPreguntas(null); setRespuestas({}); setRonda(0); setHistorial(HIST_VACIO);
    setResultado(null); setElegido(0); setVariantes({});
  };

  // Si se reabre con otra descripción del producto, lo anterior ya no corresponde.
  useEffect(() => {
    if (!abierto) return;
    const d = String(descripcion || '').trim();
    if (d && descPrevia.current && d !== descPrevia.current) { reiniciar(); setTexto(d); }
    else setTexto((t) => t || d);
    descPrevia.current = d;
  }, [abierto, descripcion]);
  useEffect(() => {
    if (!abierto) return;
    const esc = (e) => { if (e.key === 'Escape' && !cargando) setAbierto(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [abierto, cargando]);

  // modo: 'nuevo' (botón principal), 'responder' o 'saltar' (desde las preguntas).
  const clasificar = async (modo = 'nuevo') => {
    const base = texto.trim();
    if (base.length < 3) { gToast.error('Escribí qué es el producto.'); return; }
    // El historial vale solo para el mismo texto.
    const prev = historial.texto === base ? historial : { ...HIST_VACIO, texto: base };
    let resp = prev.respuestas, sin = prev.sinResponder;
    if (modo !== 'nuevo' && preguntas) {
      const ahora = preguntas.map((p, i) => ({ pregunta: p.pregunta, respuesta: String(respuestas[i] || '').trim() }));
      const mismas = new Set(ahora.map((r) => r.pregunta));
      resp = [...resp.filter((r) => !mismas.has(r.pregunta)), ...ahora.filter((r) => r.respuesta)];
      sin = [...sin.filter((p) => !mismas.has(p)), ...ahora.filter((r) => !r.respuesta).map((r) => r.pregunta)];
    }
    setHistorial({ texto: base, respuestas: resp, sinResponder: sin });
    setCargando(true);
    if (modo === 'nuevo') setResultado(null);
    try {
      const r = await fetch('/api/ai/clasificar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descripcion: base,
          origen: origen === 'Otro' ? '' : origen,
          imagenes: (imagenes || []).map((im) => im.key).filter(Boolean),
          respuestas: resp,
          sinResponder: sin,
          ronda: modo === 'nuevo' ? 0 : ronda,
          saltarPreguntas: modo === 'saltar',
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { gToast.error(j.error || 'No se pudo clasificar.'); return; }
      if (j.etapa === 'preguntas') { setPreguntas(j.preguntas); setRespuestas({}); setRonda(j.ronda || 1); setResultado(null); return; }
      setPreguntas(null);
      setResultado(j);
      setElegido(0);
      setVariantes({});
    } catch {
      gToast.error('Error de conexión. Probá de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  // El candidato tal como se muestra: si se eligió un hermano de la misma
  // subpartida, toma su código, texto y alícuotas.
  const vista = (i) => {
    const c = resultado?.candidatos?.[i];
    if (!c) return null;
    const h = variantes[i] && variantes[i] !== c.ncm ? (c.hermanos || []).find((x) => x.ncm === variantes[i]) : null;
    if (!h) return c;
    return {
      ...c, ncm: h.ncm, descripcion: h.descripcion, aec: h.aec, regimen: h.regimen, en_biblioteca: h.en_biblioteca,
      alicuotas: h.alicuotas, antidumping: h.antidumping, avisos: h.avisos, descripcion_en_portugues: false,
      jerarquia: (c.jerarquia || []).filter((x) => digitos(h.ncm).startsWith(digitos(x.codigo))),
      ajustado_desde: null, cambiado_desde: c.ncm,
    };
  };
  const candidato = vista(elegido);

  // firmes: solo lo que sale de la posición o de la biblioteca; la regla general no
  // pisa lo que el usuario ya tenía cargado.
  const datosParaAplicar = (c, firmes) => {
    const v = (a) => (!a ? null : firmes && a.fuente === 'regla' ? null : a.valor);
    const interv = (resultado?.intervenciones_probables || []).map((i) => `${i.organismo}: ${i.motivo}`);
    return {
      ncm: c.ncm,
      der: v(c.alicuotas.der), tasa: v(c.alicuotas.tasa), iva: v(c.alicuotas.iva), ivaAdic: v(c.alicuotas.ivaAdic),
      ganancias: v(c.alicuotas.ganancias), iibb: v(c.alicuotas.iibb),
      producto: resultado?.producto_normalizado || '',
      sim: '',
      intervenciones: interv.length ? [`Estimado por IA: ${interv.join(' · ')}`] : [],
    };
  };

  const aplicar = () => {
    if (!candidato) return;
    aplicarAduanix(datosParaAplicar(candidato, true), setters);
    const sinTocar = CAMPOS.filter(([, k]) => candidato.alicuotas[k]?.fuente === 'regla').map(([l]) => l.toLowerCase());
    setAbierto(false);
    gToast.success(`Posición ${candidato.ncm} aplicada a la cotización.${sinTocar.length ? ` Sin tocar (regla general): ${sinTocar.join(', ')}.` : ''}`);
  };

  const guardar = async () => {
    if (!candidato || guardando) return;
    const noValidadas = CAMPOS.filter(([, k]) => candidato.alicuotas[k] && candidato.alicuotas[k].fuente !== 'biblioteca').map(([l]) => l.toLowerCase());
    if (noValidadas.length && !window.confirm(`Vas a guardar en tu biblioteca alícuotas que no están validadas (${noValidadas.join(', ')}): salen del AEC, del régimen BK/BIT o de la regla general. Guardalas solo si las verificaste en VUCE o con el despachante. ¿Guardar igual?`)) return;
    setGuardando(true);
    try {
      if (await guardarNcmDesdeAduanix(datosParaAplicar(candidato, false), descripcion)) onNcmGuardada?.();
    } finally { setGuardando(false); }
  };

  const verificarEnVuce = async () => {
    if (!candidato) return;
    try { await navigator.clipboard.writeText(candidato.ncm); gToast.success(`${candidato.ncm} copiada: pegala en el buscador de VUCE.`); } catch {}
    window.open('https://www.vuce.gob.ar/', '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} style={TXTBTN} title="Propone la posición NCM con IA, con datos oficiales">
        Clasificar con IA
      </button>

      {abierto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
          onClick={(e) => { if (e.target === e.currentTarget && !cargando) setAbierto(false); }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 680, maxHeight: '92vh', overflowY: 'auto', padding: '1.4rem 1.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Clasificar con IA</h3>
              <button onClick={() => !cargando && setAbierto(false)} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.4rem', lineHeight: 1 }}>×</button>
            </div>
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '0.9rem' }}>
              Propone la posición y la valida contra la Nomenclatura Común del MERCOSUR vigente. Orientativo: lo confirma el despachante.
            </p>

            {/* datos del producto */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 170px', gap: '0.7rem', alignItems: 'start' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.68rem', color: '#9ca3af', marginBottom: 4 }}>Producto: qué es, de qué material, para qué se usa</label>
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Ej: Caja fuerte de acero con cerradura electrónica, 60 kg, uso doméstico"
                  style={{ ...MINP, resize: 'vertical', lineHeight: 1.45 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.68rem', color: '#9ca3af', marginBottom: 4 }}>País de origen</label>
                <select value={origen} onChange={(e) => setOrigen(e.target.value)} style={{ ...MINP, cursor: 'pointer' }}>
                  {PAISES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <p style={{ fontSize: '0.64rem', color: '#c4c9d4', marginTop: 4 }}>Define el antidumping.</p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.7rem' }}>
              <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>
                {imagenes.length ? `Usa ${imagenes.length === 1 ? 'la foto' : `las ${imagenes.length} fotos`} del producto.` : 'Si sumás fotos del producto, la IA también las mira.'}
              </span>
              <button onClick={() => clasificar('nuevo')} disabled={cargando} style={PRIM(!cargando)}>
                {cargando ? 'Clasificando…' : resultado ? 'Clasificar de nuevo' : 'Clasificar'}
              </button>
            </div>

            {/* preguntas de aclaración */}
            {preguntas && (
              <div style={{ marginTop: '1rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.9rem' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827' }}>Para clasificar bien, falta un dato</p>
                <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginBottom: '0.6rem' }}>Respondé lo que sepas; lo que no, dejalo vacío.</p>
                {preguntas.map((p, i) => (
                  <div key={i} style={{ marginBottom: '0.75rem' }}>
                    <p style={{ fontSize: '0.78rem', color: '#374151' }}>{p.pregunta}</p>
                    {p.motivo && <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 1 }}>{p.motivo}</p>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.35rem' }}>
                      {p.opciones.map((op, j) => {
                        const on = respuestas[i] === op;
                        return (
                          <button key={j} type="button" onClick={() => setRespuestas((r) => ({ ...r, [i]: op }))}
                            style={{ border: `1px solid ${on ? '#111827' : '#e5e7eb'}`, background: on ? '#111827' : '#fff', color: on ? '#fff' : '#374151', borderRadius: 999, padding: '0.25rem 0.7rem', fontSize: '0.74rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                            {op}
                          </button>
                        );
                      })}
                    </div>
                    <input value={p.opciones.includes(respuestas[i]) ? '' : (respuestas[i] || '')} onChange={(e) => setRespuestas((r) => ({ ...r, [i]: e.target.value }))}
                      placeholder="O escribí la respuesta" style={{ ...MINP, marginTop: '0.35rem', padding: '0.35rem 0.55rem', fontSize: '0.76rem' }} />
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', alignItems: 'center' }}>
                  <button onClick={() => clasificar('saltar')} disabled={cargando} style={{ ...TXTBTN, color: '#6b7280', fontWeight: 500, fontSize: '0.76rem' }}>Clasificar sin responder</button>
                  <button onClick={() => clasificar('responder')} disabled={cargando} style={PRIM(!cargando)}>Clasificar con estas respuestas</button>
                </div>
              </div>
            )}

            {/* resultado */}
            {resultado && (
              <div style={{ marginTop: '1rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.9rem' }}>
                {resultado.producto_normalizado && (
                  <p style={{ fontSize: '0.74rem', color: '#6b7280', marginBottom: '0.6rem' }}>Entendido como: <strong style={{ color: '#111827' }}>{resultado.producto_normalizado}</strong></p>
                )}

                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {resultado.candidatos.map((_, i) => {
                    const c = vista(i);
                    const on = i === elegido;
                    return (
                      <div key={i} onClick={() => setElegido(i)} role="button" tabIndex={0}
                        style={{ border: `1px solid ${on ? '#111827' : '#e5e7eb'}`, borderRadius: 10, padding: '0.7rem 0.85rem', cursor: 'pointer', background: on ? '#fafafa' : '#fff' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 700, fontSize: '0.92rem', color: '#111827' }}>{c.ncm}</span>
                          {c.cambiado_desde
                            ? <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>elegida a mano (la IA proponía {c.cambiado_desde})</span>
                            : <span style={{ fontSize: '0.7rem', color: c.confianza >= 75 ? '#059669' : c.confianza >= 50 ? '#d97706' : '#dc2626', fontWeight: 600 }}>{c.confianza} % de confianza</span>}
                          {c.regimen && <span title={c.regimen === 'BK' ? 'Bien de capital: en general IVA 10,5 %' : 'Informática y telecomunicaciones: en general IVA 10,5 %'} style={{ fontSize: '0.64rem', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 999, padding: '0 6px' }}>{c.regimen}</span>}
                          {c.en_biblioteca && <span style={{ fontSize: '0.64rem', color: '#059669', border: '1px solid #bbf7d0', borderRadius: 999, padding: '0 6px' }}>en tu biblioteca</span>}
                          {c.ajustado_desde && <span style={{ fontSize: '0.64rem', color: '#b45309', border: '1px solid #fde68a', borderRadius: 999, padding: '0 6px' }}>ajustada desde {c.ajustado_desde}</span>}
                        </div>
                        <p style={{ fontSize: '0.78rem', color: '#111827', marginTop: 3 }}>{c.descripcion}{c.descripcion_en_portugues ? ' (texto oficial en portugués)' : ''}</p>
                        {c.jerarquia?.length > 0 && (
                          <p style={{ fontSize: '0.66rem', color: '#9ca3af', marginTop: 2 }}>{c.jerarquia.map((h) => `${h.codigo} ${h.descripcion}`).join(' › ').slice(0, 260)}</p>
                        )}
                        {on && <p style={{ fontSize: '0.74rem', color: '#4b5563', marginTop: 6, lineHeight: 1.45 }}>{c.justificacion}</p>}
                        {on && c.datos_a_confirmar?.length > 0 && (
                          <p style={{ fontSize: '0.7rem', color: '#b45309', marginTop: 4 }}>A confirmar: {c.datos_a_confirmar.join(' · ')}</p>
                        )}
                        {on && resultado.candidatos[i].hermanos?.length > 1 && (
                          <div style={{ marginTop: 8 }}>
                            <p style={{ fontSize: '0.66rem', color: '#9ca3af', marginBottom: 3 }}>Otras posiciones de la misma subpartida</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                              {resultado.candidatos[i].hermanos.map((h) => {
                                const sel = h.ncm === c.ncm;
                                return (
                                  <button key={h.ncm} type="button" title={h.descripcion}
                                    onClick={(e) => { e.stopPropagation(); setVariantes((v) => ({ ...v, [i]: h.ncm })); }}
                                    style={{ border: `1px solid ${sel ? '#111827' : '#e5e7eb'}`, background: sel ? '#111827' : '#fff', color: sel ? '#fff' : '#374151', borderRadius: 999, padding: '0.1rem 0.55rem', fontSize: '0.66rem', cursor: 'pointer', fontFamily: 'inherit', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{h.ncm}</span> {h.descripcion.slice(0, 40)}{h.descripcion.length > 40 ? '…' : ''}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {candidato && (
                  <div style={{ marginTop: '0.85rem' }}>
                    <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginBottom: '0.35rem' }}>Alícuotas sugeridas para {candidato.ncm}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.4rem 0.9rem' }}>
                      {CAMPOS.map(([l, k]) => {
                        const a = candidato.alicuotas[k];
                        return (
                          <div key={k} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 4 }}>
                            <p style={{ fontSize: '0.66rem', color: '#9ca3af' }}>{l}</p>
                            <p style={{ fontSize: '0.86rem', color: '#111827', fontWeight: 600 }}>
                              {pct(a?.valor)} <span style={{ fontSize: '0.62rem', fontWeight: 500, color: COLOR_FUENTE[a?.fuente] || '#9ca3af' }}>{a ? FUENTE[a.fuente] : ''}</span>
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    {CAMPOS.some(([, k]) => candidato.alicuotas[k]?.fuente === 'regla') && (
                      <p style={{ fontSize: '0.66rem', color: '#9ca3af', marginTop: 6 }}>Lo marcado como regla general es orientativo: al aplicar no pisa lo que ya tenés cargado en la cotización.</p>
                    )}
                    {!candidato.en_biblioteca && candidato.alicuotas.der?.fuente === 'aec' && (
                      <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 6, lineHeight: 1.45 }}>
                        Los derechos salen del Arancel Externo Común. Argentina tiene excepciones nacionales para algunas posiciones: verificalo en VUCE antes de cotizar.
                      </p>
                    )}
                    {/* IVA: manda el régimen de la posición; la opinión de la IA solo como aviso */}
                    {candidato.alicuotas.iva?.fuente !== 'biblioteca' && candidato.regimen && (
                      <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 4 }}>IVA 10,5 %: la posición figura como {candidato.regimen} en el Decreto 557/2023.</p>
                    )}
                    {candidato.alicuotas.iva?.fuente !== 'biblioteca' && !candidato.regimen && resultado.iva_reducido_probable && (
                      <p style={{ fontSize: '0.68rem', color: '#b45309', marginTop: 4 }}>
                        La IA estima que podría tributar IVA 10,5 %{resultado.motivo_iva ? ` (${resultado.motivo_iva})` : ''}, pero la posición no figura como BK ni BIT: se sugiere 21 %. Confirmalo con el despachante.
                      </p>
                    )}

                    {(candidato.ajustado_desde || resultado.estado === 'usado' || resultado.estado === 'reacondicionado' || candidato.avisos?.length > 0) && (
                      <div style={AMBAR}>
                        {candidato.ajustado_desde && (
                          <p style={{ fontSize: '0.72rem', color: '#92400e' }}>La IA propuso {candidato.ajustado_desde}, que no existe en la NCM vigente: se ajustó a {candidato.ncm} dentro de la misma subpartida. Revisá que corresponda.</p>
                        )}
                        {(resultado.estado === 'usado' || resultado.estado === 'reacondicionado') && (
                          <p style={{ fontSize: '0.72rem', color: '#92400e', marginTop: 2 }}>Mercadería {resultado.estado}: los usados tienen un régimen de importación propio. Las alícuotas de arriba son las del bien nuevo.</p>
                        )}
                        {(candidato.avisos || []).map((a, i) => (
                          <p key={i} style={{ fontSize: '0.72rem', color: '#92400e', marginTop: 2 }}>{a}</p>
                        ))}
                      </div>
                    )}

                    {candidato.antidumping?.length > 0 && (
                      <div style={{ marginTop: '0.7rem', border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 8, padding: '0.55rem 0.75rem' }}>
                        <p style={{ fontSize: '0.74rem', fontWeight: 700, color: '#dc2626' }}>Antidumping vigente{origen && origen !== 'Otro' ? ` para ${origen}` : ''}</p>
                        {candidato.antidumping.map((m, i) => (
                          <p key={i} style={{ fontSize: '0.72rem', color: '#7f1d1d', marginTop: 2 }}>
                            {m.producto} · {m.pais} · {m.medida}{m.norma ? ` · ${m.norma}` : ''}{m.hasta ? ` · hasta ${m.hasta}` : ''}
                            {m.revisar && <span style={{ color: '#b45309' }}> · tiene más de 5 años: confirmar si sigue vigente</span>}
                          </p>
                        ))}
                      </div>
                    )}

                    {resultado.intervenciones_probables?.length > 0 && (
                      <div style={{ marginTop: '0.6rem' }}>
                        <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#d97706' }}>Intervenciones probables</p>
                        {resultado.intervenciones_probables.map((it, i) => (
                          <p key={i} style={{ fontSize: '0.72rem', color: '#92400e' }}>{it.organismo}: {it.motivo}</p>
                        ))}
                      </div>
                    )}
                    {resultado.advertencias?.length > 0 && (
                      <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0 }}>
                        {resultado.advertencias.map((a, i) => <li key={i} style={{ fontSize: '0.7rem', color: '#6b7280' }}>{a}</li>)}
                      </ul>
                    )}

                    <p style={{ fontSize: '0.64rem', color: '#c4c9d4', marginTop: '0.7rem', lineHeight: 1.45 }}>
                      Fuentes: {resultado.fuentes?.nomenclador?.version || 'NCM vigente'} (MERCOSUR){resultado.fuentes?.antidumping ? ` · antidumping: informe de la CNCE a la OMC${resultado.fuentes.antidumping.corte ? `, medidas al ${resultado.fuentes.antidumping.corte.split('-').reverse().join('/')}` : ''} (lo dictado después no figura)` : ''}. Las intervenciones son una estimación de la IA, no un dato oficial.
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button onClick={verificarEnVuce} style={{ ...TXTBTN, fontWeight: 500, color: '#2563eb', fontSize: '0.76rem' }}>Copiar y verificar en VUCE ↗</button>
                    <button onClick={guardar} disabled={guardando} title="Guardalas como validadas solo después de verificarlas"
                      style={{ ...TXTBTN, fontWeight: 500, color: '#6b7280', fontSize: '0.76rem' }}>{guardando ? 'Guardando…' : 'Guardar en mis NCM'}</button>
                  </div>
                  <button onClick={aplicar} style={PRIM(true)}>Aplicar a la cotización</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default ClasificadorIA;
