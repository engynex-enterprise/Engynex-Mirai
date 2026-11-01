import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { HealthView } from "@/features/planning/health-view"

export const metadata = { title: "Salud financiera" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><HealthView /></Suspense>
}
