import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { NovedadesView } from "@/features/ayuda/views"

export const metadata = { title: "Novedades" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><NovedadesView /></Suspense>
}
