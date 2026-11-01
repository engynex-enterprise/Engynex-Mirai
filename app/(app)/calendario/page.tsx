import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { FiscalCalendar } from "@/features/agenda/fiscal-calendar"

export const metadata = { title: "Calendario fiscal y laboral" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={3} />}><FiscalCalendar /></Suspense>
}
