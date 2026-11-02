import { Suspense } from "react"
import { AdminSkeleton } from "@/features/admin/ui"
import { AdminHeader } from "@/components/admin/admin-shell"
import { OpinionesPanel } from "@/features/admin/admin-view"

export const metadata = { title: "Opiniones" }

export default function Page() {
  return (
    <div className="grid gap-6">
      <AdminHeader />
      <Suspense fallback={<AdminSkeleton kind="cards" />}><OpinionesPanel /></Suspense>
    </div>
  )
}
