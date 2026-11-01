import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminHeader } from "@/components/admin/admin-shell"
import { PagosPanel } from "@/features/admin/console-negocio"

export const metadata = { title: "Pagos e ingresos" }

export default function Page() {
  return (
    <>
      <AdminHeader />
      <Suspense fallback={<Skeleton className="h-96" />}><PagosPanel /></Suspense>
    </>
  )
}
