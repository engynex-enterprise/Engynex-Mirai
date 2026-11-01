import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminHeader } from "@/components/admin/admin-shell"
import { SuscripcionesPanel } from "@/features/admin/console-negocio"

export const metadata = { title: "Suscripciones" }

export default function Page() {
  return (
    <>
      <AdminHeader />
      <Suspense fallback={<Skeleton className="h-96" />}><SuscripcionesPanel /></Suspense>
    </>
  )
}
