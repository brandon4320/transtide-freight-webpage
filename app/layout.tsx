import type React from "react"
import "@/app/globals.css"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import Header from "@/components/header"
import { SpeedInsights } from "@vercel/speed-insights/next"

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
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <Header />
          {children}
          <Toaster />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  )
}
