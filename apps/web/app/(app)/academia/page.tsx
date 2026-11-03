import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { AcademiaView } from "@/features/academia/academia-view"

export const metadata = { title: "Academia Mirai" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><AcademiaView /></Suspense>
}
