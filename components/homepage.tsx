"use client"

import { useEffect, useRef } from "react"
import Image from "next/image"
import GlobeHero from "@/components/GlobeHero"
import HowItWorksStepper from "@/components/HowItWorksStepper"
import LocationsSection from "@/components/LocationsSection"
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
  Package,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"

const metrics = [
  { value: 70, suffix: "%", label: "de reducción en costos logísticos" },
  { value: 50, suffix: "+", label: "importadores activos" },
  { value: 3, suffix: "", label: "Oficinas globales", compact: true, narrow: true },
  { value: null, suffix: "", label: "disponibilidad operativa", display: "24/7", compact: true },
]

const services = [
  { icon: <Globe className="h-6 w-6" />, title: "Gestión en origen", description: "Validamos proveedores y coordinamos en origen para reducir el riesgo antes de embarcar." },
  { icon: <Ship className="h-6 w-6" />, title: "Transporte y embarque", description: "Elegimos la mejor ruta, consolidamos y hacemos seguimiento hasta destino." },
  { icon: <Truck className="h-6 w-6" />, title: "Despacho y entrega", description: "Manejamos la documentación y el despacho para que la mercadería llegue sin trabas." },
]

const differentiators = [
  { icon: <ShieldCheck className="h-5 w-5" />, title: "Presencia en origen", text: "Más control sobre proveedor, producción y carga antes de embarcar." },
  { icon: <Boxes className="h-5 w-5" />, title: "Control total del costo", text: "No trabajamos una sola parte de la operación, miramos el proceso entero." },
  { icon: <Clock3 className="h-5 w-5" />, title: "Decisiones rápidas, sin burocracia", text: "Menos vueltas, más claridad para decidir rápido y mover la operación." },
  { icon: <Package className="h-5 w-5" />, title: "Un contacto real en cada etapa", text: "Un punto de contacto real durante cada etapa de la importación." },
]

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

      <main className="relative z-[1] min-h-screen overflow-x-clip bg-transparent text-[#0b1120]">
        <section id="inicio" className="relative border-b border-black/[0.05]">
          <div className="container relative z-[1] mx-auto px-6 md:px-10" style={{ paddingTop: "clamp(2rem, 4vh, 3rem)", paddingBottom: "clamp(2rem, 4vh, 3rem)" }}>
            <div className="grid gap-8 lg:gap-16 lg:grid-cols-[1fr_1fr] lg:items-center" style={{ minHeight: "calc(100vh - 76px)" }}>
              <div className="flex items-start gap-6">
                <div className="flex flex-col items-start gap-4 lg:gap-5">
                  <div className="rounded-full border border-[#fed7aa] bg-[rgba(254,215,170,0.1)] px-[14px] py-[6px] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#ea580c]">
                    Coordinación logística internacional
                  </div>

                  <h1 className="text-[clamp(2.2rem,7vw,4rem)] font-black leading-[1.08] tracking-[-0.04em] text-[#040914]">
                    Importá con claridad. Sin sorpresas, sin intermediarios innecesarios.
                  </h1>

                  <p className="max-w-[420px] text-[0.95rem] leading-relaxed text-[#4b5563] lg:text-[1.05rem]">
                    Gestionamos toda la cadena, desde el proveedor hasta la entrega en destino. Un solo interlocutor, visibilidad total.
                  </p>

                  <div className="mt-1 flex flex-wrap items-center gap-3 lg:gap-4">
                    <a
                      href="#contact"
                      className="relative inline-flex h-[46px] items-center gap-2 overflow-hidden rounded-lg bg-[#ea580c] px-5 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(234,88,12,0.25)] transition-all duration-200 hover:translate-y-[-2px] hover:shadow-[0_6px_16px_rgba(234,88,12,0.35)] lg:h-[50px] lg:px-6"
                    >
                      <span className="inline-flex items-center">Cotizar operación</span>
                      <ArrowRight className="h-4 w-4" />
                      <span className="btn-shine" />
                    </a>
                    <a href="#process" className="inline-flex h-[46px] items-center text-sm font-semibold text-[#4b5563] transition-colors hover:text-[#040914] lg:h-[50px]">
                      Ver cómo trabajamos
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center">
                <div className="w-full max-w-[420px] lg:max-w-[560px]" style={{ overflow: "visible" }}>
                  <GlobeHero />
                </div>
              </div>
            </div>
          </div>
        </section>

        <Reveal>
          <section className="border-y border-black/5 bg-white py-10">
            <div className="mx-auto max-w-7xl px-6 md:px-10">
              <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
                {[
                  { value: "70%",  label: "De reducción en costos logísticos" },
                  { value: "50+",  label: "Importadores satisfechos" },
                  { value: "3",    label: "Oficinas globales" },
                  { value: "24/7", label: "Disponibilidad operativa" },
                ].map(({ value, label }) => (
                  <div key={value} className="flex items-center gap-3">
                    <span
                      className="shrink-0 font-black leading-none text-[#ea580c]"
                      style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)" }}
                    >
                      {value}
                    </span>
                    <span className="text-[11px] font-bold uppercase leading-[1.4] tracking-[0.06em] text-slate-700">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </Reveal>

        <section id="services" className="bg-transparent py-16 lg:py-28">
          <div className="container mx-auto px-6 md:px-10">
            <Reveal>
              <h2 className="mb-4 text-center text-4xl font-bold tracking-[-0.02em] text-[#040914]">Qué hacemos por vos</h2>
              <p className="mx-auto mb-16 max-w-[600px] text-center text-base leading-relaxed text-[#4b5563]">
                Cubrimos cada etapa de la importación para que llegues al final sin desvíos ni fricciones.
              </p>
            </Reveal>
            <div className="grid items-stretch gap-8 lg:grid-cols-3">
              {services.map((s, i) => (
                <Reveal key={s.title} delay={i * 100} className="h-full">
                  <div className="flex h-full cursor-default flex-col rounded-3xl border border-black/[0.04] bg-white/78 p-12 text-center shadow-[0_12px_32px_-12px_rgba(0,0,0,0.05)] backdrop-blur-[3px] transition-all duration-300 hover:translate-y-[-8px] hover:border-[rgba(234,88,12,0.15)] hover:shadow-[0_20px_48px_-12px_rgba(0,0,0,0.08)]">
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

        <section id="process">
          <HowItWorksStepper />
        </section>

        <section id="operations" className="border-t border-black/[0.04] bg-transparent py-16 lg:py-28">
          <div className="container mx-auto px-6 md:px-10">
            <div className="grid items-start gap-10 lg:gap-20 lg:grid-cols-2">
              <Reveal>
                <div>
                  <div className="mb-6 inline-block rounded-full border border-[#fed7aa] bg-[rgba(254,215,170,0.1)] px-[14px] py-[6px] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#ea580c]">
                    Por qué elegirnos
                  </div>
                  <h2 className="mb-6 text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-[#040914]">
                    Sabés qué pasa con tu carga en todo momento.
                  </h2>
                  <p className="mb-10 text-base leading-relaxed text-[#4b5563]">
                    Coordinamos cada etapa con criterio operativo y un solo punto de contacto real.
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
                <div className="cursor-default rounded-3xl border border-white/[0.05] bg-gradient-to-br from-[#0f172a]/95 to-[#0b1120]/95 p-10 text-white shadow-[0_24px_48px_-12px_rgba(11,17,32,0.4)] backdrop-blur-[3px] transition-transform duration-300 lg:hover:translate-y-[-8px]">
                  <p className="mb-5 text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Modalidades de embarque</p>
                  <h3 className="mb-3 text-[22px] font-bold leading-[1.2]">Operamos con cualquier tipo de carga y destino.</h3>
                  <p className="mb-7 text-[13px] leading-relaxed text-[#94a3b8]">
                    De punta a punta. Sin fragmentar la operación entre múltiples proveedores.
                  </p>
                  <div className="mb-8 flex flex-col gap-3">
                    {[
                      { icon: "🚢", title: "Marítimo FCL", desc: "Contenedor completo. Ideal para volúmenes altos con costo por unidad optimizado." },
                      { icon: "📦", title: "Marítimo LCL", desc: "Carga consolidada. Para embarques menores sin pagar un contenedor entero." },
                      { icon: "✈️", title: "Aéreo", desc: "Tiempos reducidos para mercadería urgente o de alto valor." },
                      { icon: "📬", title: "Courier / Express", desc: "Envíos rápidos puerta a puerta para muestras y volúmenes pequeños." },
                    ].map((item) => (
                      <div key={item.title} className="flex items-start gap-4 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                        <span className="mt-0.5 text-xl leading-none">{item.icon}</span>
                        <div>
                          <p className="text-[13px] font-semibold text-white">{item.title}</p>
                          <p className="text-[12px] leading-relaxed text-[#94a3b8]">{item.desc}</p>
                        </div>
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

        <LocationsSection />

        <section id="contact" className="border-t border-black/[0.05] bg-transparent py-16 lg:py-28">
          <div className="container mx-auto px-6 md:px-10">
            <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
              <Reveal>
                <div className="max-w-xl">
                  <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#ea580c]">Contacto</p>
                  <h2 className="mb-4 text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-[#040914]">¿Tenés una importación en mente? Hablemos.</h2>
                  <p className="mb-6 text-base leading-relaxed text-[#4b5563]">
                    Ya sea que tengas todo definido o estés en la etapa de evaluación, arrancamos desde donde estés.
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

        <footer className="bg-gradient-to-br from-[#0d1b35] to-[#0b1120] text-white">
          {/* Top strip — CTA */}
          <div className="border-b border-white/[0.07]">
            <div className="container mx-auto flex flex-col items-start justify-between gap-6 px-6 py-10 md:flex-row md:items-center md:px-10">
              <div>
                <p className="text-xl font-bold text-white">¿Tenés una importación en mente?</p>
                <p className="mt-1 text-sm text-[#94a3b8]">Hablemos antes de que empiece la operación.</p>
              </div>
              <a
                href="#contact"
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#ea580c] px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(234,88,12,0.3)] transition-colors hover:bg-[#d04b06]"
              >
                Cotizar operación
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Main footer body */}
          <div className="container mx-auto px-6 py-14 md:px-10">
            <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4">

              {/* Col 1 — Brand */}
              <div className="lg:col-span-1">
                <p className="mb-3 text-xl font-black tracking-tight text-white">TRANSTIDE<span className="text-[#ea580c]">.</span></p>
                <p className="mb-6 max-w-[220px] text-sm leading-relaxed text-[#94a3b8]">
                  Tu operación de importación, de principio a fin.
                </p>
                <div className="flex flex-col gap-2">
                  <a href="https://wa.me/5491144394020" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-[#94a3b8] transition-colors hover:text-white">
                    <Phone className="h-4 w-4 text-[#ea580c]" />
                    +54 9 11 4439-4020
                  </a>
                  <a href="https://wa.me/5491144394020" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-[#94a3b8] transition-colors hover:text-white">
                    <svg className="h-4 w-4 text-[#ea580c]" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.533 5.856L.057 23.386l5.683-1.448A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.805 9.805 0 01-5.032-1.388l-.36-.214-3.733.952.983-3.627-.235-.373A9.793 9.793 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
                    WhatsApp directo
                  </a>
                </div>
              </div>

              {/* Col 2 — Navegación */}
              <div>
                <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748b]">Navegación</p>
                <ul className="flex flex-col gap-3">
                  {[["#inicio","Inicio"],["#services","Servicios"],["#process","Cómo trabajamos"],["#operations","Operaciones"],["#offices","Oficinas"],["#contact","Contacto"]].map(([h,l]) => (
                    <li key={h}>
                      <a href={h} className="text-sm text-[#94a3b8] transition-colors hover:text-white">{l}</a>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Col 3 — Servicios */}
              <div>
                <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748b]">Modalidades</p>
                <ul className="flex flex-col gap-3">
                  {["Marítimo FCL","Marítimo LCL","Carga aérea","Courier / Express","Operación puerta a puerta"].map(s => (
                    <li key={s} className="text-sm text-[#94a3b8]">{s}</li>
                  ))}
                </ul>
              </div>

              {/* Col 4 — Oficinas */}
              <div>
                <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748b]">Oficinas</p>
                <ul className="flex flex-col gap-5">
                  {[
                    { flag: "🇦🇷", city: "Bahía Blanca", detail: "Argentina" },
                    { flag: "🇺🇸", city: "Miami, FL", detail: "Estados Unidos" },
                    { flag: "🇨🇳", city: "Shanghai", detail: "China" },
                  ].map(o => (
                    <li key={o.city} className="flex items-center gap-3">
                      <span className="text-xl leading-none">{o.flag}</span>
                      <div>
                        <p className="text-sm font-semibold text-white">{o.city}</p>
                        <p className="text-[12px] text-[#64748b]">{o.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-white/[0.06]">
            <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-6 py-5 md:flex-row md:px-10">
              <p className="text-[12px] text-[#475569]">© {new Date().getFullYear()} Transtide Freight. Todos los derechos reservados.</p>
              <p className="text-[12px] text-[#475569]">Importaciones internacionales · Argentina · EE.UU. · China</p>
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
        `}} />
      </main>
    </>
  )
}
