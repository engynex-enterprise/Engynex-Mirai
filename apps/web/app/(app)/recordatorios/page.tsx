import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { PaymentsCalendar } from "@/features/agenda/payments-calendar"

export const metadata = { title: "Próximos pagos" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><PaymentsCalendar /></Suspense>
}
