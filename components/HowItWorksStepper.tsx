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
  const [progress, setProgress] = useState(0); // 0 to 1

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      const rect = container.getBoundingClientRect();
      const totalScroll = container.offsetHeight - window.innerHeight;
      const scrolled = -rect.top;
      const p = Math.min(1, Math.max(0, scrolled / totalScroll));
      setProgress(p);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Which step is active: 0-3 based on progress
  // Step N is active when progress is in [N/4, (N+1)/4)
  // Step 4 (index 3) becomes active at 0.75 and stays active until 1.0
  const activeIndex = Math.min(3, Math.floor(progress * 4));

  // Bar width percentage
  const barWidth = progress * 100;

  return (
    <section
      ref={containerRef}
      className="relative bg-transparent"
      style={{ height: "300vh" }}
    >
      <div
        className="sticky flex flex-col items-center justify-center px-6 md:px-12"
        style={{ top: 76, height: "calc(100vh - 76px)" }}
      >
        <div className="max-w-7xl w-full">

          <div className="text-center mb-14">
            <h2 className="text-4xl md:text-5xl font-extrabold text-[#040914] mb-4">
              Cómo funciona
            </h2>
            <p className="text-slate-500 text-lg">
              La operación se ordena mejor cuando cada etapa está clara desde el inicio.
            </p>
          </div>

          {/* Cards — siempre 100% visibles, solo cambia el estilo del activo */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {STEPS.map((step, index) => {
              const isActive = index === activeIndex;
              const isPast   = index < activeIndex;

              return (
                <div
                  key={step.num}
                  className="rounded-2xl flex flex-col p-8 transition-all duration-500"
                  style={{
                    background: isActive ? "#fff" : "#f9fafb",
                    border: isActive
                      ? "2px solid #ea580c"
                      : "2px solid #e5e7eb",
                    boxShadow: isActive
                      ? "0 8px_32px rgba(234,88,12,0.12)"
                      : "none",
                    opacity: isPast ? 0.5 : 1,
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold mb-6 flex-shrink-0 transition-all duration-500"
                    style={{
                      border: isActive || isPast ? "2px solid #ea580c" : "2px solid #d1d5db",
                      color: isActive || isPast ? "#ea580c" : "#9ca3af",
                    }}
                  >
                    {step.num}
                  </div>
                  <h3
                    className="text-xl font-bold mb-3 transition-colors duration-500"
                    style={{ color: isActive ? "#040914" : "#6b7280" }}
                  >
                    {step.title}
                  </h3>
                  <p
                    className="leading-relaxed text-sm flex-grow transition-colors duration-500"
                    style={{ color: isActive ? "#6b7280" : "#9ca3af" }}
                  >
                    {step.desc}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Barra de progreso */}
          <div className="relative mt-16">
            <div className="absolute top-1/2 left-0 w-full h-[3px] bg-slate-100 -translate-y-1/2 rounded-full overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full bg-[#ea580c] rounded-full transition-none"
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <div className="relative flex justify-between z-10 w-full">
              {STEPS.map((step, index) => (
                <div
                  key={step.num}
                  className="text-white text-xs w-7 h-7 flex items-center justify-center rounded-sm font-bold shadow-md transition-all duration-300"
                  style={{
                    background: index <= activeIndex ? "#ea580c" : "#d1d5db",
                  }}
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
