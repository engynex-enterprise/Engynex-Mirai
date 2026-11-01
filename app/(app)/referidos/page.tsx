import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { ReferidosView } from "@/features/referidos/referidos-view"

export const metadata = { title: "Invita y gana" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><ReferidosView /></Suspense>
}
