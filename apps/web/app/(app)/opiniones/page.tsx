import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { OpinionesView } from "@/features/opiniones/opiniones-view"

export const metadata = { title: "Tu opinión" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><OpinionesView /></Suspense>
}
