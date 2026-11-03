import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { GoalsView } from "@/features/goals/goals-view"

export const metadata = { title: "Metas y emergencia" }

export default function MetasPage() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><GoalsView /></Suspense>
}
