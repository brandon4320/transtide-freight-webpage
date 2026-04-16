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
      <header className="fixed inset-x-0 top-0 z-50">
        <div className="container mx-auto px-4 pt-4 md:px-6 md:pt-5">
          <div
            className={`rounded-[34px] border border-white/18 bg-[rgba(139,123,156,0.72)] transition-all duration-300 ${
              scrolled
                ? "shadow-[0_22px_60px_rgba(15,23,42,0.22)] backdrop-blur-xl"
                : "shadow-[0_16px_42px_rgba(15,23,42,0.14)] backdrop-blur-lg"
            }`}
          >
            <div className="flex h-[82px] items-center justify-between px-5 md:px-7 lg:px-8">
              <a href="#inicio" className="flex items-center" aria-label="Ir al inicio">
                <div className="relative h-7 w-[280px] sm:h-8 sm:w-[300px]">
                  <Image
                    src="/images/transtide-logo-white.png"
                    alt="Transtide Freight"
                    fill
                    className="object-contain object-left"
                    priority
                    sizes="300px"
                  />
                </div>
              </a>

              <div className="hidden items-center gap-3 lg:flex">
                <nav className="flex items-center gap-1 xl:gap-2">
                  {navItems.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className="rounded-full px-4 py-2.5 text-base font-medium text-white/92 transition-colors hover:bg-white/8 hover:text-white"
                    >
                      {item.name}
                    </a>
                  ))}
                </nav>

                <Button asChild className="ml-3 h-auto rounded-full bg-accent px-7 py-4 text-lg font-medium text-white shadow-[0_10px_28px_rgba(249,115,22,0.30)] hover:bg-accent-700">
                  <a href="#contact">Cotizar operación</a>
                </Button>
              </div>

              <button
                type="button"
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className="inline-flex min-h-[46px] min-w-[46px] items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white backdrop-blur lg:hidden"
                aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
                aria-expanded={isMenuOpen}
              >
                {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {isMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={handleCloseMenu}>
          <div className="container px-4 pt-[104px] md:px-6" onClick={(e) => e.stopPropagation()}>
            <div className="rounded-[28px] border border-white/18 bg-[rgba(139,123,156,0.92)] p-4 shadow-[0_22px_60px_rgba(15,23,42,0.24)] backdrop-blur-xl">
              <nav className="space-y-2">
                <a href="#inicio" onClick={handleCloseMenu} className="block rounded-2xl px-4 py-3 text-base font-medium text-white hover:bg-white/8">
                  Inicio
                </a>
                {navItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={handleCloseMenu}
                    className="block rounded-2xl px-4 py-3 text-base font-medium text-white/90 hover:bg-white/8 hover:text-white"
                  >
                    {item.name}
                  </a>
                ))}
                <Button asChild className="mt-3 w-full rounded-full bg-accent py-6 text-lg text-white shadow-[0_10px_28px_rgba(249,115,22,0.30)] hover:bg-accent-700">
                  <a href="#contact" onClick={handleCloseMenu}>Cotizar operación</a>
                </Button>
              </nav>
            </div>
          </div>
        </div>
      )}

      <div className="h-[102px] md:h-[110px]" />
    </>
  )
}
