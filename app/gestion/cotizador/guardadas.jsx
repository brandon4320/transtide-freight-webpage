'use client';
// Panel lateral de cotizaciones guardadas: buscar, filtrar por estado, agrupar,
// abrir en el cotizador, cambiar el estado, convertir en operación y eliminar.
// Mismas llamadas a la API de siempre; los estilos (.cz-) viajan con Dialogo.
import { useState, useEffect, useId } from 'react';
import { gToast } from '../toast';
import { ESTADOS, estadoMeta, Dialogo, Confirmar, IconoPapelera } from './comun';
import { TextInput, Revelar, fmtUSD } from './ui';

const cx = (...clases) => clases.filter(Boolean).join(' ');
const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const AGRUPAR = [
  { id: 'estado', label: 'Estado' },
  { id: 'cliente', label: 'Cliente' },
  { id: 'fecha', label: 'Más recientes' },
  { id: 'valor', label: 'Mayor valor' },
];

// Fecha de la base ('AAAA-MM-DD HH:MM:SS' de D1, en UTC) o ISO → Date. null si no
// se entiende. (Safari no lee la forma con espacio: por eso se arma la ISO.)
function aFecha(v) {
  if (!v) return null;
  let s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s = s.replace(' ', 'T') + 'Z';
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
const msDe = (q) => aFecha(q.updated_at || q.created_at)?.getTime() || 0;
const DIA = 86400000;
const inicioDelDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const dos = (x) => String(x).padStart(2, '0');
// "hoy" · "ayer" · "12/09" · "12/09/2025"
function fechaCorta(v) {
  const d = aFecha(v);
  if (!d) return '';
  const hoy = new Date();
  const dias = Math.round((inicioDelDia(hoy) - inicioDelDia(d)) / DIA);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  const dm = `${dos(d.getDate())}/${dos(d.getMonth() + 1)}`;
  return d.getFullYear() === hoy.getFullYear() ? dm : `${dm}/${d.getFullYear()}`;
}
const diasDesde = (v) => {
  const d = aFecha(v);
  return d ? Math.floor((Date.now() - d.getTime()) / DIA) : 0;
};
const totalDe = (q) => {
  const t = Number(q.total_usd);
  return Number.isFinite(t) && t > 0 ? t : null;
};

function SelectorEstado({ q, disabled, onCambiar }) {
  const meta = estadoMeta(q.estado);
  return (
    <span className="cz-estado">
      <span className="cz-punto" style={{ background: meta.fg }} aria-hidden="true" />
      <select
        className="cz-select cz-select-chico"
        value={q.estado}
        onChange={e => onCambiar(e.target.value)}
        disabled={disabled}
        aria-label={`Estado de «${q.nombre || 'la cotización'}»`}
        title="Cambiar el estado"
      >
        {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
      </select>
    </span>
  );
}

function FilaCotizacion({ q, cerrada, ocupada, onAbrir, onConvertir, onEstado, onEliminar }) {
  const total = totalDe(q);
  const meta = [
    cerrada ? estadoMeta(q.estado).label : null,
    (q.cliente || '').trim() || null,
    q.modo === 'aereo' ? 'Aéreo' : 'Marítimo',
    fechaCorta(q.updated_at || q.created_at),
  ].filter(Boolean).join(' · ');
  const nombre = q.nombre || 'Sin nombre';
  return (
    <li className={cx('cz-item', cerrada && 'cz-item-cerrada')} aria-busy={ocupada || undefined}>
      <div className="cz-item-cab">
        <div className="cz-item-textos">
          <p className="cz-item-nombre">{nombre}</p>
          {meta ? <p className="cz-item-meta">{meta}</p> : null}
          {q.resumen ? <p className="cz-item-extra">{q.resumen}</p> : null}
        </div>
        {total !== null ? (
          <p className="cz-item-monto">
            {fmtUSD(total)}
            <small>total cotizado</small>
          </p>
        ) : null}
      </div>
      <div className="cz-item-acciones">
        <button type="button" className="ct-btn-texto cz-texto-fuerte" onClick={onAbrir} disabled={ocupada} title="Cargarla en el cotizador">
          Abrir
        </button>
        <button
          type="button"
          className="ct-btn-texto"
          onClick={onConvertir}
          disabled={ocupada}
          title={q.operation_id ? 'Ya es una operación: ir a verla' : 'Crear una operación con estos datos'}
        >
          {q.operation_id ? 'Ver operación' : 'Convertir en operación'}
        </button>
        <span className="cz-item-derecha">
          <SelectorEstado q={q} disabled={ocupada} onCambiar={onEstado} />
          <button type="button" className="cz-icono cz-icono-peligro" onClick={onEliminar} disabled={ocupada} aria-label={`Eliminar «${nombre}»`} title="Eliminar">
            <IconoPapelera />
          </button>
        </span>
      </div>
    </li>
  );
}

// ─── saved-quotes panel ─────────────────────────────────────────────────────────
function SavedQuotesPanel({ onClose, onReactivate }) {
  const [quotes, setQuotes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');
  const [filter, setFilter]   = useState('todas');
  const [search, setSearch]   = useState('');
  const [agrupar, setAgrupar] = useState('estado'); // estado | cliente | fecha | valor
  const [busyId, setBusyId]   = useState(null);
  const [confirmConv, setConfirmConv] = useState(null); // cotización a convertir
  const [confirmDel, setConfirmDel]   = useState(null); // cotización a eliminar
  const [showCerradas, setShowCerradas] = useState(false); // sección "Cerradas" colapsada por defecto
  const idAgrupar = useId();

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const res = await fetch('/api/db/cotizaciones');
      if (!res.ok) throw new Error('Error al cargar');
      const json = await res.json();
      setQuotes(Array.isArray(json) ? json : (json.data || json.rows || []));
    } catch (e) {
      setErr('No se pudieron cargar las cotizaciones.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const reactivate = async (q) => {
    setBusyId(q.id);
    try {
      const res = await fetch(`/api/db/cotizaciones/${q.id}`);
      if (!res.ok) throw new Error('Error al abrir');
      const full = await res.json();
      const data = full.data || {};
      onReactivate(q.modo, data, { id: q.id, nombre: q.nombre, cliente: q.cliente, estado: q.estado, notas: full.notas || '' });
    } catch (e) {
      gToast.error('No se pudo abrir la cotización. Probá de nuevo.');
      setBusyId(null);
    }
  };

  const changeEstado = async (q, estado) => {
    setBusyId(q.id);
    try {
      const res = await fetch(`/api/db/cotizaciones/${q.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onlyEstado: true, estado }),
      });
      if (!res.ok) throw new Error('Error');
      setQuotes(qs => qs.map(x => x.id === q.id ? { ...x, estado } : x));
    } catch (e) {
      gToast.error('No se pudo cambiar el estado.');
    } finally {
      setBusyId(null);
    }
  };

  // Si ya está convertida, va directo a la operación; si no, pide confirmación.
  const convertir = (q) => {
    if (q.operation_id) { window.location.href = '/gestion/operaciones?op=' + q.operation_id; return; }
    setConfirmConv(q);
  };
  const doConvertir = async (q) => {
    setConfirmConv(null);
    setBusyId(q.id);
    try {
      const res = await fetch(`/api/db/cotizaciones/${q.id}/convertir`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'No se pudo convertir');
      gToast.success('Operación creada. Abriéndola…');
      window.location.href = '/gestion/operaciones?op=' + j.operationId;
    } catch (e) {
      gToast.error(e.message || 'No se pudo convertir');
      setBusyId(null);
    }
  };

  const remove = (q) => setConfirmDel(q);
  const doRemove = async (q) => {
    setConfirmDel(null);
    setBusyId(q.id);
    try {
      const res = await fetch(`/api/db/cotizaciones/${q.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error');
      setQuotes(qs => qs.filter(x => x.id !== q.id));
      gToast.success('Cotización eliminada.');
    } catch (e) {
      gToast.error('No se pudo eliminar.');
    } finally {
      setBusyId(null);
    }
  };

  // Búsqueda sin distinguir acentos ni mayúsculas, por nombre o cliente.
  const s = normalizar(search.trim());
  const buscadas = s
    ? quotes.filter(q => normalizar(q.nombre).includes(s) || normalizar(q.cliente).includes(s))
    : quotes;
  const visible = filter === 'todas' ? buscadas : buscadas.filter(q => q.estado === filter);
  const cuenta = (id) => (id === 'todas' ? buscadas.length : buscadas.filter(q => q.estado === id).length);

  // "Cerrada" = ya no requiere trabajo: rechazada, o aprobada ya convertida en operación.
  const isCerrada = (q) => q.estado === 'rechazada' || (q.estado === 'aprobada' && q.operation_id);
  const activas  = visible.filter(q => !isCerrada(q));
  const cerradas = visible.filter(isCerrada);
  // Si el filtro o la búsqueda apuntan a cerradas, la sección se muestra sola.
  const cerradasAbiertas = showCerradas || filter === 'rechazada' || filter === 'aprobada' || (!!s && cerradas.length > 0);

  // Agrupación / orden de la lista para poder trabajar (no todo apilado suelto).
  // Solo las ACTIVAS se agrupan acá; las cerradas van todas juntas al fondo.
  const byDateDesc = (a, b) => msDe(b) - msDe(a);
  let groups;
  if (agrupar === 'cliente') {
    const m = {};
    activas.forEach(q => { const k = ((q.cliente || '').trim()) || 'Sin cliente'; (m[k] = m[k] || []).push(q); });
    groups = Object.keys(m).sort((a, b) => a.localeCompare(b, 'es')).map(k => ({ key: k, label: k, items: m[k].sort(byDateDesc) }));
  } else if (agrupar === 'valor') {
    groups = [{ key: 'all', items: [...activas].sort((a, b) => Number(b.total_usd || 0) - Number(a.total_usd || 0)) }];
  } else if (agrupar === 'fecha') {
    groups = [{ key: 'all', items: [...activas].sort(byDateDesc) }];
  } else { // estado (default): en orden de pipeline
    groups = ESTADOS.map(e => ({ key: e.id, label: e.label, dot: e.fg, items: activas.filter(q => q.estado === e.id).sort(byDateDesc) })).filter(g => g.items.length);
  }

  // Seguimiento: cotizaciones frías y aprobadas sin convertir (sobre todas).
  const frias = quotes.filter(q => ['enviada', 'negociacion'].includes(q.estado) && diasDesde(q.updated_at || q.created_at) >= 5);
  const sinConv = quotes.filter(q => q.estado === 'aprobada' && !q.operation_id);

  const fila = (q, cerrada) => (
    <FilaCotizacion
      key={q.id}
      q={q}
      cerrada={cerrada}
      ocupada={busyId === q.id}
      onAbrir={() => reactivate(q)}
      onConvertir={() => convertir(q)}
      onEstado={(estado) => changeEstado(q, estado)}
      onEliminar={() => remove(q)}
    />
  );

  const cantidad = quotes.length;
  const sub = loading || err ? null : cantidad === 0 ? 'Todavía no hay ninguna.' : `${cantidad} ${cantidad === 1 ? 'guardada' : 'guardadas'}`;
  const hayFiltro = filter !== 'todas' || !!s;

  const fijo = (
    <>
      <div className="cz-barra">
        <div className="cz-barra-busca">
          <TextInput value={search} onChange={setSearch} placeholder="Buscar por nombre o cliente" ariaLabel="Buscar por nombre o cliente" />
        </div>
        <div className="cz-barra-lado">
          <label className="cz-rotulo" htmlFor={idAgrupar}>Ver por</label>
          <select id={idAgrupar} className="cz-select cz-select-chico" value={agrupar} onChange={e => setAgrupar(e.target.value)}>
            {AGRUPAR.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
      </div>
      <div className="cz-filtros" role="group" aria-label="Filtrar por estado">
        {[{ id: 'todas', label: 'Todas' }, ...ESTADOS].map(e => (
          <button key={e.id} type="button" className="cz-filtro" aria-pressed={filter === e.id} onClick={() => setFilter(e.id)}>
            {e.label}
            {!loading && !err ? <span className="cz-cuenta">{cuenta(e.id)}</span> : null}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <>
      <Dialogo
        lateral
        capa={1050}
        ancho={580}
        titulo="Cotizaciones guardadas"
        sub={sub}
        fijo={fijo}
        enfocar="input"
        onClose={onClose}
      >
        {loading ? <p className="cz-estado-vacio" role="status">Cargando las cotizaciones…</p> : null}

        {!loading && err ? (
          <div className="cz-estado-vacio" role="alert">
            <p className="cz-error">{err}</p>
            <button type="button" className="ct-btn-texto cz-texto-fuerte" onClick={load} style={{ marginTop: 8 }}>Reintentar</button>
          </div>
        ) : null}

        {!loading && !err && (sinConv.length > 0 || frias.length > 0) ? (
          <div className="cz-seguimiento">
            <p className="cz-seguimiento-titulo">Para hacer</p>
            <ul>
              {sinConv.slice(0, 3).map(q => (
                <li key={q.id}>
                  <strong>{q.nombre || 'Sin nombre'}</strong> está aprobada y todavía no es una operación.{' '}
                  <button type="button" className="ct-btn-texto cz-texto-fuerte cz-en-linea" onClick={() => convertir(q)} disabled={busyId === q.id}>
                    Convertir
                  </button>
                </li>
              ))}
              {frias.slice(0, 4).map(q => {
                const d = diasDesde(q.updated_at || q.created_at);
                return (
                  <li key={q.id}>
                    <strong>{q.nombre || 'Sin nombre'}</strong> lleva <span className="cz-ambar">{d} días</span> sin respuesta
                    {q.cliente ? `: escribile a ${q.cliente}.` : '.'}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {!loading && !err && cantidad === 0 ? (
          <p className="cz-estado-vacio">
            Todavía no guardaste cotizaciones. Se guardan desde el cotizador con «Guardar cotización» o con Cmd o Ctrl + S.
          </p>
        ) : null}

        {!loading && !err && cantidad > 0 && visible.length === 0 ? (
          <div className="cz-estado-vacio">
            <p style={{ margin: 0 }}>Ninguna cotización coincide{s ? ` con «${search.trim()}»` : ''}{filter !== 'todas' ? ` en «${estadoMeta(filter).label}»` : ''}.</p>
            {hayFiltro ? (
              <button type="button" className="ct-btn-texto cz-texto-fuerte" style={{ marginTop: 8 }} onClick={() => { setFilter('todas'); setSearch(''); }}>
                Ver todas
              </button>
            ) : null}
          </div>
        ) : null}

        {!loading && !err ? groups.map(g => (
          <div key={g.key} className="cz-grupo" role={g.label ? 'group' : undefined} aria-label={g.label || undefined}>
            {g.label ? (
              <h3 className="cz-grupo-titulo">
                {g.dot ? <span className="cz-punto" style={{ background: g.dot }} aria-hidden="true" /> : null}
                {g.label}
                <span className="cz-cuenta">{g.items.length}</span>
              </h3>
            ) : null}
            <ul className="cz-lista">
              {g.items.map(q => fila(q, false))}
            </ul>
          </div>
        )) : null}

        {/* Cerradas: rechazadas y aprobadas ya convertidas, al fondo y plegadas. */}
        {!loading && !err && cerradas.length > 0 ? (
          <div className="cz-cerradas">
            <Revelar label={`Cerradas · ${cerradas.length}`} abierto={cerradasAbiertas} onToggle={() => setShowCerradas(v => !v)}>
              <p className="cz-item-extra" style={{ margin: '0 0 2px' }}>Rechazadas y aprobadas que ya son una operación.</p>
              <ul className="cz-lista">
                {[...cerradas].sort(byDateDesc).map(q => fila(q, true))}
              </ul>
            </Revelar>
          </div>
        ) : null}
      </Dialogo>

      {confirmConv ? (
        <Confirmar
          titulo="¿Convertir en operación?"
          confirmar="Convertir"
          onConfirmar={() => doConvertir(confirmConv)}
          onCancelar={() => setConfirmConv(null)}
        >
          Se crea una operación con los datos de <strong>«{confirmConv.nombre}»</strong> (cliente, {confirmConv.modo === 'aereo' ? '' : 'contenedor, '}metros cúbicos, FOB y precio cotizado) y se abre para seguir cargándola.
        </Confirmar>
      ) : null}

      {confirmDel ? (
        <Confirmar
          titulo="¿Eliminar la cotización?"
          confirmar="Eliminar"
          peligro
          onConfirmar={() => doRemove(confirmDel)}
          onCancelar={() => setConfirmDel(null)}
        >
          Se borra <strong>«{confirmDel.nombre}»</strong>. No se puede deshacer.
        </Confirmar>
      ) : null}
    </>
  );
}

export { SavedQuotesPanel };
export default SavedQuotesPanel;
