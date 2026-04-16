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

const metrics = [
  { icon: <DollarSign className="h-5 w-5" />, value: 70, suffix: "%", label: "De nuestros clientes reducen costos logísticos" },
  { icon: <Users className="h-5 w-5" />, value: 50, suffix: "+", label: "Clientes satisfechos" },
  { icon: <Building2 className="h-5 w-5" />, value: 3, suffix: "", label: "Oficinas globales" },
  { icon: <Phone className="h-5 w-5" />, value: null, suffix: "", label: "Soporte disponible", display: "24/7" },
]

const services = [
  { icon: <Globe className="h-6 w-6" />, title: "Comprar en origen", description: "Buscamos, validamos y coordinamos con proveedores para reducir riesgo comercial desde el inicio." },
  { icon: <Ship className="h-6 w-6" />, title: "Mover la carga", description: "Definimos la mejor alternativa logística, consolidamos, embarcamos y hacemos seguimiento del tránsito." },
  { icon: <Truck className="h-6 w-6" />, title: "Liberar y entregar", description: "Gestionamos documentación, despacho y entrega final para que la operación llegue cerrada." },
]

const processSteps = [
  { title: "Definimos la operación", desc: "Nos contás qué querés importar, origen, volumen y tiempos esperados." },
  { title: "Evaluamos proveedor y logística", desc: "Ordenamos costo, riesgo comercial y mejor alternativa de embarque." },
  { title: "Coordinamos embarque y documentación", desc: "Seguimos la carga y cerramos la documentación para liberar sin fricción." },
  { title: "Entregamos cerrado", desc: "La operación llega completa: liberada, documentada y en destino." },
]

const differentiators = [
  { icon: <ShieldCheck className="h-5 w-5" />, title: "Presencia en origen", text: "Más control sobre proveedor, producción y carga antes de embarcar." },
  { icon: <Boxes className="h-5 w-5" />, title: "Visión completa del costo", text: "No trabajamos una sola parte de la operación, miramos el proceso entero." },
  { icon: <Clock3 className="h-5 w-5" />, title: "Respuesta ágil", text: "Menos vueltas, más claridad para decidir rápido y mover la operación." },
  { icon: <Package className="h-5 w-5" />, title: "Seguimiento cercano", text: "Un punto de contacto real durante cada etapa de la importación." },
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

function AnimatedCounter({ target, suffix }: { target: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const observed = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || observed.current) return
      observed.current = true
      let ts: number | null = null
      const step = (now: number) => {
        if (!ts) ts = now
        const p = Math.min((now - ts) / 2000, 1)
        const ease = 1 - Math.pow(1 - p, 4)
        el.textContent = Math.floor(ease * target).toString()
        if (p < 1) requestAnimationFrame(step)
        else el.textContent = target.toString()
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
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        el.style.opacity = "1"
        el.style.transform = "translateY(0)"
        obs.disconnect()
      }
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
    const btn = ref.current
    if (!btn) return
    const onScroll = () => {
      const show = window.scrollY > 400
      btn.style.opacity = show ? "1" : "0"
      btn.style.pointerEvents = show ? "auto" : "none"
      btn.style.transform = show ? "translateY(0) scale(1)" : "translateY(20px) scale(0.9)"
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  return (
    <button
      ref={ref}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Volver arriba"
      className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#ea580c] text-white shadow-[0_8px_24px_rgba(234,88,12,0.3)] transition-all duration-300 hover:translate-y-[-4px] hover:bg-[#c2410a]"
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
    <>
      <div className="bg-squares" aria-hidden="true">
        <span className="sq sq-1" />
        <span className="sq sq-2" />
        <span className="sq sq-3" />
        <span className="sq sq-4" />
        <span className="sq sq-5" />
        <span className="sq sq-6" />
        <span className="sq sq-7" />
        <span className="sq sq-8" />
        <span className="sq sq-9" />
        <span className="sq sq-10" />
        <span className="sq sq-11" />
        <span className="sq sq-12" />
        <span className="sq sq-13" />
        <span className="sq sq-14" />
        <span className="sq sq-15" />
        <span className="sq sq-16" />
        <span className="sq sq-17" />
      </div>

      <main className="relative z-[1] min-h-screen overflow-x-hidden bg-transparent text-[#0b1120]">
        <section id="inicio" className="relative border-b border-black/[0.05]">
          {/* 5 — espaciado simétrico arriba y abajo */}
          <div className="container relative z-[1] mx-auto px-6 md:px-10" style={{ paddingTop: "clamp(2rem, 4vh, 3rem)", paddingBottom: "clamp(2rem, 4vh, 3rem)" }}>
            {/* 4 — alineación vertical perfecta entre texto y globo */}
            <div className="grid gap-16 lg:grid-cols-[1fr_1fr] lg:items-center" style={{ minHeight: "calc(100vh - 76px)" }}>

              {/* Columna izquierda */}
              <div className="flex flex-col items-start gap-5">
                <div className="rounded-full border border-[#fed7aa] bg-[rgba(254,215,170,0.1)] px-[14px] py-[6px] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#ea580c]">
                  Importaciones Internacionales
                </div>

                {/* 3 — tipografía más pesada, mayor tamaño, mejor interlineado */}
                <h1 className="text-[clamp(2.8rem,5.5vw,4rem)] font-black leading-[1.08] tracking-[-0.04em] text-[#040914]">
                  Coordiná tu importación con más control, no con más vueltas.
                </h1>

                {/* 6 — subtítulo más corto y directo */}
                <p className="max-w-[420px] text-[1.05rem] leading-relaxed text-[#4b5563]">
                  Sourcing, embarque, despacho y entrega. Un solo punto de contacto, visión completa de la operación.
                </p>

                {/* 7 — botones más juntos y alineados */}
                <div className="mt-1 flex items-center gap-4">
                  <a
                    href="#contact"
                    className="relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-[#ea580c] px-6 py-[13px] text-sm font-semibold text-white shadow-[0_4px_12px_rgba(234,88,12,0.25)] transition-all duration-200 hover:translate-y-[-2px] hover:shadow-[0_6px_16px_rgba(234,88,12,0.35)]"
                  >
                    Cotizar operación
                    <ArrowRight className="h-4 w-4" />
                    <span className="btn-shine" />
                  </a>
                  <a href="#process" className="text-sm font-semibold text-[#4b5563] transition-colors hover:text-[#040914]">
                    Ver cómo trabajamos
                  </a>
                </div>
              </div>

              {/* 1 — globo sin fondo, flota sobre la página */}
              <div className="flex items-center justify-center">
                <div className="w-full max-w-[560px]">
                  <GlobeHero />
                </div>
              </div>

            </div>
          </div>
        </section>

        <Reveal>
          <section className="border-y border-black/[0.06] bg-transparent py-10">
            <div className="container mx-auto px-6 md:px-10">
              <div className="grid grid-cols-2 gap-8 xl:grid-cols-4">
                {metrics.map((m) => (
                  <div key={m.label} className="flex items-center gap-4">
                    <div className="text-[48px] font-bold leading-none tracking-[-0.04em] text-[#ea580c]">
                      {m.display ? m.display : <AnimatedCounter target={m.value!} suffix={m.suffix} />}
                    </div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.05em] leading-[1.4] text-[#1e293b]">
                      {m.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </Reveal>

        <section className="border-b border-black/[0.04] bg-transparent py-5">
          <div className="container mx-auto px-6 md:px-10">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {trustItems.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/75 px-4 py-4 backdrop-blur-[2px]">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#ea580c]" />
                  <p className="text-sm text-slate-700">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="services" className="bg-transparent py-28">
          <div className="container mx-auto px-6 md:px-10">
            <Reveal>
              <h2 className="mb-4 text-center text-4xl font-bold tracking-[-0.02em] text-[#040914]">Qué resolvemos</h2>
              <p className="mx-auto mb-16 max-w-[600px] text-center text-base leading-relaxed text-[#4b5563]">
                La logística internacional no debería depender de improvisación. Ordenamos la operación para que tengas más visibilidad y menos fricción.
              </p>
            </Reveal>
            <div className="grid gap-8 lg:grid-cols-3">
              {services.map((s, i) => (
                <Reveal key={s.title} delay={i * 100}>
                  <div className="cursor-default rounded-3xl border border-black/[0.04] bg-white/78 p-12 text-center shadow-[0_12px_32px_-12px_rgba(0,0,0,0.05)] backdrop-blur-[3px] transition-all duration-300 hover:translate-y-[-8px] hover:border-[rgba(234,88,12,0.15)] hover:shadow-[0_20px_48px_-12px_rgba(0,0,0,0.08)]">
                    <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(234,88,12,0.08)] text-[#ea580c]">
                      {s.icon}
                    </div>
                    <h3 className="mb-3 text-xl font-bold text-[#040914]">{s.title}</h3>
                    <p className="text-[15px] leading-relaxed text-[#4b5563]">{s.description}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="process" className="bg-transparent pb-28">
          <div className="container mx-auto px-6 md:px-10">
            <Reveal>
              <h2 className="mb-4 text-center text-4xl font-bold tracking-[-0.02em] text-[#040914]">Cómo funciona</h2>
              <p className="mx-auto mb-16 max-w-[600px] text-center text-base leading-relaxed text-[#4b5563]">
                La operación se ordena mejor cuando cada etapa está clara desde el inicio.
              </p>
            </Reveal>
            <div className="grid items-center gap-20 lg:grid-cols-[1.1fr_0.9fr]">
              <Reveal>
                <div className="text-center">
                  <Image
                    src="/images/ship.png"
                    alt="Cargo Ship"
                    width={480}
                    height={480}
                    className="mx-auto w-full max-w-[480px]"
                    style={{ animation: "floatShip 5s ease-in-out infinite", mixBlendMode: "darken" }}
                  />
                </div>
              </Reveal>
              <div className="relative flex flex-col gap-8">
                {processSteps.map((step, i) => (
                  <Reveal key={step.title} delay={i * 100}>
                    <div className="relative flex gap-6">
                      {i < processSteps.length - 1 && <div className="absolute bottom-[-32px] left-[17px] top-10 z-0 w-[2px] bg-[#fed7aa]" />}
                      <div className="relative z-[1] flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#ea580c] text-base font-bold text-white shadow-[0_0_0_6px_transparent]">
                        {i + 1}
                      </div>
                      <div className="mt-1">
                        <h4 className="mb-2 text-[18px] font-bold text-[#040914]">{step.title}</h4>
                        <p className="text-[15px] leading-relaxed text-[#4b5563]">{step.desc}</p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="operations" className="border-t border-black/[0.04] bg-transparent py-28">
          <div className="container mx-auto px-6 md:px-10">
            <div className="grid items-start gap-20 lg:grid-cols-2">
              <Reveal>
                <div>
                  <div className="mb-6 inline-block rounded-full border border-[#fed7aa] bg-[rgba(254,215,170,0.1)] px-[14px] py-[6px] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#ea580c]">
                    Para operaciones reales
                  </div>
                  <h2 className="mb-6 text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-[#040914]">
                    Menos incertidumbre en cada importación.
                  </h2>
                  <p className="mb-10 text-base leading-relaxed text-[#4b5563]">
                    Transtide acompaña la operación completa con criterio operativo, seguimiento cercano y presencia internacional.
                  </p>
                  <div className="flex flex-col gap-8">
                    {differentiators.map((d) => (
                      <div key={d.title} className="flex gap-4">
                        <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#ea580c] text-white">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="mb-1 text-base font-bold text-[#040914]">{d.title}</h4>
                          <p className="text-[15px] leading-relaxed text-[#4b5563]">{d.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>

              <Reveal delay={100}>
                <div className="cursor-default rounded-3xl border border-white/[0.05] bg-gradient-to-br from-[#0f172a]/95 to-[#0b1120]/95 p-12 text-white shadow-[0_24px_48px_-12px_rgba(11,17,32,0.4)] backdrop-blur-[3px] transition-transform duration-300 hover:translate-y-[-8px]">
                  <p className="mb-6 text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Operaciones que manejamos</p>
                  <h3 className="mb-4 text-[28px] font-bold leading-[1.2]">Coordinación integral para distintos tipos de carga.</h3>
                  <p className="mb-8 text-[15px] leading-relaxed text-[#94a3b8]">
                    No trabajamos una sola parte del proceso. Miramos la operación completa para que la carga llegue cerrada.
                  </p>
                  <div className="mb-10 grid grid-cols-2 gap-4">
                    {operationTypes.map((op) => (
                      <div key={op} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-[13px] font-semibold text-[#e2e8f0]">
                        {op}
                      </div>
                    ))}
                  </div>
                  <a href="#contact" className="block w-full rounded-lg bg-[#ea580c] py-4 text-center font-semibold text-white transition-colors hover:bg-[#d04b06]">
                    Solicitar una consulta
                  </a>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section id="offices" className="border-t border-black/[0.04] bg-transparent py-20 pb-28">
          <div className="container mx-auto px-6 md:px-10">
            <Reveal>
              <h2 className="mb-4 text-center text-4xl font-bold tracking-[-0.02em] text-[#040914]">Presencia operativa</h2>
              <p className="mx-auto mb-16 max-w-[600px] text-center text-base leading-relaxed text-[#4b5563]">
                Oficinas reales, teléfonos directos y presencia internacional para operar con más respaldo.
              </p>
            </Reveal>
            <div className="grid gap-8 lg:grid-cols-3">
              {offices.map((o, i) => (
                <Reveal key={o.title} delay={i * 100}>
                  <div className="cursor-default rounded-3xl border border-black/[0.04] bg-white/78 p-12 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.05)] backdrop-blur-[3px] transition-all duration-300 hover:translate-y-[-8px] hover:border-[rgba(234,88,12,0.15)] hover:shadow-[0_20px_48px_-12px_rgba(0,0,0,0.08)]">
                    <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[rgba(234,88,12,0.08)] text-[#ea580c]">
                      <MapPin className="h-6 w-6" />
                    </div>
                    <h4 className="mb-4 text-xl font-bold text-[#040914]">{o.title}</h4>
                    <p className="mb-6 text-[15px] leading-relaxed text-[#4b5563]">
                      {o.lines.map((l, j) => <span key={j}>{l}<br /></span>)}
                    </p>
                    {o.phone && o.phoneHref && (
                      <a href={o.phoneHref} className="inline-flex items-center gap-2 text-[15px] font-bold text-[#ea580c] transition-opacity hover:opacity-80">
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

        <section id="contact" className="border-t border-black/[0.05] bg-transparent py-28">
          <div className="container mx-auto px-6 md:px-10">
            <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
              <Reveal>
                <div className="max-w-xl">
                  <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#ea580c]">Contacto</p>
                  <h2 className="mb-4 text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-[#040914]">Hablemos de tu próxima importación.</h2>
                  <p className="mb-6 text-base leading-relaxed text-[#4b5563]">
                    Si ya tenés un producto definido o todavía estás evaluando cómo encararlo, te ayudamos a ordenar la operación desde el inicio.
                  </p>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <Button asChild className="rounded-lg bg-[#ea580c] px-6 font-semibold text-white hover:bg-[#d04b06]">
                      <a href="https://wa.me/5491144394020" target="_blank" rel="noreferrer">Escribir por WhatsApp</a>
                    </Button>
                    <Button asChild variant="outline" className="border-slate-300 px-6 text-slate-900 hover:bg-slate-50/70">
                      <a href="#offices">Ver oficinas</a>
                    </Button>
                  </div>
                </div>
              </Reveal>
              <Reveal delay={100}>
                <div className="rounded-3xl border border-slate-200 bg-white/82 p-8 shadow-sm backdrop-blur-[3px]">
                  <form className="space-y-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700">Nombre</label>
                        <input id="name" type="text" className="w-full rounded-2xl border border-slate-300 bg-white/80 px-4 py-3 text-slate-900 outline-none transition focus:border-[#ea580c]" placeholder="Tu nombre" />
                      </div>
                      <div>
                        <label htmlFor="company" className="mb-2 block text-sm font-medium text-slate-700">Empresa</label>
                        <input id="company" type="text" className="w-full rounded-2xl border border-slate-300 bg-white/80 px-4 py-3 text-slate-900 outline-none transition focus:border-[#ea580c]" placeholder="Tu empresa" />
                      </div>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
                        <input id="email" type="email" className="w-full rounded-2xl border border-slate-300 bg-white/80 px-4 py-3 text-slate-900 outline-none transition focus:border-[#ea580c]" placeholder="tu@email.com" />
                      </div>
                      <div>
                        <label htmlFor="phone" className="mb-2 block text-sm font-medium text-slate-700">Teléfono</label>
                        <input id="phone" type="tel" className="w-full rounded-2xl border border-slate-300 bg-white/80 px-4 py-3 text-slate-900 outline-none transition focus:border-[#ea580c]" placeholder="Tu teléfono" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="message" className="mb-2 block text-sm font-medium text-slate-700">¿Qué querés importar?</label>
                      <textarea id="message" rows={5} className="w-full rounded-2xl border border-slate-300 bg-white/80 px-4 py-3 text-slate-900 outline-none transition focus:border-[#ea580c]" placeholder="Contanos el producto, origen, cantidad o cualquier dato que ya tengas." />
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button type="submit" className="bg-[#ea580c] px-6 text-white hover:bg-[#d04b06]">Enviar consulta</Button>
                      <Button asChild type="button" variant="outline" className="border-slate-300 px-6 text-slate-900 hover:bg-white/70">
                        <a href="https://wa.me/5491144394020" target="_blank" rel="noreferrer">Escribir por WhatsApp</a>
                      </Button>
                    </div>
                  </form>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <footer className="border-t border-slate-200 bg-transparent">
          <div className="container mx-auto px-6 py-10 md:px-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-lg font-semibold text-[#040914]">Transtide Freight</p>
                <p className="mt-1 text-sm text-slate-600">Importaciones internacionales con control real en cada etapa.</p>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
                {[["#services", "Servicios"], ["#process", "Cómo trabajamos"], ["#operations", "Operaciones"], ["#offices", "Oficinas"], ["#contact", "Contacto"]].map(([h, l]) => (
                  <a key={h} href={h} className="transition-colors hover:text-slate-950">{l}</a>
                ))}
              </div>
            </div>
          </div>
        </footer>

        <BackToTop />

        <style dangerouslySetInnerHTML={{ __html: `
          .bg-squares {
            position: fixed;
            inset: 0;
            z-index: -1;
            overflow: hidden;
            pointer-events: none;
          }
          .bg-squares .sq {
            position: absolute;
            border-radius: 12px;
            background: rgba(29, 45, 95, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.18);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px rgba(15, 23, 42, 0.04);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            animation: floatSq 20s infinite alternate ease-in-out;
          }
          .bg-squares .sq-1 { left: 2%; top: 26px; width: 60px; height: 60px; animation-delay: -2s; }
          .bg-squares .sq-2 { left: 4.8%; top: 24px; width: 84px; height: 84px; animation-delay: -6s; }
          .bg-squares .sq-3 { left: 5%; top: 68px; width: 108px; height: 108px; animation-delay: -10s; }
          .bg-squares .sq-4 { left: 10%; top: 158px; width: 52px; height: 52px; animation-delay: -14s; }
          .bg-squares .sq-5 { left: 28%; top: 20px; width: 58px; height: 58px; animation-delay: -4s; }
          .bg-squares .sq-6 { left: 30%; top: 64px; width: 84px; height: 84px; animation-delay: -9s; }
          .bg-squares .sq-7 { left: 32%; top: 116px; width: 42px; height: 42px; animation-delay: -12s; }
          .bg-squares .sq-8 { right: 28%; top: 18px; width: 60px; height: 60px; animation-delay: -7s; }
          .bg-squares .sq-9 { right: 24.5%; top: 32px; width: 68px; height: 68px; animation-delay: -11s; }
          .bg-squares .sq-10 { right: 22.5%; top: 42px; width: 68px; height: 68px; animation-delay: -15s; }
          .bg-squares .sq-11 { right: 11.5%; top: 34px; width: 84px; height: 84px; animation-delay: -5s; }
          .bg-squares .sq-12 { right: 8.6%; top: 82px; width: 60px; height: 60px; animation-delay: -13s; }
          .bg-squares .sq-13 { left: 10%; bottom: 142px; width: 42px; height: 42px; animation-delay: -8s; }
          .bg-squares .sq-14 { left: 22%; bottom: 92px; width: 58px; height: 58px; animation-delay: -16s; }
          .bg-squares .sq-15 { left: 25.2%; bottom: 68px; width: 50px; height: 50px; animation-delay: -3s; }
          .bg-squares .sq-16 { right: 14%; bottom: 142px; width: 60px; height: 60px; animation-delay: -18s; }
          .bg-squares .sq-17 { right: 9%; bottom: 92px; width: 68px; height: 68px; animation-delay: -1s; }

          @keyframes floatSq {
            from { transform: translateY(0px) rotate(0deg); }
            to { transform: translateY(-40px) rotate(10deg); }
          }
          @keyframes floatShip {
            0% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-15px) rotate(1deg); }
            100% { transform: translateY(0px) rotate(0deg); }
          }
          @keyframes btnShine {
            0%   { left: -100%; opacity: 0; }
            10%  { opacity: 1; }
            50%  { left: 120%; opacity: 1; }
            51%  { opacity: 0; }
            100% { left: 120%; opacity: 0; }
          }
          .btn-shine {
            position: absolute;
            top: 0;
            left: -100%;
            width: 50%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
            transform: skewX(-20deg);
            animation: btnShine 3.5s ease-in-out infinite;
          }
          .btn-shine-header {
            position: absolute;
            top: 0;
            left: -100%;
            width: 50%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
            transform: skewX(-20deg);
            animation: btnShine 3.5s ease-in-out 1.75s infinite;
          }
        `}} />
      </main>
    </>
  )
}
