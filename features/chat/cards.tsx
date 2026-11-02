"use client"

import { useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { Check, Crown, Settings, X } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Icon } from "@/components/mirai/icon"
import { useApp } from "@/components/app/app-context"
import { invalidateBook } from "@/hooks/use-book-data"
import { fmtDate, fmtMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ChatMeta, ChatMsg, Propuesta } from "@/lib/chat/types"
import { chatCancel, chatConfirm } from "./actions"
import { msgsKey } from "./store"

const TIPO: Record<Propuesta["tipo"], { icon: string; q: string; tone: string }> = {
  gasto: { icon: "receipt", q: "¿Registro este gasto?", tone: "bg-[#FDE7EA] text-danger dark:bg-danger-soft" },
  ingreso: { icon: "banknote", q: "¿Registro este ingreso?", tone: "bg-success-soft text-success" },
  meta: { icon: "target", q: "¿Creo esta meta?", tone: "bg-brand-soft text-link" },
  recordatorio: { icon: "bell", q: "¿Creo este recordatorio?", tone: "bg-warning-soft text-[#B86E00] dark:text-[#FFB547]" },
}

/** Tarjeta para confirmar una acción antes de escribir en el libro (gasto, ingreso, meta, recordatorio). */
export function ConfirmCard({ p, msg, threadId }: { p: Propuesta; msg: ChatMsg | null; threadId: string | null }) {
  const qc = useQueryClient()
  const { book, household } = useApp()
  const [busy, setBusy] = useState<"ok" | "no" | null>(null)
  const T = TIPO[p.tipo]
  const d = p.datos
  const canEdit = household.role !== "viewer"
  const rows: [string, React.ReactNode][] = p.tipo === "meta"
    ? [["Meta", d.nombre], ["Quieres juntar", <span key="v" data-money>{fmtMoney(d.objetivo ?? 0)}</span>], ...(d.ahorrado ? [["Ya tienes", <span key="a" data-money>{fmtMoney(d.ahorrado)}</span>]] as [string, React.ReactNode][] : []), ["Para cuándo", d.fecha ? fmtDate(d.fecha, { year: true }) : "Sin fecha"]]
    : p.tipo === "recordatorio"
      ? [["Qué", d.titulo], ["Fecha", d.fecha ? fmtDate(d.fecha, { year: true }) : "—"], ...(d.monto ? [["Valor", <span key="m" data-money>{fmtMoney(d.monto)}</span>]] as [string, React.ReactNode][] : [])]
      : [["Valor", <span key="v" data-money className="font-semibold">{fmtMoney(d.valor ?? 0)}</span>], ["Descripción", d.descripcion], ["Fecha", d.fecha ? fmtDate(d.fecha, { year: true }) : "Hoy"], ...(p.tipo === "gasto" ? [["Categoría", d.categoria ?? "Sin categoría"]] as [string, React.ReactNode][] : [])]
  const save = (next: Propuesta) => { if (msg && threadId) qc.setQueryData<ChatMsg[]>(msgsKey(threadId), (old) => old?.map((m) => (m.id === msg.id ? { ...m, meta: { ...m.meta, propuestas: (m.meta.propuestas ?? []).map((x) => (x.id === next.id ? next : x)) } } : m))) }
  const ok = async () => {
    if (!msg) return
    setBusy("ok")
    const r = await chatConfirm(msg.id, p.id)
    setBusy(null)
    if (!r.ok) return toast.error("No se guardó", { description: r.msg })
    save(r.propuesta)
    invalidateBook(qc, book.id, r.table)
    toast.success(r.msg, { action: { label: "Ver", onClick: () => { location.href = r.href } } })
  }
  const no = async () => {
    if (!msg) return
    setBusy("no")
    const r = await chatCancel(msg.id, p.id)
    setBusy(null)
    if (r.ok && r.propuesta) save(r.propuesta)
  }
  const href = { gasto: "/gastos", ingreso: "/ingresos", meta: "/metas", recordatorio: "/recordatorios" }[p.tipo]
  return (
    <div data-testid="confirm-card" className={cn("grid w-full max-w-sm gap-3 rounded-2xl bg-card p-3.5 shadow-card ring-1 ring-black/5 dark:ring-white/10", p.estado === "cancelado" && "opacity-70")}>
      <div className="flex items-center gap-2.5">
        <span className={cn("grid size-9 place-items-center rounded-full", T.tone)}><Icon name={T.icon} className="size-4.5" /></span>
        <p className="font-semibold">{p.estado === "hecho" ? "Guardado en tu libro" : p.estado === "cancelado" ? "Cancelado" : T.q}</p>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13.5px]">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="truncate text-right">{v}</dd></div>)}
      </dl>
      {p.estado === "pendiente" ? (
        canEdit ? (
          <div className="flex gap-2">
            <Button className="flex-1" disabled={!msg || !!busy} onClick={ok}>{busy === "ok" ? <Spinner /> : <Check />} Confirmar</Button>
            <Button variant="outline" disabled={!msg || !!busy} onClick={no}>{busy === "no" ? <Spinner /> : <X />} Cancelar</Button>
          </div>
        ) : <p className="text-[12.5px] text-muted-foreground">Tu rol es de solo lectura: no puedes guardar esto.</p>
      ) : p.estado === "hecho" ? (
        <Button variant="soft" size="sm" className="w-fit" asChild><Link href={href}><Check /> Ver en {({ gasto: "Gastos", ingreso: "Ingresos", meta: "Metas", recordatorio: "Próximos pagos" })[p.tipo]}</Link></Button>
      ) : null}
    </div>
  )
}

/** Botón para resolver por qué no respondió la IA (plan, apagada o créditos). */
export function AvisoAction({ aviso }: { aviso: NonNullable<ChatMeta["aviso"]> }) {
  if (aviso === "plan") return <Button size="sm" asChild className="bg-[linear-gradient(135deg,#FFD36B,#E08A00)] text-white hover:brightness-105"><Link href="/planes?f=ia"><Crown /> Conoce Premium</Link></Button>
  if (aviso === "creditos") return <Button size="sm" variant="soft" asChild><Link href="/ajustes?tab=usoia"><Icon name="gauge" /> Ver mi uso de IA</Link></Button>
  return <Button size="sm" variant="soft" asChild><Link href="/ajustes?tab=ia"><Settings /> Ajustes de IA</Link></Button>
}
