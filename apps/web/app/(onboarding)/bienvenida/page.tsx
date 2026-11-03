import { Suspense } from "react"
import { redirect } from "next/navigation"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { Illustration } from "@/components/mirai/illustration"
import { AuthSkeleton } from "@/components/auth/auth-skeleton"
import { supabaseServer } from "@/utils/supabase/server"
import { WelcomeForm } from "./welcome-form"

export const metadata = { title: "Bienvenida" }

export default function BienvenidaPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="appear w-full max-w-[460px] overflow-hidden rounded-lg bg-card shadow-float">
        <div className="bg-soft-gradient grid justify-items-center px-6 pt-6"><Illustration k="bienvenida" width={240} /></div>
        <div className="p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <IsoIcon k="mirai" size={44} />
          <div>
            <h1 className="font-heading text-2xl font-extrabold">¡Bienvenido a Mirai!</h1>
            <p className="text-sm text-muted-foreground">Arranquemos con lo básico. Toma menos de un minuto.</p>
          </div>
        </div>
        <Suspense fallback={<AuthSkeleton />}>
          <Welcome />
        </Suspense>
        </div>
      </div>
    </main>
  )
}

async function Welcome() {
  const sb = await supabaseServer()
  const { data: claims } = await sb.auth.getClaims()
  const uid = claims?.claims.sub
  if (!uid) redirect("/login")
  const [{ count }, { data: profile }] = await Promise.all([
    sb.from("household_members").select("household_id", { count: "exact", head: true }).eq("user_id", uid),
    sb.from("profiles").select("nombre").eq("id", uid).single(),
  ])
  if (count) redirect("/inicio")
  return <WelcomeForm nombre={profile?.nombre ?? ""} />
}
