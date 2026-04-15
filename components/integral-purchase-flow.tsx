"use client"

import type React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Package, Search, Boxes, Ship, Eye, FileText, Truck } from "lucide-react"

interface IntegralPurchaseFlowProps {
  title: string
  description: string
  steps: string[]
  icon?: React.ReactNode
}

export default function IntegralPurchaseFlow({
  title,
  description,
  steps,
  icon = <Package className="w-6 h-6" />,
}: IntegralPurchaseFlowProps) {
  const icons = [
    <Package key="0" className="w-6 h-6" />,
    <Search key="1" className="w-6 h-6" />,
    <Boxes key="2" className="w-6 h-6" />,
    <Ship key="3" className="w-6 h-6" />,
    <Eye key="4" className="w-6 h-6" />,
    <FileText key="5" className="w-6 h-6" />,
    <Truck key="6" className="w-6 h-6" />,
  ]

  return (
    <Card className="w-full overflow-hidden shadow-lg border-0 bg-gradient-to-br from-white to-primary-50">
      {/* Header */}
      <CardHeader className="pb-6 sm:pb-8">
        <div className="flex items-start gap-3 sm:gap-4 mb-4">
          <div className="p-2 sm:p-3 bg-accent/20 rounded-lg border-2 border-accent flex-shrink-0">
            <div className="text-accent text-xl sm:text-2xl">{icon}</div>
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-2xl sm:text-3xl lg:text-4xl font-bold text-primary-800 mb-2 text-balance">
              {title}
            </CardTitle>
            <p className="text-gray-600 text-sm sm:text-base leading-relaxed">{description}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 pb-8 sm:pb-12">
        {/* Desktop Layout - 3 steps in row 1, 4 steps in row 2 */}
        <div className="hidden md:block">
          {/* Row 1: Steps 0, 1, 2 (Left to Right) */}
          <div className="mb-16 flex justify-center gap-8">
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="flex items-start gap-6">
                {/* Circle and text */}
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-accent to-orange-600 flex items-center justify-center text-white shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300 flex-shrink-0">
                    {icons[idx]}
                  </div>
                  <p className="text-center font-semibold text-primary-800 text-sm mt-3 w-24 leading-tight">
                    {steps[idx]}
                  </p>
                </div>

                {/* Arrow to next (except last) */}
                {idx < 2 && (
                  <div className="flex items-center justify-center w-12 h-12 mt-2">
                    <svg className="w-full h-full" viewBox="0 0 24 24" fill="none">
                      <path d="M 5 12 L 19 12" stroke="#E07443" strokeWidth="2" />
                      <path
                        d="M 16 9 L 19 12 L 16 15"
                        stroke="#E07443"
                        strokeWidth="2"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Vertical connector down */}
          <div className="flex justify-center mb-8">
            <svg className="w-8 h-16" viewBox="0 0 24 48" fill="none">
              <path d="M 12 0 L 12 40" stroke="#E07443" strokeWidth="2" strokeDasharray="4 4" />
              <path
                d="M 9 40 L 12 48 L 15 40"
                stroke="#E07443"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Row 2: Steps 3, 4, 5, 6 (Right to Left) */}
          <div className="flex justify-center gap-8">
            {[6, 5, 4, 3].map((idx) => (
              <div key={idx} className="flex items-start gap-6">
                {/* Arrow from next (except first in this row) */}
                {idx !== 6 && (
                  <div className="flex items-center justify-center w-12 h-12 mt-2">
                    <svg className="w-full h-full" viewBox="0 0 24 24" fill="none">
                      <path d="M 19 12 L 5 12" stroke="#E07443" strokeWidth="2" />
                      <path
                        d="M 8 9 L 5 12 L 8 15"
                        stroke="#E07443"
                        strokeWidth="2"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}

                {/* Circle and text */}
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-accent to-orange-600 flex items-center justify-center text-white shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300 flex-shrink-0">
                    {icons[idx]}
                  </div>
                  <p className="text-center font-semibold text-primary-800 text-sm mt-3 w-24 leading-tight">
                    {steps[idx]}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile Layout - Vertical */}
        <div className="md:hidden space-y-8">
          {steps.map((step, idx) => (
            <div key={idx}>
              <div className="flex gap-4">
                {/* Icon Circle */}
                <div className="flex-shrink-0 relative z-10">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent to-orange-600 flex items-center justify-center text-white shadow-lg">
                    {icons[idx]}
                  </div>
                </div>

                {/* Step Text */}
                <div className="flex-1 pt-1">
                  <div className="bg-white rounded-lg p-3 border-l-4 border-accent">
                    <h4 className="font-semibold text-primary-800 text-sm leading-tight">{step}</h4>
                  </div>
                </div>
              </div>

              {/* Vertical connector line (except last) */}
              {idx < steps.length - 1 && <div className="ml-8 mt-4 h-8 w-0.5 bg-accent/40"></div>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
