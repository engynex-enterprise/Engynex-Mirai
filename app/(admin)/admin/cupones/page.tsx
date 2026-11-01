import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminHeader } from "@/components/admin/admin-shell"
import { CuponesPanel } from "@/features/admin/console-negocio"

export const metadata = { title: "Cupones" }

export default function Page() {
  return (
    <>
      <AdminHeader />
      <Suspense fallback={<Skeleton className="h-96" />}><CuponesPanel /></Suspense>
    </>
  )
}
