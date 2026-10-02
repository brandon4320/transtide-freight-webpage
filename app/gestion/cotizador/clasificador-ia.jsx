'use client';

// "Clasificar con IA": propone la posición NCM desde la descripción y las fotos
// del producto, con datos de fuentes oficiales (nomenclador MERCOSUR, AEC,
// antidumping de la CNCE) y lo que ya está validado en la biblioteca de NCM.
// Nada se aplica sin confirmar: primero se ve qué propone y de dónde sale cada
// número. Ver app/api/ai/clasificar/route.ts.

import { useEffect, useState } from 'react';
import { gToast } from '../toast';
import { aplicarAduanix, guardarNcmDesdeAduanix } from './aduanix';

const PAISES = ['China', 'Estados Unidos', 'India', 'Vietnam', 'Turquía', 'Taiwán', 'Corea del Sur', 'Japón', 'Alemania', 'Italia', 'España', 'Brasil', 'Otro'];
const FUENTE = { biblioteca: 'tu biblioteca', aec: 'AEC MERCOSUR', regla: 'regla general' };
const COLOR_FUENTE = { biblioteca: '#059669', aec: '#111827', regla: '#9ca3af' };

const TXTBTN = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, color: '#111827', fontFamily: 'inherit' };
const MINP = { width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.82rem', color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const PRIM = (activo) => ({ background: '#111827', color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 1.1rem', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit', cursor: activo ? 'pointer' : 'default', opacity: activo ? 1 : 0.45 });
const pct = (v) => (v === null || v === undefined ? '—' : String(v).replace('.', ',') + ' %');

export function ClasificadorIA({ descripcion = '', imagenes = [], setters, onNcmGuardada }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [origen, setOrigen] = useState('China');
  const [cargando, setCargando] = useState(false);
  const [preguntas, setPreguntas] = useState(null);   // [{ pregunta, opciones }]
  const [respuestas, setRespuestas] = useState({});   // { índice: respuesta }
  const [resultado, setResultado] = useState(null);
  const [elegido, setElegido] = useState(0);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { if (abierto) setTexto((t) => t || descripcion || ''); }, [abierto, descripcion]);
  useEffect(() => {
    if (!abierto) return;
    const esc = (e) => { if (e.key === 'Escape' && !cargando) setAbierto(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [abierto, cargando]);

  const clasificar = async ({ conRespuestas = false, saltar = false } = {}) => {
    if (texto.trim().length < 3) { gToast.error('Escribí qué es el producto.'); return; }
    setCargando(true);
    if (!conRespuestas) setResultado(null);
    try {
      const listaResp = conRespuestas && preguntas ? preguntas.map((p, i) => ({ pregunta: p.pregunta, respuesta: respuestas[i] || '' })).filter((r) => r.respuesta) : [];
      const r = await fetch('/api/ai/clasificar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descripcion: texto.trim(),
          origen: origen === 'Otro' ? '' : origen,
          imagenes: (imagenes || []).map((im) => im.key).filter(Boolean),
          respuestas: listaResp,
          saltarPreguntas: saltar,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { gToast.error(j.error || 'No se pudo clasificar.'); return; }
      if (j.etapa === 'preguntas') { setPreguntas(j.preguntas); setRespuestas({}); setResultado(null); return; }
      setPreguntas(null);
      setResultado(j);
      setElegido(0);
    } catch {
      gToast.error('Error de conexión. Probá de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  const candidato = resultado?.candidatos?.[elegido] || null;
  const datosParaAplicar = (c) => ({
    ncm: c.ncm,
    der: c.alicuotas.der?.valor ?? null,
    tasa: c.alicuotas.tasa?.valor ?? null,
    iva: c.alicuotas.iva?.valor ?? null,
    ivaAdic: c.alicuotas.ivaAdic?.valor ?? null,
    ganancias: c.alicuotas.ganancias?.valor ?? null,
    iibb: c.alicuotas.iibb?.valor ?? null,
    producto: resultado?.producto_normalizado || '',
    sim: '',
    intervenciones: (resultado?.intervenciones_probables || []).map((i) => `${i.organismo}: ${i.motivo}`),
  });

  const aplicar = () => {
    if (!candidato) return;
    aplicarAduanix(datosParaAplicar(candidato), setters);
    setAbierto(false);
    gToast.success(`Posición ${candidato.ncm} aplicada a la cotización.`);
  };

  const guardar = async () => {
    if (!candidato || guardando) return;
    setGuardando(true);
    try {
      if (await guardarNcmDesdeAduanix(datosParaAplicar(candidato), descripcion)) onNcmGuardada?.();
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
              <button onClick={() => clasificar()} disabled={cargando} style={PRIM(!cargando)}>
                {cargando ? 'Clasificando…' : resultado ? 'Clasificar de nuevo' : 'Clasificar'}
              </button>
            </div>

            {/* preguntas de aclaración */}
            {preguntas && (
              <div style={{ marginTop: '1rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.9rem' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>Para clasificar bien, falta un dato</p>
                {preguntas.map((p, i) => (
                  <div key={i} style={{ marginBottom: '0.75rem' }}>
                    <p style={{ fontSize: '0.78rem', color: '#374151', marginBottom: '0.35rem' }}>{p.pregunta}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {p.opciones.map((op) => {
                        const on = respuestas[i] === op;
                        return (
                          <button key={op} type="button" onClick={() => setRespuestas((r) => ({ ...r, [i]: op }))}
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
                  <button onClick={() => clasificar({ saltar: true })} disabled={cargando} style={{ ...TXTBTN, color: '#6b7280', fontWeight: 500, fontSize: '0.76rem' }}>Clasificar sin responder</button>
                  <button onClick={() => clasificar({ conRespuestas: true })} disabled={cargando} style={PRIM(!cargando)}>Clasificar con estas respuestas</button>
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
                  {resultado.candidatos.map((c, i) => {
                    const on = i === elegido;
                    return (
                      <div key={c.ncm} onClick={() => setElegido(i)} role="button" tabIndex={0}
                        style={{ border: `1px solid ${on ? '#111827' : '#e5e7eb'}`, borderRadius: 10, padding: '0.7rem 0.85rem', cursor: 'pointer', background: on ? '#fafafa' : '#fff' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 700, fontSize: '0.92rem', color: '#111827' }}>{c.ncm}</span>
                          <span style={{ fontSize: '0.7rem', color: c.confianza >= 75 ? '#059669' : c.confianza >= 50 ? '#d97706' : '#dc2626', fontWeight: 600 }}>{c.confianza} % de confianza</span>
                          {c.regimen && <span title={c.regimen === 'BK' ? 'Bien de capital: en general IVA 10,5 %' : 'Informática y telecomunicaciones: en general IVA 10,5 %'} style={{ fontSize: '0.64rem', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 999, padding: '0 6px' }}>{c.regimen}</span>}
                          {c.en_biblioteca && <span style={{ fontSize: '0.64rem', color: '#059669', border: '1px solid #bbf7d0', borderRadius: 999, padding: '0 6px' }}>en tu biblioteca</span>}
                          {c.ajustado_desde && <span style={{ fontSize: '0.64rem', color: '#9ca3af' }}>ajustada desde {c.ajustado_desde}</span>}
                        </div>
                        <p style={{ fontSize: '0.78rem', color: '#111827', marginTop: 3 }}>{c.descripcion}{c.descripcion_en_portugues ? ' (texto oficial en portugués)' : ''}</p>
                        {c.jerarquia?.length > 0 && (
                          <p style={{ fontSize: '0.66rem', color: '#9ca3af', marginTop: 2 }}>{c.jerarquia.map((h) => `${h.codigo} ${h.descripcion}`).join(' › ').slice(0, 260)}</p>
                        )}
                        {on && <p style={{ fontSize: '0.74rem', color: '#4b5563', marginTop: 6, lineHeight: 1.45 }}>{c.justificacion}</p>}
                      </div>
                    );
                  })}
                </div>

                {candidato && (
                  <div style={{ marginTop: '0.85rem' }}>
                    <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginBottom: '0.35rem' }}>Alícuotas sugeridas para {candidato.ncm}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.4rem 0.9rem' }}>
                      {[['Derechos de importación', 'der'], ['Tasa estadística', 'tasa'], ['IVA', 'iva'], ['IVA adicional', 'ivaAdic'], ['Perc. Ganancias', 'ganancias'], ['Perc. IIBB', 'iibb']].map(([l, k]) => {
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
                    {!candidato.en_biblioteca && candidato.alicuotas.der?.fuente === 'aec' && (
                      <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 6, lineHeight: 1.45 }}>
                        Los derechos salen del Arancel Externo Común. Argentina tiene excepciones nacionales para algunas posiciones: verificalo en VUCE antes de cotizar.
                      </p>
                    )}
                    {resultado.motivo_iva && <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 4 }}>IVA: {resultado.motivo_iva}</p>}

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
