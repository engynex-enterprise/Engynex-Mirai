"use client"

import { useState } from "react"
import { Check, X } from "lucide-react"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { cn } from "@/lib/utils"
import { VS } from "./content"

type Modo = "sin" | "con"

/** Interruptor animado Sin Mirai ↔ Con Mirai. */
function Interruptor({ modo, onChange }: { modo: Modo; onChange: (m: Modo) => void }) {
  const con = modo === "con"
  return (
    <button
      type="button"
      role="switch"
      aria-checked={con}
      aria-label="Con Mirai"
      data-testid="vs-switch"
      onClick={() => onChange(con ? "sin" : "con")}
      className="relative grid h-12 w-full max-w-[340px] grid-cols-2 items-center rounded-full border bg-card p-1 text-sm font-semibold shadow-card backdrop-blur outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full transition-[transform,background-color] duration-300 ease-(--ease-fb-enter)",
          con ? "translate-x-full bg-primary" : "translate-x-0 bg-danger",
        )}
      />
      <span className={cn("relative z-10 flex items-center justify-center gap-1.5 transition-colors", con ? "text-muted-foreground" : "text-white")}><X className="size-4" aria-hidden /> Sin Mirai</span>
      <span className={cn("relative z-10 flex items-center justify-center gap-1.5 transition-colors", con ? "text-primary-foreground" : "text-muted-foreground")}><Check className="size-4" aria-hidden /> Con Mirai</span>
    </button>
  )
}

/**
 * Comparación por situaciones. En escritorio es una tabla con las dos columnas (resalta la elegida);
 * en el celular cada situación es una tarjeta que muestra solo el lado del interruptor.
 */
export function VersusMirai() {
  const [modo, setModo] = useState<Modo>("con")
  const con = modo === "con"
  return (
    <div className="group/vs grid gap-6" data-vs={modo} data-testid="vs">
      <div className="flex flex-col items-center gap-2">
        <Interruptor modo={modo} onChange={setModo} />
        <p className="text-center text-sm text-muted-foreground" aria-live="polite">
          {con ? "Así se ven tus finanzas con Mirai." : "Así se ven hoy las finanzas de muchas familias."}
        </p>
      </div>

      <div role="table" aria-label="Tus finanzas sin Mirai y con Mirai" className="grid overflow-hidden rounded-2xl md:border md:bg-card md:shadow-card md:backdrop-blur">
        <div role="row" className="hidden grid-cols-[minmax(180px,0.8fr)_1fr_1fr] border-b bg-muted/50 text-sm font-semibold md:grid">
          <span role="columnheader" className="px-5 py-3">Situación</span>
          <span role="columnheader" className={cn("flex items-center gap-2 px-5 py-3 transition-opacity duration-300", con && "opacity-55")}><span className="grid size-5 place-items-center rounded-full bg-danger-soft text-danger"><X className="size-3" aria-hidden /></span>Sin Mirai</span>
          <span role="columnheader" className={cn("flex items-center gap-2 px-5 py-3 transition-opacity duration-300", !con && "opacity-55")}><span className="grid size-5 place-items-center rounded-full bg-success-soft text-success"><Check className="size-3" aria-hidden /></span>Con Mirai</span>
        </div>
        <div role="rowgroup" className="grid gap-3 md:gap-0">
          {VS.map((r) => (
            <div
              key={r.t}
              role="row"
              className="grid gap-2 rounded-2xl border bg-card p-4 shadow-card backdrop-blur md:grid-cols-[minmax(180px,0.8fr)_1fr_1fr] md:gap-0 md:rounded-none md:border-0 md:border-b md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none md:last:border-b-0"
            >
              <span role="rowheader" className="flex items-center gap-3 font-semibold md:px-5 md:py-4">
                <IsoIcon k={r.iso} size={32} />
                {r.t}
              </span>
              <span
                role="cell"
                className={cn(
                  "flex items-start gap-2 text-sm leading-relaxed transition-[opacity,background-color] duration-300 md:px-5 md:py-4",
                  con ? "max-md:hidden md:opacity-55" : "max-md:animate-[appear_.28s_ease-out] md:bg-danger-soft/50",
                )}
              >
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-danger-soft text-danger md:hidden"><X className="size-3" aria-hidden /></span>
                <span><span className="sr-only">Sin Mirai: </span>{r.sin}</span>
              </span>
              <span
                role="cell"
                className={cn(
                  "flex items-start gap-2 text-sm leading-relaxed transition-[opacity,background-color] duration-300 md:px-5 md:py-4",
                  con ? "max-md:animate-[appear_.28s_ease-out] md:bg-success-soft/50" : "max-md:hidden md:opacity-55",
                )}
              >
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-success md:hidden"><Check className="size-3" aria-hidden /></span>
                <span><span className="sr-only">Con Mirai: </span>{r.con}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
