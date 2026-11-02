import { Suspense } from "react"
import { AdminSkeleton } from "@/features/admin/ui"
import { AdminHeader } from "@/components/admin/admin-shell"
import { PlanesPanel } from "@/features/admin/console-plataforma"

export const metadata = { title: "Planes" }

export default function Page() {
  return (
    <div className="grid gap-6">
      <AdminHeader />
      <Suspense fallback={<AdminSkeleton kind="cards" />}><PlanesPanel /></Suspense>
    </div>
  )
}
