import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ReactNode } from "react"
import ProcessTimeline from "./process-timeline"

interface ServiceCardWithTimelineProps {
  icon: ReactNode
  title: string
  description: string
  steps: string[]
  image?: string
}

export default function ServiceCardWithTimeline({ icon, title, description, steps }: ServiceCardWithTimelineProps) {
  return (
    <Card className="overflow-hidden service-card service-card-with-timeline border-0 shadow-lg sm:shadow-xl bg-gradient-to-br from-white to-primary-50/30 border-l-4 border-accent">
      <CardHeader className="pb-4 sm:pb-6 pt-6 sm:pt-8 px-4 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="p-2 sm:p-3 bg-primary-100 rounded-lg sm:rounded-xl border border-primary-200">{icon}</div>
        </div>
        <div className="space-y-3 sm:space-y-4">
          <CardTitle className="text-xl sm:text-2xl lg:text-3xl font-bold text-primary-800 leading-tight">
            {title}
          </CardTitle>
          <CardDescription className="text-gray-700 leading-relaxed text-base sm:text-lg">
            {description}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="pt-0 pb-6 sm:pb-8 px-4 sm:px-6">
        <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-6 shadow-inner border border-primary-100">
          <ProcessTimeline steps={steps} />
        </div>
      </CardContent>
    </Card>
  )
}
