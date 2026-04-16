"use client";

import { useRef, useEffect, useState } from "react";

const STEPS = [
  {
    num: 1,
    title: "Definimos la operación",
    desc: "Nos contás qué querés importar, origen, volumen y tiempos esperados.",
  },
  {
    num: 2,
    title: "Evaluamos proveedor y logística",
    desc: "Ordenamos costo, riesgo comercial y mejor alternativa de embarque.",
  },
  {
    num: 3,
    title: "Coordinamos embarque y documentación",
    desc: "Seguimos la carga y cerramos la documentación para liberar sin fricción.",
  },
  {
    num: 4,
    title: "Entregamos cerrado",
    desc: "La operación llega completa: liberada, documentada y en destino.",
  },
];

export default function HowItWorksStepper() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile) return; // No sticky on mobile
    const onScroll = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const totalScroll = el.offsetHeight - window.innerHeight;
      const scrolled = -rect.top;
      setProgress(Math.min(1, Math.max(0, scrolled / totalScroll)));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [isMobile]);

  const activeIndex = Math.min(3, Math.floor(progress * 4));
  const barWidth = progress * 100;

  // ── MOBILE: layout estático, sin sticky, cards en columna ──────────────
  if (isMobile) {
    return (
      <section className="bg-transparent px-5 py-16">
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-3xl font-extrabold text-[#040914]">
            Cómo funciona
          </h2>
          <p className="text-base text-slate-500">
            La operación se ordena mejor cuando cada etapa está clara desde el inicio.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {STEPS.map((step) => (
            <div
              key={step.num}
              className="rounded-2xl border-2 border-[#ea580c] bg-white p-6 shadow-sm"
            >
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#ea580c] text-sm font-bold text-[#ea580c]">
                {step.num}
              </div>
              <h3 className="mb-2 text-[17px] font-bold text-[#040914]">{step.title}</h3>
              <p className="text-sm leading-relaxed text-slate-500">{step.desc}</p>
            </div>
          ))}
        </div>

        {/* Barra de progreso estática completa en mobile */}
        <div className="relative mt-10">
          <div className="absolute top-1/2 left-0 h-[3px] w-full -translate-y-1/2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-full bg-[#ea580c]" />
          </div>
          <div className="relative flex justify-between">
            {STEPS.map((step) => (
              <div
                key={step.num}
                className="flex h-7 w-7 items-center justify-center rounded-sm bg-[#ea580c] text-xs font-bold text-white shadow-md"
              >
                {step.num}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // ── DESKTOP: sticky scroll-driven ────────────────────────────────────────
  return (
    <section ref={containerRef} className="relative hidden bg-transparent lg:block" style={{ height: "300vh" }}>
      <div
        className="sticky flex flex-col items-center justify-center overflow-hidden px-12"
        style={{ top: 76, height: "calc(100vh - 76px)" }}
      >
        <div className="w-full max-w-7xl">
          <div className="mb-14 text-center">
            <h2 className="mb-4 text-5xl font-extrabold text-[#040914]">
              Cómo funciona
            </h2>
            <p className="text-lg text-slate-500">
              La operación se ordena mejor cuando cada etapa está clara desde el inicio.
            </p>
          </div>

          <div className="grid grid-cols-4 gap-5">
            {STEPS.map((step, index) => {
              const isActive = index === activeIndex;
              const isPast   = index < activeIndex;
              return (
                <div
                  key={step.num}
                  className="flex flex-col rounded-2xl p-8 transition-all duration-500"
                  style={{
                    background: isActive ? "#fff" : "#f9fafb",
                    border: isActive ? "2px solid #ea580c" : "2px solid #e5e7eb",
                    boxShadow: isActive ? "0 8px 32px rgba(234,88,12,0.12)" : "none",
                    opacity: isPast ? 0.5 : 1,
                  }}
                >
                  <div
                    className="mb-6 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full font-bold transition-all duration-500"
                    style={{
                      border: isActive || isPast ? "2px solid #ea580c" : "2px solid #d1d5db",
                      color: isActive || isPast ? "#ea580c" : "#9ca3af",
                    }}
                  >
                    {step.num}
                  </div>
                  <h3
                    className="mb-3 text-xl font-bold transition-colors duration-500"
                    style={{ color: isActive ? "#040914" : "#6b7280" }}
                  >
                    {step.title}
                  </h3>
                  <p
                    className="flex-grow text-sm leading-relaxed transition-colors duration-500"
                    style={{ color: isActive ? "#6b7280" : "#9ca3af" }}
                  >
                    {step.desc}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="relative mt-16">
            <div className="absolute top-1/2 left-0 h-[3px] w-full -translate-y-1/2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-[#ea580c] rounded-full transition-none"
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <div className="relative flex justify-between">
              {STEPS.map((step, index) => (
                <div
                  key={step.num}
                  className="flex h-7 w-7 items-center justify-center rounded-sm text-xs font-bold text-white shadow-md transition-all duration-300"
                  style={{ background: index <= activeIndex ? "#ea580c" : "#d1d5db" }}
                >
                  {step.num}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
