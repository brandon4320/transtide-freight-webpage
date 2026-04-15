"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

export default function PreviewPage() {
  const searchParams = useSearchParams()
  const device = searchParams.get("device")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simulamos carga
    setTimeout(() => setIsLoading(false), 500)
  }, [device])

  // Función para determinar el tamaño de la vista previa
  const getViewportSize = () => {
    switch (device) {
      case "iPhone SE":
        return { width: 375, height: 667 }
      case "iPhone 12/13":
        return { width: 390, height: 844 }
      case "Samsung Galaxy S21":
        return { width: 360, height: 800 }
      case "iPad Mini":
        return { width: 768, height: 1024 }
      case "iPad Pro":
        return { width: 1024, height: 1366 }
      case "Desktop":
        return { width: 1440, height: 900 }
      default:
        return { width: 375, height: 667 }
    }
  }

  const viewport = getViewportSize()

  return (
    <div style={{ width: viewport.width, height: viewport.height, overflow: "hidden" }}>
      {isLoading ? (
        <div className="flex items-center justify-center h-full bg-gray-100">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-800"></div>
        </div>
      ) : (
        <iframe src="/" title={`Vista previa en ${device}`} style={{ width: "100%", height: "100%", border: "none" }} />
      )}
    </div>
  )
}
