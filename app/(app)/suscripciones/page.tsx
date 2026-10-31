import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { SubscriptionsView } from "@/features/subscriptions/subscriptions-view"

export const metadata = { title: "Suscripciones" }

export default function SuscripcionesPage() {
  return <Suspense fallback={<PageSkeleton kpis={3} />}><SubscriptionsView /></Suspense>
}
