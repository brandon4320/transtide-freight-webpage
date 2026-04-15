import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ReactNode } from "react"

interface ProcessStepProps {
  number: string
  title: string
  description: string
  icon?: ReactNode
}

export default function ProcessStep({ number, title, description, icon }: ProcessStepProps) {
  return (
    <Card className="relative overflow-hidden border-l-4 border-accent process-step bg-white shadow-lg hover:shadow-xl transition-shadow duration-300">
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-accent flex items-center justify-center">
        {icon ? (
          <div className="bg-accent-700 w-10 h-10 rounded-full flex items-center justify-center">{icon}</div>
        ) : (
          <span className="text-3xl font-bold text-white">{number}</span>
        )}
      </div>
      <CardHeader className="pl-20">
        <CardTitle className="text-primary-800">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pl-20">
        <p className="text-gray-600">{description}</p>
      </CardContent>
    </Card>
  )
}
