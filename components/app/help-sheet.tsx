"use client"

import dynamic from "next/dynamic"
import { useCallback, useState } from "react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useShell } from "./shell-store"

/** Esqueleto mientras carga el Centro de ayuda (incluye el título del diálogo para lectores de pantalla). */
function PanelSkeleton() {
  return (
    <>
      <SheetHeader className="flex-row items-center gap-2 border-b px-3 py-2.5">
        <Skeleton className="size-8 rounded-full" />
        <div className="grid flex-1 gap-1"><SheetTitle className="text-base font-semibold">Centro de ayuda</SheetTitle><SheetDescription className="text-xs">Cargando…</SheetDescription></div>
      </SheetHeader>
      <div className="grid gap-4 p-4" aria-busy="true">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid grid-cols-2 gap-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      </div>
    </>
  )
}

const HelpPanel = dynamic(() => import("@/features/ayuda/panel").then((m) => m.HelpPanel), { ssr: false, loading: PanelSkeleton })

/**
 * Centro de ayuda: panel derecho con buscador global, ayuda de la página actual, novedades, preguntas frecuentes,
 * manual, guías, academia, glosario, atajos, tu opinión, soporte y estado del servicio.
 * Se abre con `useShell().setHelp(clave)` (ver parseHelpKey en lib/content/centro-ayuda.ts): `"@"` = portada,
 * el id de una sección = su "Cómo funciona", `"@novedades"`, `"@glosario:uvt"`…
 */
export function HelpSheet() {
  const key = useShell((s) => s.help)
  const setHelp = useShell((s) => s.setHelp)
  const close = useCallback(() => setHelp(null), [setHelp])
  // Cada vez que se abre (o se pide otra vista) empieza de cero; al cerrar se conserva el contenido durante la animación.
  const [prev, setPrev] = useState<string | null>(null)
  const [view, setView] = useState<{ key: string; n: number } | null>(null)
  if (prev !== key) {
    setPrev(key)
    if (key !== null) setView((v) => ({ key, n: (v?.n ?? 0) + 1 }))
  }
  return (
    <Sheet open={key !== null} onOpenChange={(o) => !o && close()}>
      <SheetContent showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-md" data-help-center>
        {view ? <HelpPanel key={view.n} initial={view.key} onClose={close} /> : <PanelSkeleton />}
      </SheetContent>
    </Sheet>
  )
}

/** Abre el Centro de ayuda (portada o una vista) desde cualquier parte. */
export const openHelpCenter = (key = "@") => useShell.getState().setHelp(key)
