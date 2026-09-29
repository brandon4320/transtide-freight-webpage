'use client';

// Imágenes del producto en la cotización.
//
// Se suben a R2 ya achicadas en el navegador (lado mayor 1600 px, JPEG) y la
// cotización guarda solo la clave. Para el documento que recibe el cliente se
// incrustan como datos dentro del HTML: la página de impresión dispara el
// diálogo enseguida y una imagen que todavía está bajando saldría en blanco.

import { useEffect, useRef, useState } from 'react';
import { gToast } from '../toast';

export const MAX_IMAGENES = 4;
const LADO_SUBIDA = 1600;   // lo que se guarda
const LADO_DOCUMENTO = 900; // lo que va dentro del PDF

export const urlImagen = (key) => `/api/db/cotizaciones/imagenes?key=${encodeURIComponent(key)}`;

// Achica una imagen (File, Blob o URL) a un lado máximo y la devuelve como JPEG.
function achicar(origen, ladoMax, calidad = 0.85) {
  return new Promise((resolve, reject) => {
    const url = typeof origen === 'string' ? origen : URL.createObjectURL(origen);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, ladoMax / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * escala));
      const h = Math.max(1, Math.round(img.naturalHeight * escala));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // los PNG transparentes no quedan en negro al pasar a JPEG
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      if (typeof origen !== 'string') URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve({ blob, w, h, canvas }) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', calidad);
    };
    img.onerror = () => { if (typeof origen !== 'string') URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

// Versión para el documento, cacheada por clave: si se sube y se imprime en la
// misma sesión, no se vuelve a bajar.
const cacheDocumento = new Map();
const blobADataUrl = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(fr.result);
  fr.onerror = () => reject(fr.error);
  fr.readAsDataURL(blob);
});

export async function imagenesParaDocumento(imagenes) {
  const salida = [];
  for (const im of (imagenes || []).slice(0, MAX_IMAGENES)) {
    if (!im || !im.key) continue;
    try {
      if (!cacheDocumento.has(im.key)) {
        const r = await fetch(urlImagen(im.key));
        if (!r.ok) throw new Error('no disponible');
        const original = await r.blob();
        const { blob } = await achicar(original, LADO_DOCUMENTO, 0.82);
        cacheDocumento.set(im.key, await blobADataUrl(blob));
      }
      salida.push({ src: cacheDocumento.get(im.key), leyenda: im.leyenda || '' });
    } catch { /* una imagen que no baja no frena el documento */ }
  }
  return salida;
}

// Tira de imágenes para el HTML del documento.
export function htmlImagenes(fotos) {
  if (!fotos || !fotos.length) return '';
  const esc = (t) => String(t || '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const celdas = fotos.map((f) => `
    <div style="flex:1 1 0;min-width:0;max-width:260px;border:1px solid #e2e8f0;border-radius:8px;padding:6px;background:#fff;text-align:center;">
      <img src="${f.src}" alt="${esc(f.leyenda) || 'Producto'}" style="max-width:100%;height:120px;object-fit:contain;display:block;margin:0 auto;" />
      ${f.leyenda ? `<div style="font-size:0.68rem;color:#64748b;margin-top:4px;">${esc(f.leyenda)}</div>` : ''}
    </div>`).join('');
  return `<div class="sec" style="display:flex;gap:10px;justify-content:flex-start;margin-bottom:12px;">${celdas}</div>`;
}

const TXTBTN = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 500, color: '#6b7280', fontFamily: 'inherit' };

// Bloque del formulario: miniaturas, agregar, sacar y una leyenda opcional por imagen.
// Las fotos entran de tres formas: el botón, arrastrándolas al bloque o pegándolas
// con ⌘V / Ctrl+V desde cualquier parte del cotizador (captura de pantalla,
// "Copiar imagen" de una web o de WhatsApp).
export function ImagenesProducto({ imagenes = [], onChange }) {
  const input = useRef(null);
  const raiz = useRef(null);
  const capas = useRef(0); // dragenter/dragleave se disparan por cada hijo: se cuentan
  const [subiendo, setSubiendo] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const lleno = imagenes.length >= MAX_IMAGENES;

  const agregar = async (files) => {
    const lista = Array.from(files || []).filter((f) => /^image\//.test(f.type));
    if (!lista.length) { gToast.error('Eso no es una imagen. Probá con una foto JPG, PNG o WEBP.'); return; }
    const lugar = MAX_IMAGENES - imagenes.length;
    if (lista.length > lugar) gToast.error(`Entran hasta ${MAX_IMAGENES} imágenes por cotización.`);
    const aSubir = lista.slice(0, Math.max(0, lugar));
    if (!aSubir.length) return;
    setSubiendo(aSubir.length);
    const nuevas = [];
    for (const f of aSubir) {
      try {
        const { blob, w, h, canvas } = await achicar(f, LADO_SUBIDA, 0.85);
        const fd = new FormData();
        const base = (f.name && f.name !== 'image.png' ? f.name : 'foto').replace(/\.[^.]+$/, '');
        fd.append('archivo', new File([blob], base + '.jpg', { type: 'image/jpeg' }));
        const r = await fetch('/api/db/cotizaciones/imagenes', { method: 'POST', body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.key) throw new Error(j.error || 'No se pudo subir la imagen');
        // Ya que está en memoria, se deja lista la versión para el documento.
        try {
          const escala = Math.min(1, LADO_DOCUMENTO / Math.max(w, h));
          const c2 = document.createElement('canvas');
          c2.width = Math.round(w * escala); c2.height = Math.round(h * escala);
          c2.getContext('2d').drawImage(canvas, 0, 0, c2.width, c2.height);
          cacheDocumento.set(j.key, c2.toDataURL('image/jpeg', 0.82));
        } catch {}
        nuevas.push({ key: j.key, nombre: f.name || '', leyenda: '' });
      } catch (e) {
        gToast.error(`${f.name || 'Imagen'}: ${e.message || 'no se pudo subir'}`);
      } finally {
        setSubiendo((n) => Math.max(0, n - 1));
      }
    }
    if (nuevas.length) onChange([...imagenes, ...nuevas]);
  };
  const agregarRef = useRef(agregar); agregarRef.current = agregar;

  // Pegar con ⌘V / Ctrl+V en cualquier parte del cotizador. No se mete cuando se
  // está pegando texto en un campo; y como marítimo y aéreo están montados a la
  // vez, solo responde el que está a la vista.
  useEffect(() => {
    const alPegar = (e) => {
      if (!raiz.current || raiz.current.offsetParent === null) return;
      const dt = e.clipboardData;
      if (!dt) return;
      const archivos = Array.from(dt.files || []).filter((f) => /^image\//.test(f.type));
      if (!archivos.length) return;
      const t = e.target;
      const editable = t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName || ''));
      if (editable && (dt.getData('text/plain') || '').trim()) return;
      e.preventDefault();
      agregarRef.current(archivos);
    };
    // Si una foto se suelta fuera del bloque, el navegador la abriría y se perdería
    // la pantalla: se lo impide mientras el arrastre trae archivos.
    const conArchivos = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
    const evitarSoltarAfuera = (e) => { if (conArchivos(e)) e.preventDefault(); };
    document.addEventListener('paste', alPegar);
    window.addEventListener('dragover', evitarSoltarAfuera);
    window.addEventListener('drop', evitarSoltarAfuera);
    return () => {
      document.removeEventListener('paste', alPegar);
      window.removeEventListener('dragover', evitarSoltarAfuera);
      window.removeEventListener('drop', evitarSoltarAfuera);
    };
  }, []);

  const traeArchivos = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  const zona = {
    onDragEnter: (e) => { if (!traeArchivos(e)) return; e.preventDefault(); capas.current += 1; setArrastrando(true); },
    onDragOver: (e) => { if (!traeArchivos(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; },
    onDragLeave: (e) => { if (!traeArchivos(e)) return; capas.current = Math.max(0, capas.current - 1); if (!capas.current) setArrastrando(false); },
    onDrop: (e) => {
      if (!traeArchivos(e)) return;
      e.preventDefault(); capas.current = 0; setArrastrando(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length) agregar(e.dataTransfer.files);
      else gToast.error('Arrastrá el archivo de la foto desde el escritorio o una carpeta.');
    },
  };

  const sacar = (key) => onChange(imagenes.filter((im) => im.key !== key));
  const leyenda = (key, texto) => onChange(imagenes.map((im) => (im.key === key ? { ...im, leyenda: texto } : im)));
  const abrir = () => { if (!lleno && !subiendo) input.current?.click(); };

  const bordeZona = arrastrando ? '1.5px dashed #111827' : '1.5px dashed #d1d5db';
  const fondoZona = arrastrando ? '#f3f4f6' : '#fafafa';

  return (
    <div ref={raiz} {...zona} style={{ marginTop: '0.35rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.45rem' }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 500, color: '#9ca3af' }}>Imágenes del producto</span>
        {subiendo > 0 && <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>Subiendo {subiendo}…</span>}
        <span style={{ fontSize: '0.64rem', color: '#c4c9d4', marginLeft: 'auto' }}>Salen en la cotización al cliente · hasta {MAX_IMAGENES}</span>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
          onChange={(e) => { agregar(e.target.files); e.target.value = ''; }} />
      </div>

      {imagenes.length === 0 ? (
        <div role="button" tabIndex={0} onClick={abrir} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } }}
          style={{ border: bordeZona, background: fondoZona, borderRadius: 8, padding: '0.85rem 0.75rem', textAlign: 'center', cursor: 'pointer', transition: 'background .12s, border-color .12s' }}>
          <p style={{ fontSize: '0.76rem', color: arrastrando ? '#111827' : '#6b7280', fontWeight: arrastrando ? 600 : 400 }}>
            {arrastrando ? 'Soltá las imágenes acá' : 'Arrastrá fotos acá, pegalas con ⌘V / Ctrl+V o tocá para elegirlas'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${MAX_IMAGENES}, minmax(0, 1fr))`, gap: '0.5rem', borderRadius: 8, outline: arrastrando ? '1.5px dashed #111827' : 'none', outlineOffset: 3 }}>
          {imagenes.map((im) => (
            <div key={im.key} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 4, position: 'relative', background: '#fff' }}>
              <img src={urlImagen(im.key)} alt={im.leyenda || im.nombre || 'Producto'} style={{ width: '100%', height: 84, objectFit: 'contain', display: 'block' }} />
              <button type="button" onClick={() => sacar(im.key)} aria-label="Sacar imagen" title="Sacar imagen"
                style={{ position: 'absolute', top: 2, right: 4, border: 'none', background: 'rgba(255,255,255,0.9)', borderRadius: 4, cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1, color: '#6b7280', padding: '0 4px' }}>×</button>
              <input value={im.leyenda || ''} onChange={(e) => leyenda(im.key, e.target.value)} placeholder="Leyenda (opcional)"
                style={{ width: '100%', border: 'none', borderTop: '1px solid #f1f5f9', outline: 'none', fontSize: '0.68rem', color: '#374151', padding: '4px 2px 0', background: 'transparent', fontFamily: 'inherit' }} />
            </div>
          ))}
          {!lleno && (
            <div role="button" tabIndex={0} onClick={abrir} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } }}
              title="Agregar: tocá, arrastrá o pegá con ⌘V / Ctrl+V"
              style={{ border: bordeZona, background: fondoZona, borderRadius: 8, minHeight: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', cursor: 'pointer', padding: 6 }}>
              <span style={{ fontSize: '0.7rem', color: '#6b7280', lineHeight: 1.35, whiteSpace: 'pre-line' }}>{arrastrando ? 'Soltá acá' : '+ Agregar\narrastrá o ⌘V'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ImagenesProducto;
