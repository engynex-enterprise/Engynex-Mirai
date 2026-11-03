import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { StrategyView } from "@/features/strategy/strategy-view"

export const metadata = { title: "Salir de deudas" }

export default function EstrategiaPage() {
  return <Suspense fallback={<PageSkeleton kpis={3} />}><StrategyView /></Suspense>
}
