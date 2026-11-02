"use client"

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Shuffle, Zap } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Icon } from "@/components/mirai/icon"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { useApp } from "@/components/app/app-context"
import { TEMAS, pickSuggestions, rng, type Sugerencia } from "@/lib/chat/suggestions"
import type { ChatHints } from "@/lib/chat/types"
import { cn } from "@/lib/utils"
import { sendChat } from "./store"

const saludo = () => { const h = new Date().getHours(); return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches" }
const ISOS = ["chat", "consejero", "mirai", "metas", "presupuesto", "inversiones"]

/** Tarjeta de sugerencia: ícono del tema en un círculo de color, la pregunta y una marca si se responde al instante. */
function Card({ s, onPick, i }: { s: Sugerencia; onPick: (q: string) => void; i: number }) {
  const T = TEMAS[s.tema]
  return (
    <button type="button" data-testid="sugerencia" onClick={() => onPick(s.q)} style={{ animationDelay: `${i * 45}ms`, "--c": T.color } as React.CSSProperties}
      className="appear press group/s relative flex min-h-[84px] min-w-0 flex-col items-start gap-2 overflow-hidden rounded-2xl bg-card p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,.08)] ring-1 ring-black/5 transition-shadow hover:shadow-[0_6px_18px_rgba(31,43,75,.12)] dark:ring-white/10">
      <span aria-hidden className="absolute -top-6 -right-6 size-16 rounded-full opacity-[.08] transition-opacity group-hover/s:opacity-[.14]" style={{ background: "var(--c)" }} />
      <span className="flex w-full items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full text-white" style={{ background: "var(--c)" }}><Icon name={T.icon} className="size-3.5" /></span>
        <span className="truncate text-[11.5px] font-semibold text-muted-foreground">{T.label}</span>
        {s.rapida && <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10.5px] font-bold text-link" title="Se responde al instante con tus datos"><Zap className="size-2.5 fill-current" />Al instante</span>}
      </span>
      <span className="text-[13.5px] leading-snug font-medium">{s.q}</span>
    </button>
  )
}

/** Pantalla de bienvenida del chat: saludo por nombre, ilustración que cambia y 4 preguntas al azar con "Otras ideas". */
export function Welcome({ hints, compact }: { hints?: ChatHints; compact?: boolean }) {
  const qc = useQueryClient()
  const { user } = useApp()
  const [seed, setSeed] = useState<number | null>(null)
  const shuffle = () => setSeed(Math.floor(Math.random() * 1e9))
  // Al azar solo en el navegador (en el servidor saldría distinto y React avisaría de la diferencia).
  useEffect(() => { queueMicrotask(shuffle) }, [])
  const nombre = hints?.nombre || (user.apodo || user.nombre || "").split(" ")[0]
  const month = new Date().getMonth() + 1
  const list = seed === null || !hints ? null : pickSuggestions(4, rng(seed), { flags: hints.flags, month, ia: hints.ia.allowed, canEdit: hints.canEdit })
  const iso = ISOS[(seed ?? 0) % ISOS.length]
  return (
    <div className={cn("mx-auto grid w-full max-w-2xl content-center gap-5", compact ? "py-4" : "py-6 sm:py-10")}>
      <div className="grid justify-items-center gap-2 text-center">
        <div className="relative">
          <span aria-hidden className="absolute inset-0 -z-10 scale-125 rounded-full bg-[radial-gradient(circle,rgba(158,219,78,.35),transparent_65%)] blur-md" />
          {seed === null ? <Skeleton className="rounded-full" style={{ width: compact ? 64 : 84, height: compact ? 64 : 84 }} /> : <IsoIcon k={iso} size={compact ? 64 : 84} className="bn-float" />}
        </div>
        <h2 className={cn("font-heading font-bold tracking-[-0.02em]", compact ? "text-[22px]" : "text-[26px] sm:text-[32px]")}>
          <span className="text-brand-gradient">{saludo()}{nombre ? `, ${nombre}` : ""}</span>
        </h2>
        <p className="max-w-md text-[14.5px] text-muted-foreground">¿En qué te ayudo con tu plata hoy? Pregúntame lo que quieras o cuéntame una decisión y la reviso con tus números.</p>
      </div>
      <div className="grid gap-2" aria-label="Preguntas sugeridas">
        <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4")}>
          {list ? list.map((s, i) => <Card key={`${seed}-${s.id}`} s={s} i={i} onPick={(q) => sendChat(qc, { text: q })} />) : [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[84px] rounded-2xl" />)}
        </div>
        <button type="button" onClick={shuffle} disabled={!list}
          className="press mx-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-link transition-colors hover:bg-brand-soft disabled:opacity-50">
          <Shuffle className="size-3.5" /> Otras ideas
        </button>
      </div>
    </div>
  )
}
