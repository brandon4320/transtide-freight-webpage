"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
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
  const pathname = usePathname()
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

  // Hide header entirely inside the gestion portal (after all hooks)
  if (pathname.startsWith("/gestion")) return null

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
                      className="inline-flex h-[36px] items-center rounded-full px-3 py-0 text-[14px] font-medium text-[#0f1a3d] transition-colors hover:bg-white/16 hover:text-[#08112f]"
                    >
                      {item.name}
                    </a>
                  ))}
                </nav>

                <Link
                  href="/gestion"
                  className="inline-flex h-[36px] items-center gap-1.5 rounded-full border border-[rgba(234,88,12,0.25)] bg-white/60 px-4 text-[13px] font-semibold text-[#ea580c] backdrop-blur transition-colors hover:bg-[#fff4ee] hover:border-[rgba(234,88,12,0.5)]"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
                  </svg>
                  Portal
                </Link>
                <Button asChild className="ml-1 inline-flex h-[36px] items-center rounded-full bg-accent px-5 py-0 text-[15px] font-medium text-white shadow-[0_8px_18px_rgba(249,115,22,0.18)] hover:bg-accent-700">
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
                <Link
                  href="/gestion"
                  onClick={handleCloseMenu}
                  className="mt-2 flex items-center gap-2 rounded-2xl border border-[rgba(234,88,12,0.3)] bg-[#fff4ee] px-4 py-3 text-base font-semibold text-[#ea580c]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
                  </svg>
                  Portal de Gestión
                </Link>
                <Button asChild className="mt-2 w-full rounded-full bg-accent py-5 text-base text-white shadow-[0_8px_22px_rgba(249,115,22,0.22)] hover:bg-accent-700">
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
