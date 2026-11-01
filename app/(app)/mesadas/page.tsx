import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { MesadasView } from "@/features/extras/mesadas-view"

export const metadata = { title: "Mesada de los hijos" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><MesadasView /></Suspense>
}
