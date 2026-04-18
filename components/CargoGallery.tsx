"use client";

// Stock images from Unsplash (free to use, no attribution required for testing)
const IMAGES = [
  {
    src: "https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?w=800&q=80",
    alt: "Contenedor marítimo en puerto",
    label: "Carga FCL — Puerto de Shangai",
    orientation: "landscape",
  },
  {
    src: "https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=800&q=80",
    alt: "Avión de carga en pista",
    label: "Embarque aéreo — Miami",
    orientation: "landscape",
  },
  {
    src: "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=800&q=80",
    alt: "Operario en depósito logístico",
    label: "Depósito — Bahía Blanca",
    orientation: "portrait",
  },
  {
    src: "https://images.unsplash.com/photo-1501700493788-fa1a4fc9fe62?w=800&q=80",
    alt: "Puerto con grúas al atardecer",
    label: "Operación marítima LCL",
    orientation: "portrait",
  },
];

export default function CargoGallery() {
  return (
    <section className="border-t border-black/[0.04] bg-transparent py-16 lg:py-24">
      <div className="container mx-auto px-6 md:px-10">

        {/* Header */}
        <div className="mb-12">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#ea580c]">
            Operaciones reales
          </p>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <h2 className="text-3xl font-black leading-[1.1] tracking-[-0.02em] text-[#040914] lg:text-4xl">
              Cargas que ya movimos.
            </h2>
            <p className="max-w-[420px] text-[15px] leading-relaxed text-[#4b5563]">
              Desde contenedores completos hasta envíos aéreos urgentes. Cada operación coordinada de punta a punta.
            </p>
          </div>
        </div>

        {/* Bento grid — handles vertical and horizontal images uniformly via object-cover */}
        <div className="grid grid-cols-2 grid-rows-2 gap-3 lg:grid-cols-4 lg:grid-rows-1 lg:gap-4" style={{ height: "480px" }}>

          {/* Image 1 — tall on mobile (spans 2 rows), normal on desktop */}
          <div className="group relative col-span-1 row-span-2 overflow-hidden rounded-2xl lg:row-span-1">
            <img
              src={IMAGES[0].src}
              alt={IMAGES[0].alt}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <p className="absolute bottom-4 left-4 right-4 text-[12px] font-semibold uppercase tracking-[0.06em] text-white/90">
              {IMAGES[0].label}
            </p>
          </div>

          {/* Image 2 */}
          <div className="group relative col-span-1 row-span-1 overflow-hidden rounded-2xl">
            <img
              src={IMAGES[1].src}
              alt={IMAGES[1].alt}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <p className="absolute bottom-3 left-3 right-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-white/90">
              {IMAGES[1].label}
            </p>
          </div>

          {/* Image 3 — wide on desktop (spans 2 cols) */}
          <div className="group relative col-span-1 row-span-1 overflow-hidden rounded-2xl lg:col-span-1">
            <img
              src={IMAGES[2].src}
              alt={IMAGES[2].alt}
              className="h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <p className="absolute bottom-3 left-3 right-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-white/90">
              {IMAGES[2].label}
            </p>
          </div>

          {/* Image 4 */}
          <div className="group relative col-span-1 row-span-1 overflow-hidden rounded-2xl">
            <img
              src={IMAGES[3].src}
              alt={IMAGES[3].alt}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <p className="absolute bottom-3 left-3 right-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-white/90">
              {IMAGES[3].label}
            </p>
          </div>

        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-[13px] text-[#94a3b8]">
          ¿Querés que manejemos tu próxima operación?{" "}
          <a href="#contact" className="font-semibold text-[#ea580c] hover:underline">
            Hablemos.
          </a>
        </p>

      </div>
    </section>
  );
}
