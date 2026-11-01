import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { FamilyView } from "@/features/planning/family-view"

export const metadata = { title: "Por miembro" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><FamilyView /></Suspense>
}
