import { Suspense } from "react"
import { AdminSkeleton } from "@/features/admin/ui"
import { AdminHeader } from "@/components/admin/admin-shell"
import { AiAdminPanel } from "@/features/admin/admin-ia"

export const metadata = { title: "Uso de IA" }

export default function Page() {
  return (
    <div className="grid gap-6">
      <AdminHeader />
      <Suspense fallback={<AdminSkeleton kpis={4} kind="split" />}><AiAdminPanel /></Suspense>
    </div>
  )
}
