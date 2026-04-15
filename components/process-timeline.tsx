interface ProcessTimelineProps {
  steps: string[]
}

export default function ProcessTimeline({ steps }: ProcessTimelineProps) {
  return (
    <div className="w-full py-4 sm:py-6 md:py-8">
      {/* Desktop Timeline */}
      <div className="hidden sm:block relative">
        {/* Línea horizontal principal */}
        <div className="absolute h-1 w-full bg-gradient-to-r from-primary-200 via-accent to-primary-200 top-6 left-0 rounded-full"></div>

        {/* Pasos del proceso */}
        <div className="flex justify-between relative">
          {steps.map((step, index) => (
            <div key={index} className="flex flex-col items-center relative z-10 flex-1 px-2">
              {/* Círculo con número */}
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent to-accent-700 flex items-center justify-center mb-4 shadow-lg border-4 border-white">
                <span className="text-white font-bold text-lg">{index + 1}</span>
              </div>

              {/* Texto del paso */}
              <div className="text-center">
                <p className="text-sm md:text-base font-semibold text-primary-800 leading-tight">{step}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Indicador de flujo */}
        <div className="mt-6 text-center">
          <div className="inline-flex items-center px-4 py-2 bg-primary-50 rounded-full border border-accent">
            <div className="w-2 h-2 bg-accent rounded-full mr-2 animate-pulse"></div>
            <span className="text-sm font-medium text-primary-800">Proceso integral garantizado</span>
          </div>
        </div>
      </div>

      {/* Mobile Timeline - Solo círculos numerados sin líneas */}
      <div className="sm:hidden">
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={index} className="flex items-center gap-3">
              {/* Círculo con número - alineado al centro del texto */}
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-accent to-accent-700 flex items-center justify-center shadow-md border-2 border-white">
                <span className="text-white font-bold text-sm">{index + 1}</span>
              </div>

              {/* Texto del paso */}
              <div className="flex-1">
                <div className="bg-primary-50 rounded-lg p-3 border-l-2 border-accent">
                  <p className="text-sm font-semibold text-primary-800 leading-relaxed">{step}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Indicador de flujo móvil */}
        <div className="mt-6 text-center">
          <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-primary-50 to-accent-50 rounded-full border border-accent shadow-sm">
            <div className="w-2 h-2 bg-accent rounded-full mr-2 animate-pulse"></div>
            <span className="text-sm font-medium text-primary-800">Proceso integral garantizado</span>
          </div>
        </div>
      </div>
    </div>
  )
}
