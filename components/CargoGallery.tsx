"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const IMAGES = [
  { src: "/images/gallery/op1.png",  label: "Excavadora Doosan — importación de maquinaria pesada" },
  { src: "/images/gallery/op2.jpg",  label: "Minicargadoras XCMG — contenedor FCL desde China", objectPosition: "center 60%" },
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goTo = useCallback((idx: number) => {
    setCurrent(prev => idx === prev ? prev : idx);
  }, []);

  const next = useCallback(() => {
    setCurrent(prev => (prev + 1) % IMAGES.length);
  }, []);

  const back = useCallback(() => {
    setCurrent(prev => (prev - 1 + IMAGES.length) % IMAGES.length);
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(next, INTERVAL);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [current, next]);

  return (
    <section className="border-t border-black/[0.04] bg-transparent py-10 lg:py-24">
      <div className="container mx-auto px-4 md:px-10">

        {/* Header */}
        <div className="mb-6 lg:mb-10 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#ea580c]">
              Operaciones reales
            </p>
            <h2 className="text-2xl font-black leading-[1.1] tracking-[-0.02em] text-[#040914] lg:text-4xl">
              Operaciones que ya coordinamos.
            </h2>
          </div>
          <p className="hidden lg:block max-w-[380px] text-[15px] leading-relaxed text-[#4b5563]">
            Maquinaria, contenedores, carga general. Cada operación coordinada de punta a punta.
          </p>
        </div>

        {/* Main carousel */}
        <div
          className="relative overflow-hidden rounded-2xl lg:rounded-3xl bg-slate-100"
          style={{ height: "clamp(240px, 55vw, 500px)" }}
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
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

              {/* Label — only on desktop */}
              <p className="absolute bottom-8 left-4 right-16 hidden lg:block text-[12px] font-bold uppercase tracking-[0.08em] text-white/90">
                {img.label}
              </p>

              {/* Counter */}
              <p className="absolute bottom-8 right-4 lg:bottom-5 text-[11px] font-semibold text-white/60">
                {i + 1} / {IMAGES.length}
              </p>
            </div>
          ))}

          {/* Prev / Next */}
          <div onClick={back} role="button" aria-label="Anterior"
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 flex items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm cursor-pointer"
            style={{ width: 32, height: 32 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </div>
          <div onClick={next} role="button" aria-label="Siguiente"
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm cursor-pointer"
            style={{ width: 32, height: 32 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>

          {/* Dots — mobile only, centered at bottom */}
          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 lg:hidden">
            {IMAGES.map((_, i) => (
              <div key={i} onClick={() => goTo(i)} role="button" aria-label={`Imagen ${i + 1}`}
                className="rounded-full transition-all duration-300 cursor-pointer"
                style={{
                  width: i === current ? "18px" : "5px",
                  height: "6px",
                  minHeight: "unset",
                  background: i === current ? "#ea580c" : "rgba(255,255,255,0.5)",
                }}
              />
            ))}
          </div>

          {/* Dots — desktop, above label */}
          <div className="absolute bottom-4 left-6 z-10 hidden lg:flex items-center gap-1.5">
            {IMAGES.map((_, i) => (
              <div key={i} onClick={() => goTo(i)} role="button" aria-label={`Imagen ${i + 1}`}
                className="rounded-full transition-all duration-300 cursor-pointer"
                style={{
                  width: i === current ? "20px" : "6px",
                  height: "6px",
                  minHeight: "unset",
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

        {/* Label below carousel — mobile only */}
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94a3b8] lg:hidden">
          {IMAGES[current].label}
        </p>

        {/* Thumbnails — desktop only */}
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

        <p className="mt-4 text-center text-[13px] text-[#94a3b8]">
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
