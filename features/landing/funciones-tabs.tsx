"use client"

import type { ReactNode } from "react"
import { Tabs as TabsPrimitive } from "radix-ui"
import { IsoIcon } from "@/components/mirai/iso-icon"

/**
 * Pestañas por grupo de funciones. Todos los paneles quedan en el HTML (forceMount) para buscadores y lectores;
 * los inactivos solo se ocultan.
 */
export function FuncionesTabs({ grupos, panels }: { grupos: { id: string; label: string; iso: string; n: number }[]; panels: Record<string, ReactNode> }) {
  return (
    <TabsPrimitive.Root defaultValue={grupos[0]?.id} className="grid grid-cols-1 gap-6">
      <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
        <TabsPrimitive.List aria-label="Grupos de funciones" className="mx-auto flex w-max gap-2 rounded-2xl lg:w-fit lg:flex-wrap lg:justify-center border bg-card p-1.5 shadow-card backdrop-blur">
          {grupos.map((g) => (
            <TabsPrimitive.Trigger
              key={g.id}
              value={g.id}
              className="press flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold whitespace-nowrap text-muted-foreground outline-none transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=active]:bg-nav-active data-[state=active]:text-nav-active-foreground"
            >
              <IsoIcon k={g.iso} size={22} />
              {g.label}
              <span className="rounded-full bg-current/10 px-1.5 text-[11px] font-medium">{g.n}</span>
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
      </div>
      {grupos.map((g) => (
        <TabsPrimitive.Content key={g.id} value={g.id} forceMount className="outline-none data-[state=active]:animate-[appear_.28s_cubic-bezier(0.14,1,0.34,1)_both] data-[state=inactive]:hidden">
          {panels[g.id]}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  )
}
