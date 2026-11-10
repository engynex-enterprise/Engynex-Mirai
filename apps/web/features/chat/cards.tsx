"use client"

import { useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { Check, CheckCheck, Crown, Settings, X } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Icon } from "@/components/mirai/icon"
import { useApp } from "@/components/app/app-context"
import { invalidateBook } from "@/hooks/use-book-data"
import { fmtDate, fmtMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ChatMeta, ChatMsg, Propuesta } from "@/lib/chat/types"
import { puedeProponer } from "@/lib/chat/permisos"
import { FREC_LABEL, TIPO_INFO, destino, type TipoInfo } from "@/lib/chat/propuestas"
import { chatCancel, chatConfirm } from "./api"
import { msgsKey } from "./store"

const TONE: Record<TipoInfo["tone"], string> = {
  gasto: "bg-[#FDE7EA] text-danger dark:bg-danger-soft",
  ingreso: "bg-success-soft text-success",
  meta: "bg-brand-soft text-link",
  aviso: "bg-warning-soft text-[#B86E00] dark:text-[#FFB547]",
  deuda: "bg-secondary text-foreground",
}

type Row = [string, React.ReactNode]
const UNIDAD: Record<string, string> = { mensual: "cuotas mensuales", quincenal: "cuotas quincenales", semanal: "cuotas semanales", diario: "cuotas diarias", diariohab: "cuotas diarias" }
const money = (v: number | undefined, strong = false) => <span data-money className={strong ? "font-semibold" : undefined}>{fmtMoney(v ?? 0)}</span>
const day = (f: string | undefined) => (f ? fmtDate(f, { year: true }) : "Hoy")

/** Filas de la tarjeta según el tipo de registro. */
function rowsOf(p: Propuesta): Row[] {
  const d = p.datos
  const opt = (c: unknown, r: Row): Row[] => (c ? [r] : [])
  switch (p.tipo) {
    case "meta": return [["Meta", d.nombre], ["Quieres juntar", money(d.objetivo)], ...opt(d.ahorrado, ["Ya tienes", money(d.ahorrado)]), ["Para cuándo", d.fecha ? fmtDate(d.fecha, { year: true }) : "Sin fecha"]]
    case "recordatorio": return [["Qué", d.titulo], ["Fecha", d.fecha ? fmtDate(d.fecha, { year: true }) : "—"], ...opt(d.monto, ["Valor", money(d.monto)])]
    case "ingreso_fijo": return [["Ingreso", d.descripcion], ["Cada pago", money(d.valor, true)], ["Frecuencia", FREC_LABEL[d.frec ?? ""] ?? d.frec], ...opt(d.dia, ["Día", `El ${d.dia}`])]
    case "fijo": return [["Gasto fijo", d.nombre], ["Valor", money(d.valor, true)], ["Frecuencia", FREC_LABEL[d.frec ?? ""] ?? d.frec], ["Día de pago", `El ${d.dia ?? 1}`], ["Categoría", d.categoria ?? "Sin categoría"]]
    case "pago_fijo": return [["Gasto fijo", d.nombre], ["Valor pagado", money(d.valor, true)], ["Fecha", day(d.fecha)], ...opt(d.descripcion, ["Periodo", d.descripcion])]
    case "suscripcion": return [["Suscripción", d.nombre], ["Valor", money(d.valor, true)], ["Se cobra", d.ciclo === "anual" ? "Cada año" : "Cada mes"], ["Próximo cobro", day(d.proximo)]]
    case "cobro_suscripcion": return [["Suscripción", d.nombre], ["Cobro", money(d.valor, true)], ["Fecha", day(d.fecha)], ...opt(d.proximo, ["Siguiente cobro", fmtDate(d.proximo!, { year: true })])]
    case "compra_tarjeta": return [["Compra", d.descripcion], ["Valor", money(d.valor, true)], ["Tarjeta", d.nombre], ["Cuotas", d.cuotas && d.cuotas > 1 ? <span key="c">{d.cuotas} de {money(d.cuota)}</span> : "1 (sin intereses si pagas el total)"], ["Fecha", day(d.fecha)], ["Categoría", d.categoria ?? "Sin categoría"]]
    case "pago_tarjeta": return [["Tarjeta", d.nombre], [d.pago_tarjeta === "total" ? "Pago total" : d.pago_tarjeta === "minimo" ? "Pago del mes" : "Pago", money(d.valor, true)], ["Fecha", day(d.fecha)], ["Queda debiendo", money(d.saldo)]]
    case "prestamo": return [
      [d.kind === "cobrar" ? "Le prestaste a" : "Te prestó", d.persona], ["Valor", money(d.valor, true)],
      ["Cuotas", d.vence ? <span key="q">Un pago de {money(d.cuota)} el {day(d.vence)}</span> : d.plazo === 1 ? <span key="q">Un pago de {money(d.cuota)}</span> : <span key="q">{d.plazo} {UNIDAD[d.frec ?? ""] ?? "cuotas"} de {money(d.cuota)}</span>],
      [d.tasa ? "Interés" : "Sin intereses", d.tasa ? `${String(d.tasa).replace(".", ",")} % mensual` : "—"], ...opt(d.total && d.total !== d.valor, ["Total a pagar", money(d.total)]), ["Desde", day(d.fecha)],
    ]
    case "pago_cuota": return [[d.kind === "cobrar" ? "Préstamo" : "Deuda", d.nombre], [d.pago === "abono" ? "Abono" : d.cuotas && d.cuotas > 1 ? `${d.cuotas} cuotas` : "Cuota", money(d.valor, true)], ["Fecha", day(d.fecha)], ["Queda debiendo", money(d.saldo)]]
    case "abono_meta": return [["Meta", d.nombre], ["Abono", money(d.valor, true)], ["Fecha", day(d.fecha)], ...opt(d.objetivo, ["Quedarías con", <span key="a">{money(d.ahorrado)} de {money(d.objetivo)}</span>])]
    default: return [["Valor", money(d.valor, true)], ["Descripción", d.descripcion], ["Fecha", day(d.fecha)], ...(p.tipo === "gasto" ? [["Categoría", d.categoria ?? "Sin categoría"]] as Row[] : []), ...opt(d.medio, [p.tipo === "gasto" ? "Pagaste con" : "Te llegó a", d.medio])]
  }
}

/** Tarjeta para confirmar una acción antes de escribir en el libro (cualquier módulo: gasto, préstamo, cuota, meta…). */
export function ConfirmCard({ p, msg, threadId }: { p: Propuesta; msg: ChatMsg | null; threadId: string | null }) {
  const qc = useQueryClient()
  const { book, household } = useApp()
  const [busy, setBusy] = useState<"ok" | "no" | null>(null)
  const T = TIPO_INFO[p.tipo] ?? TIPO_INFO.gasto
  const dest = destino(p.tipo, p.datos.kind)
  const canEdit = puedeProponer(household.access, p.tipo)
  const rows = rowsOf(p)
  const save = (next: Propuesta) => { if (msg && threadId) qc.setQueryData<ChatMsg[]>(msgsKey(threadId), (old) => old?.map((m) => (m.id === msg.id ? { ...m, meta: { ...m.meta, propuestas: (m.meta.propuestas ?? []).map((x) => (x.id === next.id ? next : x)) } } : m))) }
  const ok = async () => {
    if (!msg) return
    setBusy("ok")
    const r = await chatConfirm(msg.id, p.id).catch(() => ({ ok: false as const, msg: "Revisa tu conexión e intenta de nuevo." }))
    setBusy(null)
    if (!r.ok) return toast.error("No se guardó", { description: r.msg })
    save(r.propuesta)
    for (const t of r.tablas) invalidateBook(qc, book.id, t)
    toast.success(r.msg, { action: { label: "Ver", onClick: () => { location.href = r.href } } })
  }
  const no = async () => {
    if (!msg) return
    setBusy("no")
    const r = await chatCancel(msg.id, p.id)
    setBusy(null)
    if (r.ok && r.propuesta) save(r.propuesta)
  }
  return (
    <div data-testid="confirm-card" data-tipo={p.tipo} className={cn("grid w-full max-w-sm gap-3 rounded-2xl bg-card p-3.5 shadow-card ring-1 ring-black/5 dark:ring-white/10", p.estado === "cancelado" && "opacity-70")}>
      <div className="flex items-center gap-2.5">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", TONE[T.tone])}><Icon name={T.icon} className="size-4.5" /></span>
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
        ) : <p className="text-[12.5px] text-muted-foreground">{household.access === "viewer" ? "Tu rol es de solo lectura: no puedes guardar esto." : "Tu rol solo registra tus gastos e ingresos: no puedes guardar esto."}</p>
      ) : p.estado === "hecho" ? (
        <Button variant="soft" size="sm" className="w-fit" asChild><Link href={dest.href}><Check /> Ver en {dest.donde}</Link></Button>
      ) : null}
    </div>
  )
}

/**
 * "Confirmar todos": guarda una por una las propuestas pendientes de una respuesta (p. ej. los 4 movimientos de una
 * foto). En orden, porque cada confirmación reescribe el mismo mensaje; si una falla, sigue con las demás y avisa.
 */
export function ConfirmAll({ msg, threadId }: { msg: ChatMsg; threadId: string | null }) {
  const qc = useQueryClient()
  const { book, household } = useApp()
  const [busy, setBusy] = useState(false)
  const pend = (msg.meta.propuestas ?? []).filter((p) => p.estado === "pendiente" && puedeProponer(household.access, p.tipo))
  if (pend.length < 2) return null
  const run = async () => {
    setBusy(true)
    let ok = 0
    const fallas: string[] = []
    const tablas = new Set<string>()
    for (const p of pend) {
      const r = await chatConfirm(msg.id, p.id).catch(() => ({ ok: false as const, msg: "Revisa tu conexión." }))
      if (!r.ok) { fallas.push(r.msg); continue }
      ok++
      r.tablas.forEach((t) => tablas.add(t))
      if (threadId) qc.setQueryData<ChatMsg[]>(msgsKey(threadId), (old) => old?.map((m) => (m.id === msg.id ? { ...m, meta: { ...m.meta, propuestas: (m.meta.propuestas ?? []).map((x) => (x.id === r.propuesta.id ? r.propuesta : x)) } } : m)))
    }
    for (const t of tablas) invalidateBook(qc, book.id, t)
    setBusy(false)
    if (ok) toast.success(ok === pend.length ? `Listo: ${ok} registros guardados` : `Guardé ${ok} de ${pend.length} registros`, fallas.length ? { description: fallas[0] } : undefined)
    else toast.error("No se guardó ninguno", { description: fallas[0] })
  }
  return (
    <Button className="w-fit" disabled={busy} onClick={run} data-testid="confirm-all">
      {busy ? <Spinner /> : <CheckCheck />} Confirmar todos ({pend.length})
    </Button>
  )
}

/** Botón para resolver por qué no respondió la IA (plan, apagada o créditos). */
export function AvisoAction({ aviso }: { aviso: NonNullable<ChatMeta["aviso"]> }) {
  if (aviso === "plan") return <Button size="sm" asChild className="bg-[linear-gradient(135deg,#FFD36B,#E08A00)] text-white hover:brightness-105"><Link href="/planes?f=ia"><Crown /> Conoce Premium</Link></Button>
  if (aviso === "creditos") return <Button size="sm" variant="soft" asChild><Link href="/ajustes?tab=usoia"><Icon name="gauge" /> Ver mi uso de IA</Link></Button>
  return <Button size="sm" variant="soft" asChild><Link href="/ajustes?tab=ia"><Settings /> Ajustes de IA</Link></Button>
}
