"use client"

import { Lightbulb } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { IsoIcon, hasIso } from "@/components/mirai/iso-icon"
import { HELP } from "@/lib/content/help"
import { useShell } from "./shell-store"

export function HelpSheet() {
  const id = useShell((s) => s.help)
  const setHelp = useShell((s) => s.setHelp)
  const h = id ? HELP[id] : undefined
  return (
    <Sheet open={!!h} onOpenChange={(o) => !o && setHelp(null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {h && (
          <>
            <SheetHeader>
              {id && hasIso(id) && <IsoIcon k={id} size={48} />}
              <SheetTitle className="text-xl">Cómo funciona: {h.t}</SheetTitle>
              <SheetDescription>{h.i}</SheetDescription>
            </SheetHeader>
            <ol className="grid gap-3 px-4">
              {h.p.map((p, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                  <span className="pt-1">{p}</span>
                </li>
              ))}
            </ol>
            {!!h.tips?.length && (
              <div className="m-4 grid gap-2 rounded-lg border-l-4 border-lime bg-brand-soft p-4">
                {h.tips.map((t, i) => (
                  <p key={i} className="flex gap-2 text-sm"><Lightbulb className="mt-0.5 size-4 shrink-0 text-brand" />{t}</p>
                ))}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
