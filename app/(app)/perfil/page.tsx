import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { ProfileView } from "@/features/profile/profile-view"

export const metadata = { title: "Mi perfil" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><ProfileView /></Suspense>
}
