import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { PlanesView } from "@/features/planes/planes-view"

export const metadata = { title: "Planes" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><PlanesView /></Suspense>
}
