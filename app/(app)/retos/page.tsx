import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { RetosView } from "@/features/extras/retos-view"

export const metadata = { title: "Retos de ahorro" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><RetosView /></Suspense>
}
