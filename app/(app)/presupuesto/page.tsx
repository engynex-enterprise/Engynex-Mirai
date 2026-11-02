import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { BudgetView } from "@/features/planning/budget-view"

export const metadata = { title: "Presupuesto 50/30/20" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={4} />}><BudgetView /></Suspense>
}
