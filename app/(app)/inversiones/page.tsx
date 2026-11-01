import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { InvestmentsView } from "@/features/investments/investments-view"

export const metadata = { title: "Inversiones" }

export default function InversionesPage() {
  return <Suspense fallback={<PageSkeleton kpis={3} />}><InvestmentsView /></Suspense>
}
