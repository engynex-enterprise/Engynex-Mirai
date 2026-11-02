import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminHeader } from "@/components/admin/admin-shell"
import { EnviosPanel } from "@/features/admin/console-plataforma"

export const metadata = { title: "Registro de envíos" }

export default function Page() {
  return (
    <>
      <AdminHeader />
      <Suspense fallback={<Skeleton className="h-96" />}><EnviosPanel /></Suspense>
    </>
  )
}
