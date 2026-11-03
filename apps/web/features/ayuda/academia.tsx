"use client"

import { useState } from "react"
import { ArrowRight, CircleCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AvanceAcademia, LeccionBody, NIVEL_TONE } from "@/features/academia/leccion"
import { LECCIONES, NIVELES, avancePorNivel, nivelDe, siguienteLeccion } from "@/lib/content/academia"
import { AppLink, Empty, ListSkeleton, RowButton, GroupLabel, useHelpNav } from "./ui"
import { useAyuda } from "./use-ayuda"

/** Academia dentro del panel: avance, insignias y lecciones por nivel. */
export function AcademiaPanel() {
  const { go } = useHelpNav()
  const { academia: hechas, isPending } = useAyuda()
  if (isPending) return <ListSkeleton rows={6} />
  const sig = siguienteLeccion(hechas)
  return (
    <div className="grid gap-5">
      <div className="rounded-xl bg-secondary/50 p-4"><AvanceAcademia hechas={hechas} compact /></div>
      {sig && <Button onClick={() => go({ v: "leccion", id: sig.id })} className="w-full justify-between"><span className="truncate">{hechas.length ? "Continuar" : "Empezar"}: {sig.titulo}</span><ArrowRight /></Button>}
      {avancePorNivel(hechas).map(({ nivel, total, hechas: n }) => (
        <section key={nivel} className="grid gap-0.5">
          <GroupLabel action={<span className="text-xs text-muted-foreground">{n} de {total}</span>}>Nivel {NIVELES[nivel].label.toLowerCase()}</GroupLabel>
          {LECCIONES.filter((l) => nivelDe(l) === nivel).map((l) => (
            <RowButton key={l.id} icon={l.icon} tone={NIVEL_TONE[nivel]} title={l.titulo} sub={`${l.minutos} min${hechas.includes(l.id) ? " · Completada" : ""}`} onClick={() => go({ v: "leccion", id: l.id })}
              badge={hechas.includes(l.id) ? <CircleCheck className="size-5 shrink-0 text-success" aria-label="Completada" /> : undefined} />
          ))}
        </section>
      ))}
      <Button variant="ghost" className="w-fit" asChild><AppLink href="/academia">Abrir la Academia en página completa</AppLink></Button>
    </div>
  )
}

/** Una lección dentro del panel. */
export function LeccionPanel({ id }: { id: string }) {
  const { go } = useHelpNav()
  const { academia, terminarLeccion } = useAyuda()
  const [ok, setOk] = useState(false)
  const l = LECCIONES.find((x) => x.id === id)
  if (!l) return <Empty>No encontramos esa lección.</Empty>
  const hecha = academia.includes(l.id)
  const sig = siguienteLeccion(hecha ? academia : [...academia, l.id])
  return (
    <article className="grid gap-4">
      <h2 className="text-xl leading-tight font-semibold break-words">{l.titulo}</h2>
      <LeccionBody key={l.id} l={l} onCorrecta={() => { setOk(true); terminarLeccion(l.id) }} onTermino={(t) => go({ v: "glosario", id: t })} />
      {(ok || hecha) && <p className="flex items-center gap-2 text-sm font-medium text-success"><CircleCheck className="size-4" /> Lección completada. Tu avance quedó guardado.</p>}
      <div className="flex flex-wrap gap-2">
        {l.ir && <Button variant="outline" asChild><AppLink href={l.ir.href}>{l.ir.label} <ArrowRight /></AppLink></Button>}
        {(ok || hecha) && sig && sig.id !== l.id && <Button className="max-w-full" onClick={() => go({ v: "leccion", id: sig.id })}><span className="truncate">Siguiente: {sig.titulo}</span></Button>}
      </div>
    </article>
  )
}
