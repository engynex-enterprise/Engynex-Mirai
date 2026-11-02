import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { CashflowView } from "@/features/planning/cashflow-view"

export const metadata = { title: "Flujo de caja" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={4} />}><CashflowView /></Suspense>
}
