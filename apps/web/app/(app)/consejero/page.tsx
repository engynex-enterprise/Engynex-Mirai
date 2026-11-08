import { Suspense } from "react"
import { AdvisorSkeleton, AdvisorView } from "@/features/advisor/advisor-view"

export const metadata = { title: "Consejero" }

// El chat funciona en todos los planes: en Gratis responde con los datos del libro (algoritmos) y muestra una invitación
// a Premium para lo que necesita IA (features/advisor/advisor-view.tsx › FreeBanner y el chat de la API).
export default function Page() {
  return <Suspense fallback={<AdvisorSkeleton />}><AdvisorView /></Suspense>
}
