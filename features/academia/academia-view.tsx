"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, CircleCheck, Clock, PlayCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Icon } from "@/components/mirai/icon"
import { PageHeader } from "@/components/mirai/page-header"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill } from "@/components/mirai/status-pill"
import { useShell } from "@/components/app/shell-store"
import { useAyuda } from "@/features/ayuda/use-ayuda"
import { LECCIONES, NIVELES, avancePorNivel, nivelDe, siguienteLeccion, type Leccion, type Nivel } from "@/lib/content/academia"
import { cn } from "@/lib/utils"
import { AvanceAcademia, LeccionBody } from "./leccion"

function LeccionDialog({ l, hecha, onClose, onDone }: { l: Leccion; hecha: boolean; onClose: () => void; onDone: () => void }) {
  const [ok, setOk] = useState(false)
  const setHelp = useShell((s) => s.setHelp)
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title={l.titulo} description={`${l.minutos} minutos de lectura`}
      footer={<>
        {l.ir ? <Button variant="outline" asChild><Link href={l.ir.href}>{l.ir.label} <ArrowRight /></Link></Button> : <Button variant="outline" onClick={onClose}>Cerrar</Button>}
        <Button disabled={!ok && !hecha} onClick={() => { onDone(); onClose() }}>{hecha ? "Listo" : "Terminar lección"}</Button>
      </>}>
      <LeccionBody l={l} onCorrecta={() => setOk(true)} onTermino={(id) => { onClose(); setTimeout(() => setHelp(`@glosario:${id}`), 250) }} />
    </ResponsiveDialog>
  )
}

/** Academia Mirai: lecciones cortas por nivel, con repaso, avance guardado e insignias. */
export function AcademiaView() {
  const { academia: hechas, terminarLeccion, isPending } = useAyuda()
  const [open, setOpen] = useState<Leccion | null>(null)
  const sig = siguienteLeccion(hechas)
  const niveles = avancePorNivel(hechas)
  return (
    <div className="grid gap-6">
      <PageHeader id="academia" title="Academia Mirai" description="Lecciones de 2 a 4 minutos para entender tu plata: presupuesto, nómina, deudas, tasas, inversión y renta. Sin jerga." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="p-5 shadow-card ring-0">{isPending ? <div className="grid gap-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-2" /><Skeleton className="h-16" /></div> : <AvanceAcademia hechas={hechas} />}</Card>
        <Card className="justify-center gap-3 bg-[linear-gradient(120deg,#1F2B4B,#2E5B33)] p-5 text-white shadow-card ring-0">
          {sig ? (
            <>
              <p className="text-sm text-white/75">{hechas.length ? "Sigue con" : "Empieza por aquí"}</p>
              <div className="flex items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15"><Icon name={sig.icon} className="size-5" /></span><div className="min-w-0"><p className="font-semibold break-words">{sig.titulo}</p><p className="text-sm text-white/75">{NIVELES[nivelDe(sig)].label} · {sig.minutos} min</p></div></div>
              <Button className="w-fit bg-lime text-navy hover:bg-lime/90" onClick={() => setOpen(sig)}><PlayCircle /> {hechas.length ? "Continuar" : "Empezar"}</Button>
            </>
          ) : <p className="font-semibold">¡Graduado! Repasa cualquier lección cuando quieras.</p>}
        </Card>
      </div>
      {niveles.map(({ nivel, total, hechas: n, minutos }) => (
        <section key={nivel} className="grid gap-3" aria-labelledby={`nivel-${nivel}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-brand"><Icon name={NIVELES[nivel].icon} className="size-4" /></span>
            <h2 id={`nivel-${nivel}`} className="text-lg font-semibold">Nivel {NIVELES[nivel].label.toLowerCase()}</h2>
            <span className="text-sm text-muted-foreground">· {NIVELES[nivel].desc} · {minutos} min</span>
            <StatusPill tone={n === total ? "ok" : "gray"} className="ml-auto">{n} de {total}</StatusPill>
          </div>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {LECCIONES.filter((l) => nivelDe(l) === (nivel as Nivel)).map((l) => {
              const hecha = hechas.includes(l.id)
              return (
                <li key={l.id}>
                  <button type="button" onClick={() => setOpen(l)} className={cn("press grid h-full w-full gap-3 rounded-xl bg-card p-4 text-left shadow-card hover:bg-hover", hecha && "ring-1 ring-success/40")}>
                    <div className="flex items-center justify-between"><span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand"><Icon name={l.icon} className="size-5" /></span>{hecha ? <CircleCheck className="size-6 text-success" aria-label="Completada" /> : <StatusPill tone="estimado">{NIVELES[nivelDe(l)].label}</StatusPill>}</div>
                    <p className="font-semibold">{l.titulo}</p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{l.puntos[0]}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3.5" />{l.minutos} min{hecha ? " · Completada" : ""}</p>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {open && <LeccionDialog key={open.id} l={open} hecha={hechas.includes(open.id)} onClose={() => setOpen(null)} onDone={() => terminarLeccion(open.id)} />}
    </div>
  )
}
