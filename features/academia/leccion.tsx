"use client"

import { useState } from "react"
import { Check, Clock, X } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Icon } from "@/components/mirai/icon"
import { StatusPill } from "@/components/mirai/status-pill"
import { LECCIONES, NIVELES, avance, insignias, nivelDe, type Leccion } from "@/lib/content/academia"
import { glosarioById, type Termino } from "@/lib/content/glosario"
import { cn } from "@/lib/utils"

/** Contenido de una lección: puntos, términos del glosario y pregunta de repaso. `onCorrecta` al acertar. */
export function LeccionBody({ l, onCorrecta, onTermino }: { l: Leccion; onCorrecta?: () => void; onTermino?: (id: string) => void }) {
  const [resp, setResp] = useState<number | null>(null)
  const ok = resp === l.pregunta.correcta
  const terms = (l.glosario ?? []).map(glosarioById).filter((t): t is Termino => !!t)
  return (
    <div className="grid gap-5 pb-2">
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><StatusPill tone="estimado">{NIVELES[nivelDe(l)].label}</StatusPill><span className="flex items-center gap-1"><Clock className="size-3.5" /> {l.minutos} min de lectura</span></p>
      <ol className="grid gap-3">{l.puntos.map((p, i) => <li key={i} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand">{i + 1}</span><p className="min-w-0 leading-relaxed break-words">{p}</p></li>)}</ol>
      {terms.length > 0 && onTermino && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm"><span className="text-muted-foreground">Palabras clave:</span>
          {terms.map((t) => <button key={t.id} type="button" onClick={() => onTermino(t.id)} className="rounded-full bg-secondary px-2.5 py-0.5 text-[13px] font-medium text-link hover:bg-secondary-hover">{t.t}</button>)}
        </div>
      )}
      <div className="grid gap-2 rounded-xl bg-secondary/60 p-4">
        <p className="font-semibold">Repaso: {l.pregunta.q}</p>
        <div role="radiogroup" aria-label="Respuesta" className="grid gap-2">
          {l.pregunta.opciones.map((o, i) => (
            <button key={o} type="button" role="radio" aria-checked={resp === i} disabled={resp !== null && ok} onClick={() => { setResp(i); if (i === l.pregunta.correcta) onCorrecta?.() }}
              className={cn("flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-2.5 text-left text-sm ring-1 ring-border", resp === i && (i === l.pregunta.correcta ? "ring-2 ring-success" : "ring-2 ring-danger"))}>
              {o}{resp === i && (i === l.pregunta.correcta ? <Check className="size-4 shrink-0 text-success" /> : <X className="size-4 shrink-0 text-danger" />)}
            </button>
          ))}
        </div>
        {resp !== null && <p role="status" className={cn("text-sm", ok ? "text-success" : "text-danger")}>{ok ? `¡Correcto! ${l.pregunta.porque}` : "Casi. Intenta de nuevo."}</p>}
      </div>
    </div>
  )
}

/** Resumen del avance: barra, conteo e insignias. */
export function AvanceAcademia({ hechas, compact = false }: { hechas: string[]; compact?: boolean }) {
  const pct = avance(hechas)
  const n = LECCIONES.filter((l) => hechas.includes(l.id)).length
  const ins = insignias(hechas)
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">Tu avance</p><p className="text-sm text-muted-foreground">{n} de {LECCIONES.length} lecciones · {pct} %</p></div>
      <Progress value={pct} aria-label="Avance de la academia" />
      {pct === 100 && <p className="text-sm font-medium text-success">¡Terminaste la Academia! Ya tienes las bases para manejar tu plata con confianza.</p>}
      <ul className={cn("grid gap-2", compact ? "grid-cols-5" : "grid-cols-5 sm:gap-3")} aria-label="Insignias">
        {ins.map((b) => (
          <li key={b.id} title={`${b.label}: ${b.desc}`} className="grid justify-items-center gap-1 text-center">
            <span className={cn("grid place-items-center rounded-full", compact ? "size-10" : "size-12", b.ok ? "bg-brand-gradient text-white shadow-card" : "bg-secondary text-muted-foreground/60")}><Icon name={b.icon} className={compact ? "size-4" : "size-5"} /></span>
            <span className={cn("text-[11px] leading-tight", b.ok ? "font-semibold" : "text-muted-foreground")}>{b.label}</span>
            <span className="sr-only">{b.ok ? "ganada" : "por ganar"}: {b.desc}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
