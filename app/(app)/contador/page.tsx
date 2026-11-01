import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { PremiumGate } from "@/features/planes/premium"
import { ContadorView } from "@/features/contador/contador-view"

export const metadata = { title: "Acceso de tu contador" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><PremiumGate feature="impuestos" section="contador" title="Acceso de tu contador"><ContadorView /></PremiumGate></Suspense>
}
