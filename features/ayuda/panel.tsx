"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, House, LifeBuoy, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { HELP } from "@/lib/content/help"
import { helpKey, initialStack, type HelpRoute, type HelpView } from "@/lib/content/centro-ayuda"
import { AcademiaPanel, LeccionPanel } from "./academia"
import { AtajosModule, EstadoModule, OpinionPanel, SoporteModule } from "./extras"
import { FaqModule } from "./faq"
import { GlosarioList, TerminoDetail } from "./glosario"
import { HelpHome } from "./home"
import { GuiaDetail, GuiasList, ManualToc, PaginaHelp } from "./manual"
import { NovedadesModule } from "./novedades"
import { HelpNavProvider } from "./ui"

const TITLE: Record<HelpView, string> = {
  inicio: "Respuestas, guías y soporte", pagina: "Ayuda para esta página", novedades: "Novedades", faq: "Preguntas frecuentes",
  manual: "Manual", guias: "Guías paso a paso", guia: "Guía paso a paso", academia: "Academia Mirai", leccion: "Academia Mirai",
  glosario: "Glosario financiero", atajos: "Atajos de teclado", opinion: "Tu opinión", soporte: "Contactar soporte", estado: "Estado del servicio",
}

function subtitle(r: HelpRoute) {
  if ((r.v === "pagina" || (r.v === "manual" && r.id)) && r.id && HELP[r.id]) return HELP[r.id].t
  return TITLE[r.v]
}

function View({ r }: { r: HelpRoute }) {
  switch (r.v) {
    case "inicio": return <HelpHome />
    case "pagina": return <PaginaHelp id={r.id} />
    case "novedades": return <NovedadesModule compact />
    case "faq": return <FaqModule compact focusId={r.id} />
    case "manual": return r.id ? <PaginaHelp id={r.id} /> : <ManualToc />
    case "guias": return <GuiasList />
    case "guia": return <GuiaDetail id={r.id} />
    case "academia": return <AcademiaPanel />
    case "leccion": return <LeccionPanel id={r.id} />
    case "glosario": return r.id ? <TerminoDetail id={r.id} /> : <GlosarioList />
    case "atajos": return <AtajosModule />
    case "opinion": return <OpinionPanel tipo={r.tipo} />
    case "soporte": return <SoporteModule />
    case "estado": return <EstadoModule />
  }
}

/**
 * Contenido del Centro de ayuda (panel derecho): navegación interna con pila y botón Atrás, como los paneles de
 * Facebook. La portada siempre queda debajo de la vista con la que se abrió.
 */
export function HelpPanel({ initial, onClose }: { initial: string; onClose: () => void }) {
  const [stack, setStack] = useState<HelpRoute[]>(() => initialStack(initial))
  const route = stack[stack.length - 1]
  const go = useCallback((r: HelpRoute) => setStack((s) => (helpKey(s[s.length - 1]) === helpKey(r) ? s : [...s, r])), [])
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
  const nav = useMemo(() => ({ inPanel: true, go, close: onClose }), [go, onClose])
  const scroller = useRef<HTMLDivElement>(null)
  const depth = stack.length
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }) }, [depth])

  return (
    <HelpNavProvider value={nav}>
      <SheetHeader className="flex-row items-center gap-2 border-b px-3 py-2.5">
        {depth > 1 ? (
          <Button size="icon-sm" variant="ghost" className="shrink-0 rounded-full" aria-label="Atrás" onClick={back}><ArrowLeft /></Button>
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand" aria-hidden><LifeBuoy className="size-4" /></span>
        )}
        <div className="min-w-0 flex-1">
          <SheetTitle className="truncate text-base leading-tight font-semibold">Centro de ayuda</SheetTitle>
          <SheetDescription className="truncate text-xs">{subtitle(route)}</SheetDescription>
        </div>
        {depth > 2 && <Button size="icon-sm" variant="ghost" className="shrink-0 rounded-full" aria-label="Volver a la portada del Centro de ayuda" onClick={() => setStack([{ v: "inicio" }])}><House /></Button>}
        <Button size="icon-sm" variant="ghost" className="shrink-0 rounded-full" aria-label="Cerrar el Centro de ayuda" onClick={onClose}><X /></Button>
      </SheetHeader>
      <div ref={scroller} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-4 pb-10">
        <div key={`${depth}-${helpKey(route)}`} className="animate-in fade-in-0 slide-in-from-right-2 duration-200 motion-reduce:animate-none">
          <View r={route} />
        </div>
      </div>
    </HelpNavProvider>
  )
}
