import { Suspense } from "react"
import { connection } from "next/server"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { contadorOpen } from "@/features/contador/actions"
import { ContadorPortal } from "@/features/contador/portal"

export const metadata = { title: "Portal del contador", robots: { index: false, follow: false } }

async function Inner({ params }: { params: Promise<{ token: string }> }) {
  await connection()
  const { token } = await params
  const r = await contadorOpen(token)
  if (r && "bloqueado" in r) return (
    <div className="mx-auto grid max-w-md justify-items-center gap-3 py-24 text-center">
      <IsoIcon k="contador" size={64} />
      <h1 className="text-xl font-semibold">Acceso no disponible por ahora</h1>
      <p className="text-muted-foreground">El plan de tu cliente ya no incluye el acceso para su contador. Cuando lo vuelva a activar, este mismo enlace funcionará de nuevo.</p>
    </div>
  )
  if (!r) return (
    <div className="mx-auto grid max-w-md justify-items-center gap-3 py-24 text-center">
      <IsoIcon k="contador" size={64} />
      <h1 className="text-xl font-semibold">No se pudo abrir el acceso</h1>
      <p className="text-muted-foreground">El enlace no existe, venció o tu cliente lo quitó. Pídele un enlace nuevo.</p>
    </div>
  )
  return <ContadorPortal token={token} share={r.share} data={r.data} />
}

export default function Page(props: PageProps<"/contador/[token]">) {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <Suspense fallback={<PageSkeleton kpis={3} />}><Inner params={props.params} /></Suspense>
    </main>
  )
}
