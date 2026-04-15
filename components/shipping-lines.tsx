import Image from "next/image"
import { Ship } from "lucide-react"

export default function ShippingLines() {
  const shippingLines = [
    {
      name: "COSCO Shipping",
      image: "/images/ships/cosco-ship.jpg",
    },
    {
      name: "MSC",
      image: "/images/ships/msc-ship.jpg",
      priority: true, // Añadir prioridad para asegurar carga
    },
    {
      name: "Maersk",
      image: "/images/ships/maersk-ship.jpg",
    },
    {
      name: "CMA CGM",
      image: "/images/ships/cma-cgm-ship.jpg",
    },
    {
      name: "Evergreen",
      image: "/images/ships/evergreen-ship.jpg",
    },
    {
      name: "Hapag-Lloyd",
      image: "/images/ships/hapag-lloyd-ship.jpg",
    },
    {
      name: "HMM",
      image: "/images/ships/hmm-ship.jpg",
    },
    {
      name: "ZIM",
      image: "/images/ships/zim-ship.jpg",
    },
  ]

  return (
    <section className="w-full py-8 sm:py-12 md:py-16 lg:py-20 bg-gradient-to-br from-primary-50 via-white to-accent-50">
      <div className="container px-4 md:px-6">
        <div className="text-center mb-6 sm:mb-8 md:mb-12 lg:mb-16">
          <div className="inline-flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4 md:mb-6">
            <div className="p-2 sm:p-3 bg-gradient-to-br from-primary-100 to-accent-100 rounded-xl sm:rounded-2xl shadow-lg border border-primary-200">
              <Ship className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 text-primary-800" />
            </div>
          </div>
          <div className="space-y-2 sm:space-y-3 md:space-y-4">
            <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-primary-800">
              Alianzas Estratégicas con Navieras
            </h2>
            <p className="text-gray-600 text-sm sm:text-base md:text-lg lg:text-xl max-w-4xl mx-auto leading-relaxed px-4 sm:px-0">
              Trabajamos con las principales líneas marítimas del mundo para garantizar disponibilidad de espacio,
              tarifas competitivas y la mejor cobertura global para tus importaciones.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-6 sm:mb-8 md:mb-12">
          {shippingLines.map((line, index) => (
            <div
              key={index}
              className="group bg-white rounded-lg sm:rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden border border-gray-100 hover:border-accent/30 transform hover:-translate-y-1"
            >
              <div className="relative h-24 sm:h-32 md:h-40 overflow-hidden">
                <Image
                  src={line.image || "/placeholder.svg"}
                  alt={`${line.name} - Barco de contenedores`}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  loading={line.name === "MSC" ? "eager" : "lazy"}
                  priority={line.name === "MSC"}
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 25vw"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-primary-800/80 via-primary-800/40 to-transparent"></div>
                <div className="absolute top-0 left-0 right-0 p-2 sm:p-3">
                  <h3 className="font-bold text-white text-xs sm:text-sm md:text-base text-center group-hover:text-white/90 transition-colors duration-300 [text-shadow:_0_2px_5px_rgba(0,0,0,0.6)]">
                    {line.name}
                  </h3>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 sm:mt-12 bg-white rounded-2xl sm:rounded-3xl shadow-lg border border-gray-100 p-4 sm:p-6 md:p-8 lg:p-10">
          <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-primary-800 mb-6 sm:mb-8 text-center sm:text-left">
            Beneficios de nuestras alianzas navieras
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
            <div className="flex items-start p-3 sm:p-4 bg-primary-50 rounded-lg sm:rounded-xl hover:bg-primary-100 transition-colors duration-300">
              <div className="text-primary-600 mr-3 sm:mr-4 flex-shrink-0">
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
                  className="h-6 w-6 sm:h-8 sm:w-8"
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
              <div>
                <h4 className="text-base sm:text-lg font-semibold text-primary-700 mb-1 sm:mb-2">
                  Tarifas preferenciales
                </h4>
                <p className="text-gray-600 text-sm sm:text-base">
                  Acceso a precios competitivos gracias a nuestros acuerdos de volumen.
                </p>
              </div>
            </div>

            <div className="flex items-start p-3 sm:p-4 bg-primary-50 rounded-lg sm:rounded-xl hover:bg-primary-100 transition-colors duration-300">
              <div className="text-primary-600 mr-3 sm:mr-4 flex-shrink-0">
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
                  className="h-6 w-6 sm:h-8 sm:w-8"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <h4 className="text-base sm:text-lg font-semibold text-primary-700 mb-1 sm:mb-2">
                  Garantía de espacio
                </h4>
                <p className="text-gray-600 text-sm sm:text-base">
                  Aseguramos disponibilidad incluso en temporadas de alta demanda.
                </p>
              </div>
            </div>

            <div className="flex items-start p-3 sm:p-4 bg-primary-50 rounded-lg sm:rounded-xl hover:bg-primary-100 transition-colors duration-300">
              <div className="text-primary-600 mr-3 sm:mr-4 flex-shrink-0">
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
                  className="h-6 w-6 sm:h-8 sm:w-8"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <h4 className="text-base sm:text-lg font-semibold text-primary-700 mb-1 sm:mb-2">
                  Tiempos de tránsito optimizados
                </h4>
                <p className="text-gray-600 text-sm sm:text-base">
                  Rutas directas y servicios express para reducir tiempos de entrega.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 sm:mt-8 flex justify-center">
            <a
              href="#contact"
              className="inline-flex items-center px-4 sm:px-6 py-2 sm:py-3 bg-accent hover:bg-accent-700 text-white font-medium rounded-lg transition-colors duration-300 text-sm sm:text-base"
            >
              Consultar disponibilidad
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="ml-2 h-4 w-4 sm:h-5 sm:w-5"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
