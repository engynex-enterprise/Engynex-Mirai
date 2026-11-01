"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, CircleCheck, Clock, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Icon } from "@/components/mirai/icon"
import { PageHeader } from "@/components/mirai/page-header"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { usePrefs } from "@/features/settings/prefs"
import { LECCIONES, avance, type Leccion } from "@/lib/content/academia"
import { cn } from "@/lib/utils"

function LeccionDialog({ l, hecha, onClose, onDone }: { l: Leccion; hecha: boolean; onClose: () => void; onDone: () => void }) {
  const [resp, setResp] = useState<number | null>(null)
  const ok = resp === l.pregunta.correcta
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title={l.titulo} description={`${l.minutos} minutos de lectura`}
      footer={<>
        {l.ir ? <Button variant="outline" asChild><Link href={l.ir.href}>{l.ir.label} <ArrowRight /></Link></Button> : <Button variant="outline" onClick={onClose}>Cerrar</Button>}
        <Button disabled={!ok && !hecha} onClick={() => { onDone(); onClose() }}>{hecha ? "Listo" : "Terminar lección"}</Button>
      </>}>
      <div className="grid gap-5 pb-2">
        <ol className="grid gap-3">{l.puntos.map((p, i) => <li key={i} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand">{i + 1}</span><p className="leading-relaxed">{p}</p></li>)}</ol>
        <div className="grid gap-2 rounded-xl bg-secondary/60 p-4">
          <p className="font-semibold">Repaso: {l.pregunta.q}</p>
          <div role="radiogroup" aria-label="Respuesta" className="grid gap-2">
            {l.pregunta.opciones.map((o, i) => (
              <button key={o} type="button" role="radio" aria-checked={resp === i} disabled={resp !== null && ok} onClick={() => setResp(i)}
                className={cn("flex items-center justify-between rounded-lg bg-card px-3 py-2.5 text-left text-sm ring-1 ring-border", resp === i && (i === l.pregunta.correcta ? "ring-2 ring-success" : "ring-2 ring-danger"))}>
                {o}{resp === i && (i === l.pregunta.correcta ? <Check className="size-4 text-success" /> : <X className="size-4 text-danger" />)}
              </button>
            ))}
          </div>
          {resp !== null && <p className={cn("text-sm", ok ? "text-success" : "text-danger")}>{ok ? `¡Correcto! ${l.pregunta.porque}` : "Casi. Intenta de nuevo."}</p>}
        </div>
      </div>
    </ResponsiveDialog>
  )
}

/** Academia Mirai: lecciones cortas de finanzas personales, con repaso y avance guardado. */
export function AcademiaView() {
  const { prefs, saveQuiet } = usePrefs()
  const extra = (prefs?.extra ?? {}) as { academia?: string[] }
  const hechas = extra.academia ?? []
  const [open, setOpen] = useState<Leccion | null>(null)
  const pct = avance(hechas)
  const marcar = (id: string) => { if (!hechas.includes(id)) saveQuiet({ extra: { ...extra, academia: [...hechas, id] } }) }
  return (
    <div className="grid gap-6">
      <PageHeader id="academia" title="Academia Mirai" description="Lecciones de 2 a 4 minutos para entender tu plata: presupuesto, deudas, tasas, inversión y renta. Sin jerga." />
      <Card className="gap-2 p-5 shadow-card ring-0">
        <div className="flex items-center justify-between"><p className="font-semibold">Tu avance</p><p className="text-sm text-muted-foreground">{LECCIONES.filter((l) => hechas.includes(l.id)).length} de {LECCIONES.length} lecciones · {pct} %</p></div>
        <Progress value={pct} aria-label="Avance de la academia" />
        {pct === 100 && <p className="text-sm font-medium text-success">¡Terminaste la Academia! Ya tienes las bases para manejar tu plata con confianza.</p>}
      </Card>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {LECCIONES.map((l, i) => {
          const hecha = hechas.includes(l.id)
          return (
            <li key={l.id}>
              <button type="button" onClick={() => setOpen(l)} className="press grid h-full w-full gap-3 rounded-xl bg-card p-4 text-left shadow-card hover:bg-hover">
                <div className="flex items-center justify-between"><span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand"><Icon name={l.icon} className="size-5" /></span>{hecha ? <CircleCheck className="size-6 text-success" aria-label="Completada" /> : <span className="text-xs font-semibold text-muted-foreground">Lección {i + 1}</span>}</div>
                <p className="font-semibold">{l.titulo}</p>
                <p className="line-clamp-2 text-sm text-muted-foreground">{l.puntos[0]}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3.5" />{l.minutos} min</p>
              </button>
            </li>
          )
        })}
      </ul>
      {open && <LeccionDialog l={open} hecha={hechas.includes(open.id)} onClose={() => setOpen(null)} onDone={() => marcar(open.id)} />}
    </div>
  )
}
