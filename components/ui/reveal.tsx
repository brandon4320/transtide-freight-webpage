"use client"

import { useEffect, useRef } from "react"

interface RevealProps {
  children: React.ReactNode
  delay?: number
  className?: string
}

export function Reveal({ children, delay = 0, className = "" }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        el.style.opacity = "1"
        el.style.transform = "translateY(0)"
        obs.disconnect()
      }
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: 0,
        transform: "translateY(30px)",
        transition: `opacity 0.8s cubic-bezier(.25,.46,.45,.94) ${delay}ms, transform 0.8s cubic-bezier(.25,.46,.45,.94) ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}
