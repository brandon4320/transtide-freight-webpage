import { MapPin, Phone, Clock3 } from "lucide-react"

const LOCATIONS = [
  {
    country: "ARGENTINA",
    city: "Bahía Blanca",
    flag: "🇦🇷",
    timezone: "GMT-3",
    address: "Belgrano 3710, Ing. White",
    phone: "+54 9 11 4439-4020",
    phoneLink: "tel:+5491144394020",
  },
  {
    country: "ESTADOS UNIDOS",
    city: "Miami, FL",
    flag: "🇺🇸",
    timezone: "GMT-5",
    address: "5605 NW 74th Ave, 33166",
    phone: "+1 754 236-5652",
    phoneLink: "tel:+17542365652",
  },
  {
    country: "CHINA",
    city: "Shanghai",
    flag: "🇨🇳",
    timezone: "GMT+8",
    address: "Waigaoqiao Free Trade Zone, Pudong",
    phone: "Contacto vía casa central",
    phoneLink: "#",
  },
]

export default function LocationsSection() {
  return (
    <section id="offices" className="py-24 bg-transparent relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-extrabold text-[#0f1a3d] mb-4 tracking-tight">
            Presencia operativa
          </h2>
          <p className="text-slate-500 text-lg">
            Tres husos horarios. Un solo equipo detrás de tu operación.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {LOCATIONS.map((loc) => (
            <div
              key={loc.city}
              className="group relative overflow-hidden rounded-[30px] bg-white border border-[rgba(24,38,84,0.10)] p-8 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(15,23,42,0.08)] hover:border-[#ea580c]/30"
            >
              <div className="absolute -top-16 -right-16 w-48 h-48 bg-[#ea580c]/5 rounded-full blur-[60px] group-hover:scale-150 transition-transform duration-700 pointer-events-none"></div>
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex justify-between items-center mb-8 gap-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-2xl drop-shadow-sm">{loc.flag}</span>
                    <span className="text-[11px] font-bold tracking-widest text-slate-400 uppercase">
                      {loc.country}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[rgba(24,38,84,0.04)] border border-[rgba(24,38,84,0.05)] text-[11px] font-bold text-[#0f1a3d] shrink-0">
                    <Clock3 className="w-3.5 h-3.5 text-[#ea580c]" />
                    {loc.timezone}
                  </div>
                </div>
                <h3 className="text-3xl font-extrabold text-[#0f1a3d] mb-8 tracking-tight">
                  {loc.city}
                </h3>

                <div className="mt-auto space-y-5 pt-6 border-t border-[rgba(24,38,84,0.06)]">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-[#ea580c] mt-0.5 shrink-0" />
                    <span className="text-[14.5px] font-medium text-[#0f1a3d]/70 leading-relaxed max-w-[200px]">
                      {loc.address}
                    </span>
                  </div>

                  <a
                    href={loc.phoneLink}
                    className={`flex items-center gap-3 w-fit text-[14.5px] font-bold transition-colors ${
                      loc.phoneLink === "#"
                        ? "text-[#0f1a3d]/50 cursor-default"
                        : "text-[#0f1a3d] hover:text-[#ea580c]"
                    }`}
                  >
                    <Phone className={`w-5 h-5 shrink-0 ${loc.phoneLink !== "#" ? "text-[#ea580c]" : "text-[#0f1a3d]/40"}`} />
                    <span>{loc.phone}</span>
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
