import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { PremiumGate } from "@/features/planes/premium"
import { RentaOwner } from "@/features/renta/renta-owner"

export const metadata = { title: "Declaración de renta" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={3} />}><PremiumGate feature="impuestos" section="renta" title="Declaración de renta"><RentaOwner /></PremiumGate></Suspense>
}
