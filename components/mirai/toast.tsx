"use client"

import { isValidElement } from "react"
import { toast as sonner, type ExternalToast } from "sonner"
import { CircleCheck, Info, Loader2, OctagonX, TriangleAlert, X, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Toasts de Mirai al estilo de Facebook: tarjeta con ícono en círculo de color, título, descripción, acción y cerrar,
 * con una barra regresiva abajo que muestra cuánto falta para que se cierre (se pausa al pasar el mouse, igual que el
 * temporizador de sonner). Misma API que `toast` de sonner: `toast("…")`, `toast.success(…)`, `toast.error(…)`…
 */
type Kind = "success" | "error" | "warning" | "info" | "message" | "loading"
type Opts = ExternalToast

const KIND: Record<Kind, { Icon: LucideIcon; dot: string; bar: string; ms: number }> = {
  success: { Icon: CircleCheck, dot: "bg-success-soft text-success", bar: "bg-success", ms: 4000 },
  error: { Icon: OctagonX, dot: "bg-danger-soft text-danger", bar: "bg-danger", ms: 7000 },
  warning: { Icon: TriangleAlert, dot: "bg-warning-soft text-[#B86E00] dark:text-[#FFB547]", bar: "bg-[#E08A00]", ms: 6000 },
  info: { Icon: Info, dot: "bg-brand-soft text-link", bar: "bg-link", ms: 5000 },
  message: { Icon: CircleCheck, dot: "bg-brand-soft text-[#3F7A1E] dark:text-lime", bar: "bg-brand", ms: 4000 },
  loading: { Icon: Loader2, dot: "bg-secondary text-foreground", bar: "bg-brand", ms: Infinity },
}

type Action = { label: React.ReactNode; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }
const isAction = (a: unknown): a is Action => !!a && typeof a === "object" && "label" in a && "onClick" in a

function MiraiToast({ id, kind, title, description, action, cancel, duration }: {
  id: string | number; kind: Kind; title: React.ReactNode; description?: React.ReactNode; action?: Opts["action"]; cancel?: Opts["cancel"]; duration: number
}) {
  const k = KIND[kind]
  const btn = (a: Opts["action"], primary: boolean) => {
    if (!a) return null
    if (isValidElement(a)) return a
    if (!isAction(a)) return null
    return (
      <button type="button" onClick={(e) => { a.onClick(e); if (!e.defaultPrevented) sonner.dismiss(id) }}
        className={cn("h-8 rounded-md px-3 text-[13px] font-semibold transition-colors", primary ? "bg-brand-soft text-link hover:bg-brand-soft/70" : "bg-secondary text-foreground hover:bg-secondary-hover")}>
        {a.label}
      </button>
    )
  }
  return (
    <div role={kind === "error" ? "alert" : "status"} aria-live={kind === "error" ? "assertive" : "polite"} data-kind={kind}
      className="relative flex w-[356px] max-w-full items-start gap-3 overflow-hidden rounded-xl bg-white p-3 pr-11 text-foreground shadow-[0_12px_28px_rgba(0,0,0,.2),0_2px_4px_rgba(0,0,0,.1)] ring-1 ring-black/5 max-sm:w-full dark:bg-[#242526] dark:ring-white/10">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", k.dot)}><k.Icon className={cn("size-5", kind === "loading" && "animate-spin")} aria-hidden /></span>
      <div className="grid min-w-0 flex-1 gap-0.5 self-center">
        <p className="text-[15px] leading-5 font-semibold">{title}</p>
        {description ? <div className="text-[13px] leading-[18px] text-muted-foreground">{description}</div> : null}
        {(action || cancel) && <div className="mt-2 flex flex-wrap gap-2">{btn(action, true)}{btn(cancel, false)}</div>}
      </div>
      <button type="button" aria-label="Cerrar" onClick={() => sonner.dismiss(id)}
        className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-secondary-hover hover:text-foreground">
        <X className="size-4" aria-hidden />
      </button>
      {Number.isFinite(duration) && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-black/5 dark:bg-white/10">
          <span className={cn("toast-countdown block h-full origin-left", k.bar)} style={{ animationDuration: `${duration}ms` }} />
        </span>
      )}
    </div>
  )
}

function show(kind: Kind, title: React.ReactNode, o: Opts = {}) {
  const { description, action, cancel, duration: d, ...rest } = o
  const duration = d ?? KIND[kind].ms
  const desc = typeof description === "function" ? (description as () => React.ReactNode)() : description
  return sonner.custom((id) => <MiraiToast key={`${id}-${kind}`} id={id} kind={kind} title={title} description={desc} action={action} cancel={cancel} duration={duration} />, { ...rest, duration })
}

export const toast = Object.assign((title: React.ReactNode, o?: Opts) => show("message", title, o), {
  message: (title: React.ReactNode, o?: Opts) => show("message", title, o),
  success: (title: React.ReactNode, o?: Opts) => show("success", title, o),
  error: (title: React.ReactNode, o?: Opts) => show("error", title, o),
  warning: (title: React.ReactNode, o?: Opts) => show("warning", title, o),
  info: (title: React.ReactNode, o?: Opts) => show("info", title, o),
  loading: (title: React.ReactNode, o?: Opts) => show("loading", title, o),
  dismiss: sonner.dismiss,
  custom: sonner.custom,
})
