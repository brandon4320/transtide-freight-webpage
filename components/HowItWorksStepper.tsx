"use client"

import { useRef, useEffect, useState } from "react"
import { motion, useScroll, useTransform } from "framer-motion"

const STEPS = [
  { num: 1, title: "Definimos la operación",               desc: "Nos contás qué querés importar, origen, volumen y tiempos esperados." },
  { num: 2, title: "Evaluamos proveedor y logística",       desc: "Ordenamos costo, riesgo comercial y mejor alternativa de embarque." },
  { num: 3, title: "Coordinamos embarque y documentación",  desc: "Seguimos la carga y cerramos la documentación para liberar sin fricción." },
  { num: 4, title: "Entregamos cerrado",                    desc: "La operación llega completa: liberada, documentada y en destino." },
]

/* ── Mobile: static layout, no JS scroll tracking ──────────────────────── */
function StepperMobile() {
  return (
    <section className="bg-transparent px-5 py-16">
      <div className="mb-12 text-center">
        <h2 className="mb-3 text-3xl font-extrabold text-[#040914]">Cómo funciona</h2>
        <p className="text-base text-slate-500">
          La operación se ordena mejor cuando cada etapa está clara desde el inicio.
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {STEPS.map((s) => (
          <div key={s.num} className="rounded-2xl border-2 border-[#ea580c] bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#ea580c] text-sm font-bold text-[#ea580c]">
              {s.num}
            </div>
            <h3 className="mb-2 text-[17px] font-bold text-[#040914]">{s.title}</h3>
            <p className="text-sm leading-relaxed text-slate-500">{s.desc}</p>
          </div>
        ))}
      </div>
      {/* Static full bar on mobile */}
      <div className="relative mt-10">
        <div className="absolute top-1/2 left-0 h-[3px] w-full -translate-y-1/2 rounded-full bg-[#ea580c]" />
        <div className="relative flex justify-between">
          {STEPS.map((s) => (
            <div key={s.num} className="flex h-7 w-7 items-center justify-center rounded-sm bg-[#ea580c] text-xs font-bold text-white shadow-md">
              {s.num}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Desktop: sticky + Framer Motion scroll-linked ──────────────────────── */
function StepperDesktop() {
  const containerRef = useRef<HTMLDivElement>(null)

  // Con 300vh y offset ["start start","end end"]:
  // progress 0 = sección entra al viewport (top de sección = top del viewport)
  // progress 1 = bottom de sección = bottom del viewport
  // El sticky ocupa 100vh, quedan 200vh de scroll "activo" = 2/3 del total
  // Los primeros ~0.33 de progreso son antes de que el sticky empiece a scrollear
  // Ajustamos los rangos para que los 4 steps se distribuyan en [0, 0.92]
  const RANGE_START = 0.0   // step 1 arranca desde el inicio
  const RANGE_END   = 0.92  // step 4 completa antes del final
  const RANGE_TOTAL = RANGE_END - RANGE_START
  const FRAC = RANGE_TOTAL / STEPS.length // ~0.23 por step

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  })

  // Bar width driven directly by scroll progress
  const scaleX = useTransform(scrollYProgress, [RANGE_START, RANGE_END], [0, 1])

  return (
    <section
      ref={containerRef}
      className="relative hidden bg-transparent lg:block"
      style={{ height: "300vh" }}
    >
      <div
        className="sticky flex flex-col items-center justify-center overflow-hidden px-12"
        style={{ top: 76, height: "calc(100vh - 76px)" }}
      >
        <div className="w-full max-w-7xl">
          <div className="mb-14 text-center">
            <h2 className="mb-4 text-5xl font-extrabold text-[#040914]">Cómo funciona</h2>
            <p className="text-lg text-slate-500">
              La operación se ordena mejor cuando cada etapa está clara desde el inicio.
            </p>
          </div>

          <div className="grid grid-cols-4 gap-5">
            {STEPS.map((step, index) => {
              const start = RANGE_START + index * FRAC
              const end   = start + FRAC * 0.75

              // useTransform writes directly to CSS — zero React re-renders on scroll
              // eslint-disable-next-line react-hooks/rules-of-hooks
              const cardOpacity = useTransform(scrollYProgress, [start, end], [0.08, 1])
              // eslint-disable-next-line react-hooks/rules-of-hooks
              const cardY       = useTransform(scrollYProgress, [start, end], [48, 0])
              // eslint-disable-next-line react-hooks/rules-of-hooks
              const borderOp    = useTransform(scrollYProgress,
                [start, Math.min(start + 0.12, end), Math.max(end - 0.04, start + 0.12), end],
                [0, 1, 1, index === 3 ? 1 : 0.25]
              )

              return (
                <div key={step.num} className="relative">
                  {/* Border overlay animates independently via motion — no re-render */}
                  <motion.div
                    style={{ opacity: borderOp }}
                    className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-[#ea580c]"
                  />
                  <motion.div
                    style={{ opacity: cardOpacity, y: cardY }}
                    className="flex h-full flex-col rounded-2xl border-2 border-transparent bg-white p-8 shadow-sm"
                  >
                    <div className="mb-6 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-[#ea580c] font-bold text-[#ea580c]">
                      {step.num}
                    </div>
                    <h3 className="mb-3 text-xl font-bold text-[#040914]">{step.title}</h3>
                    <p className="flex-grow text-sm leading-relaxed text-slate-500">{step.desc}</p>
                  </motion.div>
                </div>
              )
            })}
          </div>

          {/* Progress bar — direct CSS transform, zero re-renders */}
          <div className="relative mt-16">
            <div className="absolute top-1/2 left-0 h-[3px] w-full -translate-y-1/2 overflow-hidden rounded-full bg-slate-100">
              <motion.div
                style={{ scaleX, transformOrigin: "left" }}
                className="absolute top-0 left-0 h-full w-full bg-[#ea580c]"
              />
            </div>
            <div className="relative flex justify-between">
              {STEPS.map((step, index) => {
                // eslint-disable-next-line react-hooks/rules-of-hooks
                const dotBg = useTransform(
                  scrollYProgress,
                  [RANGE_START + index * FRAC, RANGE_START + index * FRAC + 0.01],
                  ["#d1d5db", "#ea580c"]
                )
                return (
                  <motion.div
                    key={step.num}
                    style={{ background: dotBg }}
                    className="flex h-7 w-7 items-center justify-center rounded-sm text-xs font-bold text-white shadow-md"
                  >
                    {step.num}
                  </motion.div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Public export: renders correct version based on breakpoint ─────────── */
export default function HowItWorksStepper() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)")
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  return isMobile ? <StepperMobile /> : <StepperDesktop />
}
