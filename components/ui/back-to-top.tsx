"use client"

import { useEffect, useRef } from "react"

export function BackToTop() {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const btn = ref.current
    if (!btn) return
    const onScroll = () => {
      const show = window.scrollY > 400
      btn.style.opacity = show ? "1" : "0"
      btn.style.pointerEvents = show ? "auto" : "none"
      btn.style.transform = show ? "translateY(0) scale(1)" : "translateY(20px) scale(0.9)"
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  return (
    <button
      ref={ref}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Volver arriba"
      className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#ea580c] text-white shadow-[0_8px_24px_rgba(234,88,12,0.3)] transition-all duration-300 hover:translate-y-[-4px] hover:bg-[#c2410a]"
      style={{ opacity: 0, pointerEvents: "none", transform: "translateY(20px) scale(0.9)" }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  )
}
