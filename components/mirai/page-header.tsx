"use client"

import { CircleHelp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IsoIcon, hasIso } from "./iso-icon"
import { useShell } from "@/components/app/shell-store"
import { HELP } from "@/lib/content/help"

/** Encabezado de cada sección: isotipo, título, descripción, "Cómo funciona" y acciones. */
export function PageHeader({ id, title, description, actions, noHelp }: { id: string; title?: string; description?: string; actions?: React.ReactNode; noHelp?: boolean }) {
  const setHelp = useShell((s) => s.setHelp)
  const help = HELP[id]
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-4">
        {hasIso(id) && <IsoIcon k={id} size={52} className="hidden sm:block" />}
        <div className="grid gap-1">
          <h1 className="font-heading text-2xl leading-8 font-semibold sm:text-[28px] sm:leading-9">{title ?? help?.t}</h1>
          {(description ?? help?.i) && <p className="max-w-[72ch] text-muted-foreground">{description ?? help?.i}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 max-sm:[&>*]:flex-1">
        {help && !noHelp && (
          <Button variant="outline" onClick={() => setHelp(id)}>
            <CircleHelp /> Cómo funciona
          </Button>
        )}
        {actions}
      </div>
    </header>
  )
}
