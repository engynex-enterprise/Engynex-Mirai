import { Suspense } from "react"
import { redirect } from "next/navigation"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { Illustration } from "@/components/mirai/illustration"
import { AuthSkeleton } from "@/components/auth/auth-skeleton"
import { supabaseServer } from "@/utils/supabase/server"
import { serverAuthProvider } from "@/lib/auth/provider"
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

/**
 * v7 (V7-H4), AUTH_PROVIDER=mirai: GET /v1/me (200 = ya tiene hogar → /inicio; 404 = bienvenida) y el nombre de
 * GET /v1/me/profile, con la cookie de Better Auth.
 */
async function WelcomeMirai() {
  const { connection } = await import("next/server")
  await connection()
  const [{ miraiSessionToken }, { miraiApiConfig, SESSION_EXPIRED_URL }, { serverApi }] = await Promise.all([import("@/lib/auth/server"), import("@/lib/dal"), import("@/lib/api/server")])
  if (!(await miraiSessionToken())) redirect("/login")
  const api = serverApi(miraiApiConfig())
  const [me, profile] = await Promise.all([api.me.get({ query: {} }), api.me.profile()])
  if ((me.status as number) === 401 || (profile.status as number) === 401) redirect(SESSION_EXPIRED_URL)
  if (me.status === 200) redirect("/inicio")
  return <WelcomeForm nombre={profile.status === 200 ? profile.body.nombre : ""} />
}

async function Welcome() {
  if (serverAuthProvider() === "mirai") return <WelcomeMirai />
  // Modo heredado: sesión y datos de Supabase.
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
