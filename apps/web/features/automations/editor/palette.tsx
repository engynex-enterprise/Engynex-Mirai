"use client"

import { Lock } from "lucide-react"
import { Icon } from "@/components/mirai/icon"
import { CATALOG, GROUPS, KINDS_BY_GROUP } from "@/lib/automations/catalog"
import type { NodeGroup, NodeKind } from "@/lib/automations/types"
import { cn } from "@/lib/utils"
import { GROUP_STYLE } from "../shared"

export const DND_TYPE = "application/x-mirai-paso"

/**
 * Paleta de pasos por grupo. En escritorio se arrastran al lienzo (o se tocan para agregarlos debajo del paso elegido);
 * en el celular se tocan.
 */
export function Palette({ onAdd, hasTrigger, aiLocked, className }: { onAdd: (k: NodeKind) => void; hasTrigger: boolean; aiLocked: boolean; className?: string }) {
  return (
    <div className={cn("grid content-start gap-4", className)}>
      {(["trigger", "condition", "action"] as NodeGroup[]).map((g) => (
        <section key={g} className="grid gap-1.5" aria-label={GROUPS[g].plural}>
          <div className="flex items-center gap-2 px-1">
            <span className={cn("size-2.5 rounded-full", GROUP_STYLE[g].bar)} aria-hidden />
            <h3 className="text-[12px] font-bold tracking-[.08em] text-muted-foreground uppercase">{GROUPS[g].plural}</h3>
          </div>
          <p className="px-1 text-[12px] text-muted-foreground">{g === "trigger" && hasTrigger ? "Ya tienes uno: arrástralo encima para cambiarlo." : GROUPS[g].desc}</p>
          <ul className="grid gap-1">
            {KINDS_BY_GROUP[g].map((k) => {
              const c = CATALOG[k]
              const locked = c.premium && aiLocked
              return (
                <li key={k}>
                  <button
                    type="button"
                    draggable={!locked}
                    disabled={locked}
                    onDragStart={(e) => { e.dataTransfer.setData(DND_TYPE, k); e.dataTransfer.effectAllowed = "move" }}
                    onClick={() => onAdd(k)}
                    title={c.desc}
                    aria-label={`Agregar paso: ${c.label}`}
                    className="flex w-full cursor-grab items-center gap-2.5 rounded-xl border bg-card px-2.5 py-2 text-left transition-colors hover:bg-hover active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", GROUP_STYLE[g].tile)}><Icon name={c.icon} className="size-4" /></span>
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-[13.5px] font-semibold">{c.label}</span>
                      <span className="truncate text-[12px] text-muted-foreground">{c.desc}</span>
                    </span>
                    {locked && <span className="flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-bold text-warning"><Lock className="size-3" />Premium</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
