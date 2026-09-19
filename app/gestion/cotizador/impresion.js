// Documento imprimible de la cotización (marítimo y aéreo) y el helper numérico n.
// Módulo puro: sin React ni 'use client'. Lo usan los cotizadores, la prueba de oro
// (node scripts/cotizador-golden.mjs) y puede usarlo el servidor.
// CONGELADO: no cambies buildQuoteHTML, qCronograma, qFechasHitos, qRow, qSection ni
// LEYENDA_*; la prueba de oro compara el HTML del cliente byte a byte.

// Número de un campo del formulario: parseFloat o 0 (los campos viajan como texto).
const n = (v) => parseFloat(v) || 0;

// ─── documento imprimible de cotización ──────────────────────────────────────
// UN SOLO generador para marítimo y aéreo: A4 apaisado, dos columnas y paleta de
// marca. Todo cambio de formato aplica a los dos cotizadores a la vez — no
// duplicar plantillas (el aéreo había quedado con un formato propio).
const qFmt = (v) => '$ ' + (Math.round((parseFloat(v) || 0) * 100) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Los % vienen del estado del form y pueden ser STRING (una cotización guardada
// los restaura como texto): parsear siempre antes de formatear.
const qPct = (v) => (parseFloat(v) || 0).toFixed(1) + '%';

function qRow(label, val, opts = {}) {
  const bg = opts.highlight ? '#fff4ee' : 'transparent';
  const size = opts.bold ? '0.9' : '0.84';
  const weight = opts.bold ? 700 : opts.semibold ? 600 : 400;
  return `<tr style="background:${bg};">
    <td style="padding:7px 12px;font-size:${size}rem;font-weight:${weight};color:${opts.sub ? '#64748b' : opts.bold ? '#1e293b' : '#374151'};border-bottom:1px solid #f1f5f9;">${label}</td>
    <td style="padding:7px 12px;text-align:right;font-size:${size}rem;font-weight:${weight};color:${opts.sub ? '#64748b' : opts.bold ? '#1e293b' : '#374151'};border-bottom:1px solid #f1f5f9;">${val}</td>
  </tr>`;
}

// Sección con título acentuado; se omite entera si no tiene filas visibles.
function qSection(title, rows) {
  const filas = (rows || []).filter(Boolean).join('');
  if (!filas) return '';
  const divider = `<tr><td colspan="2" style="padding:10px 12px 5px;font-size:0.65rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #e2e8f0;"><span style="border-left:3px solid #ea580c;padding-left:8px;">${title}</span></td></tr>`;
  return `<table class="sec" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:12px;">${divider}${filas}</table>`;
}

// Fechas estimadas de los hitos, contadas desde HOY (el día que se genera la
// cotización). El arribo sale de producción + tránsito; el flete se paga 10 días
// antes de que llegue —salvo que el tránsito sea más corto que eso (aéreo), donde
// no puede caer antes del embarque.
const qDiaMas = (dias) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + dias); return d; };
const qFecha = (d) => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
function qFechasHitos(diasProd, diasTransito) {
  const prod = Math.max(0, diasProd || 0), tran = Math.max(0, diasTransito || 0);
  const dEmbarque = prod, dArribo = prod + tran;
  return {
    hoy:      qFecha(qDiaMas(0)),
    embarque: qFecha(qDiaMas(dEmbarque)),
    flete:    qFecha(qDiaMas(Math.max(dEmbarque, dArribo - 10))),
    arribo:   qFecha(qDiaMas(dArribo)),
    despacho: qFecha(qDiaMas(dArribo + 5)),   // el despacho lleva ~5 días desde el arribo
    entrega:  qFecha(qDiaMas(dArribo + 6)),   // y se entrega al día siguiente
    prod, tran,
  };
}

// Cronograma de pagos: cuándo tiene que pagar cada parte el cliente. Los momentos
// son fijos (así trabaja Transtide); el anticipo de mercadería no lleva porcentaje
// porque lo define cada proveedor (suele ser 30% o 50%).
// Los cuatro importes suman EXACTO el precio final: mercadería + (flete y seguro) +
// (aranceles, impuestos y gastos locales) + (honorarios y facturación).
function qCronograma({ c, fleteMonto, fleteLabel, sinFacturaDistinto, diasProd, diasTransito }) {
  const f = qFechasHitos(diasProd, diasTransito);
  const fch = (d) => `<strong style="color:#1e293b;">${d}</strong> · `;
  const aranceles = c.derC + c.tasC + c.ivaC + c.ivaAC + c.ganC + c.iibbC + c.gasC;
  const cierre = c.honorarios + c.gastFac;
  const hito = (titulo, detalle, monto, opts = {}) => `<tr>
    <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;">
      <div style="font-size:0.82rem;font-weight:600;color:#1e293b;">${titulo}</div>
      <div style="font-size:0.68rem;color:#64748b;margin-top:2px;line-height:1.4;">${detalle}</div>
    </td>
    <td style="padding:9px 12px;text-align:right;vertical-align:top;font-size:0.84rem;font-weight:${opts.bold ? 700 : 600};color:#1e293b;white-space:nowrap;border-bottom:1px solid #f1f5f9;">${monto}</td>
  </tr>`;
  const total = c.fobC + fleteMonto + c.segC + aranceles + cierre;
  return `<table class="sec" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:12px;width:100%;">
    <tr><td colspan="2" style="padding:10px 12px 5px;font-size:0.65rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #e2e8f0;"><span style="border-left:3px solid #ea580c;padding-left:8px;">Cronograma de pagos</span></td></tr>
    <tr><td colspan="2" style="padding:7px 12px;font-size:0.66rem;color:#64748b;border-bottom:1px solid #f1f5f9;">Fechas estimadas tomando como inicio hoy, ${f.hoy} · producción ${f.prod} días · tránsito ${f.tran} días · <strong style="color:#1e293b;">arribo estimado ${f.arribo}</strong>.</td></tr>
    ${hito('Mercadería (FOB)', `${fch(f.hoy)}Anticipo al confirmar la orden — el porcentaje lo define el proveedor (habitualmente 30% a 50%).<br>${fch(f.embarque)}Saldo con la producción terminada, antes de embarcar.`, qFmt(c.fobC))}
    ${hito(fleteLabel, `${fch(f.flete)}10 días antes del arribo de la mercadería.`, qFmt(fleteMonto + c.segC))}
    ${hito('Aranceles, impuestos y gastos locales', `${fch(f.despacho)}Durante el despacho, que lleva unos 5 días desde el arribo.`, qFmt(aranceles))}
    ${hito('Honorarios del servicio', `${fch(f.entrega)}Contra entrega, al día siguiente de terminado el despacho.`, qFmt(cierre))}
    <tr style="background:#fff4ee;">
      <td style="padding:10px 12px;font-size:0.9rem;font-weight:700;color:#1e293b;">Total</td>
      <td style="padding:10px 12px;text-align:right;font-size:0.9rem;font-weight:700;color:#1e293b;white-space:nowrap;">${qFmt(total)}</td>
    </tr>
    ${sinFacturaDistinto ? `<tr><td colspan="2" style="padding:7px 12px;font-size:0.66rem;color:#64748b;">Sin factura, el último pago es de ${qFmt(c.honorarios)} y el total queda en ${qFmt(total - c.gastFac)}.</td></tr>` : ''}
  </table>`;
}

function buildQuoteHTML({ titulo, cliente, fecha, subtitulo, descripcion, clasificacion, izq, der, precio, cronograma, footer }) {
  const cols = (arr) => (arr || []).filter(Boolean).join('');
  const chipTxt = [
    descripcion ? `<strong style="color:#9a3412;font-size:0.72rem;">Descripción:</strong> ${descripcion}` : '',
    clasificacion ? `<strong style="color:#9a3412;font-size:0.72rem;">Posición arancelaria:</strong> ${clasificacion}` : '',
    subtitulo ? `<strong style="color:#9a3412;font-size:0.72rem;">Servicio:</strong> ${subtitulo}` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  const banda = precio.unico
    ? `<tr><td style="padding:14px 20px;background:#0f172a;border-radius:10px;">
         <div style="font-size:0.65rem;font-weight:700;color:#fb923c;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Precio Final</div>
         <div style="font-size:1.5rem;font-weight:800;color:#ffffff;line-height:1;">${qFmt(precio.conFactura)}</div>
         <div style="font-size:0.7rem;color:#94a3b8;margin-top:4px;">Honorarios ${qFmt(precio.honorarios)} incluidos</div>
       </td></tr>`
    : `<tr>
         <td style="padding:14px 20px;background:#0f172a;border-radius:10px 0 0 10px;width:50%;">
           <div style="font-size:0.65rem;font-weight:700;color:#fb923c;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Precio Final CON Factura</div>
           <div style="font-size:1.5rem;font-weight:800;color:#ffffff;line-height:1;">${qFmt(precio.conFactura)}</div>
           <div style="font-size:0.7rem;color:#94a3b8;margin-top:4px;">Hon. ${qFmt(precio.honorarios)} + Gs.Fac. ${qFmt(precio.gastFac)}</div>
         </td>
         <td style="width:8px;"></td>
         <td style="padding:14px 20px;background:#ea580c;border-radius:0 10px 10px 0;width:50%;">
           <div style="font-size:0.65rem;font-weight:700;color:#ffedd5;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Precio Final SIN Factura</div>
           <div style="font-size:1.5rem;font-weight:800;color:#ffffff;line-height:1;">${qFmt(precio.sinFactura)}</div>
           <div style="font-size:0.7rem;color:#ffedd5;margin-top:4px;">Ahorro para el cliente: ${qFmt(precio.gastFac)}</div>
         </td>
       </tr>`;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>${titulo} - ${cliente || 'Cliente'}</title>
    <style>
      @page { margin: 10mm 14mm; size: A4 landscape; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; }
      .page { max-width: 1060px; margin: 0 auto; }
      table { width: 100%; border-collapse: collapse; }
      .sec { break-inside: avoid; page-break-inside: avoid; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
    <div class="page">

      <table class="sec" style="margin-bottom:12px;">
        <tr>
          <td style="width:28%;">
            <img src="/images/transtide-logo-full.png" alt="Transtide Freight" style="height:36px;width:auto;display:block;" />
            <div style="font-size:0.68rem;color:#94a3b8;margin-top:3px;">Gestión Logística &amp; Importaciones</div>
          </td>
          <td style="text-align:center;">
            <div style="display:inline-block;background:#0f172a;border-radius:8px;padding:8px 22px;">
              <span style="font-size:0.95rem;font-weight:800;color:#fff;">${titulo}</span>${cliente ? `<span style="font-size:0.85rem;color:#94a3b8;"> · <strong style="color:#fb923c;">${cliente}</strong></span>` : ''}
            </div>
          </td>
          <td style="width:16%;text-align:right;vertical-align:top;">
            <div style="font-size:0.68rem;color:#94a3b8;">Fecha de cotización</div>
            <div style="font-size:0.85rem;font-weight:600;color:#475569;">${fecha}</div>
          </td>
        </tr>
      </table>

      ${chipTxt ? `<div class="sec" style="background:#fff4ee;border:1px solid #fed7aa;border-radius:8px;padding:7px 14px;margin-bottom:12px;font-size:0.78rem;color:#1e293b;">${chipTxt}</div>` : ''}

      <table style="margin-bottom:12px;"><tr>
        <td style="width:49.5%;vertical-align:top;">${cols(izq)}</td>
        <td style="width:1%;"></td>
        <td style="width:49.5%;vertical-align:top;">${cols(der)}</td>
      </tr></table>

      <table class="sec" style="margin-bottom:10px;border-radius:10px;overflow:hidden;">${banda}</table>

      ${cronograma || ''}

      <div class="sec" style="border-top:1px solid #e2e8f0;padding-top:8px;">
        <p style="font-size:0.66rem;color:#94a3b8;line-height:1.45;">${footer}</p>
      </div>
    </div>
    </body></html>`;
}

// Leyenda legal — misma cobertura en marítimo y aéreo; el aéreo suma chargeable.
const LEYENDA_BASE = 'Los valores se calculan sobre la base de tarifas, tipo de cambio y normativa vigentes a la fecha de emisión, y el importe definitivo se confirmará al momento del despacho, pudiendo variar según: (i) el tipo de cambio oficial al momento del despacho; (ii) el flete internacional, cuya tarifa puede ajustarse hasta la fecha efectiva de embarque; (iii) actualizaciones arancelarias, impositivas o normativas; (iv) condiciones del proveedor en origen; y (v) contingencias operativas o aduaneras ajenas a Transtide, tales como asignación de canal rojo o naranja, verificaciones físicas, escaneos, almacenajes, estadías o demoras. De producirse alguna de estas variaciones, la diferencia se trasladará al costo final, con la documentación respaldatoria correspondiente. La presente cotización no constituye una oferta en firme, tiene validez de 7 días hábiles desde su emisión y comprende únicamente los conceptos aquí detallados; todo servicio no incluido se cotiza por separado.';
const LEYENDA_MAR = '* Cotización de carácter estimativo y no final, expresada en dólares estadounidenses (USD). ' + LEYENDA_BASE;
const LEYENDA_AER = '* Cotización aérea de carácter estimativo y no final, expresada en dólares estadounidenses (USD). Chargeable weight = máx(peso real, peso volumétrico). ' + LEYENDA_BASE;

export {
  n, qFmt, qPct, qRow, qSection, qDiaMas, qFecha, qFechasHitos, qCronograma,
  buildQuoteHTML, LEYENDA_BASE, LEYENDA_MAR, LEYENDA_AER,
};
