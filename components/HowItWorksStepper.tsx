"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

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

  // ── Fix 2: offset ["start start", "end start"] → cuenta mientras la sección
  // ocupa pantalla, no hasta que su bottom sale por abajo del viewport.
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  // Barra de progreso
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    // ── Fix 1: 500vh para dar más recorrido de scroll
    <section ref={containerRef} className="relative h-[500vh] bg-transparent">

      {/* ── Fix 3: top exacto del header (76px) para que la sección quede
           perfectamente debajo del navbar y ocupe toda la altura disponible */}
      <div
        className="sticky flex flex-col items-center justify-center overflow-hidden px-6 md:px-12"
        style={{ top: 76, height: "calc(100vh - 76px)" }}
      >
        <div className="max-w-7xl w-full">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-extrabold text-[#040914] mb-4">
              Cómo funciona
            </h2>
            <p className="text-slate-500 text-lg">
              La operación se ordena mejor cuando cada etapa está clara desde el inicio.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {STEPS.map((step, index) => {
              const stepFraction = 1 / STEPS.length;
              const startReveal = index * stepFraction;
              // ── Fix 4: rango ampliado de 0.15 a 0.2 → transición más visible
              const fullReveal = startReveal + 0.2;

              // eslint-disable-next-line react-hooks/rules-of-hooks
              const opacity = useTransform(
                scrollYProgress,
                [startReveal, fullReveal],
                [0.08, 1]
              );
              // eslint-disable-next-line react-hooks/rules-of-hooks
              const y = useTransform(
                scrollYProgress,
                [startReveal, fullReveal],
                [50, 0]
              );

              return (
                <motion.div
                  key={step.num}
                  style={{ opacity, y }}
                  className="bg-white p-8 rounded-2xl border border-black/5 shadow-sm flex flex-col"
                >
                  <div className="w-10 h-10 rounded-full border-2 border-[#ea580c] flex items-center justify-center text-[#ea580c] font-bold mb-6 flex-shrink-0">
                    {step.num}
                  </div>
                  <h3 className="text-xl font-bold mb-4 text-[#040914]">{step.title}</h3>
                  <p className="text-slate-500 leading-relaxed text-sm flex-grow">{step.desc}</p>
                </motion.div>
              );
            })}
          </div>

          {/* Barra de progreso */}
          <div className="relative mt-20">
            <div className="absolute top-1/2 left-0 w-full h-[3px] bg-slate-100 -translate-y-1/2 rounded-full overflow-hidden">
              <motion.div
                style={{ scaleX, transformOrigin: "left" }}
                className="absolute top-0 left-0 w-full h-full bg-[#ea580c]"
              />
            </div>
            <div className="relative flex justify-between z-10 w-full">
              {STEPS.map((step) => (
                <div
                  key={step.num}
                  className="bg-[#ea580c] text-white text-xs w-7 h-7 flex items-center justify-center rounded-sm font-bold shadow-md"
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
