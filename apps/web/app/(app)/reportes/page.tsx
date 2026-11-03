import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { ReportsView } from "@/features/reports/reports-view"

export const metadata = { title: "Reportes" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><ReportsView /></Suspense>
}
