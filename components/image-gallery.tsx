import Image from "next/image"

export default function ImageGallery() {
  const galleryImages = [
    {
      src: "/images/container1.png",
      alt: "Contenedores marítimos Trantide",
    },
    {
      src: "/images/container2.png",
      alt: "Operaciones logísticas",
    },
    {
      src: "/images/container3.png",
      alt: "Transporte marítimo internacional",
    },
    {
      src: "/images/container4.png",
      alt: "Contenedores de carga",
    },
    {
      src: "/images/global-shipping.png",
      alt: "Logística global",
    },
    {
      src: "/images/warehouse.png",
      alt: "Almacenaje y consolidación",
    },
  ]

  return (
    <div className="image-gallery">
      {galleryImages.map((image, index) => (
        <div key={index} className="image-gallery-item shadow-md">
          <Image src={image.src || "/placeholder.svg"} alt={image.alt} fill className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-end">
            <div className="p-4 text-white">
              <p className="font-medium">{image.alt}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
