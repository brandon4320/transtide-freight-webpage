"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { motion, useScroll, useTransform } from "framer-motion"

const STEPS = [
  { num: 1, title: "Definimos la operación",               desc: "Nos contás qué querés importar, origen, volumen y tiempos esperados." },
  { num: 2, title: "Evaluamos proveedor y logística",       desc: "Ordenamos costo, riesgo comercial y mejor alternativa de embarque." },
  { num: 3, title: "Coordinamos embarque y documentación",  desc: "Seguimos la carga y cerramos la documentación para liberar sin fricción." },
  { num: 4, title: "Entregamos cerrado",                    desc: "La operación llega completa: liberada, documentada y en destino." },
]

/* ── Mobile: layout estático ─────────────────────────────────────────────── */
function StepperMobile() {
  return (
    <section className="bg-transparent px-5 py-16">
      <div className="mb-12 text-center">
        <h2 className="mb-3 text-3xl font-extrabold text-[#040914]">Cómo funciona</h2>
        <p className="text-base text-slate-500">La operación se ordena mejor cuando cada etapa está clara desde el inicio.</p>
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

/* ── Desktop: sticky + Framer Motion para la barra, useState para las cards ─ */
function StepperDesktop() {
  const containerRef = useRef<HTMLDivElement>(null)
  // activeIndex: cuál card está "encendida" — solo 4 valores posibles (0-3)
  // Esto se actualiza MAX 4 veces durante todo el scroll de la sección
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      // totalScroll = distancia que recorre la sección mientras el sticky está activo
      const totalScroll = el.offsetHeight - window.innerHeight
      const scrolled = Math.max(0, -rect.top)
      const progress = Math.min(1, scrolled / totalScroll)
      // Cada step ocupa exactamente 1/4 del progreso
      const idx = Math.min(3, Math.floor(progress * 4))
      setActiveIndex(idx)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // La barra naranja usa Framer Motion para animación suave sin re-renders extra
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  })
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1])

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
            <p className="text-lg text-slate-500">La operación se ordena mejor cuando cada etapa está clara desde el inicio.</p>
          </div>

          <div className="grid grid-cols-4 gap-5">
            {STEPS.map((step, index) => {
              const isActive = index === activeIndex
              const isPast   = index < activeIndex
              return (
                <div
                  key={step.num}
                  className="relative flex flex-col rounded-2xl p-8 transition-all duration-500"
                  style={{
                    background:  isActive ? "#fff" : "#f9fafb",
                    border:      isActive ? "2px solid #ea580c" : "2px solid #e5e7eb",
                    boxShadow:   isActive ? "0 8px 32px rgba(234,88,12,0.12)" : "none",
                    opacity:     isPast ? 0.45 : isActive ? 1 : 0.25,
                  }}
                >
                  <div
                    className="mb-6 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full font-bold transition-all duration-500"
                    style={{
                      border: isActive || isPast ? "2px solid #ea580c" : "2px solid #d1d5db",
                      color:  isActive || isPast ? "#ea580c"           : "#9ca3af",
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
                    style={{ color: isActive ? "#4b5563" : "#9ca3af" }}
                  >
                    {step.desc}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Barra de progreso con Framer Motion — sin re-renders por scroll */}
          <div className="relative mt-16">
            <div className="absolute top-1/2 left-0 h-[3px] w-full -translate-y-1/2 overflow-hidden rounded-full bg-slate-100">
              <motion.div
                style={{ scaleX, transformOrigin: "left" }}
                className="absolute top-0 left-0 h-full w-full bg-[#ea580c]"
              />
            </div>
            <div className="relative flex justify-between">
              {STEPS.map((step, index) => (
                <div
                  key={step.num}
                  className="flex h-7 w-7 items-center justify-center rounded-sm text-xs font-bold text-white shadow-md transition-colors duration-300"
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
  )
}

/* ── Export ──────────────────────────────────────────────────────────────── */
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
