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
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [isMenuOpen])

  const handleCloseMenu = () => setIsMenuOpen(false)

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50">
        <div className="container mx-auto px-4 pt-2 md:px-6 md:pt-2.5">
          <div
            className={`rounded-[30px] border border-[rgba(24,38,84,0.10)] bg-[rgba(29,45,95,0.20)] transition-all duration-300 ${
              scrolled
                ? "shadow-[0_16px_34px_rgba(15,23,42,0.10)] backdrop-blur-xl"
                : "shadow-[0_10px_24px_rgba(15,23,42,0.07)] backdrop-blur-lg"
            }`}
          >
            <div className="flex h-[58px] items-center justify-between px-4 md:px-5 lg:px-6">
              <a href="#inicio" className="flex items-center" aria-label="Ir al inicio">
                <div className="relative h-7 w-[215px] sm:h-8 sm:w-[245px] lg:w-[270px]">
                  <Image
                    src="/images/transtide-logo-full.png"
                    alt="Transtide Freight"
                    fill
                    className="object-contain object-left"
                    priority
                    sizes="(min-width: 1024px) 270px, (min-width: 640px) 245px, 215px"
                  />
                </div>
              </a>

              <div className="hidden items-center gap-2 lg:flex">
                <nav className="flex items-center gap-0.5 xl:gap-1">
                  {navItems.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className="rounded-full px-3 py-1.5 text-[14px] font-medium text-[#0f1a3d] transition-colors hover:bg-white/16 hover:text-[#08112f]"
                    >
                      {item.name}
                    </a>
                  ))}
                </nav>

                <Button asChild className="ml-2 h-auto rounded-full bg-accent px-5 py-2 text-[15px] font-medium text-white shadow-[0_8px_18px_rgba(249,115,22,0.18)] hover:bg-accent-700">
                  <a href="#contact">Cotizar operación</a>
                </Button>
              </div>

              <button
                type="button"
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-2xl border border-[rgba(24,38,84,0.10)] bg-white/18 text-[#0f1a3d] backdrop-blur lg:hidden"
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
        <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={handleCloseMenu}>
          <div className="container px-4 pt-[76px] md:px-6" onClick={(e) => e.stopPropagation()}>
            <div className="rounded-[26px] border border-[rgba(24,38,84,0.10)] bg-[rgba(29,45,95,0.34)] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.14)] backdrop-blur-xl">
              <nav className="space-y-2">
                <a href="#inicio" onClick={handleCloseMenu} className="block rounded-2xl px-4 py-3 text-base font-medium text-[#0f1a3d] hover:bg-white/12">
                  Inicio
                </a>
                {navItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={handleCloseMenu}
                    className="block rounded-2xl px-4 py-3 text-base font-medium text-[#0f1a3d] hover:bg-white/12"
                  >
                    {item.name}
                  </a>
                ))}
                <Button asChild className="mt-3 w-full rounded-full bg-accent py-5 text-base text-white shadow-[0_8px_22px_rgba(249,115,22,0.22)] hover:bg-accent-700">
                  <a href="#contact" onClick={handleCloseMenu}>Cotizar operación</a>
                </Button>
              </nav>
            </div>
          </div>
        </div>
      )}

      <div className="h-[72px] md:h-[76px]" />
    </>
  )
}
