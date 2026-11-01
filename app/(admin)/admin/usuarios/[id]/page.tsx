import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { UserDetail } from "@/features/admin/console-usuario"

export const metadata = { title: "Usuario" }

export default function Page() {
  return <Suspense fallback={<Skeleton className="h-96" />}><UserDetail /></Suspense>
}
