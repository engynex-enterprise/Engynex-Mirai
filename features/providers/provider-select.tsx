"use client"

import { useMemo, useState } from "react"
import { Check, ChevronsUpDown, Plus, SquarePen, X } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { useCanEdit } from "@/components/app/app-context"
import { useSave } from "@/hooks/use-book-data"
import { brandFor } from "@/lib/brands"
import { PROVIDER_TIPOS, cleanProvName, findProvider, normProv, sugerenciasPendientes, tipoLabel, tipoSugerido, type ProviderTipo } from "@/lib/domain"
import type { Row } from "@/lib/supabase/tables"
import { cn } from "@/lib/utils"
import { useProviders } from "@/features/catalogs/hooks"
import { ProviderAvatar } from "./provider-avatar"
import { ProviderDialog } from "./provider-dialog"

export type Provider = Row<"providers">

type Props = {
  value: string | null | undefined
  /** Recibe el id elegido (null = sin proveedor) y el proveedor completo (para sugerir su categoría). */
  onChange: (id: string | null, provider: Provider | null) => void
  /** Nombre guardado en la columna de texto: se muestra si el proveedor ya no está en la lista (p. ej. lo eliminaron). */
  fallbackName?: string | null
  id?: string
  placeholder?: string
  invalid?: boolean
  disabled?: boolean
  className?: string
}

/**
 * Selector de proveedor: busca entre los del libro (agrupados por tipo, con su logo), sugiere proveedores comunes de
 * Colombia y deja agregar uno nuevo con lo que escribiste ("+ Agregar proveedor «…»"), que queda elegido al instante.
 * Para guardar más datos (contrato, teléfono…) abre la ventana corta "Agregar con más datos".
 */
export function ProviderSelect({ value, onChange, fallbackName, id, placeholder = "Elige o agrega un proveedor", invalid, disabled, className }: Props) {
  const { data: list = [], isPending } = useProviders()
  const save = useSave("providers")
  const canEdit = useCanEdit()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [dialog, setDialog] = useState<{ nombre: string; tipo?: ProviderTipo } | null>(null)
  const [creating, setCreating] = useState(false)

  const sel = value ? list.find((p) => p.id === value) : undefined
  const label = sel?.nombre ?? (value && fallbackName ? fallbackName : null)
  const groups = useMemo(() => {
    const vivos = list.filter((p) => p.activo || p.id === value)
    return (Object.keys(PROVIDER_TIPOS) as ProviderTipo[]).map((t) => ({ t, items: vivos.filter((p) => (p.tipo in PROVIDER_TIPOS ? p.tipo : "otro") === t) })).filter((g) => g.items.length)
  }, [list, value])
  const sugeridas = useMemo(() => sugerenciasPendientes(list), [list])
  const texto = cleanProvName(q)
  const existe = !!texto && (!!findProvider(list, texto) || sugeridas.some((s) => normProv(s.nombre) === normProv(texto)))

  const pick = (p: Provider | null) => { onChange(p?.id ?? null, p); setOpen(false); setQ("") }

  /** Crea el proveedor (o usa el que ya existe con ese nombre) y lo deja elegido. */
  const add = async (nombre: string, tipo?: ProviderTipo, brand?: string) => {
    const n = cleanProvName(nombre)
    if (!n) return
    const ya = findProvider(list, n)
    if (ya) return pick(ya)
    setOpen(false); setQ(""); setCreating(true)
    try {
      const row = (await save.mutateAsync({ nombre: n, tipo: tipo ?? tipoSugerido(n), brand: brand ?? brandFor(n), activo: true } as never)) as Provider
      onChange(row.id, row)
      toast.success("Proveedor agregado", { description: `“${n}” quedó en tu lista de proveedores.` })
    } catch { /* useSave ya mostró el error */ } finally { setCreating(false) }
  }

  // Búsqueda sin tildes ni mayúsculas sobre el nombre y el tipo; las acciones (__…) siempre se muestran.
  const filter = (v: string, search: string, kw?: string[]) => (v.startsWith("__") ? 1 : normProv((kw ?? []).join(" ")).includes(normProv(search)) ? 1 : 0)

  return (
    <>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ("") }}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-invalid={invalid} disabled={disabled || creating}
            className={cn("h-11 w-full justify-between font-normal", !label && "text-muted-foreground", className)}>
            <span className="flex min-w-0 items-center gap-2">
              {creating ? <Spinner /> : label && <ProviderAvatar p={sel ?? { nombre: label }} size={24} />}
              <span className="truncate">{creating ? "Agregando…" : label ?? placeholder}</span>
              {value && !sel && label && !isPending && <span className="shrink-0 text-xs text-muted-foreground">(eliminado)</span>}
            </span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
          <Command filter={filter}>
            <CommandInput placeholder="Buscar o escribir un proveedor…" value={q} onValueChange={setQ} />
            <CommandList>
              <CommandEmpty>{canEdit ? "No está en tu lista. Agrégalo abajo." : "Sin resultados"}</CommandEmpty>
              {groups.map((g) => (
                <CommandGroup key={g.t} heading={PROVIDER_TIPOS[g.t].label}>
                  {g.items.map((p) => (
                    <CommandItem key={p.id} value={`p:${p.id}`} keywords={[p.nombre, tipoLabel(p.tipo), p.referencia ?? ""]} onSelect={() => pick(p)}>
                      <ProviderAvatar p={p} size={28} />
                      <span className="grid min-w-0">
                        <span className="truncate">{p.nombre}</span>
                        {p.referencia && <span className="truncate text-xs text-muted-foreground">Ref. {p.referencia}</span>}
                      </span>
                      <Check className={cn("ml-auto", p.id === value ? "opacity-100" : "opacity-0")} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {canEdit && sugeridas.length > 0 && (
                <CommandGroup heading="Comunes en Colombia">
                  {sugeridas.map((s) => (
                    <CommandItem key={s.nombre} value={`s:${s.nombre}`} keywords={[s.nombre, tipoLabel(s.tipo)]} onSelect={() => add(s.nombre, s.tipo, s.brand)}>
                      <ProviderAvatar p={s} size={28} />
                      <span className="grid min-w-0">
                        <span className="truncate">{s.nombre}</span>
                        <span className="truncate text-xs text-muted-foreground">{tipoLabel(s.tipo)} · toca para agregarlo</span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {(canEdit || value) && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    {canEdit && texto && !existe && (
                      <CommandItem value="__crear" onSelect={() => add(texto)}>
                        <Plus /> Agregar proveedor “{texto}”
                      </CommandItem>
                    )}
                    {canEdit && (
                      <CommandItem value="__dialogo" onSelect={() => { setOpen(false); setDialog({ nombre: texto }); setQ("") }}>
                        <SquarePen /> {texto && !existe ? `Agregar “${texto}” con más datos…` : "Agregar proveedor con más datos…"}
                      </CommandItem>
                    )}
                    {value && (
                      <CommandItem value="__quitar" onSelect={() => pick(null)}>
                        <X /> Sin proveedor
                      </CommandItem>
                    )}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <ProviderDialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)} initialName={dialog?.nombre ?? ""} initialTipo={dialog?.tipo}
        onSaved={(row) => onChange(row.id, row)} />
    </>
  )
}
