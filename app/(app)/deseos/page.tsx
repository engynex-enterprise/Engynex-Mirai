import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { DeseosView } from "@/features/deseos/deseos-view"

export const metadata = { title: "Lista de deseos" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><DeseosView /></Suspense>
}
