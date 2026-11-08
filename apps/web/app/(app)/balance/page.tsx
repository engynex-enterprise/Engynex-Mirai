import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { BalanceView } from "@/features/balance/balance-view"

export const metadata = { title: "Balance" }

export default function BalancePage() {
  return <Suspense fallback={<PageSkeleton kpis={3} />}><BalanceView /></Suspense>
}
