import type React from "react"
import "@/app/globals.css"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import Header from "@/components/header"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "Transtide Freight - Importá desde China y EE.UU.",
  description:
    "Importá desde China y EE.UU. con rapidez, seguridad y acompañamiento real. Servicios de logística internacional, despacho aduanero y más.",
  keywords:
    "importaciones, logística internacional, China, Estados Unidos, Argentina, despacho aduanero, transporte marítimo, Transtide Freight",
  authors: [{ name: "Transtide Freight" }],
  creator: "Transtide Freight",
  publisher: "Transtide Freight",
  robots: "index, follow",
  openGraph: {
    title: "Transtide Freight - Importá desde China y EE.UU.",
    description:
      "Movemos tu carga. Impulsamos tu negocio. Especialistas en logística internacional con presencia global.",
    url: "https://transtidefreight.com",
    siteName: "Transtide Freight",
    type: "website",
    locale: "es_AR",
    images: [
      {
        url: "https://transtidefreight.com/images/transtide-logo.png",
        width: 1200,
        height: 630,
        alt: "Transtide Freight - Logística Internacional",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Transtide Freight - Importá desde China y EE.UU.",
    description: "Movemos tu carga. Impulsamos tu negocio. Especialistas en logística internacional.",
    images: ["/images/transtide-logo.png"],
    creator: "@transtidefreight",
  },
  alternates: {
    canonical: "https://transtidefreight.com",
  },
  verification: {
    google: "google-site-verification-code",
  },
    generator: 'v0.app'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#1e40af" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Transtide Freight",
              url: "https://transtidefreight.com",
              logo: "https://transtidefreight.com/images/transtide-logo.png",
              description:
                "Especialistas en logística internacional. Importaciones desde China y EE.UU. con rapidez, seguridad y acompañamiento real.",
              address: [
                {
                  "@type": "PostalAddress",
                  addressCountry: "AR",
                  addressLocality: "Buenos Aires",
                  streetAddress: "Belgrano 3710, Ing White, Bahía Blanca",
                },
                {
                  "@type": "PostalAddress",
                  addressCountry: "US",
                  addressLocality: "Miami",
                  addressRegion: "FL",
                  streetAddress: "5605 NW 74th Ave",
                },
                {
                  "@type": "PostalAddress",
                  addressCountry: "CN",
                  addressLocality: "Shanghai",
                  addressRegion: "Pudong New Area",
                  streetAddress: "Room 902, Jingang Building, No. 55 Aona Road, Waigaoqiao Free Trade Zone",
                },
              ],
              contactPoint: {
                "@type": "ContactPoint",
                telephone: "+XX-XXXX-XXXX",
                contactType: "customer service",
                email: "contacto@transtidefreight.com",
              },
              sameAs: ["https://instagram.com/transtidefreight", "https://linkedin.com/company/transtide-freight"],
              service: [
                "Logística Internacional",
                "Despacho Aduanero",
                "Sourcing Profesional",
                "Consolidación de Carga",
                "Transporte Marítimo",
                "Transporte Aéreo",
              ],
            }),
          }}
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <Header />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
