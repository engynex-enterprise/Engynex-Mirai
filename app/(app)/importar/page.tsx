import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { PremiumGate } from "@/features/planes/premium"
import { ImportView } from "@/features/import/import-view"
import { V4RestoreCard } from "@/features/import/v4-card"

export const metadata = { title: "Importar extractos" }

export default function ImportarPage() {
  return <Suspense fallback={<PageSkeleton kpis={0} rows={4} />}><PremiumGate feature="banco" section="importar" title="Importar extractos" free={<V4RestoreCard />}><ImportView /></PremiumGate></Suspense>
}
