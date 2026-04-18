"use client"

import { useEffect, useRef } from "react"

export function BackToTop() {
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const btn = ref.current
    if (!btn) return
    const onScroll = () => {
      const show = window.scrollY > 500
      btn.style.opacity = show ? "1" : "0"
      btn.style.pointerEvents = show ? "auto" : "none"
      btn.style.transform = show ? "scale(1)" : "scale(0.8)"
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <button
      ref={ref}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Volver arriba"
      className="fixed bottom-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-[#ea580c] text-white shadow-[0_4px_12px_rgba(234,88,12,0.4)] transition-all duration-300 lg:bottom-6 lg:right-6 lg:h-12 lg:w-12"
      style={{ opacity: 0, pointerEvents: "none", transform: "scale(0.8)" }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  )
}
