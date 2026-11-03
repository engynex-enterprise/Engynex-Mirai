import { Suspense } from "react"
import { AdminSkeleton } from "@/features/admin/ui"
import { UserDetail } from "@/features/admin/console-usuario"

export const metadata = { title: "Usuario" }

export default function Page() {
  return <Suspense fallback={<AdminSkeleton kind="split" />}><UserDetail /></Suspense>
}
