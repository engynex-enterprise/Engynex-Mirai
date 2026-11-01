"use client"

import { CircleHelp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IsoIcon, hasIso } from "./iso-icon"
import { useShell } from "@/components/app/shell-store"
import { HELP } from "@/lib/content/help"

/** Encabezado de cada sección tipo "portada" (estilo Meta): banda con degradado suave, isotipo grande, título y acciones. */
export function PageHeader({ id, title, description, actions, noHelp }: { id: string; title?: string; description?: string; actions?: React.ReactNode; noHelp?: boolean }) {
  const setHelp = useShell((s) => s.setHelp)
  const help = HELP[id]
  return (
    <header className="appear relative overflow-hidden rounded-lg bg-card shadow-card">
      <div className="bg-soft-gradient absolute inset-x-0 top-0 h-20 sm:h-24" aria-hidden />
      <div className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-lime/25 blur-2xl" aria-hidden />
      <div className="relative flex flex-col gap-4 px-4 pt-6 pb-4 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:pt-10 sm:pb-5">
        <div className="flex items-end gap-4">
          {hasIso(id) && (
            <span className="grid size-16 shrink-0 place-items-center rounded-lg bg-card shadow-float ring-4 ring-card sm:size-20">
              <IsoIcon k={id} size={44} className="sm:hidden" />
              <IsoIcon k={id} size={54} className="hidden sm:block" />
            </span>
          )}
          <div className="grid min-w-0 gap-1 pb-0.5">
            <h1 className="font-heading text-[26px] leading-8 font-extrabold tracking-tight sm:text-[30px] sm:leading-9">{title ?? help?.t}</h1>
            {(description ?? help?.i) && <p className="max-w-[72ch] text-[15px] text-muted-foreground">{description ?? help?.i}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-sm:[&>*]:flex-1 sm:shrink-0 sm:flex-nowrap sm:justify-end">
          {help && !noHelp && (
            <Button variant="outline" onClick={() => setHelp(id)}>
              <CircleHelp /> Cómo funciona
            </Button>
          )}
          {actions}
        </div>
      </div>
    </header>
  )
}
