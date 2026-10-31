import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { CardsView } from "@/features/cards/cards-view"

export const metadata = { title: "Tarjetas de crédito" }

export default function TarjetasPage() {
  return <Suspense fallback={<PageSkeleton kpis={3} />}><CardsView /></Suspense>
}
