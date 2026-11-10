import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { InformesView } from "@/features/informes/informes-view"

export const metadata = { title: "Informes" }

export default function InformesPage() {
  return <Suspense fallback={<PageSkeleton kpis={3} rows={8} />}><InformesView /></Suspense>
}
