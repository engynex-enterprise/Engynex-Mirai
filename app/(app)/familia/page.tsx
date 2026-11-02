import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { PremiumGate } from "@/features/planes/premium"
import { FamilyView } from "@/features/planning/family-view"

export const metadata = { title: "Por miembro" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={3} />}><PremiumGate feature="familia" section="familia" title="Por miembro"><FamilyView /></PremiumGate></Suspense>
}
