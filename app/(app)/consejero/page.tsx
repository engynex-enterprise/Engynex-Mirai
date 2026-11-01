import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { AdvisorView } from "@/features/advisor/advisor-view"

export const metadata = { title: "Consejero" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><AdvisorView /></Suspense>
}
