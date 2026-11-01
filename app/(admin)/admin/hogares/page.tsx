import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminHeader } from "@/components/admin/admin-shell"
import { HogaresPanel } from "@/features/admin/console-negocio"

export const metadata = { title: "Hogares" }

export default function Page() {
  return (
    <>
      <AdminHeader />
      <Suspense fallback={<Skeleton className="h-96" />}><HogaresPanel /></Suspense>
    </>
  )
}
