import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { HomeView } from "@/features/home/home-view"

export const metadata = { title: "Inicio" }

export default function InicioPage() {
  return <Suspense fallback={<PageSkeleton kpis={4} />}><HomeView /></Suspense>
}
