"use client"

import Link from "next/link"
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/mirai/page-header"
import { StatusPill } from "@/components/mirai/status-pill"
import { Icon } from "@/components/mirai/icon"
import { Panel } from "@/components/mirai/panel"
import { Tip } from "@/components/mirai/tip"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { Segmented } from "@/components/mirai/choice-cards"
import { useListControls, type ListFilter } from "@/components/mirai/list-toolbar"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { healthScore, indicadores } from "@/lib/domain"
import { todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useBookData } from "@/features/book/use-book-data"

const COLOR = { ok: "#9EDB4E", warn: "#E08A00", bad: "#C8213B" }
const LBL = { ok: ["pagado", "Sano"], warn: ["porVencer", "Vigilar"], bad: ["vencido", "En riesgo"] } as const
const TIP = { ok: "Está dentro de lo recomendado.", warn: "Está cerca del límite: vale la pena revisarlo.", bad: "Está fuera de lo recomendado: empieza por aquí." } as const
const TONE = { ok: "green", warn: "amber", bad: "red" } as const
type Ind = ReturnType<typeof indicadores>[number]
const FILTROS: ListFilter<Ind>[] = [
  { value: "todos", label: "Todos" },
  { value: "bad", label: "En riesgo", match: (i) => i.ok && i.st === "bad" },
  { value: "warn", label: "Vigilar", match: (i) => i.ok && i.st === "warn" },
  { value: "ok", label: "Sanos", match: (i) => i.ok && i.st === "ok" },
  { value: "falta", label: "Faltan datos", match: (i) => !i.ok },
]

export function HealthView() {
  const today = todayISO()
  const { data: book, isPending } = useBookData()
  const d = useMemo(() => { if (!book) return null; const I = indicadores(book, today); return { I, H: healthScore(I) } }, [book, today])
  const ctl = useListControls<Ind>(d?.I, { filters: FILTROS })
  if (isPending || !d) return <PageSkeleton kpis={0} />
  const { I, H } = d
  const n = I.filter((i) => i.ok).length
  return (
    <div className="grid gap-6">
      <PageHeader id="indicadores" description="Seis preguntas que se hacen los asesores para saber si las finanzas de un hogar están sanas. Solo mostramos un resultado cuando tienes los datos necesarios para que sea exacto." />
      <Panel className="flex-col items-center gap-6 p-6 sm:flex-row">
        {H.visible ? (
          <>
            <svg viewBox="0 0 120 120" className="size-32 shrink-0 -rotate-90" role="img" aria-label={`Puntaje ${H.sc} de 100`}>
              <circle cx="60" cy="60" r="50" fill="none" stroke="var(--muted)" strokeWidth="12" />
              <circle cx="60" cy="60" r="50" fill="none" stroke={COLOR[H.lvl[0]]} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${H.sc * 3.1416} 400`} />
              <text x="60" y="68" textAnchor="middle" className="fill-foreground text-[28px] font-bold" transform="rotate(90 60 60)">{H.sc}</text>
            </svg>
            <div className="grid flex-1 gap-2">
              <p className="text-sm text-muted-foreground">Tu salud financiera</p>
              <p className="flex items-center gap-2 text-2xl font-semibold"><Icon name={H.lvl[2]} className="size-6" style={{ color: COLOR[H.lvl[0]] }} />{H.lvl[1]}</p>
              <p className="text-sm text-muted-foreground">Calculada con {n} de 6 indicadores con datos completos.</p>
              <div className="grid gap-1"><Progress value={H.comp * 100} className="h-2 [&>div]:bg-lime" /><span className="text-xs text-muted-foreground">Datos completos: {Math.round(H.comp * 100)} %</span></div>
            </div>
          </>
        ) : (
          <div className="grid gap-2">
            <p className="text-lg font-semibold">Todavía no puedo darte un puntaje confiable</p>
            <p className="text-sm text-muted-foreground">Para que el resultado sea exacto necesito al menos 4 de los 6 indicadores. Hoy tengo {n}. Me falta registrar:</p>
            <ul className="ml-5 list-disc text-sm">{[...new Set(I.filter((i) => !i.ok).flatMap((i) => i.falta))].map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        )}
      </Panel>
      <Segmented value={ctl.filter} onChange={ctl.setFilter} items={FILTROS.map((f) => ({ value: f.value, label: `${f.label} (${ctl.counts[f.value] ?? 0})` }))} />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {ctl.rows.map((i) => (
          <Panel key={i.k} className={cn("gap-3", !i.ok && "border border-dashed shadow-none")}>
            <div className="flex items-center justify-between gap-2">
              <ToneIcon icon={i.icon} tone={i.ok ? TONE[i.st] : "gray"} />
              {i.ok ? <Tip label={TIP[i.st]}><span><StatusPill tone={LBL[i.st][0]}>{LBL[i.st][1]}</StatusPill></span></Tip> : <Tip label="Registra los datos que faltan para calcularlo."><span><StatusPill tone="gray">Faltan datos</StatusPill></span></Tip>}
            </div>
            <h2 className="font-semibold">{i.k}</h2>
            {i.ok ? (
              <>
                <p className="text-[24px] leading-[30px] font-bold tracking-tight">{i.v.replace(/(\d)\.(\d)/, "$1,$2")}</p>
                <Progress value={Math.min(100, (i.r / (i.max || 1)) * 100)} className="h-2" />
                <p className="text-sm text-muted-foreground"><b className="text-foreground">{i.meta}.</b> {i.d}</p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Para calcularlo con exactitud necesito {i.falta.join(" y ")}.</p>
                {i.go && <Button variant="soft" size="sm" className="mt-auto w-fit" asChild><Link href={`/${i.go}`}>Completar datos</Link></Button>}
              </>
            )}
          </Panel>
        ))}
        {!ctl.rows.length && <p className="col-span-full rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Ningún indicador está en este grupo. ¡Buena señal!</p>}
      </div>
    </div>
  )
}
