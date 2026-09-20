'use client';
// ─── Sistema visual del cotizador ("Cotizador en tres pasos") ────────────────
// Primitivas de formulario y de lectura, sistema Transtide Flat pero legible:
// rótulos en oración (nunca mayúsculas espaciadas), campos con CAJA para que se
// vea qué está cargado, placeholders que dicen el valor por defecto, texto gris
// para lo calculado y "—" donde no hay dato (nunca "$ 0,00").
//
// Los estilos viven en cotizador.css (clases .ct-). Los importes y porcentajes
// que viajan por onChange son SIEMPRE el string canónico de JS ('53000', '2.5'):
// ver numeros.js.
import './cotizador.css';
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { aNumero, fmtNum, fmtUSD, parseNum } from './numeros';

export { aNumero, fmtNum, fmtPct, fmtUSD, parseNum } from './numeros';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const cx = (...clases) => clases.filter(Boolean).join(' ');
// Valor del estado (número o string) → canónico, para comparar sin falsos cambios.
const canonico = (v) => {
  const num = aNumero(v);
  return num === null ? '' : String(num);
};
const sinModificadores = (e) => !(e.shiftKey || e.altKey || e.metaKey || e.ctrlKey);
const componiendo = (e) => e.nativeEvent?.isComposing || e.isComposing || e.keyCode === 229;

// Un Campo le pasa a su control el id, la ayuda y el error (aria-describedby):
// así el rótulo queda asociado aunque el control no reciba id.
const CampoCtx = createContext(null);

function Chevron() {
  return (
    <svg className="ct-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M4.5 2.75 7.75 6 4.5 9.25" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Estructura ──────────────────────────────────────────────────────────────

// Paso numerado del formulario ("1 Mercadería", "2 Carga y gastos", "3 Cierre").
export function Paso({ n, titulo, ayuda, children }) {
  const idTitulo = useId();
  return (
    <div className="ct-paso" role="group" aria-labelledby={idTitulo}>
      <div className="ct-paso-cab">
        <span className="ct-paso-num" aria-hidden="true">{n}</span>
        <h3 className="ct-paso-titulo" id={idTitulo}>
          {n != null ? <span className="ct-sr">Paso {n}: </span> : null}
          {titulo}
        </h3>
      </div>
      {ayuda ? <p className="ct-paso-ayuda">{ayuda}</p> : null}
      <div className="ct-paso-cuerpo">{children}</div>
    </div>
  );
}

// Rótulo + control + ayuda (o error). Un control por Campo: si el control no
// trae id, toma el del Campo (htmlFor o uno generado).
export function Campo({ label, ayuda, error, htmlFor, children }) {
  const auto = useId();
  const id = htmlFor || auto;
  const idLabel = `${id}-rotulo`;
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const ctx = useMemo(() => ({
    id,
    idLabel: label ? idLabel : undefined,
    describedBy: error ? idError : ayuda ? idAyuda : undefined,
    invalido: !!error,
  }), [id, idLabel, idAyuda, idError, label, ayuda, error]);
  return (
    <div className={cx('ct-campo', error && 'ct-campo-error')}>
      {label ? <label className="ct-label" id={idLabel} htmlFor={id}>{label}</label> : null}
      <CampoCtx.Provider value={ctx}>{children}</CampoCtx.Provider>
      {error
        ? <p className="ct-error" id={idError}>{error}</p>
        : ayuda ? <p className="ct-ayuda" id={idAyuda}>{ayuda}</p> : null}
    </div>
  );
}

// ─── Campos con caja ─────────────────────────────────────────────────────────

// Click en el borde, el prefijo o el sufijo: el foco va al input de la caja.
function enfocarDesdeCaja(e, ref) {
  const input = ref.current;
  if (!input || e.target === input || input.disabled) return;
  e.preventDefault();
  input.focus();
}

// Importe / decimal / porcentaje. type="text" + inputMode="decimal" (nunca
// type=number: rompe el formato es-AR y la ruedita cambia montos).
// Con foco muestra lo que se tipea tal cual (sin mover el cursor) y avisa cada
// cambio ya leído; al salir se ve formateado. onChange recibe SIEMPRE el
// canónico ('' si queda vacío o no es un número).
export function NumInput({
  id, value, onChange, tipo = 'dinero', prefijo, sufijo, placeholder, grande, autoFocus,
  onEnter, ariaLabel, placeholderFuerte, disabled, className, style,
  // El Enter no se detiene acá (el Tab sí): ver useSiguienteConEnter.
  saltarConEnter,
}) {
  const ctx = useContext(CampoCtx);
  const inputRef = useRef(null);
  const [foco, setFoco] = useState(false);
  const [texto, setTexto] = useState('');
  const inicial = useRef('');                 // texto al tomar el foco
  const conFoco = useRef(false);
  const canonProp = canonico(value);
  const ultimo = useRef(canonProp);            // último canónico emitido o recibido
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Cambio que vino de afuera (no de lo que se tipeó): se adopta; si justo tiene
  // el foco, se muestra formateado para no quedar desfasado.
  useIsoLayoutEffect(() => {
    if (canonProp === ultimo.current) return;
    ultimo.current = canonProp;
    if (conFoco.current) {
      const t = fmtNum(canonProp, tipo);
      inicial.current = t;
      setTexto(t);
    }
  }, [canonProp, tipo]);

  // Texto escrito que no es un número: NO se emite ''. Vaciar el campo es una
  // orden ("cobrá tu costo", "usá el prorrateo"), así que un tipeo suelto
  // ("53k", "5000 aprox") no puede valer lo mismo: queda el valor anterior y al
  // salir del campo se vuelve a ver formateado.
  const emitir = (t) => {
    const c = parseNum(t, tipo);
    if (c === '' && String(t).trim() !== '') return;
    if (c === ultimo.current) return;
    ultimo.current = c;
    onChangeRef.current?.(c);
  };

  const alEntrar = () => {
    const t = fmtNum(value, tipo);
    inicial.current = t;
    ultimo.current = canonProp; // al entrar manda lo que tiene el estado
    conFoco.current = true;
    setTexto(t);
    setFoco(true);
  };
  const alSalir = () => {
    conFoco.current = false;
    setFoco(false);
    if (texto !== inicial.current) emitir(texto);
  };
  const alEscribir = (e) => {
    const t = e.target.value;
    setTexto(t);
    emitir(t);
  };
  const alTecla = (e) => {
    if (e.key !== 'Enter' || componiendo(e) || !sinModificadores(e)) return;
    if (texto !== inicial.current) emitir(texto);
    if (onEnter) {
      e.preventDefault();
      onEnter(e);
    }
  };

  return (
    <div
      className={cx(
        'ct-caja', 'ct-caja-num',
        grande && 'ct-caja-grande',
        placeholderFuerte && 'ct-caja-ph-fuerte',
        disabled && 'ct-caja-off',
        ctx?.invalido && 'ct-caja-error',
        className,
      )}
      style={style}
      onMouseDown={(e) => enfocarDesdeCaja(e, inputRef)}
    >
      {prefijo ? <span className="ct-caja-prefijo" aria-hidden="true">{prefijo}</span> : null}
      <input
        ref={inputRef}
        id={id || ctx?.id}
        className="ct-caja-input"
        type="text"
        inputMode="decimal"
        enterKeyHint="next"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={foco ? texto : fmtNum(value, tipo)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={ctx?.describedBy}
        aria-invalid={ctx?.invalido || undefined}
        data-ct-enter-saltar={saltarConEnter ? '' : undefined}
        onFocus={alEntrar}
        onBlur={alSalir}
        onChange={alEscribir}
        onKeyDown={alTecla}
      />
      {sufijo ? <span className="ct-caja-sufijo" aria-hidden="true">{sufijo}</span> : null}
    </div>
  );
}

// Texto libre con la misma caja. onChange recibe el string tal cual.
export function TextInput({
  id, value, onChange, placeholder, autoFocus, onEnter, ariaLabel, mono, disabled, maxLength, className, style,
}) {
  const ctx = useContext(CampoCtx);
  const inputRef = useRef(null);
  const alTecla = (e) => {
    if (e.key !== 'Enter' || componiendo(e) || !sinModificadores(e) || !onEnter) return;
    e.preventDefault();
    onEnter(e);
  };
  return (
    <div
      className={cx('ct-caja', disabled && 'ct-caja-off', ctx?.invalido && 'ct-caja-error', className)}
      style={style}
      onMouseDown={(e) => enfocarDesdeCaja(e, inputRef)}
    >
      <input
        ref={inputRef}
        id={id || ctx?.id}
        className={cx('ct-caja-input', mono && 'ct-mono')}
        type="text"
        enterKeyHint="next"
        autoComplete="off"
        value={value ?? ''}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        maxLength={maxLength}
        aria-label={ariaLabel}
        aria-describedby={ctx?.describedBy}
        aria-invalid={ctx?.invalido || undefined}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={alTecla}
      />
    </div>
  );
}

// ─── Elección ────────────────────────────────────────────────────────────────

// Control segmentado (radiogroup): flechas para moverse, un solo Tab para entrar.
// opciones: [{ id, label, disabled? }]; los id pueden ser string, número o booleano.
export function Segmentado({ opciones = [], valor, onChange, chico, ariaLabel, id }) {
  const ctx = useContext(CampoCtx);
  const refs = useRef([]);
  const habilitadas = opciones.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const actual = opciones.findIndex((o) => o.id === valor);
  const conFoco = actual >= 0 && !opciones[actual]?.disabled ? actual : habilitadas[0];

  const elegir = (i) => {
    const o = opciones[i];
    if (!o || o.disabled) return;
    if (o.id !== valor) onChange?.(o.id);
    refs.current[i]?.focus();
  };
  const alTecla = (e) => {
    if (!habilitadas.length) return;
    const pos = Math.max(0, habilitadas.indexOf(conFoco));
    let destino = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') destino = habilitadas[(pos + 1) % habilitadas.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') destino = habilitadas[(pos - 1 + habilitadas.length) % habilitadas.length];
    else if (e.key === 'Home') destino = habilitadas[0];
    else if (e.key === 'End') destino = habilitadas[habilitadas.length - 1];
    if (destino === null) return;
    e.preventDefault();
    elegir(destino);
  };

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : ctx?.idLabel}
      className={cx('ct-seg', chico && 'ct-seg-chico')}
      onKeyDown={alTecla}
    >
      {opciones.map((o, i) => {
        const activa = o.id === valor;
        return (
          <button
            key={String(o.id)}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={activa}
            tabIndex={i === conFoco ? 0 : -1}
            disabled={o.disabled}
            className={cx('ct-seg-op', activa && 'ct-seg-activa')}
            onClick={() => elegir(i)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Sí / No chico (percepciones que aplican o no). valor booleano.
export function SiNo({ valor, onChange, ariaLabel }) {
  return (
    <Segmentado
      chico
      ariaLabel={ariaLabel}
      opciones={[{ id: true, label: 'Sí' }, { id: false, label: 'No' }]}
      valor={!!valor}
      onChange={onChange}
    />
  );
}

// Controlado si viene `abierto`; si no, maneja su propio estado.
function useAbierto(abierto, onToggle) {
  const [interno, setInterno] = useState(false);
  const controlado = abierto !== undefined && abierto !== null;
  const abiertoFinal = controlado ? !!abierto : interno;
  const alternar = () => {
    if (!controlado) setInterno(!abiertoFinal);
    onToggle?.(!abiertoFinal);
  };
  return [abiertoFinal, alternar];
}

// Una fila de lectura con lo configurado y "Cambiar": los campos aparecen en el
// lugar solo cuando hacen falta ("Aranceles  Derechos 35 % · IVA 21 %  Cambiar").
export function LineaResumen({ label, resumen, abierto, onToggle, children, id }) {
  const [abiertoFinal, alternar] = useAbierto(abierto, onToggle);
  const auto = useId();
  const idCuerpo = id || `${auto}-cuerpo`;
  const cuerpoRef = useRef(null);
  const pedirFoco = useRef(false);

  // Al abrir con "Cambiar", el foco va al primer campo: se puede tipear de una.
  useEffect(() => {
    if (!abiertoFinal || !pedirFoco.current) return;
    pedirFoco.current = false;
    const el = cuerpoRef.current?.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])');
    if (!el) return;
    el.focus();
    if (el.tagName === 'INPUT') { try { el.select(); } catch { /* no todos admiten select */ } }
  }, [abiertoFinal]);

  const alClic = () => {
    pedirFoco.current = !abiertoFinal;
    alternar();
  };

  return (
    <div className={cx('ct-linea', abiertoFinal && 'ct-linea-abierta')}>
      {/* Toda la fila responde al click; el botón es el control accesible. */}
      <div className="ct-linea-fila" onClick={alClic}>
        <span className="ct-linea-label">{label}</span>
        <span className="ct-linea-resumen">{resumen}</span>
        <button type="button" className="ct-btn-texto ct-linea-btn" aria-expanded={abiertoFinal} aria-controls={idCuerpo}>
          {abiertoFinal ? 'Listo' : 'Cambiar'}
        </button>
      </div>
      <div className="ct-linea-cuerpo" id={idCuerpo} ref={cuerpoRef} hidden={!abiertoFinal}>
        {children}
      </div>
    </div>
  );
}

// Enlace de texto con chevron que muestra u oculta lo de abajo.
export function Revelar({ label, abierto, onToggle, children, id }) {
  const [abiertoFinal, alternar] = useAbierto(abierto, onToggle);
  const auto = useId();
  const idCuerpo = id || `${auto}-cuerpo`;
  return (
    <div className={cx('ct-revelar', abiertoFinal && 'ct-revelar-abierto')}>
      <button type="button" className="ct-btn-texto ct-revelar-btn" aria-expanded={abiertoFinal} aria-controls={idCuerpo} onClick={alternar}>
        <Chevron />
        {label}
      </button>
      <div className="ct-revelar-cuerpo" id={idCuerpo} hidden={!abiertoFinal}>
        {children}
      </div>
    </div>
  );
}

// ─── Combobox ────────────────────────────────────────────────────────────────

const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const compacto = (s) => s.replace(/[^a-z0-9]/g, '');

// Filtra por label y sub sin distinguir acentos ni mayúsculas; cada palabra
// tiene que aparecer. Los códigos se comparan también sin puntos
// ("84561100" encuentra "8456.11.00"). Primero las que empiezan con lo tipeado.
function filtrarOpciones(opciones, consulta, max) {
  const lista = Array.isArray(opciones) ? opciones : [];
  const q = normalizar(consulta).trim();
  if (!q) return lista.slice(0, max);
  const palabras = q.split(/\s+/).filter(Boolean);
  const primeras = [];
  const resto = [];
  for (const o of lista) {
    const label = normalizar(o.label);
    const texto = `${label} ${normalizar(o.sub)}`;
    const textoCompacto = compacto(texto);
    const coincide = palabras.every((p) => {
      if (texto.includes(p)) return true;
      const pc = compacto(p);
      return pc.length > 0 && textoCompacto.includes(pc);
    });
    if (!coincide) continue;
    (label.startsWith(palabras[0]) ? primeras : resto).push(o);
  }
  return primeras.concat(resto).slice(0, max);
}

// Texto libre con sugerencias (clientes guardados, NCM guardadas).
// Tipear avisa por onChange; elegir una opción avisa onChange(opcion.label) y
// después onElegir(opcion) (ahí se puede, por ejemplo, completar aranceles).
// Flechas mueven, Enter elige la marcada, Escape y click afuera cierran.
export function Combobox({
  id, value, onChange, opciones = [], onElegir, placeholder, vacio, autoFocus, onEnter,
  ariaLabel, mono, disabled, maxResultados = 100,
}) {
  const ctx = useContext(CampoCtx);
  const auto = useId();
  const idInput = id || ctx?.id || auto;
  const idLista = `${idInput}-opciones`;
  const raiz = useRef(null);
  const inputRef = useRef(null);
  const opcionesRef = useRef([]);
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(-1);
  // Tras elegir (o al abrir con una opción ya elegida) se muestran todas; al
  // tipear, se filtra por lo tipeado.
  const [filtrando, setFiltrando] = useState(false);
  // Lo último que se tipeó acá adentro. Sirve para distinguir "lo escribió el
  // usuario" de "el valor vino de afuera" (una guardada, un borrador): solo lo
  // tipeado se aplica solo al salir del campo.
  const tecleado = useRef(null);
  const texto = value ?? '';
  const textoNormal = normalizar(texto).trim();
  // "Es exactamente esta opción" se compara sin acentos, mayúsculas, espacios ni
  // puntos: '84561100' y '8456 11 00' son la NCM '8456.11.00'. Es la misma regla
  // con la que la lista le pone el tilde, así que lo que se ve elegido es lo que
  // se aplica al salir del campo.
  const textoClave = compacto(textoNormal);
  const mismaOpcion = (o) => !!textoClave && compacto(normalizar(o.label)) === textoClave;
  const buscarExacta = () => (Array.isArray(opciones) ? opciones : []).find(mismaOpcion) || null;
  const coincideExacta = () => !!buscarExacta();

  const resultados = useMemo(
    () => filtrarOpciones(opciones, filtrando ? texto : '', maxResultados),
    [opciones, texto, filtrando, maxResultados],
  );
  const conLista = abierto && resultados.length > 0;
  const conVacio = abierto && resultados.length === 0 && !!vacio;

  const cerrar = useCallback(() => { setAbierto(false); setActiva(-1); }, []);
  const abrir = (primera = false) => {
    if (disabled) return;
    setFiltrando(!!textoNormal && !coincideExacta());
    setActiva(primera ? 0 : -1);
    setAbierto(true);
  };
  const elegir = (o) => {
    tecleado.current = null;
    onChange?.(o.label);
    onElegir?.(o);
    setFiltrando(false);
    cerrar();
  };

  // Al salir del campo (Enter, Tab o click afuera) sin haber marcado ninguna
  // opción: si lo TIPEADO es exactamente una guardada, se aplica igual. Sin
  // esto, escribir la NCM entera dejaba los aranceles de siempre y nada avisaba.
  // Solo se aplica lo tipeado en este campo (no un valor que vino de afuera) y
  // una sola vez: después de aplicar, cambiar los aranceles a mano no se pisa.
  const aplicarTecleado = () => {
    if (!onElegir || tecleado.current === null || tecleado.current !== texto) return;
    const o = buscarExacta();
    if (o) elegir(o);
  };

  // Click o toque afuera: cierra.
  useEffect(() => {
    if (!abierto) return undefined;
    const afuera = (e) => { if (raiz.current && !raiz.current.contains(e.target)) cerrar(); };
    document.addEventListener('mousedown', afuera);
    document.addEventListener('touchstart', afuera, { passive: true });
    return () => {
      document.removeEventListener('mousedown', afuera);
      document.removeEventListener('touchstart', afuera);
    };
  }, [abierto, cerrar]);

  // La marcada siempre a la vista dentro de la lista.
  useEffect(() => {
    if (conLista && activa >= 0) opcionesRef.current[activa]?.scrollIntoView?.({ block: 'nearest' });
  }, [activa, conLista]);

  const alTecla = (e) => {
    if (componiendo(e)) return;
    const n = resultados.length;
    switch (e.key) {
      case 'ArrowDown':
        if (!sinModificadores(e)) return;
        e.preventDefault();
        if (!abierto) abrir(true);
        else if (n) setActiva((i) => (i + 1) % n);
        return;
      case 'ArrowUp':
        if (!sinModificadores(e)) return;
        e.preventDefault();
        if (!abierto) abrir();
        else if (n) setActiva((i) => (i <= 0 ? n - 1 : i - 1));
        return;
      case 'Enter':
        if (!sinModificadores(e)) return;
        if (conLista && activa >= 0 && resultados[activa]) {
          e.preventDefault(); // elegir no es "pasar al siguiente campo"
          elegir(resultados[activa]);
          return;
        }
        aplicarTecleado();
        if (abierto) cerrar();
        if (onEnter) { e.preventDefault(); onEnter(e); }
        return;
      case 'Escape':
        if (!abierto) return;
        e.preventDefault();
        e.stopPropagation(); // que no cierre también el diálogo de abajo
        cerrar();
        return;
      case 'Tab':
        aplicarTecleado();
        if (abierto) cerrar();
        return;
      default:
    }
  };

  const idOpcion = (i) => `${idLista}-${i}`;

  return (
    <div className={cx('ct-combo', conLista && 'ct-combo-abierta')} ref={raiz}>
      <div
        className={cx('ct-caja', disabled && 'ct-caja-off', ctx?.invalido && 'ct-caja-error')}
        onMouseDown={(e) => enfocarDesdeCaja(e, inputRef)}
      >
        <input
          ref={inputRef}
          id={idInput}
          className={cx('ct-caja-input', mono && 'ct-mono')}
          type="text"
          role="combobox"
          data-ct-combo=""
          aria-autocomplete="list"
          aria-expanded={conLista}
          aria-controls={idLista}
          aria-activedescendant={conLista && activa >= 0 ? idOpcion(activa) : undefined}
          aria-label={ariaLabel}
          aria-describedby={ctx?.describedBy}
          aria-invalid={ctx?.invalido || undefined}
          enterKeyHint="next"
          autoComplete="off"
          spellCheck={false}
          value={texto}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          onChange={(e) => {
            tecleado.current = e.target.value;
            onChange?.(e.target.value);
            setFiltrando(true);
            setActiva(-1);
            setAbierto(true);
          }}
          onClick={() => { if (!abierto) abrir(); }}
          onKeyDown={alTecla}
          onBlur={() => {
            // Por si el foco se fue sin click (programático): cerrar si ya no está adentro.
            // El timeout deja pasar primero el click en una opción de la lista.
            setTimeout(() => {
              if (!raiz.current || raiz.current.contains(document.activeElement)) return;
              aplicarTecleado();
              cerrar();
            }, 0);
          }}
        />
      </div>
      {conLista ? (
        <ul className="ct-combo-lista" id={idLista} role="listbox" aria-label={ariaLabel}>
          {resultados.map((o, i) => {
            const esLaActual = mismaOpcion(o);
            return (
              <li
                key={`${String(o.id ?? '')}-${i}`}
                id={idOpcion(i)}
                ref={(el) => { opcionesRef.current[i] = el; }}
                role="option"
                aria-selected={i === activa}
                className={cx('ct-combo-op', i === activa && 'ct-combo-op-activa', esLaActual && 'ct-combo-op-actual')}
                onMouseDown={(e) => e.preventDefault()} // el foco se queda en el input
                onMouseMove={() => { if (i !== activa) setActiva(i); }}
                onClick={() => elegir(o)}
              >
                <span className={cx('ct-combo-op-label', mono && 'ct-mono')}>{o.label}</span>
                {o.sub ? <span className="ct-combo-op-sub">{o.sub}</span> : null}
                {esLaActual ? (
                  <svg className="ct-combo-op-tilde" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
                    <path d="M3 7.2 5.8 10 11 4.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {conVacio ? <div className="ct-combo-vacio" role="status">{vacio}</div> : null}
    </div>
  );
}

// ─── Gastos ──────────────────────────────────────────────────────────────────

// Encabezado de la tabla de gastos (Concepto · Tu costo · Cobrás) + filas + pie.
// Usa la misma grilla que FilaGasto, así las columnas quedan alineadas.
// `intro` va ARRIBA de todo: lo que hay que decidir antes de la tabla (el
// recargo, que es lo que se cobra en las filas que queden vacías).
export function TablaGastos({ ocultarCobro, costoLabel = 'Tu costo', cobroLabel = 'Cobrás', intro, pie, children }) {
  return (
    <div className="ct-gastos">
      {intro ? <div className="ct-gastos-intro">{intro}</div> : null}
      <div className={cx('ct-gasto', 'ct-gastos-cab', ocultarCobro && 'ct-gasto-sin-cobro')} aria-hidden="true">
        <span className="ct-gasto-concepto">Concepto</span>
        <span className="ct-gasto-costo">{costoLabel}</span>
        {ocultarCobro ? null : <span className="ct-gasto-cobro">{cobroLabel}</span>}
      </div>
      {children}
      {pie ? <div className="ct-gastos-pie">{pie}</div> : null}
    </div>
  );
}

// Una fila de gasto: Concepto · Tu costo · Cobrás.
// "Tu costo" es texto gris calculado si no viene onCosto, o un campo si viene.
// "Cobrás" muestra como placeholder lo que se cobra si queda vacío: el costo, o
// `sugerido` si se cobra con recargo. Si lo cobrado queda por debajo del costo,
// avisa en ámbar (no mientras se está tipeando).
export function FilaGasto({
  id, concepto, costo, onCosto, valor, onChange, ocultarCobro, onEnter, sugerido,
  // Cuando "Tu costo" se carga a mano pero tiene un valor por defecto (el flete
  // marítimo, que sale del prorrateo del contenedor): costoPlaceholder es lo que
  // se ve en gris en la caja vacía y costoEfectivo es lo que realmente se paga,
  // que es lo que manda para el placeholder de "Cobrás" y para el aviso.
  costoPlaceholder, costoEfectivo,
  // Con los dos campos editables (el aéreo), el Enter baja al "Tu costo" de la
  // fila siguiente en vez de parar en el "Cobrás" que casi siempre queda vacío;
  // al "Cobrás" se llega con Tab.
  cobroFueraDelEnter,
}) {
  const auto = useId();
  const base = id || auto;
  const [tipeando, setTipeando] = useState(false);
  const costoNum = aNumero(costoEfectivo !== undefined ? costoEfectivo : costo);
  const phCosto = aNumero(costoPlaceholder);
  const valorNum = aNumero(valor);
  const porDefecto = aNumero(sugerido !== undefined ? sugerido : costoNum);
  const cobraMenos = !ocultarCobro && valorNum !== null && costoNum !== null && costoNum > 0
    && Math.round(valorNum * 100) < Math.round(costoNum * 100);

  return (
    <div className={cx('ct-gasto', ocultarCobro && 'ct-gasto-sin-cobro', cobraMenos && !tipeando && 'ct-gasto-alerta')}>
      <span className="ct-gasto-concepto">{concepto}</span>
      <div className="ct-gasto-costo">
        {onCosto ? (
          <NumInput
            id={`${base}-costo`}
            value={costo}
            onChange={onCosto}
            prefijo="USD"
            placeholder={phCosto ? fmtNum(phCosto, 'dinero') : ''}
            placeholderFuerte={!!phCosto}
            ariaLabel={`${concepto}: tu costo`}
          />
        ) : (
          <span className={cx('ct-gasto-costo-txt', !costoNum && 'ct-vacio')}>
            {costoNum ? fmtNum(costoNum, 'dinero') : '—'}
          </span>
        )}
      </div>
      {ocultarCobro ? null : (
        <div className="ct-gasto-cobro" onFocus={() => setTipeando(true)} onBlur={() => setTipeando(false)}>
          <NumInput
            id={id || `${base}-cobro`}
            value={valor}
            onChange={onChange}
            prefijo="USD"
            placeholder={porDefecto ? fmtNum(porDefecto, 'dinero') : ''}
            placeholderFuerte
            ariaLabel={`${concepto}: cobrás`}
            onEnter={onEnter}
            saltarConEnter={cobroFueraDelEnter}
          />
        </div>
      )}
      {cobraMenos && !tipeando ? <p className="ct-gasto-aviso">Cobrás menos que tu costo</p> : null}
    </div>
  );
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

// Lista de chequeo de lo que falta para calcular. items: [{ label, ok }].
export function Falta({ items = [] }) {
  return (
    <ul className="ct-falta">
      {items.map((it, i) => (
        <li key={`${it.label}-${i}`} className={cx('ct-falta-item', it.ok && 'ct-falta-ok')}>
          <span className="ct-falta-ico" aria-hidden="true">
            {it.ok ? (
              <svg width="18" height="18" viewBox="0 0 18 18" focusable="false">
                <circle cx="9" cy="9" r="8" fill="#059669" />
                <path d="M5.4 9.2 7.8 11.5 12.6 6.6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" focusable="false">
                <circle cx="9" cy="9" r="7.25" fill="none" stroke="#d1d5db" strokeWidth="1.5" />
              </svg>
            )}
          </span>
          <span className="ct-sr">{it.ok ? 'Listo: ' : 'Falta: '}</span>
          <span className="ct-falta-label">{it.label}</span>
        </li>
      ))}
    </ul>
  );
}

const TONOS = { positivo: 'positivo', verde: 'positivo', negativo: 'negativo', rojo: 'negativo', gris: 'gris', ambar: 'ambar' };

// Importe en USD, sin decimales por defecto. tam: 'xl' | 'md' | 'sm'.
// tono: 'positivo' | 'negativo' | 'gris' | 'ambar' | 'auto' (verde o rojo según
// el signo); sin tono hereda el color. Sin dato: '—' gris claro.
export function Monto({ valor, tam = 'md', tono, dec = 0, className }) {
  const num = aNumero(valor);
  if (num === null) return <span className={cx('ct-monto', `ct-monto-${tam}`, 'ct-vacio', className)}>—</span>;
  const redondo = Number(num.toFixed(dec));
  const t = tono === 'auto' ? (redondo > 0 ? 'positivo' : redondo < 0 ? 'negativo' : null) : TONOS[tono] || null;
  const cifra = fmtUSD(num, { dec }).slice(4); // 'USD 71.234' → '71.234'
  return (
    <span className={cx('ct-monto', `ct-monto-${tam}`, t && `ct-tono-${t}`, className)}>
      <span className="ct-monto-moneda">USD</span>
      {' '}
      <span className="ct-monto-cifra">{cifra}</span>
    </span>
  );
}

// ─── Teclado ─────────────────────────────────────────────────────────────────

const TIPOS_DE_TEXTO = new Set(['', 'text', 'search', 'email', 'tel', 'url', 'number', 'password', 'date', 'datetime-local', 'month', 'time', 'week']);

function esVisible(el) {
  if (!el || !el.isConnected || !el.getClientRects().length) return false;
  return window.getComputedStyle(el).visibility !== 'hidden';
}
function esInputDeTexto(el) {
  return el?.tagName === 'INPUT' && TIPOS_DE_TEXTO.has((el.getAttribute('type') || '').toLowerCase());
}
function esDestino(el) {
  if (el.disabled || el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  if (el.tagName === 'INPUT') {
    if (!esInputDeTexto(el) || el.readOnly || el.tabIndex < 0) return false;
  } else if (el.tagName === 'SELECT') {
    if (el.tabIndex < 0) return false;
  }
  return esVisible(el);
}

// Enter en un campo pasa al siguiente campo visible del contenedor (input,
// select o elemento con data-ct-campo). No actúa en textarea, con modificadores,
// si el campo ya manejó el Enter (preventDefault: onEnter, combobox eligiendo)
// ni en el último campo. Escucha en window para correr después de los onKeyDown
// de React.
//
// Un campo con data-ct-enter-saltar no es destino del Enter (el Tab sí llega):
// es para los campos de una fila que la mayoría de las veces se dejan vacíos,
// como el "Cobrás" del aéreo cuando solo se cargan los costos del agente.
export function useSiguienteConEnter(refContenedor) {
  useEffect(() => {
    const alTecla = (e) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
      const cont = refContenedor?.current;
      const t = e.target;
      if (!cont || !(t instanceof HTMLElement) || !cont.contains(t) || !esInputDeTexto(t)) return;
      // Un combobox ajeno con la lista abierta: el Enter es para elegir.
      if (t.getAttribute('role') === 'combobox' && t.getAttribute('aria-expanded') === 'true' && !t.hasAttribute('data-ct-combo')) return;
      const campos = Array.from(cont.querySelectorAll('input, select, [data-ct-campo]'))
        .filter((el) => el === t || (esDestino(el) && !el.hasAttribute('data-ct-enter-saltar')));
      const i = campos.indexOf(t);
      if (i < 0 || i === campos.length - 1) return;
      let destino = campos[i + 1];
      if (destino.hasAttribute('data-ct-campo') && destino.tabIndex < 0) {
        destino = destino.querySelector('input, select, button:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])') || destino;
      }
      e.preventDefault();
      destino.focus();
      if (esInputDeTexto(destino)) { try { destino.select(); } catch { /* date, etc. */ } }
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [refContenedor]);
}

// Atajos del cotizador: Cmd/Ctrl + S guarda y Cmd/Ctrl + Enter abre la
// cotización al cliente. Con un diálogo abierto no hacen nada (salvo frenar el
// "Guardar página" del navegador).
//
// Los dos cotizadores viven montados a la vez (uno oculto), así que el atajo
// actúa sobre lo que está a la vista: si hay un botón visible con
// data-ct-atajo (los de PanelResultado y BarraMovil), lo aprieta, y si está
// deshabilitado no hace nada. Si no hay botón a la vista, llama al callback
// cuando no hay ambigüedad. Para ser explícito: `activo: false` apaga los
// atajos de un cotizador oculto, o colgá la ref que devuelve el hook (o pasá
// `ref`) en la raíz del cotizador para que solo actúe cuando está visible.
const registroAtajos = new Set();
let atajosEnganchados = false;

function hayDialogoAbierto() {
  const dialogos = document.querySelectorAll('[role="dialog"][aria-modal="true"], .cz-modal');
  if (Array.from(dialogos).some(esVisible)) return true;
  // Los modales viejos no tienen role="dialog": son una capa fija que tapa toda
  // la pantalla. Si el centro de la pantalla cae en una capa así, hay un diálogo
  // (o el menú lateral, o el buscador) encima.
  let el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    if (window.getComputedStyle(el).position !== 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9) return true;
  }
  return false;
}

function alTeclaAtajos(e) {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.isComposing) return;
  const guardar = !e.shiftKey && (e.key === 's' || e.key === 'S');
  const verCliente = !e.shiftKey && e.key === 'Enter';
  if (!guardar && !verCliente) return;
  if (guardar) e.preventDefault(); // nunca el "Guardar página" del navegador
  if (e.repeat || hayDialogoAbierto()) return;
  const accion = guardar ? 'guardar' : 'ver-cliente';

  // Candidatas: encendidas y, si tienen raíz colgada, visibles.
  const candidatas = [...registroAtajos].filter((r) => {
    if (r.datos().activo === false) return false;
    const el = r.elemento();
    return !el || esVisible(el);
  });
  const aLaVista = candidatas.find((r) => r.elemento());
  const alcance = aLaVista ? aLaVista.elemento() : document;

  const boton = Array.from(alcance.querySelectorAll(`[data-ct-atajo="${accion}"]`)).find(esVisible);
  if (boton) {
    if (verCliente) e.preventDefault();
    if (!boton.disabled && boton.getAttribute('aria-disabled') !== 'true') boton.click();
    return;
  }
  const elegida = aLaVista || (candidatas.length === 1 ? candidatas[0] : null);
  const fn = elegida && (guardar ? elegida.datos().onGuardar : elegida.datos().onVerCliente);
  if (typeof fn !== 'function') return;
  if (verCliente) e.preventDefault();
  fn();
}

export function useAtajos({ onGuardar, onVerCliente, activo, ref } = {}) {
  const ultimo = useRef(null);
  ultimo.current = { onGuardar, onVerCliente, activo, ref };
  const nodo = useRef(null);
  useEffect(() => {
    const entrada = {
      datos: () => ultimo.current,
      elemento: () => ultimo.current?.ref?.current || nodo.current,
    };
    registroAtajos.add(entrada);
    if (!atajosEnganchados) {
      window.addEventListener('keydown', alTeclaAtajos);
      atajosEnganchados = true;
    }
    return () => {
      registroAtajos.delete(entrada);
      if (!registroAtajos.size && atajosEnganchados) {
        window.removeEventListener('keydown', alTeclaAtajos);
        atajosEnganchados = false;
      }
    };
  }, []);
  // Opcional: <div ref={refAtajos}> en la raíz del cotizador.
  return useCallback((el) => { nodo.current = el; }, []);
}
