import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { ContactsView } from "@/features/contacts/contacts-view"

export const metadata = { title: "Contactos" }

export default function ContactosPage() {
  return <Suspense fallback={<PageSkeleton kpis={0} />}><ContactsView /></Suspense>
}
