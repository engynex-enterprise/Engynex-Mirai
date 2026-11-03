import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { LogrosView } from "@/features/gami/logros-view"

export const metadata = { title: "Logros y nivel" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={3} />}><LogrosView /></Suspense>
}
