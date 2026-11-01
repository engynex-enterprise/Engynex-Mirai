import { Suspense } from "react"
import { redirect } from "next/navigation"
import { supabaseServer } from "@/utils/supabase/server"
import { Landing } from "@/features/landing/landing"

export const metadata = {
  title: { absolute: "Mirai · Tus finanzas en orden, sin saber de finanzas" },
  description: "Organiza tu quincena, tus deudas, tus metas y tus impuestos en palabras simples. Gratis para empezar. Hecho para Colombia.",
}

/** Con sesión va a la app; sin sesión, la página pública. */
async function Gate() {
  const { data } = await (await supabaseServer()).auth.getClaims()
  if (data?.claims) redirect("/inicio")
  return <Landing />
}

export default function Home() {
  return <Suspense fallback={null}><Gate /></Suspense>
}
