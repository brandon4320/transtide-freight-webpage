import { Card, CardContent } from "@/components/ui/card"

interface IndustryCardProps {
  icon: string
  title: string
}

export default function IndustryCard({ icon, title }: IndustryCardProps) {
  return (
    <Card className="h-full industry-card bg-white hover:bg-primary-50 transition-colors duration-300 border border-primary-100 hover:border-accent shadow-md hover:shadow-lg">
      <CardContent className="flex flex-col items-center justify-center p-6 text-center h-full">
        <div className="text-4xl mb-3">{icon}</div>
        <h3 className="font-medium text-primary-800">{title}</h3>
      </CardContent>
    </Card>
  )
}
