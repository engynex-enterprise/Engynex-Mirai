import { Suspense } from "react"
import { AdminSkeleton } from "@/features/admin/ui"
import { AdminHeader } from "@/components/admin/admin-shell"
import { UsoPanel } from "@/features/admin/admin-view"

export const metadata = { title: "Uso y analítica" }

export default function Page() {
  return (
    <div className="grid gap-6">
      <AdminHeader />
      <Suspense fallback={<AdminSkeleton kpis={4} kind="split" />}><UsoPanel /></Suspense>
    </div>
  )
}
