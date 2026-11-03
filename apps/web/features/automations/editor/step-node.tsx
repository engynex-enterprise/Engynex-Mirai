"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { CircleAlert, CircleCheck, CircleX, Hourglass } from "lucide-react"
import { Icon } from "@/components/mirai/icon"
import { CATALOG, GROUPS } from "@/lib/automations/catalog"
import { cn } from "@/lib/utils"
import { GROUP_STYLE } from "../shared"
import type { StepNode } from "./graph"

const handleBase = "!size-3.5 !border-2 !border-card"

/** Tarjeta de un paso en el diagrama: color por tipo, ícono, nombre, resumen y avisos de validación o de la prueba. */
export const StepNodeView = memo(function StepNodeView({ data, selected }: NodeProps<StepNode>) {
  const c = CATALOG[data.kind]
  const st = GROUP_STYLE[c.group]
  const isCond = c.group === "condition"
  return (
    <div
      data-testid={`paso-${data.kind}`}
      className={cn(
        "relative w-[260px] overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-[0_2px_10px_rgba(16,24,40,.08)] transition-[box-shadow,opacity]",
        selected && cn("ring-[3px]", st.ring),
        data.issues.length > 0 && !selected && "border-warning",
        data.run === "error" && "ring-[3px] ring-danger",
        data.dim && "opacity-45",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1.5", st.bar)} aria-hidden />
      {c.group !== "trigger" && <Handle type="target" position={Position.Top} className={cn(handleBase, "!bg-muted-foreground")} />}
      <div className="flex items-start gap-3 py-3 pr-3 pl-4">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", st.tile)}><Icon name={c.icon} className="size-5" /></span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className={cn("text-[10.5px] font-bold tracking-[.08em] uppercase", st.text)}>{GROUPS[c.group].label}</span>
          <span className="truncate text-[14px] leading-tight font-semibold">{c.label}</span>
          <span className="line-clamp-2 text-[12.5px] leading-snug text-muted-foreground">{data.summary}</span>
        </div>
        {data.run === "ok" && <CircleCheck className="size-5 shrink-0 text-success" aria-label="Pasó en la prueba" />}
        {data.run === "si" && <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-bold text-success">Sí</span>}
        {data.run === "no" && <span className="shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">No</span>}
        {data.run === "wait" && <Hourglass className="size-5 shrink-0 text-info" aria-label="Esperaría" />}
        {data.run === "error" && <CircleX className="size-5 shrink-0 text-danger" aria-label="Falló" />}
        {!data.run && data.issues.length > 0 && <CircleAlert className="size-5 shrink-0 text-warning" aria-label={data.issues[0]} />}
      </div>
      {data.issues.length > 0 && <p className="truncate border-t bg-warning-soft px-4 py-1.5 text-[12px] font-medium text-warning" title={data.issues.join(" · ")}>{data.issues[0]}</p>}
      {isCond ? (
        <>
          <Handle id="si" type="source" position={Position.Bottom} style={{ left: "28%" }} className={cn(handleBase, "!bg-[#3F7A1E]")} />
          <Handle id="no" type="source" position={Position.Bottom} style={{ left: "72%" }} className={cn(handleBase, "!bg-[#D0243F]")} />
          <div className="flex justify-between px-[calc(28%-14px)] pb-1 text-[11px] font-bold" aria-hidden>
            <span className="text-success">Sí</span>
            <span className="text-danger">No</span>
          </div>
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className={cn(handleBase, c.group === "trigger" ? "!bg-[#9EDB4E]" : "!bg-[#3F7A1E]")} />
      )}
    </div>
  )
})
