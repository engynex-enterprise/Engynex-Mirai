"use client"

import { CircleHelp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IsoIcon, hasIso } from "./iso-icon"
import { useShell } from "@/components/app/shell-store"
import { HELP } from "@/lib/content/help"

/**
 * Encabezado de cada sección como el héroe de developers.facebook.com (medido con REA): tarjeta de 32 px con el
 * degradado rosa → lavanda → celeste → aguamarina, título centrado de peso medio y acciones centradas.
 */
export function PageHeader({ id, title, description, actions, noHelp }: { id: string; title?: string; description?: string; actions?: React.ReactNode; noHelp?: boolean }) {
  const setHelp = useShell((s) => s.setHelp)
  const help = HELP[id]
  return (
    <header className="appear relative px-2 pt-3 pb-1 text-center sm:px-10 sm:pt-6 sm:pb-2">
      <div className="mx-auto grid max-w-3xl justify-items-center gap-3">
        {hasIso(id) && (
          <span className="grid size-16 place-items-center rounded-2xl bg-white/85 shadow-[0_1px_2px_rgba(0,0,0,.12)] backdrop-blur dark:bg-white/10">
            <IsoIcon k={id} size={44} />
          </span>
        )}
        <h1 className="font-heading text-[30px] leading-[1.15] font-medium tracking-[-0.02em] text-meta-text sm:text-[44px]">{title ?? help?.t}</h1>
        {(description ?? help?.i) && <p className="max-w-[62ch] text-[15px] leading-relaxed text-meta-text/85 sm:text-[17px]">{description ?? help?.i}</p>}
        {(actions || (help && !noHelp)) && (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1 max-sm:w-full max-sm:[&>*]:flex-1">
            {help && !noHelp && (
              <Button variant="outline" className="bg-white/70 hover:bg-white dark:bg-white/10 dark:hover:bg-white/15" onClick={() => setHelp(id)}>
                <CircleHelp /> Cómo funciona
              </Button>
            )}
            {actions}
          </div>
        )}
      </div>
    </header>
  )
}
