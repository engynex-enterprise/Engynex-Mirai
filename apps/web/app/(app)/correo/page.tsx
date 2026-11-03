import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { PremiumGate } from "@/features/planes/premium"
import { CorreoView } from "@/features/correo/correo-view"

export const metadata = { title: "Gastos desde el correo" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><PremiumGate feature="banco" section="correo" title="Correo del banco"><CorreoView /></PremiumGate></Suspense>
}
