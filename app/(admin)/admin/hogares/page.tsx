import { Suspense } from "react"
import { AdminSkeleton } from "@/features/admin/ui"
import { AdminHeader } from "@/components/admin/admin-shell"
import { HogaresPanel } from "@/features/admin/console-negocio"

export const metadata = { title: "Hogares" }

export default function Page() {
  return (
    <div className="grid gap-6">
      <AdminHeader />
      <Suspense fallback={<AdminSkeleton kind="table" />}><HogaresPanel /></Suspense>
    </div>
  )
}
