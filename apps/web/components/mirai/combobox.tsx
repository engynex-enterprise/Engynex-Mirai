"use client"

import { useState } from "react"
import { Check, ChevronsUpDown, Plus, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Icon } from "./icon"
import { BrandLogo } from "./brand-logo"

export type Option = {
  value: string; label: string; icon?: string; hint?: string; group?: string
  /** Marca de lib/brands.ts (banco, servicio…): se muestra su logo en vez del ícono. */
  brand?: string | null
}

/**
 * Selector con búsqueda (sel() de la v4). Opcional: crear una opción nueva desde el pie
 * ("Crear …" y "Que la IA la cree").
 */
export function Combobox({
  value, onChange, options, id, placeholder = "Selecciona…", searchPlaceholder = "Buscar…", emptyText = "Sin resultados",
  onCreate, onCreateAI, createLabel = "Crear", invalid, disabled, className, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledby,
}: {
  value: string | null | undefined; onChange: (v: string) => void; options: Option[]; id?: string; placeholder?: string
  searchPlaceholder?: string; emptyText?: string; onCreate?: (text: string) => void; onCreateAI?: (text: string) => void
  createLabel?: string; invalid?: boolean; disabled?: boolean; className?: string
  /** Nombre accesible cuando no hay un <label htmlFor> que apunte al `id`. */
  "aria-label"?: string; "aria-labelledby"?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const sel = options.find((o) => o.value === value)
  const groups = [...new Set(options.map((o) => o.group ?? ""))]
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ("") }}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-invalid={invalid} aria-label={ariaLabel} aria-labelledby={ariaLabelledby} disabled={disabled}
          className={cn("h-11 w-full justify-between font-normal", !sel && "text-muted-foreground", className)}>
          <span className="flex min-w-0 items-center gap-2">
            {sel?.brand ? <BrandLogo k={sel.brand} size={22} /> : sel?.icon && <Icon name={sel.icon} className="text-muted-foreground" />}
            <span className="truncate">{sel?.label ?? placeholder}</span>
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g} heading={g || undefined}>
                {options.filter((o) => (o.group ?? "") === g).map((o) => (
                  <CommandItem key={o.value} value={`${o.label} ${o.hint ?? ""}`} onSelect={() => { onChange(o.value); setOpen(false) }}>
                    {o.brand ? <BrandLogo k={o.brand} size={28} /> : o.icon && <span className="grid size-7 place-items-center rounded-full bg-muted"><Icon name={o.icon} className="size-4" /></span>}
                    <span className="grid min-w-0">
                      <span className="truncate">{o.label}</span>
                      {o.hint && <span className="truncate text-xs text-muted-foreground">{o.hint}</span>}
                    </span>
                    <Check className={cn("ml-auto", o.value === value ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            {(onCreate || onCreateAI) && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  {onCreate && (
                    <CommandItem value={`__crear ${q}`} onSelect={() => { setOpen(false); onCreate(q.trim()) }}>
                      <Plus /> {q.trim() ? `${createLabel} “${q.trim()}”` : `${createLabel}…`}
                    </CommandItem>
                  )}
                  {onCreateAI && (
                    <CommandItem value={`__ia ${q}`} onSelect={() => { setOpen(false); onCreateAI(q.trim()) }}>
                      <Sparkles className="text-brand" /> Que la IA la cree
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
