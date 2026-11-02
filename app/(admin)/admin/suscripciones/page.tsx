import { Suspense } from "react"
import { AdminSkeleton } from "@/features/admin/ui"
import { AdminHeader } from "@/components/admin/admin-shell"
import { SuscripcionesPanel } from "@/features/admin/console-negocio"

export const metadata = { title: "Suscripciones" }

export default function Page() {
  return (
    <div className="grid gap-6">
      <AdminHeader />
      <Suspense fallback={<AdminSkeleton kind="table" />}><SuscripcionesPanel /></Suspense>
    </div>
  )
}
