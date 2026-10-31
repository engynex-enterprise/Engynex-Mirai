import type { Metadata, Viewport } from "next"
import { Inter, Geist_Mono } from "next/font/google"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Providers } from "./providers"
import { IsoDefs } from "@/components/mirai/iso-icon"
import "./globals.css"

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" })
const mono = Geist_Mono({ variable: "--font-mono-app", subsets: ["latin"], display: "swap" })

export const metadata: Metadata = {
  title: { default: "Mirai · Tu futuro financiero", template: "%s · Mirai" },
  description: "Finanzas personales y familiares para Colombia, explicadas en palabras simples.",
  applicationName: "Mirai",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/brand/mirai-logo.svg", apple: "/brand/mirai-logo.png" },
  appleWebApp: { capable: true, title: "Mirai", statusBarStyle: "default" },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F5F5" },
    { media: "(prefers-color-scheme: dark)", color: "#1F1F1F" },
  ],
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CO" suppressHydrationWarning className={`${inter.variable} ${mono.variable} h-full`}>
      <body className="min-h-full">
        <IsoDefs />
        <Providers>{children}</Providers>
        <SpeedInsights />
      </body>
    </html>
  )
}
