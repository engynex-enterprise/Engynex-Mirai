import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { ExpensesView } from "@/features/expenses/expenses-view"

export const metadata = { title: "Gastos y hormiga" }

export default function GastosPage() {
  return (
    <Suspense fallback={<PageSkeleton kpis={0} rows={8} />}>
      <ExpensesView />
    </Suspense>
  )
}
