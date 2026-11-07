import { Suspense } from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { supabaseServer } from "@/utils/supabase/server"
import { serverAuthProvider } from "@/lib/auth/provider"
import { Landing } from "@/features/landing/landing"
import { SITE_URL } from "@/features/landing/content"

const TITLE = "Mirai · Tus finanzas en orden, sin saber de finanzas"
const DESCRIPTION =
  "Organiza tu quincena, tus gastos, tus deudas, tus metas y tus impuestos en palabras simples. Avisos antes de cada pago, consejero con tus números y toda tu familia en un solo lugar. Gratis para empezar. Hecho para Colombia."

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: ["finanzas personales", "Colombia", "presupuesto", "quincena", "gastos hormiga", "deudas", "declaración de renta", "DIAN", "finanzas familiares"],
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    locale: "es_CO",
    url: SITE_URL,
    siteName: "Mirai",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: `${SITE_URL}/brand/mirai-logo.png`, alt: "Mirai" }],
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION, images: [`${SITE_URL}/brand/mirai-logo.png`] },
}

/** Con sesión va a la app; sin sesión, la página pública. */
async function Gate() {
  // v7 (V7-H4): con AUTH_PROVIDER=mirai basta con la cookie de Better Auth (getAppContext la valida en /inicio).
  if (serverAuthProvider() === "mirai") {
    const { connection } = await import("next/server")
    await connection()
    if (await (await import("@/lib/auth/server")).miraiSessionToken()) redirect("/inicio")
    return <Landing />
  }
  // Modo heredado: sesión de Supabase.
  const { data } = await (await supabaseServer()).auth.getClaims()
  if (data?.claims) redirect("/inicio")
  return <Landing />
}

export default function Home() {
  return <Suspense fallback={null}><Gate /></Suspense>
}
