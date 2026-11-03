"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, CircleCheck, CircleX, Hourglass, Split } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Icon } from "@/components/mirai/icon"
import { StatusPill } from "@/components/mirai/status-pill"
import { EmptyState } from "@/components/mirai/empty-state"
import { ListToolbar, NoResults, useListControls, type ListFilter } from "@/components/mirai/list-toolbar"
import { Tip } from "@/components/mirai/tip"
import { useSave } from "@/hooks/use-book-data"
import { CATALOG, GROUPS } from "@/lib/automations/catalog"
import { automationFromTemplate, type Template } from "@/lib/automations/templates"
import type { Graph, NodeGroup, StepResult } from "@/lib/automations/types"
import { cn } from "@/lib/utils"
import { ESTADOS, fechaHora, type AutomationRun } from "./hooks"

/** Colores de marca por tipo de paso (tokens: lime, navy, forest). */
export const GROUP_STYLE: Record<NodeGroup, { tile: string; bar: string; text: string; ring: string }> = {
  trigger: { tile: "bg-lime text-navy", bar: "bg-lime", text: "text-forest dark:text-lime", ring: "ring-lime" },
  condition: { tile: "bg-navy text-white dark:bg-[#4A67A8]", bar: "bg-navy dark:bg-[#4A67A8]", text: "text-navy dark:text-[#AFC0E8]", ring: "ring-navy dark:ring-[#4A67A8]" },
  action: { tile: "bg-forest text-white", bar: "bg-forest", text: "text-forest dark:text-lime", ring: "ring-forest" },
}

export function StepIcon({ kind, className }: { kind: keyof typeof CATALOG; className?: string }) {
  const c = CATALOG[kind]
  return <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", GROUP_STYLE[c.group].tile, className)}><Icon name={c.icon} className="size-[18px]" /></span>
}

/** Los pasos de un flujo en fila (disparador → … → acción), para tarjetas y la galería. */
export function FlowChips({ graph, max = 4 }: { graph: Graph; max?: number }) {
  const ordered = [...graph.nodes].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
  return (
    <div className="flex flex-wrap items-center gap-1">
      {ordered.slice(0, max).map((n, i) => (
        <span key={n.id} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground" aria-hidden>→</span>}
          <Tip label={`${GROUPS[CATALOG[n.kind].group].label}: ${CATALOG[n.kind].label}`}>
            <span role="img" aria-label={CATALOG[n.kind].label} className={cn("grid size-7 place-items-center rounded-lg", GROUP_STYLE[CATALOG[n.kind].group].tile)}><Icon name={CATALOG[n.kind].icon} className="size-3.5" /></span>
          </Tip>
        </span>
      ))}
      {ordered.length > max && <span className="text-xs text-muted-foreground">+{ordered.length - max}</span>}
    </div>
  )
}

/** Crea una automatización (desde plantilla o en blanco) pausada y abre el editor. */
export function useCreateAutomation() {
  const save = useSave("automations", { created: "Automatización creada. Revísala y actívala cuando quieras." })
  const router = useRouter()
  const create = async (t: Template | null, nombre?: string) => {
    const base = t
      ? automationFromTemplate(t)
      : { nombre: nombre || "Nueva automatización", descripcion: "", icon: "workflow", disparador: "gasto", activo: false, plantilla: null, grafo: { nodes: [{ id: "t", type: "trigger", kind: "gasto", data: {}, position: { x: -130, y: 0 } }], edges: [] } }
    const row = await save.mutateAsync(base as never)
    router.push(`/automatizaciones/${row.id}`)
  }
  return { create, pending: save.isPending }
}

export function TemplateCard({ t, onUse, disabled }: { t: Template; onUse: () => void; disabled?: boolean }) {
  return (
    <Card className="lift h-full gap-3 p-4 shadow-card ring-0" data-testid="plantilla">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-lime text-navy"><Icon name={t.icon} className="size-5" /></span>
        <div className="grid min-w-0 gap-1">
          <p className="leading-snug font-semibold">{t.nombre}</p>
          {t.premium && <Tip label="Usa la IA: necesita el plan Premium."><Badge variant="secondary" className="w-fit">Premium</Badge></Tip>}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{t.descripcion}</p>
      <div className="mt-auto flex items-center justify-between gap-2">
        <FlowChips graph={t.graph} />
        <Button size="sm" variant="soft" onClick={onUse} disabled={disabled} aria-label={`Usar plantilla ${t.nombre}`}>Usar</Button>
      </div>
    </Card>
  )
}

const stepIcon = (s: StepResult) =>
  !s.ok ? <CircleX className="size-4 text-danger" /> : s.wait ? <Hourglass className="size-4 text-info" /> : s.branch ? <Split className={cn("size-4", s.branch === "si" ? "text-success" : "text-danger")} /> : <CircleCheck className="size-4 text-success" />

/** Recorrido paso a paso (historial y resultado de "Probar"). */
export function StepList({ steps }: { steps: StepResult[] }) {
  return (
    <ol className="grid gap-2">
      {steps.map((s, i) => (
        <li key={`${s.node}-${i}`} className="flex items-start gap-2.5 rounded-lg bg-secondary/60 p-2.5">
          <span className="mt-0.5">{stepIcon(s)}</span>
          <div className="grid min-w-0 gap-0.5">
            <span className={cn("text-[11px] font-semibold tracking-wide uppercase", GROUP_STYLE[CATALOG[s.kind]?.group ?? "action"].text)}>
              {GROUPS[CATALOG[s.kind]?.group ?? "action"].label} · {CATALOG[s.kind]?.label}
            </span>
            <span className="text-sm break-words">{s.msg}</span>
          </div>
        </li>
      ))}
    </ol>
  )
}

const RUN_FILTROS: ListFilter<AutomationRun>[] = [
  { value: "todas", label: "Todas" },
  { value: "ok", label: "Bien", match: (r) => r.estado === "ok" },
  { value: "error", label: "Con error", match: (r) => r.estado === "error" },
  { value: "esperando", label: "Esperando", match: (r) => r.estado === "esperando" },
  { value: "omitida", label: "Omitidas", match: (r) => r.estado === "omitida" },
]

/** Historial de ejecuciones con el detalle desplegable. Con `filterable`, buscador y filtro por estado. */
export function RunsList({ runs, loading, names, filterable }: { runs: AutomationRun[] | undefined; loading?: boolean; names?: Record<string, string>; filterable?: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  const ctl = useListControls(runs, { text: (r) => `${names?.[r.automation_id] ?? ""} ${CATALOG[r.disparador as keyof typeof CATALOG]?.label ?? ""} ${((r.evento ?? {}) as { data?: { descripcion?: string } }).data?.descripcion ?? ""}`, filters: RUN_FILTROS })
  if (loading) return <div className="grid gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
  if (!runs?.length) return <EmptyState iso="calendario" title="Todavía no hay ejecuciones" description="Cuando una automatización activa se dispare, aquí verás qué hizo." />
  const list = filterable ? ctl.rows : runs
  return (
    <div className="grid gap-3">
    {filterable && runs.length > 3 && <ListToolbar c={ctl} placeholder="Buscar ejecución" filters={RUN_FILTROS.filter((f) => !f.match || runs.some(f.match))} />}
    {!list.length && <NoResults c={ctl} />}
    <ul className="grid gap-2" data-testid="historial">
      {list.map((r) => {
        const st = ESTADOS[r.estado] ?? ESTADOS.ok
        const steps = Array.isArray(r.pasos) ? (r.pasos as unknown as StepResult[]) : []
        const ev = (r.evento ?? {}) as { data?: { descripcion?: string } }
        const isOpen = open === r.id
        return (
          <li key={r.id} className="rounded-xl border bg-card">
            <button type="button" className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}>
              <StepIcon kind={(CATALOG[r.disparador as keyof typeof CATALOG] ? r.disparador : "gasto") as keyof typeof CATALOG} className="size-8" />
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-sm font-semibold">{names?.[r.automation_id] ?? CATALOG[r.disparador as keyof typeof CATALOG]?.label ?? "Ejecución"}</span>
                <span className="truncate text-xs text-muted-foreground">{fechaHora(r.created_at)}{ev.data?.descripcion ? ` · ${ev.data.descripcion}` : ""}</span>
              </div>
              <StatusPill tone={st.tone}>{st.label}</StatusPill>
              <ChevronDown className={cn("size-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div className="grid gap-2 border-t p-3">
                {r.error && <p className="text-sm text-danger">{r.error}</p>}
                {r.estado === "esperando" && r.reanudar_at && <p className="text-sm text-info">Sigue el {fechaHora(r.reanudar_at)}.</p>}
                <StepList steps={steps} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
    </div>
  )
}
