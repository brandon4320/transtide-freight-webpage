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

// Cada paso ocupa 1/4 del scroll total.
// El paso N empieza a aparecer en (N-1)/4 y termina en N/4.
// Así el step 4 termina exactamente en scrollYProgress = 1,
// que ocurre justo cuando el bottom del contenedor (600vh)
// llega al top del viewport → el usuario puede seguir scrolleando.
const STEP_FRACTION = 1 / STEPS.length;

export default function HowItWorksStepper() {
  const containerRef = useRef<HTMLDivElement>(null);

  // offset ["start start", "end start"]:
  //   • empieza a contar cuando el TOP del contenedor toca el TOP del viewport
  //   • termina de contar cuando el BOTTOM del contenedor toca el TOP del viewport
  // Con 600vh de altura eso nos da 500vh de recorrido "útil" (600 - 100 viewport).
  // Durante esos 500vh el sticky se queda fijo y scrollYProgress va de 0 → 1.
  // El step 4 termina en progress = 1  →  justo cuando la sección empieza a salir.
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  // Barra naranja crece de 0 → 100% durante todo el recorrido
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    // 600vh: 100vh de viewport + 500vh de scroll activo
    <section ref={containerRef} className="relative bg-transparent" style={{ height: "600vh" }}>

      {/* Sticky: queda pegado top=76px (header) y ocupa el resto de la pantalla */}
      <div
        className="sticky flex flex-col items-center justify-center overflow-hidden px-6 md:px-12"
        style={{ top: 76, height: "calc(100vh - 76px)" }}
      >
        <div className="max-w-7xl w-full">

          {/* Título */}
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-extrabold text-[#040914] mb-4">
              Cómo funciona
            </h2>
            <p className="text-slate-500 text-lg">
              La operación se ordena mejor cuando cada etapa está clara desde el inicio.
            </p>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {STEPS.map((step, index) => {
              const start = index * STEP_FRACTION;
              const end   = start + STEP_FRACTION * 0.8; // usa 80% de la fracción para la transición

              // eslint-disable-next-line react-hooks/rules-of-hooks
              const opacity = useTransform(scrollYProgress, [start, end], [0.08, 1]);
              // eslint-disable-next-line react-hooks/rules-of-hooks
              const y       = useTransform(scrollYProgress, [start, end], [48, 0]);

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
