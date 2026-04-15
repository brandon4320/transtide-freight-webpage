import Link from "next/link"
import Image from "next/image"
import { Globe, Package, Ship, Truck, ArrowRight, MapPin, Clock, Shield, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import ServiceCard from "@/components/service-card"
import IntegralPurchaseFlow from "@/components/integral-purchase-flow"
import StatsCounter from "@/components/stats-counter"
import ProcessStep from "@/components/process-step"
import IndustryCard from "@/components/industry-card"
import ContactForm from "@/components/contact-form"
import ShippingLines from "@/components/shipping-lines"
import Cotizador from "@/components/cotizador"

export const metadata = {
  title: "Transtide Freight - Logística Internacional | Importaciones China y EE.UU.",
  description:
    "Transtide Freight: Especialistas en logística internacional. Importá desde China y EE.UU. con rapidez, seguridad y acompañamiento real. Despacho aduanero, transporte marítimo y más.",
  keywords:
    "Transtide Freight, logística internacional, importaciones China, importaciones Estados Unidos, despacho aduanero, transporte marítimo, sourcing, consolidación carga",
  openGraph: {
    title: "Transtide Freight - Logística Internacional",
    description: "Movemos tu carga. Impulsamos tu negocio. Especialistas en importaciones desde China y EE.UU.",
    url: "https://transtidefreight.com",
    siteName: "Transtide Freight",
    images: [
      {
        url: "https://transtidefreight.com/images/transtide-logo-final.png",
        width: 1200,
        height: 630,
        alt: "Transtide Freight - Logística Internacional",
      },
    ],
  },
}

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="w-full py-12 md:py-16 lg:py-24 relative overflow-hidden hero-section">
        <div className="absolute inset-0 z-0">
          <Image
            src="https://images.unsplash.com/photo-1494412651409-8963ce7935a7?q=80&w=1470&auto=format&fit=crop"
            alt="Transtide Freight - Logística Internacional"
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-primary-800/80 mix-blend-multiply" />
        </div>
        <div className="container px-4 md:px-6 relative z-10">
          <div className="flex flex-col items-center justify-center text-center max-w-4xl mx-auto hero-content">
            <div className="space-y-4 md:space-y-6">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter text-white [text-shadow:_0_2px_4px_rgba(0,0,0,0.5)]">
                Movemos tu carga. Impulsamos tu negocio.
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl text-white/90 max-w-3xl mx-auto [text-shadow:_0_1px_3px_rgba(0,0,0,0.4)]">
                Importá desde China y EE.UU. con rapidez, seguridad y acompañamiento real.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-6 md:mt-8 w-full sm:w-auto">
              <Button
                asChild
                size="lg"
                className="bg-accent hover:bg-accent-700 active:bg-accent-800 text-white transform active:scale-95 transition-all duration-200 text-base md:text-lg px-6 md:px-8 py-4 w-full sm:w-auto min-h-[44px] touch-manipulation"
              >
                <Link href="#contact">Contactanos</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-white bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 active:bg-white/30 hover:text-white text-base md:text-lg px-6 md:px-8 py-4 w-full sm:w-auto min-h-[44px] touch-manipulation"
              >
                <Link href="#services">Nuestros Servicios</Link>
              </Button>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6 text-white mt-6 md:mt-8">
              <div className="flex items-center gap-2 hover:text-accent-300 transition-colors duration-300">
                <MapPin className="h-4 w-4 md:h-5 md:w-5" />
                <span className="text-base md:text-lg">China · EE.UU. · Argentina</span>
              </div>
              <div className="flex items-center gap-2 hover:text-accent-300 transition-colors duration-300">
                <Ship className="h-4 w-4 md:h-5 md:w-5" />
                <span className="text-base md:text-lg">Marítimo · Aéreo · Courier</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Counter */}
      <section className="w-full py-4 md:py-6 bg-gradient-to-r from-primary-800 to-primary-700 text-white">
        <div className="container px-4 md:px-6">
          <div className="grid-stats text-center">
            <StatsCounter
              end={70}
              suffix="%"
              label="De nuestros clientes reducen costos logísticos"
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-white"
                >
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              }
            />
            <StatsCounter
              end={50}
              suffix="+"
              label="Clientes satisfechos"
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-white"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="m22 21-3-3 3-3" />
                  <path d="M16 8h.01" />
                </svg>
              }
            />
            <StatsCounter
              end={3}
              label="Oficinas globales"
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-white"
                >
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              }
            />
            <StatsCounter
              end={24}
              suffix="/7"
              label="Soporte disponible"
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-white"
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              }
            />
          </div>
        </div>
      </section>

      {/* About Us */}
      <section className="w-full py-12 md:py-16 lg:py-20 bg-white" id="about">
        <div className="container px-4 md:px-6">
          <div className="grid-features items-center">
            <div className="relative group">
              <Image
                src="/images/logistics-multimodal.png"
                alt="Transtide Freight - Logística multimodal internacional"
                width={600}
                height={400}
                className="rounded-2xl shadow-2xl group-hover:scale-105 transition-transform duration-500"
                sizes="(max-width: 768px) 100vw, 50vw"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary-800/20 to-transparent rounded-2xl"></div>
            </div>
            <div className="space-y-4 md:space-y-6">
              <div className="space-y-3 md:space-y-4">
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-primary-800 leading-tight">
                  Quiénes Somos
                </h2>
                <p className="text-gray-700 text-base md:text-lg lg:text-xl leading-relaxed">
                  En <span className="font-semibold text-primary-800">Transtide Freight</span> transformamos procesos
                  complejos en soluciones simples. Somos especialistas en logística internacional con presencia global y
                  enfoque personalizado.
                </p>
              </div>

              <div className="relative p-4 md:p-6 lg:p-8 bg-gradient-to-r from-accent-50 to-primary-50 rounded-2xl border-l-4 border-accent shadow-lg">
                <div className="absolute top-4 right-4 w-10 h-10 md:w-12 md:h-12 bg-accent/10 rounded-full flex items-center justify-center">
                  <Package className="h-5 w-5 md:h-6 md:w-6 text-accent" />
                </div>
                <p className="text-base md:text-lg lg:text-xl font-semibold text-primary-800 leading-relaxed pr-12 md:pr-16">
                  Desde la búsqueda de producto hasta la entrega final, nos ocupamos de todo.
                </p>
              </div>

              <Button
                asChild
                size="lg"
                className="bg-accent hover:bg-accent-700 text-white text-base md:text-lg px-6 md:px-8 py-3 md:py-4 transform hover:scale-105 transition-all duration-300 shadow-lg w-full sm:w-auto"
              >
                <Link href="#services" className="flex items-center justify-center">
                  Conocer nuestros servicios <ArrowRight className="ml-2 h-4 w-4 md:h-5 md:w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section
        className="w-full py-12 md:py-16 lg:py-20 bg-gradient-to-br from-primary-50 via-white to-accent-50"
        id="services"
      >
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 md:space-y-6 text-center mb-8 md:mb-12 lg:mb-16">
            <div className="inline-block p-3 md:p-4 bg-gradient-to-br from-primary-100 to-accent-100 rounded-2xl shadow-lg border border-primary-200">
              <Ship className="h-8 w-8 md:h-10 md:w-10 text-primary-800" />
            </div>
            <div className="space-y-3 md:space-y-4">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight bg-gradient-to-r from-primary-800 to-accent bg-clip-text text-transparent">
                Nuestros Servicios
              </h2>
              <p className="mx-auto max-w-4xl text-gray-600 text-base md:text-lg lg:text-xl leading-relaxed">
                Soluciones integrales para optimizar cada etapa de tu importación
              </p>
            </div>
          </div>

          {/* Servicio Principal - Gestión Integral */}
          <div className="mb-10 md:mb-16">
            <IntegralPurchaseFlow
              icon={<Package className="h-10 w-10 md:h-12 md:w-12 text-primary-800" />}
              title="Gestión Integral de Compra Internacional"
              description="Servicio completo desde la identificación del producto hasta su entrega, con calidad y costos optimizados en cada etapa."
              steps={[
                "Cotización detallada de producto",
                "Búsqueda y validación rigurosa de proveedores",
                "Consolidación estratégica en origen",
                "Coordinación profesional de embarque",
                "Seguimiento en tiempo real",
                "Liberación aduanera especializada",
                "Entrega final coordinada",
              ]}
            />
          </div>

          {/* Servicios Complementarios */}
          <div className="space-y-8 md:space-y-12">
            <div className="text-center mb-6 md:mb-12">
              <h3 className="text-2xl md:text-3xl lg:text-4xl font-bold text-primary-800 mb-3 md:mb-4">
                Servicios Especializados
              </h3>
              <p className="text-gray-600 text-base md:text-lg lg:text-xl max-w-4xl mx-auto leading-relaxed">
                Cada servicio está diseñado para maximizar la eficiencia de tu operación
              </p>
            </div>

            {/* Primera fila de servicios */}
            <div className="grid-services-main">
              <ServiceCard
                icon={<Globe className="h-8 w-8 md:h-10 md:w-10 text-primary-800" />}
                title="Sourcing Profesional"
                description="Identificamos y validamos los mejores proveedores del mercado global, asegurando calidad, competitividad y confiabilidad en cada partnership comercial que establecemos para tu empresa."
                items={[
                  "Investigación exhaustiva de mercado",
                  "Negociación estratégica de condiciones comerciales",
                  "Verificación integral de proveedores",
                  "Control de calidad con evidencia visual",
                  "Inspección técnica pre-embarque",
                ]}
                image="/images/sourcing-global.jpg"
              />
              <ServiceCard
                icon={<Ship className="h-8 w-8 md:h-10 md:w-10 text-primary-800" />}
                title="Logística Internacional"
                description="Optimizamos tu cadena de suministro seleccionando la modalidad de transporte más eficiente según las características de tu carga, tiempos requeridos y presupuesto disponible."
                items={[
                  "Transporte marítimo (FCL y LCL)",
                  "Carga aérea express y regular",
                  "Courier internacional especializado",
                  "Trazabilidad completa en tiempo real",
                  "Seguro de carga internacional",
                ]}
                image="https://images.unsplash.com/photo-1605745341112-85968b19335b?q=80&w=1471&auto=format&fit=crop"
              />
              <ServiceCard
                icon={<Truck className="h-8 w-8 md:h-10 md:w-10 text-primary-800" />}
                title="Despacho Aduanero Estratégico"
                description="Gestionamos la liberación de tus mercancías con un enfoque estratégico, optimizando clasificaciones arancelarias y minimizando tiempos de permanencia en puerto."
                items={[
                  "Análisis y clasificación arancelaria optimizada",
                  "Preparación completa de documentación",
                  "Gestión con despachantes certificados",
                  "Cálculo preciso de costos tributarios",
                  "Monitoreo de tiempos portuarios",
                ]}
                image="/images/despacho-aduanero.png"
              />
            </div>

            {/* Segunda fila de servicios */}
            <div className="grid-services-main">
              <ServiceCard
                icon={<Package className="h-8 w-8 md:h-10 md:w-10 text-primary-800" />}
                title="Consolidación Inteligente"
                description="Maximizamos la eficiencia de tus importaciones mediante la consolidación estratégica de múltiples proveedores, reduciendo significativamente los costos logísticos por unidad."
                items={[
                  "Análisis de optimización de cargas",
                  "Consolidación multi-proveedor",
                  "Reducción de costos logísticos",
                  "Coordinación de tiempos de producción",
                  "Gestión de inventarios temporales",
                ]}
                image="/images/consolidacion-inteligente.png"
              />
              <ServiceCard
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-primary-800"
                  >
                    <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
                    <path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9" />
                    <path d="M12 3v6" />
                  </svg>
                }
                title="Almacenaje Estratégico"
                description="Ofrecemos soluciones de almacenamiento flexibles en origen y destino, permitiendo optimizar tus flujos de caja y tiempos de importación según las necesidades de tu negocio."
                items={[
                  "Depósitos seguros en China y EE.UU.",
                  "Almacenamiento temporal flexible",
                  "Gestión de inventarios en tránsito",
                  "Coordinación de entregas programadas",
                  "Servicios de cross-docking",
                ]}
                image="https://images.unsplash.com/photo-1553413077-190dd305871c?q=80&w=1470&auto=format&fit=crop"
              />
              <ServiceCard
                icon={<Clock className="h-8 w-8 md:h-10 md:w-10 text-primary-800" />}
                title="Trazabilidad Avanzada"
                description="Mantenemos total visibilidad de tu operación mediante reportes detallados y actualizaciones en tiempo real, garantizando transparencia absoluta en cada etapa del proceso."
                items={[
                  "Dashboard de seguimiento en tiempo real",
                  "Alertas automáticas de estado",
                  "Reportes detallados por etapa",
                  "Notificaciones proactivas",
                  "Histórico completo de operaciones",
                ]}
                image="/images/trazabilidad-avanzada.png"
              />
            </div>

            {/* Tercera fila - Servicios de consultoría */}
            <div className="grid-services-secondary max-w-5xl mx-auto">
              <ServiceCard
                icon={<Shield className="h-8 w-8 md:h-10 md:w-10 text-primary-800" />}
                title="Consultoría Estratégica"
                description="Desarrollamos estrategias personalizadas de importación que optimizan tus costos, tiempos y procesos, adaptándose perfectamente a las necesidades específicas de tu industria y modelo de negocio."
                items={[
                  "Análisis integral de costos totales",
                  "Estudios comparativos de rutas y tiempos",
                  "Diseño de estructuras de importación",
                  "Optimización de procesos logísticos",
                  "Planificación estratégica a largo plazo",
                ]}
                image="https://images.unsplash.com/photo-1552664730-d307ca884978?q=80&w=1470&auto=format&fit=crop"
              />
              <ServiceCard
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-primary-800"
                  >
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14,2 14,8 20,8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10,9 9,9 8,9" />
                  </svg>
                }
                title="Gestión Documental Especializada"
                description="Garantizamos el cumplimiento normativo mediante la gestión profesional de toda la documentación requerida, minimizando riesgos y asegurando procesos sin contratiempos."
                items={[
                  "Preparación de documentación comercial",
                  "Gestión de certificaciones requeridas",
                  "Cumplimiento normativo internacional",
                  "Archivo digital organizado",
                  "Soporte legal especializado",
                ]}
                image="/images/gestion-documental.jpg"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Shipping Lines */}
      <ShippingLines />

      {/* How it Works */}
      <section className="w-full py-12 md:py-16 lg:py-20 bg-gradient-to-br from-primary-50 to-accent-50" id="process">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 md:space-y-6 text-center mb-8 md:mb-12">
            <div className="inline-block p-3 bg-gradient-to-br from-primary-100 to-accent-100 rounded-2xl shadow-lg border border-primary-200">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-primary-800"
              >
                <path d="M12 22v-5" />
                <path d="M9 8V2" />
                <path d="M15 8V2" />
                <path d="M18 8v4" />
                <path d="M6 8v4" />
                <path d="M12 12v5" />
                <rect x="2" y="8" width="20" height="8" rx="2" />
              </svg>
            </div>
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-primary-800">
              ¿Cómo Funciona Nuestro Modelo?
            </h2>
            <p className="mx-auto max-w-3xl text-gray-600 text-base md:text-lg lg:text-xl leading-relaxed">
              Un proceso simple y efectivo para tu importación
            </p>
          </div>
          <div className="grid-process">
            <ProcessStep
              number="1"
              title="Nos contás qué querés importar"
              description="Compartí con nosotros tus necesidades y objetivos de importación."
              icon={<Package className="h-6 w-6 text-white" />}
            />
            <ProcessStep
              number="2"
              title="Te damos opciones claras de producto, proveedor y logística"
              description="Analizamos las mejores alternativas y te presentamos un plan claro y transparente."
              icon={<Globe className="h-6 w-6 text-white" />}
            />
            <ProcessStep
              number="3"
              title="Coordinamos el embarque desde origen"
              description="Nos encargamos de toda la gestión logística desde el país de origen."
              icon={<Ship className="h-6 w-6 text-white" />}
            />
            <ProcessStep
              number="4"
              title="Supervisamos todo hasta la entrega en tu puerta"
              description="Seguimiento constante y resolución de cualquier inconveniente hasta la entrega final."
              icon={<Truck className="h-6 w-6 text-white" />}
            />
          </div>
        </div>
      </section>

      {/* Cotizador */}
      <Cotizador />

      {/* Why Choose Us */}
      <section className="w-full py-12 md:py-16 lg:py-20 bg-white" id="why-us">
        <div className="container px-4 md:px-6">
          <div className="grid-features items-center">
            <div className="order-2 md:order-1">
              <div className="space-y-4 md:space-y-6">
                <div className="inline-block p-3 bg-primary-100 rounded-xl">
                  <CheckCircle className="h-6 w-6 md:h-8 md:w-8 text-primary-800" />
                </div>
                <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-primary-800">
                  ¿Por Qué Transtide Freight?
                </h2>
                <p className="text-gray-600 text-base md:text-lg lg:text-xl leading-relaxed">
                  Nos destacamos por ofrecer un servicio de excelencia con atención personalizada y resultados
                  comprobados.
                </p>
              </div>
              <div className="mt-6 md:mt-8 space-y-3 md:space-y-4">
                <div className="flex items-start p-3 md:p-4 bg-primary-50 rounded-xl hover:bg-primary-100 transition-colors duration-300 transform hover:scale-105 border-l-4 border-accent">
                  <div className="flex-shrink-0 mt-1">
                    <CheckCircle className="h-5 w-5 md:h-6 md:w-6 text-accent" />
                  </div>
                  <div className="ml-3 md:ml-4">
                    <h3 className="font-semibold text-base md:text-lg text-primary-800">Tiempos rápidos</h3>
                    <p className="text-gray-700 text-sm md:text-base">
                      Estructura ágil que permite optimizar los tiempos de importación.
                    </p>
                  </div>
                </div>
                <div className="flex items-start p-3 md:p-4 bg-primary-50 rounded-xl hover:bg-primary-100 transition-colors duration-300 transform hover:scale-105 border-l-4 border-accent">
                  <div className="flex-shrink-0 mt-1">
                    <CheckCircle className="h-5 w-5 md:h-6 md:w-6 text-accent" />
                  </div>
                  <div className="ml-3 md:ml-4">
                    <h3 className="font-semibold text-base md:text-lg text-primary-800">Agentes propios en origen</h3>
                    <p className="text-gray-700 text-sm md:text-base">
                      Que auditan, verifican y consolidan para garantizar la calidad.
                    </p>
                  </div>
                </div>
                <div className="flex items-start p-3 md:p-4 bg-primary-50 rounded-xl hover:bg-primary-100 transition-colors duration-300 transform hover:scale-105 border-l-4 border-accent">
                  <div className="flex-shrink-0 mt-1">
                    <CheckCircle className="h-5 w-5 md:h-6 md:w-6 text-accent" />
                  </div>
                  <div className="ml-3 md:ml-4">
                    <h3 className="font-semibold text-base md:text-lg text-primary-800">Atención personalizada</h3>
                    <p className="text-gray-700 text-sm md:text-base">
                      Con ejecutivo dedicado para cada cliente y operación.
                    </p>
                  </div>
                </div>
                <div className="flex items-start p-3 md:p-4 bg-primary-50 rounded-xl hover:bg-primary-100 transition-colors duration-300 transform hover:scale-105 border-l-4 border-accent">
                  <div className="flex-shrink-0 mt-1">
                    <CheckCircle className="h-5 w-5 md:h-6 md:w-6 text-accent" />
                  </div>
                  <div className="ml-3 md:ml-4">
                    <h3 className="font-semibold text-base md:text-lg text-primary-800">
                      Previsibilidad y transparencia
                    </h3>
                    <p className="text-gray-700 text-sm md:text-base">
                      En costos y plazos, sin sorpresas ni sobrecostos.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 md:order-2">
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg border border-primary-100">
                  <Image
                    src="/images/puerto-maritimo-operaciones.png"
                    alt="Transtide Freight - Puerto marítimo con grúas y operaciones de contenedores"
                    fill
                    className="object-cover hover:scale-105 transition-transform duration-500"
                    sizes="(max-width: 768px) 50vw, 25vw"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary-800/20 to-transparent"></div>
                </div>
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg border border-accent-100">
                  <Image
                    src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=1470&auto=format&fit=crop"
                    alt="Transtide Freight - Barco carguero en puerto"
                    fill
                    className="object-cover hover:scale-105 transition-transform duration-500"
                    sizes="(max-width: 768px) 50vw, 25vw"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-accent/20 to-transparent"></div>
                </div>
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg border border-accent-100">
                  <Image
                    src="https://images.unsplash.com/photo-1605745341112-85968b19335b?q=80&w=1471&auto=format&fit=crop"
                    alt="Transtide Freight - Grúas portuarias y contenedores"
                    fill
                    className="object-cover hover:scale-105 transition-transform duration-500"
                    sizes="(max-width: 768px) 50vw, 25vw"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-accent/20 to-transparent"></div>
                </div>
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg border border-primary-100">
                  <Image
                    src="https://images.unsplash.com/photo-1494412651409-8963ce7935a7?q=80&w=1470&auto=format&fit=crop"
                    alt="Transtide Freight - Terminal de contenedores internacional"
                    fill
                    className="object-cover hover:scale-105 transition-transform duration-500"
                    sizes="(max-width: 768px) 50vw, 25vw"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary-800/20 to-transparent"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Industries */}
      <section
        className="w-full py-12 md:py-16 lg:py-20 bg-gradient-to-br from-primary-50 to-accent-50"
        id="industries"
      >
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 md:space-y-6 text-center mb-8 md:mb-12">
            <div className="inline-block p-3 bg-gradient-to-br from-primary-100 to-accent-100 rounded-2xl shadow-lg border border-primary-200">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-primary-800"
              >
                <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
                <path d="M17 18h1" />
                <path d="M12 18h1" />
                <path d="M7 18h1" />
              </svg>
            </div>
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-primary-800">
              Rubros Frecuentes
            </h2>
            <p className="mx-auto max-w-3xl text-gray-600 text-base md:text-lg lg:text-xl leading-relaxed">
              Especialización en sectores estratégicos con capacidad de adaptación a cualquier industria
            </p>
          </div>
          <div className="grid-industries">
            <IndustryCard icon="🏗" title="Maquinaria y equipos industriales" />
            <IndustryCard icon="🧰" title="Herramientas y ferretería" />
            <IndustryCard icon="⚙️" title="Autopartes y repuestos" />
            <IndustryCard icon="📺" title="Electrónica y componentes" />
            <IndustryCard icon="🏭" title="Materiales de construcción" />
            <IndustryCard icon="🛍️" title="Bazar y artículos generales" />
          </div>
          <div className="mt-8 md:mt-10 text-center">
            <div className="inline-flex items-center p-4 md:p-6 bg-gradient-to-r from-primary-100 to-accent-100 rounded-2xl border border-primary-200 shadow-lg">
              <p className="text-base md:text-lg lg:text-xl font-medium text-primary-800">
                Nuestra experiencia abarca múltiples sectores industriales y comerciales.
              </p>
            </div>
            <div className="mt-4 md:mt-6">
              <Button
                asChild
                className="bg-accent hover:bg-accent-700 text-white text-base md:text-lg px-6 md:px-8 py-3 transform hover:scale-105 transition-all duration-300 w-full sm:w-auto"
              >
                <Link href="#contact" className="flex items-center justify-center">
                  Consultanos <ArrowRight className="ml-2 h-4 w-4 md:h-5 md:w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="w-full py-12 md:py-16 lg:py-20 bg-white" id="contact">
        <div className="container px-4 md:px-6">
          <div className="grid-contact items-start">
            <div className="flex flex-col justify-center space-y-4 md:space-y-6">
              <div className="space-y-3 md:space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="inline-block p-3 bg-primary-100 rounded-xl">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-primary-800"
                    >
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </div>
                </div>
                <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-primary-800">Contacto</h2>
                <p className="text-gray-600 text-base md:text-lg lg:text-xl">
                  Estamos listos para ayudarte con tu próxima importación
                </p>
              </div>

              <div className="space-y-3 md:space-y-4 mt-4 md:mt-6">
                <div className="flex items-start p-3 md:p-4 bg-primary-50 rounded-xl hover:bg-primary-100 transition-colors duration-300 transform hover:scale-105 border-l-4 border-accent">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-accent mr-3 md:mr-4 flex-shrink-0 mt-1"
                  >
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <div className="flex-1">
                    <div className="font-semibold text-primary-800 mb-2 text-lg">Oficina Argentina</div>
                    <div className="space-y-1">
                      <div className="text-base text-primary-800">Belgrano 3710</div>
                      <div className="text-sm text-gray-600">Ing White, Bahía Blanca</div>
                      <div className="text-sm text-gray-600">Buenos Aires, Argentina</div>
                      <div className="flex items-center mt-2">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-accent mr-2"
                        >
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                        <span className="text-base font-medium text-primary-800">+54 9 11 4439-4020</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-start p-3 md:p-4 bg-primary-50 rounded-xl hover:bg-primary-100 transition-colors duration-300 transform hover:scale-105 border-l-4 border-accent">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-accent mr-3 md:mr-4 flex-shrink-0 mt-1"
                  >
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <div className="flex-1">
                    <div className="font-semibold text-primary-800 mb-2 text-lg">Oficina Estados Unidos</div>
                    <div className="space-y-1">
                      <div className="text-base text-primary-800">5605 NW 74th Ave</div>
                      <div className="text-sm text-gray-600">Miami, FL 33166</div>
                      <div className="text-sm text-gray-600">Estados Unidos</div>
                      <div className="flex items-center mt-2">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-accent mr-2"
                        >
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                        <span className="text-base font-medium text-primary-800">+1 754 236-5652</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-start p-3 md:p-4 bg-primary-50 rounded-xl hover:bg-primary-100 transition-colors duration-300 transform hover:scale-105 border-l-4 border-accent">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-accent mr-3 md:mr-4 flex-shrink-0 mt-1"
                  >
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <div className="flex-1">
                    <div className="font-semibold text-primary-800 mb-2 text-lg">Oficina China</div>
                    <div className="space-y-1">
                      <div className="text-base text-primary-800">Room 902, Jingang Building</div>
                      <div className="text-sm text-gray-600">No. 55 Aona Road, Waigaoqiao Free Trade Zone</div>
                      <div className="text-sm text-gray-600">Pudong New Area, Shanghai</div>
                      <div className="text-sm text-gray-600">China</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center p-3 md:p-4 bg-primary-50 rounded-xl hover:bg-primary-100 transition-colors duration-300 transform hover:scale-105 border-l-4 border-accent">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-accent mr-3 md:mr-4 flex-shrink-0"
                  >
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <span className="text-base md:text-lg text-primary-800">contacto@transtidefreight.com</span>
                </div>

                <div className="flex items-center p-3 md:p-4 bg-primary-50 rounded-xl hover:bg-primary-100 transition-colors duration-300 transform hover:scale-105 border-l-4 border-accent">
                  <Globe className="h-5 w-5 md:h-6 md:w-6 text-accent mr-3 md:mr-4 flex-shrink-0" />
                  <span className="text-base md:text-lg text-primary-800">www.transtidefreight.com</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col space-y-4 md:space-y-6">
              <div className="space-y-3 md:space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="inline-block p-3 bg-primary-100 rounded-xl">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-primary-800"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                </div>
                <h3 className="text-xl md:text-2xl lg:text-3xl font-bold text-primary-800">Envianos tu consulta</h3>
                <p className="text-gray-600 text-base md:text-lg">
                  Completá el formulario y te responderemos a la brevedad
                </p>
              </div>
              <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg sm:shadow-2xl p-4 sm:p-6 lg:p-8 border border-primary-100 sm:border-2 transform hover:scale-105 transition-transform duration-300">
                <ContactForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full py-8 md:py-12 lg:py-16 bg-gradient-to-br from-primary-800 to-primary-900 text-white">
        <div className="container px-4 md:px-6">
          <div className="grid-footer">
            <div>
              <div className="flex items-center mb-4 md:mb-6">
                <Image
                  src="/images/transtide-logo.png"
                  alt="Transtide Freight Logo"
                  width={200}
                  height={80}
                  className="mr-4"
                  sizes="200px"
                />
              </div>
              <p className="text-white/80 mb-4 md:mb-6 text-base md:text-lg">
                Movemos tu carga. Impulsamos tu negocio.
              </p>
              <div className="flex space-x-4 md:space-x-6">
                <a
                  href="#"
                  className="text-white hover:text-accent transition-colors duration-300 transform hover:scale-110"
                  aria-label="Facebook de Transtide Freight"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                  </svg>
                </a>
                <a
                  href="#"
                  className="text-white hover:text-accent transition-colors duration-300 transform hover:scale-110"
                  aria-label="Instagram de Transtide Freight"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                  </svg>
                </a>
                <a
                  href="#"
                  className="text-white hover:text-accent transition-colors duration-300 transform hover:scale-110"
                  aria-label="LinkedIn de Transtide Freight"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                    <rect width="4" height="12" x="2" y="9" />
                    <circle cx="4" cy="4" r="2" />
                  </svg>
                </a>
              </div>
            </div>
            <div>
              <h3 className="text-lg md:text-xl font-semibold mb-4 md:mb-6">Enlaces Rápidos</h3>
              <ul className="space-y-2 md:space-y-3">
                <li>
                  <Link
                    href="#about"
                    className="text-white/80 hover:text-accent transition-colors duration-300 text-base md:text-lg transform hover:translate-x-2 inline-block"
                  >
                    Sobre Nosotros
                  </Link>
                </li>
                <li>
                  <Link
                    href="#services"
                    className="text-white/80 hover:text-accent transition-colors duration-300 text-base md:text-lg transform hover:translate-x-2 inline-block"
                  >
                    Servicios
                  </Link>
                </li>
                <li>
                  <Link
                    href="#process"
                    className="text-white/80 hover:text-accent transition-colors duration-300 text-base md:text-lg transform hover:translate-x-2 inline-block"
                  >
                    Cómo Funciona
                  </Link>
                </li>
                <li>
                  <Link
                    href="#why-us"
                    className="text-white/80 hover:text-accent transition-colors duration-300 text-base md:text-lg transform hover:translate-x-2 inline-block"
                  >
                    Por Qué Elegirnos
                  </Link>
                </li>
                <li>
                  <Link
                    href="#industries"
                    className="text-white/80 hover:text-accent transition-colors duration-300 text-base md:text-lg transform hover:translate-x-2 inline-block"
                  >
                    Industrias
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg md:text-xl font-semibold mb-4 md:mb-6">Oficinas</h3>
              <div className="space-y-3 md:space-y-4">
                <div className="transform hover:scale-105 transition-transform duration-300">
                  <p className="font-medium text-base md:text-lg">Argentina</p>
                  <p className="text-white/80 text-sm md:text-base">Bahía Blanca, Buenos Aires</p>
                  <p className="text-white/60 text-xs md:text-sm">+54 9 11 4439-4020</p>
                </div>
                <div className="transform hover:scale-105 transition-transform duration-300">
                  <p className="font-medium text-base md:text-lg">Estados Unidos</p>
                  <p className="text-white/80 text-sm md:text-base">Miami, Florida</p>
                  <p className="text-white/60 text-xs md:text-sm">+1 754 236-5652</p>
                </div>
                <div className="transform hover:scale-105 transition-transform duration-300">
                  <p className="font-medium text-base md:text-lg">China</p>
                  <p className="text-white/80 text-sm md:text-base">Shanghai, Pudong New Area</p>
                  <p className="text-white/60 text-xs md:text-sm">Waigaoqiao Free Trade Zone</p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-8 md:mt-12 pt-6 md:pt-8 border-t border-white/20 text-center">
            <p className="text-white/60 text-sm md:text-base">
              © 2024 Transtide Freight. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
