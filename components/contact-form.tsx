"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"

export default function ContactForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    service: "",
    message: "",
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSelectChange = (value: string) => {
    setFormData((prev) => ({ ...prev, service: value }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Validación básica
    if (!formData.name || !formData.email || !formData.message) {
      toast({
        title: "Error en el formulario",
        description: "Por favor completa todos los campos requeridos.",
        variant: "destructive",
      })
      setIsSubmitting(false)
      return
    }

    // Simulate form submission
    setTimeout(() => {
      setIsSubmitting(false)
      toast({
        title: "Formulario enviado",
        description: "Nos pondremos en contacto contigo pronto.",
      })

      // Reset form
      setFormData({
        name: "",
        email: "",
        phone: "",
        service: "",
        message: "",
      })
    }, 1500)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid-form">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-primary-800 text-base">
            Nombre <span className="text-accent">*</span>
          </Label>
          <Input
            id="name"
            placeholder="Tu nombre"
            required
            className="border-primary-200 focus:border-accent h-12 sm:h-12 text-base touch-manipulation"
            value={formData.name}
            onChange={handleChange}
            autoComplete="name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email" className="text-primary-800 text-base">
            Email <span className="text-accent">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="tu@email.com"
            required
            className="border-primary-200 focus:border-accent h-12 text-base"
            value={formData.email}
            onChange={handleChange}
          />
        </div>
      </div>
      <div className="grid-form">
        <div className="space-y-2">
          <Label htmlFor="phone" className="text-primary-800 text-base">
            Teléfono
          </Label>
          <Input
            id="phone"
            placeholder="+XX XXXX XXXX"
            className="border-primary-200 focus:border-accent h-12 text-base"
            value={formData.phone}
            onChange={handleChange}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="service" className="text-primary-800 text-base">
            Servicio de interés
          </Label>
          <Select value={formData.service} onValueChange={handleSelectChange}>
            <SelectTrigger id="service" className="border-primary-200 focus:border-accent h-12 text-base">
              <SelectValue placeholder="Seleccionar servicio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="integral">Gestión Integral</SelectItem>
              <SelectItem value="sourcing">Sourcing</SelectItem>
              <SelectItem value="logistics">Logística Internacional</SelectItem>
              <SelectItem value="customs">Despacho Aduanero</SelectItem>
              <SelectItem value="consolidation">Consolidación de Carga</SelectItem>
              <SelectItem value="storage">Almacenaje</SelectItem>
              <SelectItem value="consulting">Asesoría Estratégica</SelectItem>
              <SelectItem value="other">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="message" className="text-primary-800 text-base">
          Mensaje <span className="text-accent">*</span>
        </Label>
        <Textarea
          id="message"
          placeholder="Cuéntanos sobre tu proyecto o consulta"
          className="min-h-[120px] border-primary-200 focus:border-accent text-base touch-manipulation resize-none"
          required
          value={formData.message}
          onChange={handleChange}
          rows={4}
        />
      </div>
      <Button
        type="submit"
        className="w-full bg-accent hover:bg-accent-700 active:bg-accent-800 text-white text-lg py-4 min-h-[44px] touch-manipulation active:scale-95 transition-all duration-200"
        disabled={isSubmitting}
        aria-label="Enviar formulario de contacto"
      >
        {isSubmitting ? "Enviando..." : "Enviar Consulta"}
      </Button>
    </form>
  )
}
