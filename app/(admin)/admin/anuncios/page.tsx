import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminHeader } from "@/components/admin/admin-shell"
import { AnunciosAdmin } from "@/features/admin/admin-ads"

export const metadata = { title: "Anuncios" }

export default function Page() {
  return (
    <>
      <AdminHeader />
      <Suspense fallback={<Skeleton className="h-96" />}><AnunciosAdmin /></Suspense>
    </>
  )
}
