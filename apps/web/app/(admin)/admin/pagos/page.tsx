import { Suspense } from "react"
import { AdminSkeleton } from "@/features/admin/ui"
import { AdminHeader } from "@/components/admin/admin-shell"
import { PagosPanel } from "@/features/admin/console-negocio"

export const metadata = { title: "Pagos e ingresos" }

export default function Page() {
  return (
    <div className="grid gap-6">
      <AdminHeader />
      <Suspense fallback={<AdminSkeleton kpis={4} kind="table" />}><PagosPanel /></Suspense>
    </div>
  )
}
