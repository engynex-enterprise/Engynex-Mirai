"use client"

import { useState } from "react"
import { CalendarDays } from "lucide-react"
import { es } from "react-day-picker/locale"
import { addDays, format, parseISO } from "date-fns"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { fmtDate, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"

const toISO = (d: Date) => format(d, "yyyy-MM-dd")

/** Selector de fecha con accesos rápidos (Hoy, Ayer, +1 mes…) como el datep de la v4. */
export function DatePicker({
  value, onChange, id, placeholder = "Elige una fecha", quick = "pasado", invalid, disabled, clearable, years = [2000, 2045], startAt,
}: {
  value: string | null | undefined; onChange: (v: string | null) => void; id?: string; placeholder?: string
  quick?: "pasado" | "futuro" | "ninguno"; invalid?: boolean; disabled?: boolean; clearable?: boolean
  /** Años del selector (p. ej. [1920, este año] para fechas de nacimiento) y mes que se muestra si no hay fecha. */
  years?: [number, number]; startAt?: string
}) {
  const [open, setOpen] = useState(false)
  const today = todayISO()
  const t = parseISO(today)
  const quicks =
    quick === "pasado"
      ? [["Hoy", today], ["Ayer", toISO(addDays(t, -1))], ["Hace 1 semana", toISO(addDays(t, -7))]]
      : quick === "futuro"
        ? [["Hoy", today], ["En 15 días", toISO(addDays(t, 15))], ["En 1 mes", toISO(addDays(t, 30))]]
        : []
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" disabled={disabled} aria-invalid={invalid} className={cn("h-11 w-full justify-start font-normal", !value && "text-muted-foreground")}>
          <CalendarDays className="text-muted-foreground" />
          {value ? fmtDate(value, { long: true }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {quicks.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b p-2">
            {quicks.map(([l, v]) => (
              <Button key={l} type="button" size="sm" variant={value === v ? "default" : "secondary"} onClick={() => { onChange(v); setOpen(false) }}>{l}</Button>
            ))}
            {clearable && value && <Button type="button" size="sm" variant="ghost" onClick={() => { onChange(null); setOpen(false) }}>Quitar</Button>}
          </div>
        )}
        <Calendar
          mode="single"
          locale={es}
          captionLayout="dropdown"
          startMonth={new Date(years[0], 0)}
          endMonth={new Date(years[1], 11)}
          selected={value ? parseISO(value) : undefined}
          defaultMonth={value ? parseISO(value) : startAt ? parseISO(startAt) : t}
          onSelect={(d) => { if (d) { onChange(toISO(d)); setOpen(false) } }}
        />
      </PopoverContent>
    </Popover>
  )
}
