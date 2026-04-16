"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const navItems = [
  { name: "Servicios", href: "#services" },
  { name: "Cómo trabajamos", href: "#process" },
  { name: "Operaciones", href: "#operations" },
  { name: "Nosotros", href: "#about" },
  { name: "Contacto", href: "#contact" },
]

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }

    return () => {
      document.body.style.overflow = ""
    }
  }, [isMenuOpen])

  const handleCloseMenu = () => setIsMenuOpen(false)

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-200 ${
          scrolled ? "border-slate-200 bg-white/95 hackdrop-blur" : "border-transparent bg-white/92"
        }`}
      >
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex h-[76px] items-center justify-between">
            <a href="#inicio" className="flex items-center" aria-label="Ir al inicio">
              <div className="relative h-7 w-48 sm:h-8 sm:w-56">
                <Image
                  src="/images/transtide-logo.png"
                  alt="Transtide Freight"
                  fill
                  className="object-contain object-left"
                  priority
                  sizes="176px"
                />
              </div>
            </a>

            <div className="hidden items-center gap-2 lg:flex">
              <nav className="flex items-center gap-1">
                {navItems.map((item) => (
                  <a key={item.href} href={item.href} className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950">
                    {item.name}
                  </a>
                ))}
              </nav>

              <Button asChild className="ml-3 rounded-full bg-accent px-5 text-white hover:bg-accent-700">
                <a href="#contact">Cotizar operación</a>
              </Button>
            </div>

            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 lg:hidden"
              aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {isMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={handleCloseMenu}>
          <div className="absolute inset-x-0 top-[76px] border-b border-slate-200 bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="container px-4 py-4">
              <nav className="space-y-2">
                <a href="#inicio" onClick={handleCloseMenu} className="block rounded-2xl px-4 py-3 text-base font-medium text-slate-900 hover:bg-slate-50">
                  Inicio
                </a>
                {navItems.map((item) => (
                  <a key={item.href} href={item.href} onClick={handleCloseMenu} className="block rounded-2xl px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-50">
                    {item.name}
                  </a>
                ))}
                <Button asChild className="mt-3 w-full bg-accent text-white hover:bg-accent-700">
                  <a href="#contact" onClick={handleCloseMenu}>Cotizar operación</a>
                </Button>
              </nav>
            </div>
          </div>
        </div>
      )}

      <div className="h-[76px]" />
    </>
  )
}
