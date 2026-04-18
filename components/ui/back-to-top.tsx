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
      btn.style.transform = show ? "translateY(0) scale(1)" : "translateY(16px) scale(0.85)"
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll() // run once on mount
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <button
      ref={ref}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Volver arriba"
      className="fixed bottom-5 right-5 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-[#ea580c] text-white shadow-[0_4px_16px_rgba(234,88,12,0.35)] transition-all duration-300"
      style={{ opacity: 0, pointerEvents: "none", transform: "translateY(16px) scale(0.85)" }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  )
}
