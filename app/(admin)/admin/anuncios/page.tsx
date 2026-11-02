import { Suspense } from "react"
import { AdminSkeleton } from "@/features/admin/ui"
import { AdminHeader } from "@/components/admin/admin-shell"
import { AnunciosAdmin } from "@/features/admin/admin-ads"

export const metadata = { title: "Anuncios" }

export default function Page() {
  return (
    <div className="grid gap-6">
      <AdminHeader />
      <Suspense fallback={<AdminSkeleton kpis={4} kind="table" />}><AnunciosAdmin /></Suspense>
    </div>
  )
}
