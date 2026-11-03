import { Suspense } from "react"
import { AdminSkeleton } from "@/features/admin/ui"
import { AdminHeader } from "@/components/admin/admin-shell"
import { AuditPanel } from "@/features/admin/console-plataforma"

export const metadata = { title: "Auditoría" }

export default function Page() {
  return (
    <div className="grid gap-6">
      <AdminHeader />
      <Suspense fallback={<AdminSkeleton kind="table" />}><AuditPanel /></Suspense>
    </div>
  )
}
