"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Smartphone, Tablet, Monitor, Check, X, ArrowRight } from "lucide-react"

interface DeviceSpec {
  name: string
  width: number
  height: number
  devicePixelRatio: number
  userAgent: string
  type: "mobile" | "tablet" | "desktop"
  icon: React.ReactNode
}

export default function DevicePreview() {
  const [currentUrl, setCurrentUrl] = useState("/")
  const [isLoading, setIsLoading] = useState(false)
  const [checkResults, setCheckResults] = useState<Record<string, boolean>>({})

  const devices: DeviceSpec[] = [
    {
      name: "iPhone SE",
      width: 375,
      height: 667,
      devicePixelRatio: 2,
      userAgent: "iPhone",
      type: "mobile",
      icon: <Smartphone className="h-4 w-4" />,
    },
    {
      name: "iPhone 12/13",
      width: 390,
      height: 844,
      devicePixelRatio: 3,
      userAgent: "iPhone",
      type: "mobile",
      icon: <Smartphone className="h-4 w-4" />,
    },
    {
      name: "Samsung Galaxy S21",
      width: 360,
      height: 800,
      devicePixelRatio: 3,
      userAgent: "Android",
      type: "mobile",
      icon: <Smartphone className="h-4 w-4" />,
    },
    {
      name: "iPad Mini",
      width: 768,
      height: 1024,
      devicePixelRatio: 2,
      userAgent: "iPad",
      type: "tablet",
      icon: <Tablet className="h-4 w-4" />,
    },
    {
      name: "iPad Pro",
      width: 1024,
      height: 1366,
      devicePixelRatio: 2,
      userAgent: "iPad",
      type: "tablet",
      icon: <Tablet className="h-4 w-4" />,
    },
    {
      name: "Desktop",
      width: 1440,
      height: 900,
      devicePixelRatio: 1,
      userAgent: "Desktop",
      type: "desktop",
      icon: <Monitor className="h-4 w-4" />,
    },
  ]

  const [selectedDevice, setSelectedDevice] = useState<DeviceSpec>(devices[0])

  const handleDeviceChange = (deviceName: string) => {
    const device = devices.find((d) => d.name === deviceName)
    if (device) {
      setSelectedDevice(device)
      setIsLoading(true)
      // Simular carga
      setTimeout(() => setIsLoading(false), 500)
    }
  }

  const checkElements = () => {
    setIsLoading(true)

    // Simulamos la verificación de elementos clave
    setTimeout(() => {
      setCheckResults({
        navigation: true,
        buttons: true,
        forms: true,
        images: true,
        typography: true,
        spacing: selectedDevice.width < 375 ? false : true,
        touch: true,
        scroll: true,
      })
      setIsLoading(false)
    }, 1000)
  }

  const getScaleRatio = () => {
    // Calculamos una escala para que el dispositivo quepa en la pantalla
    const maxWidth = 900
    const maxHeight = 600
    const widthRatio = maxWidth / selectedDevice.width
    const heightRatio = maxHeight / selectedDevice.height
    return Math.min(widthRatio, heightRatio, 1) // No escalar hacia arriba
  }

  return (
    <div className="w-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h2 className="text-xl font-bold text-primary-800 mb-1">Prueba de Dispositivos Móviles</h2>
        <p className="text-sm text-gray-600">Verifica cómo se ve el sitio en diferentes tamaños de pantalla</p>
      </div>

      <div className="p-4">
        <Tabs defaultValue="devices" className="w-full">
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="devices">Dispositivos</TabsTrigger>
            <TabsTrigger value="checks">Verificaciones</TabsTrigger>
          </TabsList>

          <TabsContent value="devices" className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {devices.map((device) => (
                <Button
                  key={device.name}
                  variant={selectedDevice.name === device.name ? "default" : "outline"}
                  className={`h-auto py-2 px-3 flex flex-col items-center justify-center text-xs ${
                    selectedDevice.name === device.name ? "bg-primary-800 text-white" : ""
                  }`}
                  onClick={() => handleDeviceChange(device.name)}
                >
                  {device.icon}
                  <span className="mt-1">{device.name}</span>
                  <span className="text-[10px] opacity-70 mt-1">
                    {device.width}x{device.height}
                  </span>
                </Button>
              ))}
            </div>

            <div className="bg-gray-100 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm font-medium text-primary-800">{selectedDevice.name}</span>
                  <span className="text-xs text-gray-500 ml-2">
                    {selectedDevice.width}x{selectedDevice.height}, {selectedDevice.devicePixelRatio}x
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="text-xs bg-primary-100 text-primary-800 px-2 py-1 rounded">
                    {selectedDevice.type}
                  </span>
                </div>
              </div>

              <div
                className="relative bg-white mx-auto overflow-hidden border border-gray-300 shadow-md transition-all duration-300"
                style={{
                  width: `${selectedDevice.width * getScaleRatio()}px`,
                  height: `${selectedDevice.height * getScaleRatio()}px`,
                  maxWidth: "100%",
                  transform: `scale(${getScaleRatio()})`,
                  transformOrigin: "top left",
                }}
              >
                {isLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-800"></div>
                  </div>
                ) : (
                  <div className="w-full h-full overflow-hidden">
                    <div
                      className="relative w-full h-full"
                      style={{ transform: `scale(${1 / getScaleRatio()})`, transformOrigin: "top left" }}
                    >
                      <iframe
                        src={`/preview?device=${selectedDevice.name}`}
                        title={`Vista previa en ${selectedDevice.name}`}
                        className="border-0"
                        style={{
                          width: `${selectedDevice.width}px`,
                          height: `${selectedDevice.height}px`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex justify-between items-center">
                <div className="text-xs text-gray-500">
                  <span className="font-medium">Escala:</span> {Math.round(getScaleRatio() * 100)}%
                </div>
                <Button size="sm" onClick={checkElements} disabled={isLoading}>
                  Verificar elementos
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="checks">
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-primary-800 mb-2">
                  Resultados de verificación para {selectedDevice.name}
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(checkResults).length > 0 ? (
                    Object.entries(checkResults).map(([key, passed]) => (
                      <div key={key} className="flex items-center p-2 bg-white rounded border">
                        {passed ? (
                          <Check className="h-5 w-5 text-green-500 mr-2" />
                        ) : (
                          <X className="h-5 w-5 text-red-500 mr-2" />
                        )}
                        <div>
                          <div className="font-medium capitalize">{key}</div>
                          <div className="text-xs text-gray-500">
                            {passed ? "Funciona correctamente" : "Necesita atención"}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-2 text-center py-8 text-gray-500">
                      Haz clic en "Verificar elementos" para analizar la compatibilidad
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-primary-800 mb-2">Elementos a verificar manualmente</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary-800 mr-2 mt-0.5" />
                    <span>Menú hamburguesa: ¿Se abre/cierra correctamente? ¿Es fácil de usar?</span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary-800 mr-2 mt-0.5" />
                    <span>
                      Formularios: ¿Los campos son suficientemente grandes? ¿El teclado no oculta campos importantes?
                    </span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary-800 mr-2 mt-0.5" />
                    <span>Imágenes: ¿Se cargan correctamente? ¿Están bien dimensionadas?</span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary-800 mr-2 mt-0.5" />
                    <span>Scroll: ¿Es suave? ¿No hay elementos que causen scroll horizontal?</span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary-800 mr-2 mt-0.5" />
                    <span>Interacciones táctiles: ¿Los botones y enlaces son fáciles de tocar?</span>
                  </li>
                </ul>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
