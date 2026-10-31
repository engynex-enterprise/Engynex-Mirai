import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { FixedView } from "@/features/fixed/fixed-view"

export const metadata = { title: "Gastos fijos" }

export default function FijosPage() {
  return <Suspense fallback={<PageSkeleton kpis={3} />}><FixedView /></Suspense>
}
