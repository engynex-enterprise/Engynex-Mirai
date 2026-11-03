import { Suspense } from "react"
import { notFound } from "next/navigation"
import { Construction } from "lucide-react"
import { PageHeader } from "@/components/mirai/page-header"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PAGES, pageById } from "@/lib/nav"
import { PHASE_OF } from "@/lib/migration-status"

export function generateStaticParams() {
  return PAGES.map((p) => ({ seccion: p.id }))
}

/** Secciones que aún se están migrando desde la v4 (cada fase las reemplaza por su página real). */
export default function SeccionPage({ params }: PageProps<"/[seccion]">) {
  // Los params se leen dentro de Suspense para que la navegación sea instantánea (Next 16).
  return (
    <Suspense fallback={<PageSkeleton kpis={0} rows={3} />}>
      <Seccion params={params} />
    </Suspense>
  )
}

async function Seccion({ params }: { params: PageProps<"/[seccion]">["params"] }) {
  const { seccion } = await params
  const page = pageById(seccion)
  if (!page) notFound()
  return (
    <div className="grid gap-6">
      <PageHeader id={page.id} title={page.label} />
      <Empty className="rounded-lg border border-dashed bg-card py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Construction /></EmptyMedia>
          <EmptyTitle>Estamos pasando esta sección a la nueva versión</EmptyTitle>
          <EmptyDescription>
            Llega en la {PHASE_OF[page.id] ?? "próxima fase"}. Mientras tanto puedes leer “Cómo funciona” para conocerla.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
