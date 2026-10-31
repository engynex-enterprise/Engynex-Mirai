"use client"

import { useMemo, useRef, useState } from "react"
import { MapPin } from "lucide-react"
import { Input } from "@/components/ui/input"
import { FormField } from "./field"
import { Combobox } from "./combobox"
import { cityOptions, geoOf, parseAddr } from "@/lib/geo"

export type Address = { dir: string; ciudad: string; barrio: string; depto: string }
export const emptyAddress: Address = { dir: "", ciudad: "", barrio: "", depto: "" }

/**
 * Dirección + ciudad + barrio (addrFields de la v4). Al escribir detecta ciudad, departamento y
 * barrio; al salir del campo deja la dirección en formato colombiano.
 */
export function AddressFields({ value, onChange, idPrefix = "addr" }: { value: Address; onChange: (a: Address) => void; idPrefix?: string }) {
  const [chip, setChip] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const options = useMemo(() => {
    const base = cityOptions()
    return value.ciudad && !base.some((o) => o.value === value.ciudad) ? [{ value: value.ciudad, label: value.ciudad, hint: "Otra ciudad", icon: "map-pin" }, ...base] : base
  }, [value.ciudad])

  const detect = (dir: string, finalize: boolean) => {
    const p = parseAddr(dir)
    if (!p) return
    const next = { ...value, dir: finalize && (p.ciudad || p.barrio || p.dir.length > 4) ? p.dir : dir }
    if (p.ciudad) { next.ciudad = p.ciudad; next.depto = p.depto ?? geoOf(p.ciudad)?.d ?? "" }
    if (p.barrio && !value.barrio) next.barrio = p.barrio
    onChange(next)
    const parts = [p.barrio, p.cityName, p.depto].filter(Boolean)
    setChip(parts.length ? `Detectamos: ${parts.join(", ")}` : finalize && dir.length > 8 ? "No identificamos la ciudad. Elígela en la lista." : null)
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <FormField label="Dirección" htmlFor={`${idPrefix}-dir`} className="sm:col-span-2" hint={chip && <span className="inline-flex items-center gap-1 text-link"><MapPin className="size-3.5" />{chip}</span>}>
        <Input id={`${idPrefix}-dir`} className="h-11" autoComplete="street-address" placeholder="Ej. Calle 80 # 15-20 apto 301, Chía" value={value.dir}
          onChange={(e) => { const dir = e.target.value; onChange({ ...value, dir }); clearTimeout(timer.current); timer.current = setTimeout(() => detect(dir, false), 350) }}
          onBlur={() => { clearTimeout(timer.current); if (value.dir) detect(value.dir, true) }} />
      </FormField>
      <FormField label="Ciudad o municipio" htmlFor={`${idPrefix}-ciudad`}>
        <Combobox id={`${idPrefix}-ciudad`} value={value.ciudad} options={options} placeholder="Busca tu ciudad" searchPlaceholder="Busca tu ciudad"
          onChange={(v) => onChange({ ...value, ciudad: v, depto: geoOf(v)?.d ?? "" })} onCreate={(t) => t && onChange({ ...value, ciudad: t, depto: "" })} createLabel="Usar" />
      </FormField>
      <FormField label="Barrio o sector" htmlFor={`${idPrefix}-barrio`}>
        <Input id={`${idPrefix}-barrio`} className="h-11" placeholder="Ej. Cedritos" value={value.barrio} onChange={(e) => onChange({ ...value, barrio: e.target.value })} />
      </FormField>
    </div>
  )
}
