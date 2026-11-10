import { Suspense } from "react"
import { AdminSkeleton } from "@/features/admin/ui"
import { AdminHeader } from "@/components/admin/admin-shell"
import { UsuraPanel } from "@/features/admin/referencias"

export const metadata = { title: "Datos de referencia" }

export default function Page() {
  return (
    <div className="grid gap-6">
      <AdminHeader />
      <Suspense fallback={<AdminSkeleton kind="table" />}><UsuraPanel /></Suspense>
    </div>
  )
}
