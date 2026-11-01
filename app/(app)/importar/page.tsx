import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { PremiumGate } from "@/features/planes/premium"
import { ImportView } from "@/features/import/import-view"

export const metadata = { title: "Importar extractos" }

export default function ImportarPage() {
  return <Suspense fallback={<PageSkeleton kpis={0} rows={4} />}><PremiumGate feature="banco" section="importar" title="Importar extractos"><ImportView /></PremiumGate></Suspense>
}
