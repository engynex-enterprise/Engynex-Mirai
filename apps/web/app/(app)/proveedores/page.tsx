import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { ProvidersView } from "@/features/providers/providers-view"

export const metadata = { title: "Proveedores" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={3} />}><ProvidersView /></Suspense>
}
