"use client";

import { useEffect, useRef, useState } from "react";

// ─── Para agregar más imágenes: solo añadí un objeto al array IMAGES ────────
// Funciona con cualquier aspecto ratio — todas se muestran con object-cover.
const IMAGES = [
  {
    src: "https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?w=1200&q=80",
    label: "Carga FCL — Puerto de Shangai",
  },
  {
    src: "https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=1200&q=80",
    label: "Embarque aéreo",
  },
  {
    src: "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=1200&q=80",
    label: "Operación en depósito",
  },
  {
    src: "https://images.unsplash.com/photo-1501700493788-fa1a4fc9fe62?w=1200&q=80",
    label: "Puerto internacional",
  },
  {
    src: "https://images.unsplash.com/photo-1605745341112-85968b19335b?w=1200&q=80",
    label: "Logística de carga LCL",
  },
];

const INTERVAL = 4000; // ms entre slides

export default function CargoGallery() {
  const [current, setCurrent] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goTo = (idx: number) => {
    if (animating || idx === current) return;
    setPrev(current);
    setCurrent(idx);
    setAnimating(true);
    setTimeout(() => {
      setPrev(null);
      setAnimating(false);
    }, 600);
  };

  const next = () => goTo((current + 1) % IMAGES.length);
  const back = () => goTo((current - 1 + IMAGES.length) % IMAGES.length);

  // Auto-advance
  useEffect(() => {
    timerRef.current = setTimeout(next, INTERVAL);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="border-t border-black/[0.04] bg-transparent py-16 lg:py-24">
      <div className="container mx-auto px-6 md:px-10">

        {/* Header */}
        <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#ea580c]">
              Operaciones reales
            </p>
            <h2 className="text-3xl font-black leading-[1.1] tracking-[-0.02em] text-[#040914] lg:text-4xl">
              Operaciones que ya coordinamos.
            </h2>
          </div>
          <p className="max-w-[380px] text-[15px] leading-relaxed text-[#4b5563]">
            Desde contenedores completos hasta envíos aéreos urgentes. Cada operación, de punta a punta.
          </p>
        </div>

        {/* Carousel */}
        <div className="relative overflow-hidden rounded-3xl bg-slate-100" style={{ height: "clamp(260px, 45vw, 520px)" }}>

          {/* Slides */}
          {IMAGES.map((img, i) => (
            <div
              key={i}
              className="absolute inset-0 transition-opacity duration-600"
              style={{
                opacity: i === current ? 1 : 0,
                zIndex: i === current ? 2 : i === prev ? 1 : 0,
                pointerEvents: i === current ? "auto" : "none",
              }}
            >
              <img
                src={img.src}
                alt={img.label}
                className="h-full w-full object-cover"
                loading={i === 0 ? "eager" : "lazy"}
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
              {/* Label */}
              <p className="absolute bottom-5 left-6 text-[12px] font-bold uppercase tracking-[0.08em] text-white/90">
                {img.label}
              </p>
            </div>
          ))}

          {/* Prev / Next buttons */}
          <button
            onClick={back}
            className="absolute left-4 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/35"
            aria-label="Anterior"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button
            onClick={next}
            className="absolute right-4 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/35"
            aria-label="Siguiente"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>

          {/* Progress dots */}
          <div className="absolute bottom-5 right-6 z-10 flex items-center gap-1.5">
            {IMAGES.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: i === current ? "20px" : "6px",
                  background: i === current ? "#ea580c" : "rgba(255,255,255,0.5)",
                }}
                aria-label={`Ir a imagen ${i + 1}`}
              />
            ))}
          </div>

          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 right-0 z-10 h-[3px] bg-white/10">
            <div
              key={current}
              className="h-full bg-[#ea580c]"
              style={{
                animation: `progressBar ${INTERVAL}ms linear forwards`,
              }}
            />
          </div>

        </div>

        {/* Thumbnails — desktop only */}
        <div className="mt-4 hidden gap-2 lg:flex">
          {IMAGES.map((img, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="relative flex-1 overflow-hidden rounded-xl transition-all duration-300"
              style={{
                height: "72px",
                opacity: i === current ? 1 : 0.45,
                outline: i === current ? "2px solid #ea580c" : "2px solid transparent",
                outlineOffset: "2px",
              }}
            >
              <img src={img.src} alt={img.label} className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>

        <p className="mt-6 text-center text-[13px] text-[#94a3b8]">
          ¿Querés que coordinemos tu próxima operación?{" "}
          <a href="#contact" className="font-semibold text-[#ea580c] hover:underline">
            Contactanos.
          </a>
        </p>

      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .duration-600 { transition-duration: 600ms; }
        @keyframes progressBar {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}} />
    </section>
  );
}
