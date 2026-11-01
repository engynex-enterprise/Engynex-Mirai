import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { PremiumGate } from "@/features/planes/premium"
import { CompartidosView } from "@/features/extras/compartidos-view"

export const metadata = { title: "Gastos compartidos" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><PremiumGate feature="familia" section="compartidos" title="Gastos compartidos"><CompartidosView /></PremiumGate></Suspense>
}
