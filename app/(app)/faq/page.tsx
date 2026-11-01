import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { FaqView } from "@/features/ayuda/views"

export const metadata = { title: "Preguntas frecuentes" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><FaqView /></Suspense>
}
