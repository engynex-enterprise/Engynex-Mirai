import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { ManualView } from "@/features/ayuda/views"

export const metadata = { title: "Manual" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><ManualView /></Suspense>
}
