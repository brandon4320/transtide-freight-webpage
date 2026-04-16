"use client"

import { useEffect, useRef } from "react"
import Image from "next/image"
import GlobeHero from "@/components/GlobeHero"
import {
  Check,
  Globe,
  Ship,
  Truck,
  ShieldCheck,
  Clock3,
  Boxes,
  Phone,
  MapPin,
  DollarSign,
  Users,
  Building2,
  Package,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"

/* ================================================================
   DATA
================================================================ */

const HUB = { name: "Buenos Aires", lat: -34.6, lon: -58.4, align: "bottom" as const }

const DESTINATIONS = [
  { name: "Shanghai",    lat: 31.2,  lon: 121.5, align: "right"  as const, arcAlt: 0.35 },
  { name: "Shenzhen",   lat: 22.5,  lon: 114.1, align: "right"  as const, arcAlt: 0.32 },
  { name: "Guangzhou",  lat: 23.1,  lon: 113.3, align: "right"  as const, arcAlt: 0.30 },
  { name: "Tianjin",    lat: 39.1,  lon: 117.2, align: "right"  as const, arcAlt: 0.38 },
  { name: "Miami",      lat: 25.8,  lon: -80.2, align: "left"   as const, arcAlt: 0.18 },
  { name: "Rotterdam",  lat: 51.9,  lon: 4.5,   align: "top"    as const, arcAlt: 0.28 },
  { name: "Santos",     lat: -23.9, lon: -46.3, align: "right"  as const, arcAlt: 0.08 },
  { name: "Los Angeles",lat: 34.05, lon: -118.2,align: "left"   as const, arcAlt: 0.22 },
]

const ALL_CITIES = [HUB, ...DESTINATIONS]

const metrics = [
  { icon: <DollarSign className="h-5 w-5" />, value: 70,   suffix: "%", label: "De nuestros clientes reducen costos logísticos" },
  { icon: <Users className="h-5 w-5" />,      value: 50,   suffix: "+", label: "Clientes satisfechos" },
  { icon: <Building2 className="h-5 w-5" />,  value: 3,    suffix: "",  label: "Oficinas globales" },
  { icon: <Phone className="h-5 w-5" />,       value: null, suffix: "",  label: "Soporte disponible", display: "24/7" },
]

const services = [
  { icon: <Globe className="h-6 w-6" />,  title: "Comprar en origen",  description: "Buscamos, validamos y coordinamos con proveedores para reducir riesgo comercial desde el inicio." },
  { icon: <Ship className="h-6 w-6" />,   title: "Mover la carga",     description: "Definimos la mejor alternativa logística, consolidamos, embarcamos y hacemos seguimiento del tránsito." },
  { icon: <Truck className="h-6 w-6" />,  title: "Liberar y entregar", description: "Gestionamos documentación, despacho y entrega final para que la operación llegue cerrada." },
]

const processSteps = [
  { title: "Definimos la operación",               desc: "Nos contás qué querés importar, origen, volumen y tiempos esperados." },
  { title: "Evaluamos proveedor y logística",      desc: "Ordenamos costo, riesgo comercial y mejor alternativa de embarque." },
  { title: "Coordinamos embarque y documentación", desc: "Seguimos la carga y cerramos la documentación para liberar sin fricción." },
  { title: "Entregamos cerrado",                   desc: "La operación llega completa: liberada, documentada y en destino." },
]

const differentiators = [
  { icon: <ShieldCheck className="h-5 w-5" />, title: "Presencia en origen",       text: "Más control sobre proveedor, producción y carga antes de embarcar." },
  { icon: <Boxes className="h-5 w-5" />,       title: "Visión completa del costo",  text: "No trabajamos una sola parte de la operación, miramos el proceso entero." },
  { icon: <Clock3 className="h-5 w-5" />,      title: "Respuesta ágil",             text: "Menos vueltas, más claridad para decidir rápido y mover la operación." },
  { icon: <Package className="h-5 w-5" />,     title: "Seguimiento cercano",        text: "Un punto de contacto real durante cada etapa de la importación." },
]

const operationTypes = ["Carga consolidada", "Importación de maquinaria", "Carga aérea urgente", "Operación puerta a puerta"]

const offices = [
  {
    title: "Oficina Argentina",
    lines: ["Belgrano 3710", "Ing White, Bahía Blanca", "Buenos Aires, Argentina"],
    phone: "+54 9 11 4439-4020",
    phoneHref: "tel:+5491144394020",
  },
  {
    title: "Oficina Estados Unidos",
    lines: ["5605 NW 74th Ave", "Miami, FL 33166", "Estados Unidos"],
    phone: "+1 754 236-5652",
    phoneHref: "tel:+17542365652",
  },
  {
    title: "Oficina China",
    lines: ["Room 902, Jingang Building", "No. 55 Aona Road, Waigaoqiao Free Trade Zone", "Pudong New Area, Shanghai", "China"],
    phone: null,
    phoneHref: null,
  },
]

const trustItems = [
  "Oficinas en Argentina, Miami y China",
  "Coordinación integral de importaciones",
  "Seguimiento de punta a punta",
  "Atención personalizada por operación",
]

/* ================================================================
   GLOBE
================================================================ */


function AnimatedCounter({ target, suffix }: { target: number; suffix: string }) {
  const ref      = useRef<HTMLSpanElement>(null)
  const observed = useRef(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || observed.current) return
      observed.current = true
      let ts: number | null = null
      const step = (now: number) => {
        if (!ts) ts = now
        const p = Math.min((now - ts) / 2000, 1)
        const ease = 1 - Math.pow(1 - p, 4)
        el.textContent = Math.floor(ease * target).toString()
        if (p < 1) requestAnimationFrame(step); else el.textContent = target.toString()
      }
      requestAnimationFrame(step)
      obs.disconnect()
    }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [target])
  return <><span ref={ref}>0</span>{suffix}</>
}

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.style.opacity = "1"; el.style.transform = "translateY(0)"; obs.disconnect() }
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={className}
      style={{ opacity: 0, transform: "translateY(30px)", transition: `opacity 0.8s cubic-bezier(.25,.46,.45,.94) ${delay}ms, transform 0.8s cubic-bezier(.25,.46,.45,.94) ${delay}ms` }}
    >
      {children}
    </div>
  )
}

function BackToTop() {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const btn = ref.current; if (!btn) return
    const onScroll = () => {
      const show = window.scrollY > 400
      btn.style.opacity       = show ? "1" : "0"
      btn.style.pointerEvents = show ? "auto" : "none"
      btn.style.transform     = show ? "translateY(0) scale(1)" : "translateY(20px) scale(0.9)"
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  return (
    <button
      ref={ref}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Volver arriba"
      className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-[#ea580c] text-white flex items-center justify-center shadow-[0_8px_24px_rgba(234,88,12,0.3)] hover:bg-[#c2410a] hover:translate-y-[-4px] transition-all duration-300"
      style={{ opacity: 0, pointerEvents: "none", transform: "translateY(20px) scale(0.9)" }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  )
}

export default function Homepage() {
  return (
    <main className="min-h-screen bg-[#fbfbfa] text-[#0b1120] overflow-x-hidden">
      <section id="inicio" className="relative overflow-hidden border-b border-black/[0.05]">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute left-[2%] top-[26px] h-[60px] w-[60px] rounded-[10px] bg-[#1d2d5f]/[0.05]" />
          <div className="absolute left-[4.8%] top-[24px] h-[84px] w-[84px] rounded-[10px] bg-[#1d2d5f]/[0.06]" />
          <div className="absolute left-[5%] top-[68px] h-[108px] w-[108px] rounded-[10px] bg-[#1d2d5f]/[0.045]" />
          <div className="absolute left-[10%] top-[158px] h-[52px] w-[52px] rounded-[8px] bg-[#1d2d5f]/[0.04]" />

          <div className="absolute left-[28%] top-[20px] h-[58px] w-[58px] rounded-[10px] bg-[#1d2d5f]/[0.045]" />
          <div className="absolute left-[30%] top-[64px] h-[84px] w-[84px] rounded-[10px] bg-[#1d2d5f]/[0.035]" />
          <div className="absolute left-[32%] top-[116px] h-[42px] w-[42px] rounded-[8px] bg-[#1d2d5f]/[0.03]" />

          <div className="absolute right-[28%] top-[18px] h-[60px] w-[60px] rounded-[10px] bg-[#1d2d5f]/[0.04]" />
          <div className="absolute right-[24.5%] top-[32px] h-[68px] w-[68px] rounded-[10px] bg-[#1d2d5f]/[0.035]" />
          <div className="absolute right-[22.5%] top-[42px] h-[68px] w-[68px] rounded-[10px] bg-[#1d2d5f]/[0.03]" />

          <div className="absolute right-[11.5%] top-[34px] h-[84px] w-[84px] rounded-[10px] bg-[#1d2d5f]/[0.04]" />
          <div className="absolute right-[8.6%] top-[82px] h-[60px] w-[60px] rounded-[8px] bg-[#1d2d5f]/[0.032]" />

          <div className="absolute left-[10%] bottom-[142px] h-[42px] w-[42px] rounded-[8px] bg-[#1d2d5f]/[0.035]" />
          <div className="absolute left-[22%] bottom-[92px] h-[58px] w-[58px] rounded-[8px] bg-[#1d2d5f]/[0.03]" />
          <div className="absolute left-[25.2%] bottom-[68px] h-[50px] w-[50px] rounded-[8px] bg-[#1d2d5f]/[0.04]" />
          <div className="absolute right-[44%] bottom-[110px] h-[48px] w-[48px] rounded-[8px] bg-[#1d2d5f]/[0.035]" />
          <div className="absolute right-[14%] bottom-[142px] h-[60px] w-[60px] rounded-[8px] bg-[#1d2d5f]/[0.035]" />
          <div className="absolute right-[9%] bottom-[92px] h-[68px] w-[68px] rounded-[8px] bg-[#1d2d5f]/[0.03]" />
          <div className="absolute right-[6.2%] bottom-[108px] h-[52px] w-[52px] rounded-[8px] bg-[#1d2d5f]/[0.04]" />
        </div>

        <div className="container relative z-[1] mx-auto px-6 md:px-10 py-16 md:py-24 lg:py-28">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center" style={{ minHeight: "calc(100vh - 80px - 8rem)" }}>
            <div className="flex flex-col gap-6 items-start">
              <div className="text-[11px] font-semibold text-[#ea580c] uppercase tracking-[0.08em] px-[14px] py-[6px] rounded-full border border-[#fed7aa] bg-[rgba(254,215,170,0.1)]">
                Importaciones Internacionales
              </div>
              <h1 className="text-5xl md:text-6xl font-bold leading-[1.05] tracking-[-0.03em] text-[#040914]">
                Coordiná tu<br />importación con más<br />control, no con más<br />vueltas.
              </h1>
              <p className="text-base leading-relaxed text-[#4b5563] max-w-[480px]">
                Transtide coordina sourcing, embarque, despacho y entrega final con una mirada integral de la operación y un punto de contacto real.
              </p>
              <div className="flex items-center gap-6 mt-2 flex-wrap">
                <a
                  href="#contact"
                  className="inline-flex items-center gap-2 bg-[#ea580c] text-white px-7 py-[14px] rounded-lg font-semibold text-sm shadow-[0_4px_12px_rgba(234,88,12,0.25)] hover:translate-y-[-2px] hover:shadow-[0_6px_16px_rgba(234,88,12,0.35)] transition-all duration-200 relative overflow-hidden group"
                >
                  Cotizar operación
                  <ArrowRight className="h-4 w-4" />
                  <span className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-500 skew-x-12" />
                </a>
                <a href="#process" className="text-[#4b5563] font-semibold text-sm hover:text-[#040914] transition-colors">
                  Ver cómo trabajamos
                </a>
              </div>
            </div>

            <GlobeHero />
          </div>
        </div>
      </section>

      <Reveal>
        <section className="border-y border-black/[0.06] bg-white py-10">
          <div className="container mx-auto px-6 md:px-10">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-8">
              {metrics.map((m) => (
                <div key={m.label} className="flex items-center gap-4">
                  <div className="text-[48px] font-bold text-[#ea580c] tracking-[-0.04em] leading-none">
                    {m.display ? m.display : <AnimatedCounter target={m.value!} suffix={m.suffix} />}
                  </div>
                  <div className="text-[11px] font-bold text-[#1e293b] uppercase tracking-[0.05em] leading-[1.4]">
                    {m.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      <section className="border-b border-black/[0.04] bg-[#f8fafc] py-5">
        <div className="container mx-auto px-6 md:px-10">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {trustItems.map(item => (
              <div key={item} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#ea580c]" />
                <p className="text-sm text-slate-700">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="services" className="py-28">
        <div className="container mx-auto px-6 md:px-10">
          <Reveal>
            <h2 className="text-4xl font-bold text-[#040914] text-center tracking-[-0.02em] mb-4">Qué resolvemos</h2>
            <p className="text-base text-[#4b5563] text-center max-w-[600px] mx-auto mb-16 leading-relaxed">
              La logística internacional no debería depender de improvisación. Ordenamos la operación para que tengas más visibilidad y menos fricción.
            </p>
          </Reveal>
          <div className="grid lg:grid-cols-3 gap-8">
            {services.map((s, i) => (
              <Reveal key={s.title} delay={i * 100}>
                <div className="bg-white border border-black/[0.04] rounded-3xl p-12 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.05)] text-center hover:translate-y-[-8px] hover:shadow-[0_20px_48px_-12px_rgba(0,0,0,0.08)] hover:border-[rgba(234,88,12,0.15)] transition-all duration-300 cursor-default">
                  <div className="w-14 h-14 rounded-2xl bg-[rgba(234,88,12,0.08)] text-[#ea580c] inline-flex items-center justify-center mb-6">
                    {s.icon}
                  </div>
                  <h3 className="text-xl font-bold text-[#040914] mb-3">{s.title}</h3>
                  <p className="text-[15px] text-[#4b5563] leading-relaxed">{s.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="process" className="pb-28">
        <div className="container mx-auto px-6 md:px-10">
          <Reveal>
            <h2 className="text-4xl font-bold text-[#040914] text-center tracking-[-0.02em] mb-4">Cómo funciona</h2>
            <p className="text-base text-[#4b5563] text-center max-w-[600px] mx-auto mb-16 leading-relaxed">
              La operación se ordena mejor cuando cada etapa está clara desde el inicio.
            </p>
          </Reveal>
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-20 items-center">
            <Reveal>
              <div className="text-center">
                <Image
                  src="/images/ship.png"
                  alt="Cargo Ship"
                  width={480}
                  height={480}
                  className="w-full max-w-[480px] mx-auto"
                  style={{ animation: "floatShip 5s ease-in-out infinite", mixBlendMode: "darken" }}
                />
              </div>
            </Reveal>
            <div className="flex flex-col gap-8 relative">
              {processSteps.map((step, i) => (
                <Reveal key={step.title} delay={i * 100}>
                  <div className="flex gap-6 relative">
                    {i < processSteps.length - 1 && (
                      <div className="absolute left-[17px] top-10 bottom-[-32px] w-[2px] bg-[#fed7aa] z-0" />
                    )}
                    <div className="w-9 h-9 rounded-full bg-[#ea580c] text-white flex items-center justify-center font-bold text-base flex-shrink-0 relative z-[1] shadow-[0_0_0_6px_#fbfbfa]">
                      {i + 1}
                    </div>
                    <div className="mt-1">
                      <h4 className="text-[18px] font-bold text-[#040914] mb-2">{step.title}</h4>
                      <p className="text-[15px] text-[#4b5563] leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="operations" className="py-28 bg-white border-t border-black/[0.04]">
        <div className="container mx-auto px-6 md:px-10">
          <div className="grid lg:grid-cols-2 gap-20 items-start">
            <Reveal>
              <div>
                <div className="text-[11px] font-semibold text-[#ea580c] uppercase tracking-[0.08em] px-[14px] py-[6px] rounded-full border border-[#fed7aa] bg-[rgba(254,215,170,0.1)] inline-block mb-6">
                  Para operaciones reales
                </div>
                <h2 className="text-4xl font-bold text-[#040914] tracking-[-0.02em] mb-6 leading-[1.1]">
                  Menos incertidumbre en cada importación.
                </h2>
                <p className="text-base text-[#4b5563] leading-relaxed mb-10">
                  Transtide acompaña la operación completa con criterio operativo, seguimiento cercano y presencia internacional.
                </p>
                <div className="flex flex-col gap-8">
                  {differentiators.map((d) => (
                    <div key={d.title} className="flex gap-4">
                      <div className="w-6 h-6 rounded-full bg-[#ea580c] text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-[#040914] mb-1">{d.title}</h4>
                        <p className="text-[15px] text-[#4b5563] leading-relaxed">{d.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div className="bg-gradient-to-br from-[#0f172a] to-[#0b1120] rounded-3xl p-12 text-white shadow-[0_24px_48px_-12px_rgba(11,17,32,0.4)] border border-white/[0.05] hover:translate-y-[-8px] transition-transform duration-300 cursor-default">
                <p className="text-xs uppercase tracking-[0.1em] text-[#64748b] font-semibold mb-6">Operaciones que manejamos</p>
                <h3 className="text-[28px] font-bold leading-[1.2] mb-4">Coordinación integral para distintos tipos de carga.</h3>
                <p className="text-[#94a3b8] text-[15px] leading-relaxed mb-8">
                  No trabajamos una sola parte del proceso. Miramos la operación completa para que la carga llegue cerrada.
                </p>
                <div className="grid grid-cols-2 gap-4 mb-10">
                  {operationTypes.map(op => (
                    <div key={op} className="border border-white/10 rounded-xl p-4 text-[13px] font-semibold text-[#e2e8f0] bg-white/[0.02]">
                      {op}
                    </div>
                  ))}
                </div>
                <a href="#contact" className="block w-full text-center bg-[#ea580c] text-white py-4 rounded-lg font-semibold hover:bg-[#d04b06] transition-colors">
                  Solicitar una consulta
                </a>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section id="offices" className="py-20 pb-28 bg-white border-t border-black/[0.04]">
        <div className="container mx-auto px-6 md:px-10">
          <Reveal>
            <h2 className="text-4xl font-bold text-[#040914] text-center tracking-[-0.02em] mb-4">Presencia operativa</h2>
            <p className="text-base text-[#4b5563] text-center max-w-[600px] mx-auto mb-16 leading-relaxed">
              Oficinas reales, teléfonos directos y presencia internacional para operar con más respaldo.
            </p>
          </Reveal>
          <div className="grid lg:grid-cols-3 gap-8">
            {offices.map((o, i) => (
              <Reveal key={o.title} delay={i * 100}>
                <div className="bg-white border border-black/[0.04] rounded-3xl p-12 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.05)] hover:translate-y-[-8px] hover:shadow-[0_20px_48px_-12px_rgba(0,0,0,0.08)] hover:border-[rgba(234,88,12,0.15)] transition-all duration-300 cursor-default">
                  <div className="w-12 h-12 rounded-xl bg-[rgba(234,88,12,0.08)] text-[#ea580c] flex items-center justify-center mb-6">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <h4 className="text-xl font-bold text-[#040914] mb-4">{o.title}</h4>
                  <p className="text-[15px] text-[#4b5563] leading-relaxed mb-6">
                    {o.lines.map((l, j) => <span key={j}>{l}<br /></span>)}
                  </p>
                  {o.phone && o.phoneHref && (
                    <a href={o.phoneHref} className="inline-flex items-center gap-2 font-bold text-[#ea580c] text-[15px] hover:opacity-80 transition-opacity">
                      <Phone className="h-4 w-4" />
                      {o.phone}
                    </a>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="border-t border-black/[0.05] bg-[#fbfbfa] py-28">
        <div className="container mx-auto px-6 md:px-10">
          <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-12 lg:items-start">
            <Reveal>
              <div className="max-w-xl">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ea580c] mb-4">Contacto</p>
                <h2 className="text-4xl font-bold text-[#040914] tracking-[-0.02em] mb-4 leading-[1.1]">Hablemos de tu próxima importación.</h2>
                <p className="text-base text-[#4b5563] leading-relaxed mb-6">
                  Si ya tenés un producto definido o todavía estás evaluando cómo encararlo, te ayudamos a ordenar la operación desde el inicio.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row mt-8">
                  <Button asChild className="bg-[#ea580c] text-white hover:bg-[#d04b06] px-6 rounded-lg font-semibold">
                    <a href="https://wa.me/5491144394020" target="_blank" rel="noreferrer">Escribir por WhatsApp</a>
                  </Button>
                  <Button asChild variant="outline" className="border-slate-300 px-6 text-slate-900 hover:bg-slate-50">
                    <a href="#offices">Ver oficinas</a>
                  </Button>
                </div>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <form className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700">Nombre</label>
                      <input id="name" type="text" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#ea580c]" placeholder="Tu nombre" />
                    </div>
                    <div>
                      <label htmlFor="company" className="mb-2 block text-sm font-medium text-slate-700">Empresa</label>
                      <input id="company" type="text" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#ea580c]" placeholder="Tu empresa" />
                    </div>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
                      <input id="email" type="email" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#ea580c]" placeholder="tu@email.com" />
                    </div>
                    <div>
                      <label htmlFor="phone" className="mb-2 block text-sm font-medium text-slate-700">Teléfono</label>
                      <input id="phone" type="tel" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#ea580c]" placeholder="Tu teléfono" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="message" className="mb-2 block text-sm font-medium text-slate-700">¿Qué querés importar?</label>
                    <textarea id="message" rows={5} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#ea580c]" placeholder="Contanos el producto, origen, cantidad o cualquier dato que ya tengas." />
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button type="submit" className="bg-[#ea580c] px-6 text-white hover:bg-[#d04b06]">Enviar consulta</Button>
                    <Button asChild type="button" variant="outline" className="border-slate-300 px-6 text-slate-900 hover:bg-white">
                      <a href="https://wa.me/5491144394020" target="_blank" rel="noreferrer">Escribir por WhatsApp</a>
                    </Button>
                  </div>
                </form>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="container mx-auto px-6 md:px-10 py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-lg font-semibold text-[#040914]">Transtide Freight</p>
              <p className="mt-1 text-sm text-slate-600">Importaciones internacionales con control real en cada etapa.</p>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
              {[["#services","Servicios"],["#process","Cómo trabajamos"],["#operations","Operaciones"],["#offices","Oficinas"],["#contact","Contacto"]].map(([h,l]) => (
                <a key={h} href={h} className="hover:text-slate-950 transition-colors">{l}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>

      <BackToTop />

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes globeAppear {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes floatShip {
          0%   { transform: translateY(0px) rotate(0deg); }
          50%  { transform: translateY(-15px) rotate(1deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }
      `}} />
    </main>
  )
}
