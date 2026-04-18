"use client"

import Image from "next/image"
import { ArrowRight, Check, Phone, MapPin } from "lucide-react"
import GlobeHero from "@/components/GlobeHero"
import HowItWorksStepper from "@/components/HowItWorksStepper"
import CargoGallery from "@/components/CargoGallery"
import { Reveal } from "@/components/ui/reveal"
import { BackToTop } from "@/components/ui/back-to-top"
import { metrics, services, differentiators } from "@/lib/data"

const navLinks = [
  ["#inicio",      "Inicio"],
  ["#services",    "Servicios"],
  ["#operations",  "Operaciones"],
  ["#process",     "Cómo trabajamos"],
  ["#offices",     "Oficinas"],
  ["#contact",     "Contacto"],
]

export default function Homepage() {
  return (
    <>
      {/* Background animated squares — styles live in globals.css */}
      <div className="bg-squares" aria-hidden="true">
        {Array.from({ length: 17 }, (_, i) => (
          <span key={i} className={`sq sq-${i + 1}`} />
        ))}
      </div>

      {/* PASO 3 — overflow-x-clip retained (not hidden) */}
      <main className="relative z-[1] min-h-screen overflow-x-clip bg-transparent text-[#0b1120]">

        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <section id="inicio" className="relative border-b border-black/[0.05]">
          <div
            className="relative z-[1] mx-auto w-full max-w-7xl px-6 md:px-10 lg:px-16"
            style={{ paddingTop: "clamp(2rem, 4vh, 3rem)", paddingBottom: "clamp(2rem, 4vh, 3rem)" }}
          >
            <div
              className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center"
              style={{ minHeight: "calc(100vh - 76px)" }}
            >
              {/* Text column */}
              <div className="flex w-full flex-col gap-4 lg:gap-5">
                <h1 className="text-4xl font-black leading-[1.1] tracking-tighter text-[#040914] sm:text-6xl lg:text-7xl">
                  <span className="block text-[#ea580c]">Importá con claridad.</span>
                  <span className="block">Sin sorpresas,</span>
                  <span className="block">sin intermediarios innecesarios.</span>
                </h1>

                <p className="max-w-[420px] text-[0.95rem] leading-relaxed text-[#4b5563] lg:text-[1.05rem]">
                  Gestionamos toda la cadena, desde el proveedor hasta la entrega en destino. Un solo interlocutor, visibilidad total.
                </p>

                <div className="mt-1 flex flex-wrap items-center gap-3 lg:gap-4">
                  <a
                    href="#contact"
                    className="relative inline-flex h-[46px] items-center gap-2 overflow-hidden rounded-lg bg-[#ea580c] px-5 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(234,88,12,0.25)] transition-all duration-200 hover:translate-y-[-2px] hover:shadow-[0_6px_16px_rgba(234,88,12,0.35)] lg:h-[50px] lg:px-6"
                  >
                    Cotizar operación
                    <ArrowRight className="h-4 w-4" />
                    <span className="btn-shine" />
                  </a>
                  <a href="#process" className="inline-flex h-[46px] items-center text-sm font-semibold text-[#4b5563] transition-colors hover:text-[#040914] lg:h-[50px]">
                    Ver cómo trabajamos
                  </a>
                </div>
              </div>

              {/* Globe column */}
              <div className="flex items-center justify-center">
                <div className="w-full max-w-[420px] lg:max-w-[560px]" style={{ overflow: "visible" }}>
                  <GlobeHero />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── STATS ────────────────────────────────────────────────────── */}
        <Reveal>
          <section className="border-y border-black/5 bg-white py-10">
            <div className="mx-auto max-w-7xl px-6 md:px-10">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                {[
                  { value: "70%",  label: "De reducción en costos logísticos" },
                  { value: "50+",  label: "Importadores satisfechos" },
                  { value: "24/7", label: "Disponibilidad operativa" },
                ].map(({ value, label }) => (
                  <div key={value} className="flex items-center gap-3">
                    <span className="shrink-0 font-black leading-none text-[#ea580c]" style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)" }}>
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

        {/* ── SERVICES ─────────────────────────────────────────────────── */}
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
                    <div className="mb-6 mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(234,88,12,0.08)] text-[#ea580c]">
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

        {/* ── GALLERY ──────────────────────────────────────────────────── */}
        <CargoGallery />

        {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
        <section id="process">
          <HowItWorksStepper />
        </section>

        {/* ── OPERATIONS ───────────────────────────────────────────────── */}
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
                      { icon: "🚢", title: "Marítimo FCL",     desc: "Contenedor completo. Ideal para volúmenes altos con costo por unidad optimizado." },
                      { icon: "📦", title: "Marítimo LCL",     desc: "Carga consolidada. Para embarques menores sin pagar un contenedor entero." },
                      { icon: "✈️", title: "Aéreo",            desc: "Tiempos reducidos para mercadería urgente o de alto valor." },
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

        {/* ── OFFICES ──────────────────────────────────────────────────── */}
        <section id="offices" className="border-t border-black/[0.04] bg-transparent py-16 lg:py-24">
          <div className="container mx-auto px-6 md:px-10">
            <Reveal>
              <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-[#ea580c]">Presencia global</p>
              <h2 className="mb-4 text-center text-4xl font-bold tracking-[-0.02em] text-[#040914]">Tres oficinas, un solo equipo.</h2>
              <p className="mx-auto mb-16 max-w-[500px] text-center text-base leading-relaxed text-[#4b5563]">
                Operamos en Argentina, Estados Unidos y China para acompañar tu carga en cada etapa.
              </p>
            </Reveal>

            <Reveal delay={100}>
              <div className="grid gap-6 lg:grid-cols-3">
                {[
                  {
                    country: "Argentina",
                    city: "Bahía Blanca",
                    address: "Belgrano 3710, Ing. White",
                    phone: "+54 9 11 4439-4020",
                    phoneHref: "tel:+5491144394020",
                    role: "Casa central",
                  },
                  {
                    country: "Estados Unidos",
                    city: "Miami, FL",
                    address: "5605 NW 74th Ave, 33166",
                    phone: "+1 754 236-5652",
                    phoneHref: "tel:+17542365652",
                    role: "Oficina EE.UU.",
                  },
                  {
                    country: "China",
                    city: "Shanghai",
                    address: "Waigaoqiao Free Trade Zone, Pudong",
                    phone: null,
                    phoneHref: null,
                    role: "Oficina Asia",
                  },
                ].map((o, i) => (
                  <div
                    key={o.country}
                    className="group cursor-default rounded-3xl border border-black/[0.06] bg-white p-8 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.06)] transition-all duration-300 hover:border-[#ea580c]/20 hover:shadow-[0_12px_40px_-8px_rgba(234,88,12,0.10)] hover:translate-y-[-4px]"
                  >
                    {/* Top row */}
                    <div className="mb-6 flex items-center justify-between">
                      <span className="inline-flex items-center rounded-full bg-[rgba(234,88,12,0.08)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#ea580c]">
                        {o.role}
                      </span>
                      <span className="text-[11px] font-medium text-[#94a3b8]">{o.country}</span>
                    </div>

                    {/* City */}
                    <h4 className="mb-6 text-[26px] font-black leading-none tracking-tight text-[#040914]">
                      {o.city}
                    </h4>

                    {/* Divider */}
                    <div className="mb-6 h-px w-full bg-black/[0.05]" />

                    {/* Address */}
                    <div className="mb-4 flex items-start gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#ea580c]" />
                      <p className="text-[14px] leading-relaxed text-[#4b5563]">{o.address}</p>
                    </div>

                    {/* Phone */}
                    {o.phone ? (
                      <a
                        href={o.phoneHref!}
                        className="flex items-center gap-3 text-[14px] font-semibold text-[#040914] transition-colors hover:text-[#ea580c]"
                      >
                        <Phone className="h-4 w-4 shrink-0 text-[#ea580c]" />
                        {o.phone}
                      </a>
                    ) : (
                      <p className="flex items-center gap-3 text-[14px] text-[#94a3b8]">
                        <Phone className="h-4 w-4 shrink-0 text-[#94a3b8]" />
                        Contacto vía casa central
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── CONTACT ──────────────────────────────────────────────────── */}
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
                  <a
                    href="https://wa.me/5491144394020"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-3 rounded-2xl border border-[#25D366]/30 bg-[#25D366]/10 px-6 py-4 text-[15px] font-semibold text-[#15803d] transition-all hover:bg-[#25D366]/20"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.533 5.856L.057 23.386l5.683-1.448A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.805 9.805 0 01-5.032-1.388l-.36-.214-3.733.952.983-3.627-.235-.373A9.793 9.793 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
                    Escribir por WhatsApp
                  </a>
                </div>
              </Reveal>

              <Reveal delay={100}>
                <div className="rounded-3xl border border-black/[0.04] bg-white/80 p-10 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.06)] backdrop-blur-[3px]">
                  <div className="flex flex-col gap-5">
                    {[
                      { id: "name",    label: "Nombre",   type: "text",  placeholder: "Tu nombre" },
                      { id: "company", label: "Empresa",  type: "text",  placeholder: "Tu empresa" },
                      { id: "email",   label: "Email",    type: "email", placeholder: "tu@email.com" },
                      { id: "phone",   label: "Teléfono", type: "tel",   placeholder: "Tu teléfono" },
                    ].map((f) => (
                      <div key={f.id}>
                        <label htmlFor={f.id} className="mb-2 block text-sm font-medium text-slate-700">{f.label}</label>
                        <input id={f.id} type={f.type} className="w-full rounded-2xl border border-slate-300 bg-white/80 px-4 py-3 text-slate-900 outline-none transition focus:border-[#ea580c]" placeholder={f.placeholder} />
                      </div>
                    ))}
                    <div>
                      <label htmlFor="message" className="mb-2 block text-sm font-medium text-slate-700">¿Qué necesitás importar?</label>
                      <textarea id="message" rows={4} className="w-full rounded-2xl border border-slate-300 bg-white/80 px-4 py-3 text-slate-900 outline-none transition focus:border-[#ea580c]" placeholder="Contanos sobre tu operación..." />
                    </div>
                    <button type="button" className="relative overflow-hidden w-full rounded-2xl bg-[#ea580c] py-4 text-base font-semibold text-white shadow-[0_8px_24px_rgba(234,88,12,0.25)] transition-all hover:translate-y-[-2px] hover:shadow-[0_12px_32px_rgba(234,88,12,0.35)]">
                      Enviar consulta
                      <span className="btn-shine" />
                    </button>
                    <a href="https://wa.me/5491144394020" target="_blank" rel="noreferrer" className="block w-full rounded-2xl border-2 border-[#25D366] py-4 text-center text-base font-semibold text-[#15803d] transition-all hover:bg-[#25D366]/10">
                      Escribir por WhatsApp
                    </a>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── FOOTER ───────────────────────────────────────────────────── */}
        <footer className="bg-gradient-to-br from-[#0d1b35] to-[#0b1120] text-white">
          <div className="border-b border-white/[0.07]">
            <div className="container mx-auto flex flex-col items-start justify-between gap-6 px-6 py-10 md:flex-row md:items-center md:px-10">
              <div>
                <p className="text-xl font-bold text-white">¿Tenés una importación en mente?</p>
                <p className="mt-1 text-sm text-[#94a3b8]">Hablemos antes de que empiece la operación.</p>
              </div>
              <a href="#contact" className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#ea580c] px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(234,88,12,0.3)] transition-colors hover:bg-[#d04b06]">
                Cotizar operación <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="container mx-auto px-6 py-14 md:px-10">
            <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-1">
                <p className="mb-3 text-xl font-black tracking-tight text-white">TRANSTIDE<span className="text-[#ea580c]">.</span></p>
                <p className="mb-6 max-w-[220px] text-sm leading-relaxed text-[#94a3b8]">Tu operación de importación, de principio a fin.</p>
                <div className="flex flex-col gap-2">
                  <a href="https://wa.me/5491144394020" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-[#94a3b8] transition-colors hover:text-white">
                    <Phone className="h-4 w-4 text-[#ea580c]" /> +54 9 11 4439-4020
                  </a>
                </div>
              </div>

              <div>
                <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748b]">Navegación</p>
                <ul className="flex flex-col gap-3">
                  {navLinks.map(([h, l]) => (
                    <li key={h}><a href={h} className="text-sm text-[#94a3b8] transition-colors hover:text-white">{l}</a></li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748b]">Modalidades</p>
                <ul className="flex flex-col gap-3">
                  {["Marítimo FCL", "Marítimo LCL", "Carga aérea", "Courier / Express", "Operación puerta a puerta"].map((s) => (
                    <li key={s} className="text-sm text-[#94a3b8]">{s}</li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748b]">Oficinas</p>
                <ul className="flex flex-col gap-5">
                  {[{ flag: "🇦🇷", city: "Bahía Blanca", detail: "Argentina" }, { flag: "🇺🇸", city: "Miami, FL", detail: "Estados Unidos" }, { flag: "🇨🇳", city: "Shanghai", detail: "China" }].map((o) => (
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

          <div className="border-t border-white/[0.06]">
            <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-6 py-5 md:flex-row md:px-10">
              <p className="text-[12px] text-[#475569]">© {new Date().getFullYear()} Transtide Freight. Todos los derechos reservados.</p>
              <p className="text-[12px] text-[#475569]">Importaciones internacionales · Argentina · EE.UU. · China</p>
            </div>
          </div>
        </footer>

        <BackToTop />

      </main>
    </>
  )
}
