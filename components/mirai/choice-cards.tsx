"use client"

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { Icon } from "./icon"
import { IsoIcon } from "./iso-icon"

export type Choice = { value: string; label: string; desc?: string; icon?: string; iso?: string; recommended?: boolean }

/** Tarjetas seleccionables (pick() de la v4) con pill "Recomendado". */
export function ChoiceCards({ value, onChange, items, cols = 2, name }: { value: string; onChange: (v: string) => void; items: Choice[]; cols?: 2 | 3 | 4; name?: string }) {
  return (
    <RadioGroup value={value} onValueChange={onChange} name={name}
      className={cn("grid gap-2", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3", cols === 4 && "grid-cols-2 sm:grid-cols-4")}>
      {items.map((i) => (
        <label key={i.value}
          className="relative flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 transition hover:bg-muted/60 has-[[data-state=checked]]:border-2 has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand-soft has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50">
          <RadioGroupItem value={i.value} aria-label={i.label} className="absolute inset-0 z-10 size-full cursor-pointer rounded-lg border-0 opacity-0 shadow-none" />
          {i.iso ? <IsoIcon k={i.iso} size={28} /> : i.icon ? <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted"><Icon name={i.icon} className="size-4" /></span> : null}
          <span className="grid gap-0.5">
            <span className="text-sm font-semibold">{i.label}</span>
            {i.desc && <span className="text-xs text-muted-foreground">{i.desc}</span>}
          </span>
          {i.recommended && <span className="absolute -top-2 right-2 rounded-full bg-lime px-2 text-[11px] font-semibold text-navy">Recomendado</span>}
        </label>
      ))}
    </RadioGroup>
  )
}

/** Botones segmentados (chips/seg de la v4). */
export function Segmented({ value, onChange, items, className }: { value: string; onChange: (v: string) => void; items: { value: string; label: string; icon?: string }[]; className?: string }) {
  return (
    <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v)} variant="outline" className={cn("flex-wrap", className)}>
      {items.map((i) => (
        <ToggleGroupItem key={i.value} value={i.value} className="h-9 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
          {i.icon && <Icon name={i.icon} />} {i.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
