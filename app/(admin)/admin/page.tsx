import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminHeader } from "@/components/admin/admin-shell"
import { DashboardPanel } from "@/features/admin/console-negocio"

export const metadata = { title: "Resumen" }

export default function Page() {
  return (
    <>
      <AdminHeader />
      <Suspense fallback={<Skeleton className="h-96" />}><DashboardPanel /></Suspense>
    </>
  )
}
