import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminHeader } from "@/components/admin/admin-shell"
import { AiAdminPanel } from "@/features/admin/admin-ia"

export const metadata = { title: "Uso de IA" }

export default function Page() {
  return (
    <>
      <AdminHeader />
      <Suspense fallback={<Skeleton className="h-96" />}><AiAdminPanel /></Suspense>
    </>
  )
}
