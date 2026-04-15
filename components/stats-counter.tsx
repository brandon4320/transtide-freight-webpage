"use client"

import { useState, useEffect, useRef } from "react"
import type { ReactNode } from "react"

interface StatsCounterProps {
  end: number
  suffix?: string
  label: string
  icon?: ReactNode
}

export default function StatsCounter({ end, suffix = "", label, icon }: StatsCounterProps) {
  const [count, setCount] = useState(0)
  const countRef = useRef<HTMLDivElement>(null)
  const hasAnimated = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true
          animateCount()
        }
      },
      { threshold: 0.1 },
    )

    if (countRef.current) {
      observer.observe(countRef.current)
    }

    return () => {
      if (countRef.current) {
        observer.unobserve(countRef.current)
      }
    }
  }, [])

  const animateCount = () => {
    const duration = 2000 // 2 seconds
    const frameDuration = 1000 / 60 // 60fps
    const totalFrames = Math.round(duration / frameDuration)
    const easeOutQuad = (t: number) => t * (2 - t)

    let frame = 0
    const countTo = end

    const counter = setInterval(() => {
      frame++
      const progress = easeOutQuad(frame / totalFrames)
      const currentCount = Math.round(countTo * progress)

      if (currentCount === countTo) {
        clearInterval(counter)
      }

      setCount(currentCount)
    }, frameDuration)
  }

  return (
    <div ref={countRef} className="flex flex-col items-center p-4">
      {icon && <div className="mb-3 p-2 bg-white/10 rounded-full">{icon}</div>}
      <div className="text-4xl font-bold text-white mb-2">
        {count}
        {suffix}
      </div>
      <div className="text-sm text-white/80">{label}</div>
    </div>
  )
}
