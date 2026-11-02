import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { AutomationsView } from "@/features/automations/automations-view"

export const metadata = { title: "Automatizaciones" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={3} />}><AutomationsView /></Suspense>
}
