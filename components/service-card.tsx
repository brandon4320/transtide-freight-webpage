"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Image from "next/image"
import { useState, useEffect, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

interface ServiceCardProps {
  icon: ReactNode
  title: string
  description: string
  items?: string[]
  image?: string
}

export default function ServiceCard({ icon, title, description, items = [], image }: ServiceCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640) // Tailwind's sm breakpoint
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  const toggleExpanded = () => {
    if (isMobile) {
      setIsExpanded(!isExpanded)
    }
  }

  return (
    <Card className="h-auto overflow-hidden service-card group border-0 shadow-md hover:shadow-lg transition-all duration-300 bg-white border-l-4 border-accent touch-manipulation">
      {image && (
        <div className="relative h-40 sm:h-48 w-full overflow-hidden">
          <Image
            src={image || "/placeholder.svg"}
            alt={title}
            fill
            className="object-cover group-hover:scale-110 transition-transform duration-500"
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary-800/80 via-primary-800/20 to-transparent"></div>
          <div className="absolute bottom-3 sm:bottom-4 left-3 sm:left-4">
            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-white/95 backdrop-blur-sm shadow-lg group-hover:scale-110 transition-transform duration-500 border-2 border-accent/20">
              {icon}
            </div>
          </div>
        </div>
      )}

      <CardHeader
        className={`${image ? "pt-4 sm:pt-6" : "pt-6 sm:pt-8"} pb-3 sm:pb-4 relative ${isMobile ? "cursor-pointer" : ""}`}
        onClick={isMobile ? toggleExpanded : undefined} // Permitir expandir/colapsar tocando el header en móvil
      >
        {!image && (
          <div className="flex items-center gap-3 mb-3 sm:mb-4">
            <div className="p-2 sm:p-3 bg-primary-50 rounded-xl group-hover:bg-primary-100 transition-colors duration-500 border border-primary-200">
              {icon}
            </div>
          </div>
        )}
        <CardTitle className="text-lg sm:text-xl font-bold text-primary-800 leading-tight mb-2 sm:mb-3 group-hover:text-accent transition-colors duration-500">
          {title}
        </CardTitle>
        <CardDescription className="text-gray-600 leading-relaxed text-sm sm:text-base mb-3 sm:mb-4">
          {description}
        </CardDescription>
      </CardHeader>

      {items && items.length > 0 && (
        <CardContent
          className={`pt-0 pb-6 sm:pb-8
            sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity sm:duration-500
            sm:max-h-0 sm:group-hover:max-h-[500px] sm:overflow-hidden sm:translate-y-4 sm:group-hover:translate-y-0 sm:transition-all sm:ease-out
            ${isMobile ? "cursor-pointer" : ""}
          `}
          onClick={isMobile ? toggleExpanded : undefined}
        >
          <div
            className={`transition-all duration-500 ease-in-out ${
              isMobile
                ? isExpanded
                  ? "max-h-[500px] opacity-100"
                  : "max-h-10 opacity-60 overflow-hidden"
                : "space-y-3"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              {/* Texto "Incluye:" solo visible en desktop y cuando está expandido en móvil */}
              <h4
                className={`font-semibold text-accent text-sm uppercase tracking-wide transition-opacity duration-300 ${
                  isMobile ? (isExpanded ? "opacity-100" : "hidden") : "block"
                }`}
              >
                Incluye:
              </h4>
              {isMobile && (
                <button
                  className={`p-1 rounded-full bg-primary-50 hover:bg-primary-100 transition-all duration-300 min-h-[32px] min-w-[32px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-accent ml-auto ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                  aria-label={isExpanded ? "Colapsar lista" : "Expandir lista"}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleExpanded()
                  }}
                >
                  <ChevronDown className="h-5 w-5 text-accent" />
                </button>
              )}
            </div>
            {/* Lista de items */}
            {(!isMobile || isExpanded) && (
              <ul className={`space-y-2 ${isMobile && !isExpanded ? "hidden" : "block"}`}>
                {items.map((item, index) => (
                  <li
                    key={index}
                    className="flex items-start text-sm text-gray-700 transform sm:translate-x-4 sm:group-hover:translate-x-0 transition-transform duration-500"
                    style={{ transitionDelay: `${index * 50}ms` }}
                  >
                    <div className="w-1.5 h-1.5 bg-accent rounded-full mt-1.5 mr-3 flex-shrink-0"></div>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      )}

      {/* Indicador visual de hover para desktop */}
      <div className="hidden sm:block absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-accent to-accent-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left"></div>
    </Card>
  )
}
