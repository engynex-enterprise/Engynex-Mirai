import { Suspense } from "react"
import { DashboardSkeleton } from "@/components/skeletons/dashboard-skeleton"
import { DashboardView } from "@/features/dashboard/dashboard-view"

export const metadata = { title: "Dashboard" }

export default function DashboardPage() {
  return <Suspense fallback={<DashboardSkeleton />}><DashboardView /></Suspense>
}
