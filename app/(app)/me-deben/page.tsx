import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { LoansView } from "@/features/loans/loans-view"

export const metadata = { title: "Me deben" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={3} />}><LoansView kind="cobrar" /></Suspense>
}
