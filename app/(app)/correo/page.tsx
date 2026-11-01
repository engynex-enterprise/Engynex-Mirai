import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { CorreoView } from "@/features/correo/correo-view"

export const metadata = { title: "Gastos desde el correo" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><CorreoView /></Suspense>
}
