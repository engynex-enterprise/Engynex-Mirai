"use client"

import Link from "next/link"
import { LifeBuoy, PlayCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/mirai/page-header"
import { useShell } from "@/components/app/shell-store"
import { FaqModule } from "./faq"
import { ManualModule } from "./manual"
import { NovedadesModule } from "./novedades"

/** Botón para abrir el Centro de ayuda (panel derecho) desde las páginas de ayuda. */
function CentroButton({ k = "@" }: { k?: string }) {
  const setHelp = useShell((s) => s.setHelp)
  return <Button variant="outline" className="bg-white/75 hover:bg-white dark:bg-white/10 dark:hover:bg-white/15" onClick={() => setHelp(k)}><LifeBuoy /> Centro de ayuda</Button>
}

export function NovedadesView() {
  return (
    <div className="grid gap-6">
      <PageHeader id="novedades" title="Novedades" description="Todo lo que hemos agregado y mejorado en Mirai, de lo más nuevo a lo más antiguo. Filtra por tipo y marca lo que ya leíste." noHelp actions={<CentroButton />} />
      <NovedadesModule />
    </div>
  )
}

export function FaqView() {
  return (
    <div className="grid gap-6">
      <PageHeader id="faq" title="Preguntas frecuentes" description="Respuestas cortas a las dudas más comunes, por tema. Busca, abre la que necesites y cuéntanos si te sirvió." noHelp actions={<CentroButton />} />
      <FaqModule />
    </div>
  )
}

export function ManualView() {
  return (
    <div className="grid gap-6">
      <PageHeader id="manual" title="Manual e instructivos" description="Aprende a usar Mirai: guías paso a paso para las tareas más comunes y el manual de cada pantalla, con enlaces directos."
        noHelp actions={<><Button variant="outline" className="bg-white/75 hover:bg-white dark:bg-white/10 dark:hover:bg-white/15" asChild><Link href="/inicio?tour=1"><PlayCircle /> Ver el tour</Link></Button><CentroButton k="@manual" /></>} />
      <ManualModule />
    </div>
  )
}
