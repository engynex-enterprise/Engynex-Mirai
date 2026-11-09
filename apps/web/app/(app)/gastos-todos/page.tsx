import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { BandejaView } from "@/features/bandeja/bandeja-view"

export const metadata = { title: "Todos los gastos" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={3} rows={8} />}><BandejaView /></Suspense>
}
