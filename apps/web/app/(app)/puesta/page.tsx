import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { SetupView } from "@/features/setup/setup-view"

export const metadata = { title: "Puesta en marcha" }

export default function PuestaPage() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><SetupView /></Suspense>
}
