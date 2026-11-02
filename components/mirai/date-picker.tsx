"use client"

import { useState } from "react"
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react"
import { es } from "react-day-picker/locale"
import { addDays, addMonths, format, parseISO } from "date-fns"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { fmtDate, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"

const toISO = (d: Date) => format(d, "yyyy-MM-dd")
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const mesLargo = (d: Date) => d.toLocaleString("es-CO", { month: "long", year: "numeric" })

/**
 * Selector de fecha con accesos rápidos (Hoy, Ayer, +1 mes…) como el datep de la v4. Encabezado con la fecha elegida,
 * mes y año que se cambian en cuadrícula (tocando el título) y días redondos del calendario de Mirai.
 */
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
  const base = value ? parseISO(value) : startAt ? parseISO(startAt) : t
  const [month, setMonth] = useState<Date>(base)
  const [vista, setVista] = useState<"dias" | "meses" | "anios">("dias")
  const quicks =
    quick === "pasado"
      ? [["Hoy", today], ["Ayer", toISO(addDays(t, -1))], ["Hace 1 semana", toISO(addDays(t, -7))], ["Hace 1 mes", toISO(addMonths(t, -1))]]
      : quick === "futuro"
        ? [["Hoy", today], ["Mañana", toISO(addDays(t, 1))], ["En 15 días", toISO(addDays(t, 15))], ["En 1 mes", toISO(addMonths(t, 1))]]
        : []
  const pick = (v: string | null) => { onChange(v); setOpen(false) }
  const onOpen = (o: boolean) => { setOpen(o); if (o) { setMonth(value ? parseISO(value) : base); setVista("dias") } }
  const min = new Date(years[0], 0), max = new Date(years[1], 11)
  const puedeIr = (d: Date) => d >= new Date(min.getFullYear(), min.getMonth()) && d <= max
  const anios = Array.from({ length: years[1] - years[0] + 1 }, (_, i) => years[0] + i)

  return (
    <Popover open={open} onOpenChange={onOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" disabled={disabled} aria-invalid={invalid} className={cn("h-11 w-full justify-start font-normal", !value && "text-muted-foreground")}>
          <CalendarDays className="text-muted-foreground" />
          {value ? fmtDate(value, { long: true }) : placeholder}
        </Button>
      </PopoverTrigger>
      {/* Se ubica solo: abre donde haya espacio (abajo o arriba) sin salirse de la pantalla; si aun así no cabe, se desplaza por dentro. */}
      <PopoverContent align="start" sideOffset={6} collisionPadding={12}
        className="max-h-[var(--radix-popover-content-available-height)] w-[290px] overflow-x-hidden overflow-y-auto overscroll-contain rounded-xl p-0 shadow-[0_12px_28px_rgba(0,0,0,.2),0_2px_4px_rgba(0,0,0,.1)]">
        {/* Encabezado: la fecha elegida, en grande */}
        <div className="flex items-center gap-2 border-b bg-brand-soft/50 px-3.5 py-2">
          <div className="grid min-w-0 flex-1">
            <span className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">{value ? "Fecha elegida" : "Sin fecha"}</span>
            <span className="truncate text-[15px] leading-5 font-bold first-letter:uppercase">{value ? parseISO(value).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "long", year: "numeric" }).replace(".", "") : placeholder}</span>
          </div>
          {clearable && value && (
            <Button type="button" size="icon-sm" variant="ghost" className="rounded-full" aria-label="Quitar la fecha" onClick={() => pick(null)}><X /></Button>
          )}
        </div>

        {/* Navegación: mes y año (toca para cambiarlos en cuadrícula) */}
        <div className="flex items-center gap-1 px-2.5 pt-2">
          <button type="button" onClick={() => setVista(vista === "dias" ? "meses" : "dias")} aria-label="Cambiar mes y año"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[14px] font-semibold capitalize hover:bg-secondary">
            {vista === "anios" ? `${anios[0]} – ${anios[anios.length - 1]}` : vista === "meses" ? month.getFullYear() : mesLargo(month)}
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", vista !== "dias" && "rotate-180")} />
          </button>
          <span className="flex-1" />
          {vista !== "anios" && (
            <>
              <Button type="button" size="icon-sm" variant="ghost" className="rounded-full text-muted-foreground" aria-label={vista === "meses" ? "Año anterior" : "Mes anterior"}
                disabled={!puedeIr(addMonths(month, vista === "meses" ? -12 : -1))} onClick={() => setMonth(addMonths(month, vista === "meses" ? -12 : -1))}><ChevronLeft /></Button>
              <Button type="button" size="icon-sm" variant="ghost" className="rounded-full text-muted-foreground" aria-label={vista === "meses" ? "Año siguiente" : "Mes siguiente"}
                disabled={!puedeIr(addMonths(month, vista === "meses" ? 12 : 1))} onClick={() => setMonth(addMonths(month, vista === "meses" ? 12 : 1))}><ChevronRight /></Button>
            </>
          )}
        </div>

        {vista === "dias" && (
          <Calendar
            mode="single"
            locale={es}
            hideNavigation
            className="px-2.5 pt-0.5 pb-1.5 [&_.rdp-month_caption]:hidden"
            month={month}
            onMonthChange={setMonth}
            startMonth={min}
            endMonth={max}
            selected={value ? parseISO(value) : undefined}
            onSelect={(d) => { if (d) pick(toISO(d)) }}
          />
        )}
        {vista === "meses" && (
          <div className="grid grid-cols-3 gap-1.5 p-2.5">
            {MESES.map((m, i) => {
              const d = new Date(month.getFullYear(), i, 1)
              const sel = month.getMonth() === i
              const hoy = t.getFullYear() === month.getFullYear() && t.getMonth() === i
              return (
                <button key={m} type="button" disabled={!puedeIr(d)} onClick={() => { setMonth(d); setVista("dias") }}
                  className={cn("h-10 rounded-full text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-40", sel && "bg-primary font-semibold text-primary-foreground hover:bg-primary", !sel && hoy && "text-brand ring-1 ring-brand/60 ring-inset")}>{m}</button>
              )
            })}
            <button type="button" onClick={() => setVista("anios")} className="col-span-3 mt-1 h-9 rounded-md text-sm font-semibold text-link hover:bg-secondary">Escoger otro año</button>
          </div>
        )}
        {vista === "anios" && (
          <div className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto p-2.5">
            {anios.map((y) => {
              const sel = month.getFullYear() === y
              return (
                <button key={y} type="button" ref={sel ? (el) => el?.scrollIntoView({ block: "center" }) : undefined} onClick={() => { setMonth(new Date(y, month.getMonth(), 1)); setVista("meses") }}
                  className={cn("h-9 rounded-full text-sm font-medium transition-colors hover:bg-secondary", sel && "bg-primary font-semibold text-primary-foreground hover:bg-primary", !sel && y === t.getFullYear() && "text-brand ring-1 ring-brand/60 ring-inset")}>{y}</button>
              )
            })}
          </div>
        )}

        {/* Accesos rápidos */}
        {quicks.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t px-2.5 py-2">
            {quicks.map(([l, v]) => (
              <button key={l} type="button" onClick={() => pick(v)}
                className={cn("h-7 rounded-full px-2.5 text-[12.5px] font-semibold transition-colors", value === v ? "bg-brand-soft text-link ring-1 ring-brand/40" : "bg-secondary text-foreground hover:bg-secondary-hover")}>{l}</button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
