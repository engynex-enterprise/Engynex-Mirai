import type { Metadata, Viewport } from "next"
import { Suspense } from "react"
import { Courier_Prime, Inter, Geist_Mono } from "next/font/google"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Providers } from "./providers"
import { IsoDefs } from "@/components/mirai/iso-icon"
import { PwaRoot } from "@/features/pwa/pwa-root"
import { PwaChrome } from "@/features/pwa/title-bar"
import { PWA_COLORS } from "@/lib/pwa/config"
import { PLATFORM_SCRIPT } from "@/lib/pwa/platform"
import { splashImages } from "@/lib/pwa/splash"
import "./globals.css"

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" })
// Mono y tirilla solo aparecen en pantallas puntuales: sin preload, el navegador no las descarga en cada página
// (antes eran 3 archivos de letra extra en cada carga) y las pide cuando algún texto las usa.
const mono = Geist_Mono({ variable: "--font-mono-app", subsets: ["latin"], display: "swap", preload: false })
// Letra de tirilla para los recibos (resumen de Agregar ingreso).
const receipt = Courier_Prime({ variable: "--font-receipt-app", subsets: ["latin"], weight: ["400", "700"], display: "swap", preload: false })

export const metadata: Metadata = {
  title: { default: "Mirai · Tu futuro financiero", template: "%s · Mirai" },
  description: "Finanzas personales y familiares para Colombia, explicadas en palabras simples.",
  applicationName: "Mirai",
  manifest: "/manifest.webmanifest",
  // App instalada (docs/PWA.md): íconos, pantalla de inicio de iPhone/iPad (claro y oscuro) y barra de estado
  // translúcida (el contenido llega hasta arriba y app/globals.css › PWA respeta la zona segura).
  icons: {
    icon: [{ url: "/brand/mirai-logo.svg", type: "image/svg+xml" }, { url: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true, title: "Mirai", statusBarStyle: "black-translucent",
    startupImage: splashImages().map((s) => ({ url: s.url, media: s.media })),
  },
  // Que iOS no convierta montos ni cédulas en enlaces de llamada.
  formatDetection: { telephone: false, date: false, address: false, email: false },
  other: { "apple-mobile-web-app-capable": "yes", "msapplication-TileColor": PWA_COLORS.navy, "msapplication-tap-highlight": "no" },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: PWA_COLORS.themeLight },
    { media: "(prefers-color-scheme: dark)", color: PWA_COLORS.themeDark },
  ],
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CO" suppressHydrationWarning className={`${inter.variable} ${mono.variable} ${receipt.variable} h-full`}>
      {/* suppressHydrationWarning: extensiones como ColorZilla (cz-shortcut-listen) o Grammarly agregan atributos al
          body antes de que React cargue; solo ignora atributos de esta etiqueta, no su contenido */}
      <body className="min-h-full" suppressHydrationWarning>
        {/* Marca <html> como app instalada / iPhone antes de pintar (lib/pwa/platform.ts). */}
        <script dangerouslySetInnerHTML={{ __html: PLATFORM_SCRIPT }} />
        <IsoDefs />
        <PwaChrome />
        {/* PwaRoot lee la ruta (usePathname): dentro de Suspense para no frenar el prerender de páginas públicas. */}
        <Providers>{children}<Suspense fallback={null}><PwaRoot /></Suspense></Providers>
        {process.env.VERCEL && <SpeedInsights />}
      </body>
    </html>
  )
}
