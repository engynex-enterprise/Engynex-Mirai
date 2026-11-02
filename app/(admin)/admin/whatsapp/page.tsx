import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminHeader } from "@/components/admin/admin-shell"
import { WhatsAppPanel } from "@/features/admin/console-whatsapp"

export const metadata = { title: "WhatsApp" }

export default function Page() {
  return (
    <>
      <AdminHeader />
      <Suspense fallback={<Skeleton className="h-96" />}><WhatsAppPanel /></Suspense>
    </>
  )
}
