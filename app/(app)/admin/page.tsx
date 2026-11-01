import { Suspense } from "react"
import { notFound } from "next/navigation"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { getAppContext } from "@/lib/dal"
import { AdminView } from "@/features/admin/admin-view"

export const metadata = { title: "Panel de administración" }

/** Solo los administradores de la plataforma; para el resto la página no existe. */
async function Gate() {
  const ctx = await getAppContext()
  if (!ctx.isAdmin) notFound()
  return <AdminView />
}

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={4} />}><Gate /></Suspense>
}
