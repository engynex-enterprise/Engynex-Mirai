import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { CalculadorasView } from "@/features/calculadoras/calculadoras-view"

export const metadata = { title: "Calculadoras" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><CalculadorasView /></Suspense>
}
