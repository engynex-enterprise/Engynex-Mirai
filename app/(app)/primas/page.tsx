import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { PrimasView } from "@/features/extras/primas-view"

export const metadata = { title: "Primas y cesantías" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={3} />}><PrimasView /></Suspense>
}
