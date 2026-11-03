"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, CircleCheck, Clock, PlayCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Icon } from "@/components/mirai/icon"
import { ListToolbar, NoResults, useListControls, type ListFilter } from "@/components/mirai/list-toolbar"
import { PageHeader } from "@/components/mirai/page-header"
import { SectionTitle } from "@/components/mirai/panel"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill } from "@/components/mirai/status-pill"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { useShell } from "@/components/app/shell-store"
import { useAyuda } from "@/features/ayuda/use-ayuda"
import { LECCIONES, NIVELES, avancePorNivel, nivelDe, siguienteLeccion, type Leccion, type Nivel } from "@/lib/content/academia"
import { cn } from "@/lib/utils"
import { AvanceAcademia, LeccionBody, NIVEL_TONE } from "./leccion"

/**
 * Ventana de una lección. Queda montada aunque se cierre (con la última lección), así ResponsiveDialog la anima al
 * salir sin cambiar de contenido; `key` la reinicia al abrir otra lección.
 */
function LeccionDialog({ l, open, hecha, onClose, onDone }: { l: Leccion; open: boolean; hecha: boolean; onClose: () => void; onDone: () => void }) {
  const [ok, setOk] = useState(false)
  const setHelp = useShell((s) => s.setHelp)
  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && onClose()} title={l.titulo} description={`${l.minutos} minutos de lectura`}
      footer={<>
        {l.ir ? <Button variant="outline" asChild><Link href={l.ir.href}>{l.ir.label} <ArrowRight /></Link></Button> : <Button variant="outline" onClick={onClose}>Cerrar</Button>}
        <Button disabled={!ok && !hecha} title={!ok && !hecha ? "Responde bien el repaso para terminar" : undefined} onClick={() => { onDone(); onClose() }}>{hecha ? "Listo" : "Terminar lección"}</Button>
      </>}>
      <LeccionBody l={l} onCorrecta={() => setOk(true)} onTermino={(id) => { onClose(); setTimeout(() => setHelp(`@glosario:${id}`), 250) }} />
    </ResponsiveDialog>
  )
}

function LeccionCard({ l, hecha, onOpen }: { l: Leccion; hecha: boolean; onOpen: () => void }) {
  const n = nivelDe(l)
  return (
    <button type="button" onClick={onOpen}
      className={cn("press lift grid h-full w-full content-start gap-3 rounded-xl bg-card p-5 text-left shadow-card hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none", hecha && "ring-1 ring-success/40")}>
      {/* El "Completada" va primero: el nombre accesible del botón empieza así (lo usan las pruebas y el lector de pantalla). */}
      <div className="flex items-center justify-between gap-2">
        <ToneIcon icon={l.icon} tone={NIVEL_TONE[n]} />
        {hecha ? <CircleCheck className="size-6 text-success" aria-label="Completada" /> : <StatusPill tone="estimado">{NIVELES[n].label}</StatusPill>}
      </div>
      <p className="font-semibold">{l.titulo}</p>
      <p className="line-clamp-2 text-sm text-muted-foreground">{l.puntos[0]}</p>
      <p className="mt-auto flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3.5" />{l.minutos} min{hecha ? " · Completada" : ""}</p>
    </button>
  )
}

/** Academia Mirai: lecciones cortas por nivel, con repaso, avance guardado e insignias. */
export function AcademiaView() {
  const { academia: hechas, terminarLeccion, isPending } = useAyuda()
  const [sel, setSel] = useState<Leccion | null>(null)
  const [show, setShow] = useState(false)
  const abrir = (l: Leccion) => { setSel(l); setShow(true) }
  const sig = siguienteLeccion(hechas)
  const niveles = avancePorNivel(hechas)
  const filtros: ListFilter<Leccion>[] = [
    { value: "todas", label: "Todas" },
    { value: "pendientes", label: "Por hacer", match: (l) => !hechas.includes(l.id) },
    { value: "hechas", label: "Completadas", match: (l) => hechas.includes(l.id) },
  ]
  const c = useListControls(LECCIONES, { text: (l) => `${l.titulo} ${l.puntos.join(" ")}`, filters: filtros })
  const visibles = new Set(c.rows.map((l) => l.id))

  return (
    <div className="grid gap-6">
      <PageHeader id="academia" title="Academia Mirai" description="Lecciones de 2 a 4 minutos para entender tu plata: presupuesto, nómina, deudas, tasas, inversión y renta. Sin jerga." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-full gap-4 p-5 shadow-card ring-0">{isPending ? <div className="grid gap-3" aria-busy="true" aria-label="Cargando"><Skeleton className="h-5 w-40" /><Skeleton className="h-2" /><Skeleton className="h-16" /></div> : <AvanceAcademia hechas={hechas} />}</Card>
        <Card className="h-full justify-center gap-3 bg-[linear-gradient(120deg,#1F2B4B,#2E5B33)] p-5 text-white shadow-card ring-0">
          {sig ? (
            <>
              <p className="text-sm text-white/75">{hechas.length ? "Sigue con" : "Empieza por aquí"}</p>
              <div className="flex items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15"><Icon name={sig.icon} className="size-5" /></span><div className="min-w-0"><p className="font-semibold break-words">{sig.titulo}</p><p className="text-sm text-white/75">{NIVELES[nivelDe(sig)].label} · {sig.minutos} min</p></div></div>
              <Button className="w-fit bg-lime text-navy hover:bg-lime/90" onClick={() => abrir(sig)}><PlayCircle /> {hechas.length ? "Continuar" : "Empezar"}</Button>
            </>
          ) : <p className="font-semibold">¡Graduado! Repasa cualquier lección cuando quieras.</p>}
        </Card>
      </div>

      <ListToolbar c={c} placeholder="Busca una lección: tarjeta, prima, CDT…" filters={filtros} />

      {!c.rows.length ? <NoResults c={c}>No hay lecciones con esa búsqueda o ese filtro.</NoResults> : niveles.map(({ nivel, total, hechas: n, minutos }) => {
        const ls = LECCIONES.filter((l) => nivelDe(l) === (nivel as Nivel) && visibles.has(l.id))
        if (!ls.length) return null
        return (
          <section key={nivel} className="grid gap-3" aria-labelledby={`nivel-${nivel}`}>
            <div className="flex flex-wrap items-center gap-3">
              <ToneIcon icon={NIVELES[nivel].icon} tone={NIVEL_TONE[nivel]} size="sm" />
              <SectionTitle className="min-w-0 flex-1" description={`${NIVELES[nivel].desc} · ${minutos} min`}><span id={`nivel-${nivel}`}>Nivel {NIVELES[nivel].label.toLowerCase()}</span></SectionTitle>
              <StatusPill tone={n === total ? "ok" : "gray"}>{n} de {total}</StatusPill>
            </div>
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {ls.map((l) => <li key={l.id}><LeccionCard l={l} hecha={hechas.includes(l.id)} onOpen={() => abrir(l)} /></li>)}
            </ul>
          </section>
        )
      })}
      {sel && <LeccionDialog key={sel.id} l={sel} open={show} hecha={hechas.includes(sel.id)} onClose={() => setShow(false)} onDone={() => terminarLeccion(sel.id)} />}
    </div>
  )
}
