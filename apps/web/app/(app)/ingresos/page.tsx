import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { IncomesView } from "@/features/incomes/incomes-view"

export const metadata = { title: "Ingresos" }

export default function IngresosPage() {
  return <Suspense fallback={<PageSkeleton kpis={3} />}><IncomesView /></Suspense>
}
