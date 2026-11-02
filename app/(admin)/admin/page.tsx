import { Suspense } from "react"
import { AdminSkeleton } from "@/features/admin/ui"
import { AdminHeader } from "@/components/admin/admin-shell"
import { DashboardPanel } from "@/features/admin/console-negocio"

export const metadata = { title: "Resumen" }

export default function Page() {
  return (
    <div className="grid gap-6">
      <AdminHeader />
      <Suspense fallback={<AdminSkeleton kpis={4} kind="split" />}><DashboardPanel /></Suspense>
    </div>
  )
}
