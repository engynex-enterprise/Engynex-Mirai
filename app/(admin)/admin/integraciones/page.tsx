import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminHeader } from "@/components/admin/admin-shell"
import { IntegracionesPanel } from "@/features/admin/console-plataforma"

export const metadata = { title: "Integraciones globales" }

export default function Page() {
  return (
    <>
      <AdminHeader />
      <Suspense fallback={<Skeleton className="h-96" />}><IntegracionesPanel /></Suspense>
    </>
  )
}
