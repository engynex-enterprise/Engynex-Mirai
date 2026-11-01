import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminHeader } from "@/components/admin/admin-shell"
import { AdminsPanel } from "@/features/admin/console-plataforma"

export const metadata = { title: "Administradores" }

export default function Page() {
  return (
    <>
      <AdminHeader />
      <Suspense fallback={<Skeleton className="h-96" />}><AdminsPanel /></Suspense>
    </>
  )
}
