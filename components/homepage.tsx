"use client"

import Link from "next/link"
import { ArrowRight, Check, Globe, Package, Ship, Truck, ShieldCheck, Clock3, Boxes, Phone, Mail, MapPin, DollarSign, Users, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"

const metrics = [
  {
    icon: <DollarSign className="h-6 w-6" />,
    value: "70%",
    label: "De nuestros clientes reducen costos logísticos",
  },
  {
    icon: <Users className="h-6 w-6" />,
    value: "50+",
    label: "Clientes satisfechos",
  },
  {
    icon: <Building2 className="h-6 w-6" />,
    value: "3",
    label: "Oficinas globales",
  },
  {
    icon: <Phone className="h-6 w-6" />,
    value: "24/7",
    label: "Soporte disponible",
  },
]

const trustItems = [
  "Oficinas en Argentina, Miami y China",
  "Coordinación integral de importaciones",
  "Seguimiento de punta a punta",
  "Atención personalizada por operación",
]

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

const services = [
  {
    icon: <Globe className="h-5 w-5" />,
    title: "Comprar en origen",
    description: "Buscamos, validamos y coordinamos con proveedores para reducir riesgo comercial desde el inicio.",
  },
  {
    icon: <Ship className="h-5 w-5" />,
    title: "Mover la carga",
    description: "Definimos la mejor alternativa logística, consolidamos, embarcamos y hacemos seguimiento del tránsito.",
  },
  {
    icon: <Truck className="h-5 w-5" />,
    title: "Liberar y entregar",
    description: "Gestionamos documentación, despacho y entrega final para que la operación llegue cerrada.",
  },
]

const processSteps = [
  "Nos contás qué querés importar",
  "Evaluamos proveedor, costo y alternativa logística",
  "Coordinamos producción, embarque y documentación",
  "Liberamos y entregamos en destino",
]

const operationTypes = [
  "Carga consolidada",
  "Importación de maquinaria",
  "Carga aérea urgente",
  "Operación puerta a puerta",
]

const industries = [
  "Maquinaria industrial",
  "Autopartes y repuestos",
  "Electrónica",
  "Herramientas",
  "Materiales",
  "Artículos generales",
]

const differentiators = [
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: "Presencia en origen",
    text: "Más control sobre proveedor, producción y carga antes de embarcar.",
  },
  {
    icon: <Boxes className="h-5 w-5" />,
    title: "Visión completa del costo",
    text: "No trabajamos una sola parte de la operación, miramos el proceso entero.",
  },
  {
    icon: <Clock3 className="h-5 w-5" />,
    title: "Respuesta ágil",
    text: "Menos vueltas, más claridad para decidir rápido y mover la operación.",
  },
  {
    icon: <Package className="h-5 w-5" />,
    title: "Seguimiento cercano",
    text: "Un punto de contacto real durante cada etapa de la importación.",
  },
]

function HeroVisual() {
  return (
    <div className="relative mx-auto flex aspect-square w-full max-w-[620px] items-center justify-center overflow-hidden rounded-[32px] border border-slate-200 bg-[radial-gradient(circle_at_center,_#ffffff_0%,_#f8fafc_58%,_#eef2f7_100%)] p-6 shadow-sm">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute left-[8%] top-[10%] h-16 w-16 rounded-2xl bg-accent/5 blur-[1px]" />
        <div className="absolute right-[12%] top-[8%] h-20 w-20 rounded-[28px] bg-slate-900/5 blur-[1px]" />
        <div className="absolute bottom-[12%] left-[12%] h-14 w-14 rounded-2xl bg-accent/5 blur-[1px]" />
        <div className="absolute bottom-[10%] right-[10%] h-24 w-24 rounded-[32px] bg-slate-900/5 blur-[1px]" />
      </div>

      <div className="hero-orb relative h-full w-full max-w-[500px]">
        <div className="absolute inset-[10%] rounded-full border border-white/70 bg-[radial-gradient(circle_at_35%_30%,_#ffffff_0%,_#f8f8f8_45%,_#ededed_100%)] shadow-[0_20px_60px_rgba(15,23,42,0.10),inset_0_-8px_30px_rgba(15,23,42,0.04)]" />
        <div className="absolute inset-[14%] rounded-full border border-slate-200/70">
          <div className="hero-dot-pattern absolute inset-[12%] rounded-full opacity-95" />
        </div>

        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" fill="none" aria-hidden="true">
          <path className="hero-route hero-route-1" d="M24 70C20 52 28 38 46 26C58 18 72 18 82 30" />
          <path className="hero-route hero-route-2" d="M26 74C42 56 58 50 74 52C82 53 86 49 86 36" />
          <path className="hero-route hero-route-3" d="M24 69C33 76 43 80 53 80C67 80 76 72 83 56" />
        </svg>

        <div className="hero-pin absolute left-[18%] top-[64%]">
          <span className="hero-label">BUENOS AIRES</span>
        </div>
        <div className="hero-pin absolute left-[24%] top-[58%]">
          <span className="hero-label">SANTOS</span>
        </div>
        <div className="hero-pin absolute left-[40%] top-[14%]">
          <span className="hero-label">ROTTERDAM</span>
        </div>
        <div className="hero-pin absolute right-[11%] top-[28%]">
          <span className="hero-label">SHANGHAI</span>
        </div>
      </div>
    </div>
  )
}

export default function Homepage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <section id="inicio" className="border-b border-slate-200 bg-white">
        <div className="container px-4 md:px-6 py-16 md:py-24 lg:py-28">
          <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="max-w-2xl">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-600">
                Importaciones desde China y Estados Unidos
              </div>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl lg:text-6xl">
                Importaciones internacionales, con control real en cada etapa.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
                Coordinamos sourcing, embarque, despacho y entrega final con un único punto de contacto y una mirada integral de la operación.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="bg-accent px-6 text-white hover:bg-accent-700">
                  <Link href="#contact">
                    Cotizar operación <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="border-slate-300 px-6 text-slate-900 hover:bg-slate-50">
                  <Link href="#process">Ver cómo trabajamos</Link>
                </Button>
              </div>
            </div>

            <HeroVisual />
          </div>
        </div>
      </section>

      <section className="bg-[#2448C8] text-white">
        <div className="container px-4 md:px-6 py-10 md:py-12">
          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white">
                  {metric.icon}
                </div>
                <div className="text-5xl font-semibold tracking-tight">{metric.value}</div>
                <p className="mx-auto mt-3 max-w-[220px] text-lg leading-7 text-white/90">{metric.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-slate-50">
        <div className="container px-4 md:px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {trustItems.map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                <p className="text-sm text-slate-700">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="services" className="bg-white">
        <div className="container px-4 md:px-6 py-16 md:py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Qué resolvemos</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Una operación ordenada, desde el proveedor hasta la entrega.
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Transtide no trabaja una sola parte de la importación. Coordinamos el proceso completo para darte más control y menos fricción.
            </p>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {services.map((service) => (
              <article key={service.title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-900">
                  {service.icon}
                </div>
                <h3 className="mt-5 text-xl font-semibold text-slate-950">{service.title}</h3>
                <p className="mt-3 leading-7 text-slate-600">{service.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="process" className="border-y border-slate-200 bg-slate-50">
        <div className="container px-4 md:px-6 py-16 md:py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Cómo trabajamos</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Cuatro pasos claros para mover la operación.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {processSteps.map((step, index) => (
              <div key={step} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-sm font-semibold text-accent">0{index + 1}</div>
                <p className="mt-4 text-lg font-medium leading-7 text-slate-900">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="operations" className="bg-white">
        <div className="container px-4 md:px-6 py-16 md:py-20">
          <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Por qué Transtide</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Más criterio operativo, más visibilidad, menos improvisación.
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Nuestra diferencia no está en prometer más. Está en ordenar mejor la operación, anticipar riesgos y acompañar cada decisión con información clara.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {differentiators.map((item) => (
                <div key={item.title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-900">
                    {item.icon}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-950">{item.title}</h3>
                  <p className="mt-2 leading-7 text-slate-600">{item.text}</p>
                </div>
              ))}
              <div className="sm:col-span-2 rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
                <p className="text-sm uppercase tracking-[0.18em] text-white/60">Operaciones que manejamos</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {operationTypes.map((operation) => (
                    <div key={operation} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/90">
                      {operation}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="offices" className="border-y border-slate-200 bg-white">
        <div className="container px-4 md:px-6 py-16 md:py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Presencia operativa</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Oficinas reales, atención directa y presencia internacional.
            </h2>
          </div>

          <div className="mt-10 space-y-6">
            {offices.map((office) => (
              <div key={office.title} className="rounded-[28px] border border-slate-200 bg-slate-50 p-8 shadow-sm">
                <div className="grid gap-6 md:grid-cols-[48px_1fr] md:items-start">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full text-accent">
                    <MapPin className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-semibold text-[#2448C8] md:text-3xl">{office.title}</h3>
                    <div className="mt-5 space-y-2 text-2xl leading-9 text-slate-600 md:text-[2rem] md:leading-[2.65rem]">
                      {office.lines.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                    {office.phone && office.phoneHref && (
                      <div className="mt-6 flex items-center gap-3 text-[#2448C8]">
                        <Phone className="h-7 w-7 text-accent" />
                        <a href={office.phoneHref} className="text-2xl font-semibold md:text-[2rem] hover:opacity-80">
                          {office.phone}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className="bg-slate-50">
        <div className="container px-4 md:px-6 py-16 md:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Rubros frecuentes</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Capacidad para distintos tipos de carga y negocio.
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {industries.map((industry) => (
                <div key={industry} className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-slate-800 shadow-sm">
                  {industry}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="bg-white">
        <div className="container px-4 md:px-6 py-16 md:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Contacto</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Hablemos de tu próxima importación.
              </h2>
              <p className="mt-4 max-w-xl text-lg leading-8 text-slate-600">
                Si ya tenés un producto definido o todavía estás evaluando cómo encararlo, te ayudamos a ordenar la operación desde el inicio.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <Phone className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
                  <div>
                    <p className="font-medium text-slate-950">WhatsApp y teléfono</p>
                    <a href="tel:+5491144394020" className="mt-1 block text-slate-600 hover:text-slate-950">
                      +54 9 11 4439-4020
                    </a>
                    <a href="tel:+17542365652" className="block text-slate-600 hover:text-slate-950">
                      +1 754 236-5652
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <Mail className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
                  <div>
                    <p className="font-medium text-slate-950">Email</p>
                    <a href="mailto:contacto@transtidefreight.com" className="mt-1 block text-slate-600 hover:text-slate-950">
                      contacto@transtidefreight.com
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
                  <div>
                    <p className="font-medium text-slate-950">Presencia operativa</p>
                    <p className="mt-1 text-slate-600">Argentina, Miami y Shanghai</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm md:p-8">
              <form className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700">Nombre</label>
                    <input id="name" type="text" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-950" placeholder="Tu nombre" />
                  </div>
                  <div>
                    <label htmlFor="company" className="mb-2 block text-sm font-medium text-slate-700">Empresa</label>
                    <input id="company" type="text" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-950" placeholder="Tu empresa" />
                  </div>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
                    <input id="email" type="email" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-950" placeholder="tu@email.com" />
                  </div>
                  <div>
                    <label htmlFor="phone" className="mb-2 block text-sm font-medium text-slate-700">Teléfono</label>
                    <input id="phone" type="tel" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-950" placeholder="Tu teléfono" />
                  </div>
                </div>
                <div>
                  <label htmlFor="message" className="mb-2 block text-sm font-medium text-slate-700">¿Qué querés importar?</label>
                  <textarea id="message" rows={5} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-950" placeholder="Contanos el producto, origen, cantidad o cualquier dato que ya tengas." />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button type="submit" className="bg-accent px-6 text-white hover:bg-accent-700">Enviar consulta</Button>
                  <Button asChild type="button" variant="outline" className="border-slate-300 px-6 text-slate-900 hover:bg-white">
                    <a href="https://wa.me/5491144394020" target="_blank" rel="noreferrer">Escribir por WhatsApp</a>
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="container px-4 py-8 md:px-6 md:py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-lg font-semibold text-slate-950">Transtide Freight</p>
              <p className="mt-1 text-sm text-slate-600">Importaciones internacionales con control real en cada etapa.</p>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
              <Link href="#services" className="hover:text-slate-950">Servicios</Link>
              <Link href="#process" className="hover:text-slate-950">Cómo trabajamos</Link>
              <Link href="#operations" className="hover:text-slate-950">Operaciones</Link>
              <Link href="#offices" className="hover:text-slate-950">Oficinas</Link>
              <Link href="#contact" className="hover:text-slate-950">Contacto</Link>
            </div>
          </div>
        </div>
      </footer>

      <style jsx>{`
        .hero-orb {
          animation: heroFloat 8s ease-in-out infinite;
        }

        .hero-dot-pattern {
          background-image: radial-gradient(circle, rgba(15, 23, 42, 0.78) 1.1px, transparent 1.7px);
          background-size: 8px 8px;
          mask-image: radial-gradient(circle at center, black 57%, transparent 88%);
          -webkit-mask-image: radial-gradient(circle at center, black 57%, transparent 88%);
        }

        .hero-route {
          stroke: #f97316;
          stroke-width: 0.55;
          stroke-linecap: round;
          fill: none;
          opacity: 0.9;
          stroke-dasharray: 120;
          stroke-dashoffset: 120;
        }

        .hero-route-1 {
          animation: routeDraw 3.2s ease-out infinite;
        }

        .hero-route-2 {
          animation: routeDraw 3.2s ease-out 0.6s infinite;
        }

        .hero-route-3 {
          animation: routeDraw 3.2s ease-out 1.2s infinite;
        }

        .hero-pin::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          background: #f97316;
          transform: translate(-50%, -50%);
          box-shadow: 0 0 0 6px rgba(249, 115, 22, 0.14);
          animation: pinPulse 2.8s ease-out infinite;
        }

        .hero-label {
          position: relative;
          display: inline-block;
          transform: translate(8px, -18px);
          background: #0f172a;
          color: white;
          border-radius: 6px;
          padding: 5px 8px;
          font-size: 10px;
          line-height: 1;
          letter-spacing: 0.08em;
        }

        @keyframes heroFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }

        @keyframes routeDraw {
          0% { stroke-dashoffset: 120; opacity: 0; }
          20% { opacity: 0.95; }
          65% { stroke-dashoffset: 0; opacity: 0.95; }
          100% { stroke-dashoffset: 0; opacity: 0.15; }
        }

        @keyframes pinPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.18); }
          60% { box-shadow: 0 0 0 8px rgba(249, 115, 22, 0); }
        }
      `}</style>
    </main>
  )
}
