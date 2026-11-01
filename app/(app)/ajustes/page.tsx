import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { SettingsView } from "@/features/settings/settings-view"

export const metadata = { title: "Ajustes" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><SettingsView /></Suspense>
}
