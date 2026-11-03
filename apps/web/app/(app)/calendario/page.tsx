import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { PremiumGate } from "@/features/planes/premium"
import { FiscalCalendar } from "@/features/agenda/fiscal-calendar"

export const metadata = { title: "Calendario fiscal y laboral" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={3} />}><PremiumGate feature="impuestos" section="calendario" title="Calendario fiscal y laboral"><FiscalCalendar /></PremiumGate></Suspense>
}
