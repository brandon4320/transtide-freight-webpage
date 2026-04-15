"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState("inicio")

  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 50
      setScrolled(isScrolled)

      // Detectar sección activa basada en scroll
      const sections = ["inicio", "services", "process", "why-us", "industries"]
      const scrollPosition = window.scrollY + window.innerHeight / 3 // Ajustado para mayor precisión

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i]
        let element

        if (section === "inicio") {
          if (scrollPosition < 400) {
            setActiveSection("inicio")
            return
          }
        } else {
          element = document.getElementById(section)
          if (element && scrollPosition >= element.offsetTop) {
            setActiveSection(section)
            return
          }
        }
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMenuOpen(false)
    }

    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  }, [])

  // Prevenir scroll del body cuando el menú está abierto
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = "hidden"
      document.body.style.position = "fixed"
      document.body.style.width = "100%"
      document.body.style.top = `-${window.scrollY}px`
    } else {
      const scrollY = document.body.style.top
      document.body.style.overflow = ""
      document.body.style.position = ""
      document.body.style.width = ""
      document.body.style.top = ""
      if (scrollY) {
        window.scrollTo(0, Number.parseInt(scrollY || "0") * -1)
      }
    }

    return () => {
      document.body.style.overflow = ""
      document.body.style.position = ""
      document.body.style.width = ""
      document.body.style.top = ""
    }
  }, [isMenuOpen])

  const navItems = [
    { name: "Inicio", href: "#inicio", id: "inicio" },
    { name: "Servicios", href: "#services", id: "services" },
    { name: "Proceso", href: "#process", id: "process" },
    { name: "Por Qué Elegirnos", href: "#why-us", id: "why-us" },
    { name: "Industrias", href: "#industries", id: "industries" },
  ]

  const handleNavClick = (href: string, id: string) => {
    setIsMenuOpen(false)
    setActiveSection(id)

    setTimeout(() => {
      if (id === "inicio") {
        window.scrollTo({ top: 0, behavior: "smooth" })
      } else {
        const element = document.getElementById(id)
        if (element) {
          const headerElement = document.querySelector("header")
          const headerHeight = headerElement ? headerElement.offsetHeight : 100 // fallback a 100px
          const offsetTop = element.offsetTop - headerHeight - 20 // 20px de margen adicional
          window.scrollTo({ top: offsetTop, behavior: "smooth" })
        }
      }
    }, 100)
  }

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-white/95 backdrop-blur-md shadow-md border-b border-gray-200" : "bg-white/10 backdrop-blur-md"
        }`}
        style={{
          WebkitBackdropFilter: "blur(12px)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="container mx-auto px-4 lg:px-6">
          {/* Desktop Header - Solo visible en pantallas grandes */}
          <div className="hidden lg:block">
            <div className="flex justify-center py-1 border-b border-white/20">
              <button onClick={() => handleNavClick("#inicio", "inicio")} className="flex items-center">
                <div className="relative w-[990px] h-36">
                  <Image
                    src="/images/transtide-logo.png"
                    alt="Transtide Freight"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
              </button>
            </div>

            <div className="flex items-center justify-center py-1">
              <nav className="flex items-center space-x-8">
                {navItems.map((item) => (
                  <button
                    key={item.name}
                    onClick={() => handleNavClick(item.href, item.id)}
                    className={`relative text-lg font-medium transition-all duration-300 hover:scale-105 px-3 py-2 rounded-lg ${
                      activeSection === item.id
                        ? "text-accent bg-accent/20"
                        : scrolled
                          ? "text-primary-800 hover:text-accent hover:bg-accent/10"
                          : "text-white hover:text-accent hover:bg-white/10 drop-shadow-lg"
                    }`}
                  >
                    {item.name}
                    {activeSection === item.id && (
                      <span className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-6 h-0.5 bg-accent rounded-full" />
                    )}
                  </button>
                ))}

                <Button
                  onClick={() => handleNavClick("#contact", "contact")}
                  className={`ml-6 bg-accent hover:bg-accent-700 text-white font-semibold px-8 py-3 rounded-full transition-all duration-300 hover:scale-105 hover:shadow-xl transform ${
                    scrolled ? "shadow-lg" : "shadow-2xl"
                  }`}
                >
                  Contáctanos
                </Button>
              </nav>
            </div>
          </div>

          {/* Mobile Header - Completamente nuevo */}
          <div className="lg:hidden">
            <div className="flex items-center justify-between h-20 w-full">
              {/* Logo */}
              <button onClick={() => handleNavClick("#inicio", "inicio")} className="flex items-center flex-shrink-0">
                <div className="relative w-32 sm:w-40 h-14 sm:h-16">
                  <Image
                    src="/images/transtide-logo.png"
                    alt="Transtide Freight"
                    fill
                    className="object-contain"
                    priority
                    sizes="(max-width: 640px) 128px, 160px"
                  />
                </div>
              </button>

              {/* Hamburger Button */}
              <button
                onClick={toggleMenu}
                className={`relative z-[60] p-3 rounded-xl transition-all duration-300 min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0 ${
                  scrolled
                    ? "text-primary-800 hover:bg-primary-100 bg-white/80"
                    : "text-white hover:bg-white/20 bg-black/20"
                } shadow-lg`}
                aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
                aria-expanded={isMenuOpen}
                type="button"
              >
                {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Overlay - Completamente nuevo */}
      {isMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-[55] bg-white/98 backdrop-blur-xl">
          <div className="pt-24 pb-8 px-4 h-full overflow-y-auto">
            <nav className="space-y-2">
              {navItems.map((item, index) => (
                <button
                  key={item.name}
                  onClick={() => handleNavClick(item.href, item.id)}
                  className={`block w-full text-left py-4 px-4 text-lg font-medium transition-all duration-300 rounded-xl min-h-[44px] ${
                    activeSection === item.id
                      ? "text-accent bg-accent/10 border-l-4 border-accent shadow-sm"
                      : "text-gray-800 hover:text-accent hover:bg-accent/5 active:bg-accent/10"
                  }`}
                  style={{
                    animationDelay: `${index * 50}ms`,
                  }}
                >
                  {item.name}
                </button>
              ))}

              <div className="pt-6">
                <Button
                  onClick={() => handleNavClick("#contact", "contact")}
                  className="w-full bg-accent hover:bg-accent-700 text-white font-semibold py-4 text-lg rounded-xl transition-all duration-300 shadow-lg min-h-[44px]"
                >
                  Contáctanos
                </Button>
              </div>
            </nav>
          </div>
        </div>
      )}

      {/* Spacer */}
      <div className="h-20 lg:h-[160px]" />
    </>
  )
}
