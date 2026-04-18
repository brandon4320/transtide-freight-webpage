import { Globe, Ship, Truck, ShieldCheck, Clock3, Boxes, Package } from "lucide-react"
import React from "react"

export const metrics = [
  { value: 70,   suffix: "%", label: "de reducción en costos logísticos" },
  { value: 50,   suffix: "+", label: "importadores satisfechos" },
  { value: null, suffix: "",  label: "disponibilidad operativa", display: "24/7" },
]

export const services = [
  { icon: React.createElement(Globe,  { className: "h-6 w-6" }), title: "Gestión en origen",       description: "Validamos proveedores y coordinamos en origen para reducir el riesgo antes de embarcar." },
  { icon: React.createElement(Ship,   { className: "h-6 w-6" }), title: "Transporte y embarque",   description: "Elegimos la mejor ruta, consolidamos y hacemos seguimiento hasta destino." },
  { icon: React.createElement(Truck,  { className: "h-6 w-6" }), title: "Despacho y entrega",      description: "Manejamos la documentación y el despacho para que la mercadería llegue sin trabas." },
]

export const differentiators = [
  { icon: React.createElement(ShieldCheck, { className: "h-5 w-5" }), title: "Presencia en origen",              text: "Más control sobre proveedor, producción y carga antes de embarcar." },
  { icon: React.createElement(Boxes,       { className: "h-5 w-5" }), title: "Control total del costo",          text: "No trabajamos una sola parte de la operación, miramos el proceso entero." },
  { icon: React.createElement(Clock3,      { className: "h-5 w-5" }), title: "Decisiones rápidas, sin burocracia", text: "Menos vueltas, más claridad para decidir rápido y mover la operación." },
  { icon: React.createElement(Package,     { className: "h-5 w-5" }), title: "Un contacto real en cada etapa",   text: "Un punto de contacto real durante cada etapa de la importación." },
]

export const operationTypes = ["FCL — Contenedor completo", "LCL — Carga consolidada", "Carga aérea", "Courier / Express"]

export const offices = [
  { flag: "🇦🇷", country: "Argentina",       city: "Bahía Blanca", address: "Belgrano 3710, Ing. White",                          phone: "+54 9 11 4439-4020", phoneHref: "tel:+5491144394020" },
  { flag: "🇺🇸", country: "Estados Unidos", city: "Miami, FL",     address: "5605 NW 74th Ave, 33166",                            phone: "+1 754 236-5652",    phoneHref: "tel:+17542365652"  },
  { flag: "🇨🇳", country: "China",           city: "Shanghai",      address: "Waigaoqiao Free Trade Zone, Pudong",                  phone: null,                 phoneHref: null                },
]
