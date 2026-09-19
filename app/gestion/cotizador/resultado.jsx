'use client';
// ─── Resultado del cotizador (columna derecha y barra del celular) ───────────
// Un solo lugar para el precio: grande arriba, tu ganancia y tu costo debajo,
// el desglose que suma el precio y, a pedido, la rentabilidad por concepto.
// Mientras falte algo para calcular NO muestra importes: muestra qué falta.
import { useId, useState } from 'react';
import { Falta, Monto, Revelar, aNumero, fmtNum } from './ui';

const cx = (...clases) => clases.filter(Boolean).join(' ');

// Entero es-AR para la tabla de rentabilidad ('71.234'); sin dato: '—'.
const entero = (v) => {
  const num = aNumero(v);
  return num === null ? '—' : fmtNum(Math.round(num), 'dinero');
};
const conSigno = (v) => {
  const num = aNumero(v);
  if (num === null) return '—';
  const r = Math.round(num);
  return (r > 0 ? '+' : '') + fmtNum(r, 'dinero');
};
const tonoDe = (v) => {
  const num = aNumero(v);
  if (num === null) return null;
  const r = Math.round(num);
  return r > 0 ? 'ct-tono-positivo' : r < 0 ? 'ct-tono-negativo' : 'ct-tono-gris';
};
// Porcentaje con un decimal: 7,6.
const pct1 = (v) => fmtNum(Math.round(v * 10) / 10, 'pct');

function TablaRentabilidad({ filas }) {
  return (
    <div className="ct-rent">
      <table className="ct-rent-tabla">
        <thead>
          <tr>
            <th scope="col">Concepto</th>
            <th scope="col">Costo</th>
            <th scope="col">Cobro</th>
            <th scope="col">Margen</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={`${f.label}-${i}`}>
              <th scope="row">{f.label}</th>
              <td>{entero(f.costo)}</td>
              <td>{entero(f.cobro)}</td>
              <td className={cx('ct-rent-margen', tonoDe(f.margen))}>{conSigno(f.margen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ct-rent-nota">Importes en USD.</p>
    </div>
  );
}

export function PanelResultado({
  listo, falta = [], nota, titulo = 'Precio al cliente', precio, subPrecio, precioAlt = null,
  ganancia, gananciaPct, costo, costoLabel = 'Tu costo', desglose = [], rentabilidad = null,
  onVerCliente, onGuardar, verClienteLabel = 'Ver cotización al cliente', children,
  // Opcionales (Importación personal): "Ganancia neta", "sobre el costo", etc.
  gananciaLabel = 'Tu ganancia', gananciaPctLabel = 'del precio', guardarLabel = 'Guardar cotización',
}) {
  const idTitulo = useId();
  const [verRentabilidad, setVerRentabilidad] = useState(false);
  const g = aNumero(ganancia);
  const gPct = aNumero(gananciaPct);
  const c = aNumero(costo);
  const filasDesglose = Array.isArray(desglose) ? desglose : [];
  const filasRent = Array.isArray(rentabilidad) ? rentabilidad : [];

  return (
    <aside className={cx('ct-panel', !listo && 'ct-panel-falta')} aria-labelledby={idTitulo}>
      {listo ? (
        <>
          <p className="ct-panel-rotulo" id={idTitulo}>{titulo}</p>
          <p className="ct-panel-precio"><Monto valor={precio} tam="xl" /></p>
          {subPrecio ? <p className="ct-panel-sub">{subPrecio}</p> : null}
          {precioAlt ? (
            <div className="ct-panel-fila ct-panel-alt">
              <span>{precioAlt.label}</span>
              <Monto valor={precioAlt.valor} tam="sm" />
            </div>
          ) : null}
          {nota ? <p className="ct-nota">{nota}</p> : null}

          {g !== null || c !== null ? (
            <div className="ct-panel-bloque">
              {g !== null ? (
                <div className={cx('ct-panel-fila', 'ct-panel-ganancia', tonoDe(g))}>
                  <span>{gananciaLabel}</span>
                  <span className="ct-panel-fila-valor">
                    <Monto valor={g} tam="sm" />
                    {gPct !== null ? <span className="ct-panel-pct">{` · ${pct1(gPct)} % ${gananciaPctLabel}`}</span> : null}
                  </span>
                </div>
              ) : null}
              {c !== null ? (
                <div className="ct-panel-fila ct-panel-costo">
                  <span>{costoLabel}</span>
                  <Monto valor={c} tam="sm" />
                </div>
              ) : null}
            </div>
          ) : null}

          {filasDesglose.length ? (
            <dl className="ct-desglose">
              {filasDesglose.map((d, i) => {
                const v = aNumero(d.valor);
                const vacio = v === null || Math.round(v) === 0;
                return (
                  <div className="ct-desglose-fila" key={`${d.label}-${i}`}>
                    <dt>{d.label}</dt>
                    <dd>{vacio ? <span className="ct-vacio">—</span> : <Monto valor={v} tam="sm" />}</dd>
                  </div>
                );
              })}
            </dl>
          ) : null}

          {filasRent.length ? (
            <div className="ct-panel-rentabilidad">
              <Revelar label="Ver rentabilidad por concepto" abierto={verRentabilidad} onToggle={() => setVerRentabilidad((v) => !v)}>
                <TablaRentabilidad filas={filasRent} />
              </Revelar>
            </div>
          ) : null}

          {children}
        </>
      ) : (
        <>
          <p className="ct-panel-falta-titulo" id={idTitulo}>Para ver el precio falta</p>
          <Falta items={falta} />
          {nota ? <p className="ct-nota">{nota}</p> : null}
        </>
      )}

      {onVerCliente || onGuardar ? (
        <div className="ct-panel-acciones">
          {onVerCliente ? (
            <button
              type="button"
              className="ct-btn-primario ct-panel-ver"
              data-ct-atajo="ver-cliente"
              disabled={!listo}
              title="Atajo: Cmd o Ctrl + Enter"
              onClick={() => onVerCliente()}
            >
              {verClienteLabel}
            </button>
          ) : null}
          {onGuardar ? (
            <button
              type="button"
              className="ct-btn-texto ct-panel-guardar"
              data-ct-atajo="guardar"
              title="Atajo: Cmd o Ctrl + S"
              onClick={() => onGuardar()}
            >
              {guardarLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

// Barra fija abajo en pantallas de menos de 1100 px: precio y "Ver cotización".
// Sin precio (falta algo) muestra "—" y el botón queda deshabilitado.
export function BarraMovil({ label = 'Precio al cliente', precio, onVerCliente, verClienteLabel = 'Ver cotización', listo }) {
  const hayPrecio = aNumero(precio) !== null;
  const ok = listo === undefined ? hayPrecio : !!listo && hayPrecio;
  return (
    <div className="ct-barra-movil" role="region" aria-label="Resumen de la cotización">
      <div className="ct-barra-info">
        <span className="ct-barra-label">{label}</span>
        {ok ? <Monto valor={precio} tam="md" /> : <span className="ct-monto ct-monto-md ct-vacio">—</span>}
      </div>
      {onVerCliente ? (
        <button
          type="button"
          className="ct-btn-primario ct-barra-btn"
          data-ct-atajo="ver-cliente"
          disabled={!ok}
          onClick={() => onVerCliente()}
        >
          {verClienteLabel}
        </button>
      ) : null}
    </div>
  );
}
