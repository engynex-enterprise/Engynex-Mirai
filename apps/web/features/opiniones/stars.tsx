"use client"

import { useState } from "react"
import { Star } from "lucide-react"
import { STAR_LABELS } from "@/lib/content/opiniones"
import { cn } from "@/lib/utils"

/** Calificación de 1 a 5 estrellas. Accesible como grupo de opciones (radio). */
export function StarRating({ value, onChange, size = "md", className }: { value: number; onChange: (n: number) => void; size?: "md" | "lg"; className?: string }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  return (
    <div className={cn("grid justify-items-center gap-1", className)}>
      <div role="radiogroup" aria-label="Calificación" className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}: ${STAR_LABELS[n - 1]}`}
            onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onBlur={() => setHover(0)} onClick={() => onChange(n)}
            onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(5, (value || 0) + 1)) } if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onChange(Math.max(1, (value || 2) - 1)) } }}
            className="press rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Star className={cn(size === "lg" ? "size-9" : "size-7", "transition", n <= shown ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
          </button>
        ))}
      </div>
      <p className="h-5 text-sm font-medium text-muted-foreground" aria-live="polite">{shown ? STAR_LABELS[shown - 1] : "Toca una estrella"}</p>
    </div>
  )
}

/** Estrellas de solo lectura (listas y panel). */
export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={`${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={cn("size-4", n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />)}
    </span>
  )
}
