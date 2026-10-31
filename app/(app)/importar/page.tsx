import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { ImportView } from "@/features/import/import-view"

export const metadata = { title: "Importar extractos" }

export default function ImportarPage() {
  return <Suspense fallback={<PageSkeleton kpis={0} rows={4} />}><ImportView /></Suspense>
}
