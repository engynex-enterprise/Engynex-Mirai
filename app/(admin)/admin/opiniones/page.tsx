import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminHeader } from "@/components/admin/admin-shell"
import { OpinionesPanel } from "@/features/admin/admin-view"

export const metadata = { title: "Opiniones" }

export default function Page() {
  return (
    <>
      <AdminHeader />
      <Suspense fallback={<Skeleton className="h-96" />}><OpinionesPanel /></Suspense>
    </>
  )
}
