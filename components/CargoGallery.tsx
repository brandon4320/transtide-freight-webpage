"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const IMAGES = [
  { src: "/images/gallery/op1.png",  label: "Excavadora Doosan — importación de maquinaria pesada" },
  { src: "/images/gallery/op2.jpg",  label: "Minicargadoras XCMG — contenedor FCL desde China", objectPosition: "center bottom" },
  { src: "/images/gallery/op3.jpg",  label: "Insumos industriales varios — despacho y distribución" },
  { src: "/images/gallery/op4.jpg",  label: "Maquinaria para carpintería — recepción en destino" },
  { src: "/images/gallery/op5.png",  label: "Bomba de hidrolavado — entrega coordinada en planta" },
  { src: "/images/gallery/op6.png",  label: "Equipamiento de gimnasio — importación comercial" },
  { src: "/images/gallery/op7.png",  label: "Retroexcavadora y pala cargadora — flat rack desde origen" },
  { src: "/images/gallery/op8.png",  label: "Grúa de 80 toneladas — transporte especial sobredimensionado" },
  { src: "/images/gallery/op9.png",  label: "Módulos habitacionales — logística de carga voluminosa" },
  { src: "/images/gallery/op10.png", label: "Maquinaria metalúrgica — desconsolidación y entrega final" },
];

const INTERVAL = 4500;

export default function CargoGallery() {
  const [current, setCurrent] = useState(0);
  const [animating, setAnimating] = useState(false);
  const prevRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goTo = useCallback((idx: number) => {
    setCurrent(prev => {
      if (idx === prev) return prev;
      prevRef.current = prev;
      setAnimating(true);
      setTimeout(() => { prevRef.current = null; setAnimating(false); }, 600);
      return idx;
    });
  }, []);

  const next = useCallback(() => {
    setCurrent(prev => {
      const idx = (prev + 1) % IMAGES.length;
      prevRef.current = prev;
      setAnimating(true);
      setTimeout(() => { prevRef.current = null; setAnimating(false); }, 600);
      return idx;
    });
  }, []);

  const back = useCallback(() => {
    setCurrent(prev => {
      const idx = (prev - 1 + IMAGES.length) % IMAGES.length;
      prevRef.current = prev;
      setAnimating(true);
      setTimeout(() => { prevRef.current = null; setAnimating(false); }, 600);
      return idx;
    });
  }, []);

  // Auto-advance — restarts timer every time current changes
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(next, INTERVAL);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [current, next]);

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
            Maquinaria, contenedores, carga general. Cada operación coordinada de punta a punta.
          </p>
        </div>

        {/* Main carousel */}
        <div
          className="relative overflow-hidden rounded-3xl bg-slate-100"
          style={{ height: "clamp(240px, 42vw, 500px)" }}
        >
          {IMAGES.map((img, i) => (
            <div
              key={i}
              className="absolute inset-0"
              style={{
                opacity: i === current ? 1 : 0,
                zIndex: i === current ? 2 : 0,
                transition: "opacity 0.6s ease",
                pointerEvents: i === current ? "auto" : "none",
              }}
            >
              <img
                src={img.src}
                alt={img.label}
                className="h-full w-full object-cover"
                style={{ objectPosition: img.objectPosition ?? "center center" }}
                loading={i === 0 ? "eager" : "lazy"}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              <p className="absolute bottom-5 left-6 text-[12px] font-bold uppercase tracking-[0.08em] text-white/90">
                {img.label}
              </p>
              <p className="absolute bottom-5 right-6 text-[12px] font-semibold text-white/50">
                {i + 1} / {IMAGES.length}
              </p>
            </div>
          ))}

          {/* Prev / Next */}
          <button onClick={back} aria-label="Anterior"
            className="absolute left-4 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/35">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button onClick={next} aria-label="Siguiente"
            className="absolute right-4 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/35">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>

          {/* Dots */}
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
            {IMAGES.map((_, i) => (
              <button key={i} onClick={() => goTo(i)} aria-label={`Imagen ${i + 1}`}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: i === current ? "20px" : "6px",
                  background: i === current ? "#ea580c" : "rgba(255,255,255,0.45)",
                }}
              />
            ))}
          </div>

          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 right-0 z-10 h-[3px] bg-white/10">
            <div
              key={current}
              className="h-full bg-[#ea580c]"
              style={{ animation: `galleryProgress ${INTERVAL}ms linear forwards` }}
            />
          </div>
        </div>

        {/* Thumbnails — desktop */}
        <div className="mt-3 hidden gap-2 lg:flex">
          {IMAGES.map((img, i) => (
            <button key={i} onClick={() => goTo(i)}
              className="relative flex-1 overflow-hidden rounded-xl transition-all duration-300"
              style={{
                height: "68px",
                opacity: i === current ? 1 : 0.4,
                outline: i === current ? "2px solid #ea580c" : "2px solid transparent",
                outlineOffset: "2px",
              }}>
              <img src={img.src} alt={img.label}
                className="h-full w-full object-cover"
                style={{ objectPosition: img.objectPosition ?? "center center" }}
                loading="lazy" />
            </button>
          ))}
        </div>

        <p className="mt-6 text-center text-[13px] text-[#94a3b8]">
          ¿Querés que coordinemos tu próxima operación?{" "}
          <a href="#contact" className="font-semibold text-[#ea580c] hover:underline">Contactanos.</a>
        </p>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes galleryProgress {
          from { width: 0% }
          to   { width: 100% }
        }
      `}} />
    </section>
  );
}
