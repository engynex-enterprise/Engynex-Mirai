"use client"

import { useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { LifeBuoy, MapPin, MessageSquareReply, Paperclip, Send, ShieldCheck, Trash2 } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Icon } from "@/components/mirai/icon"
import { Illustration } from "@/components/mirai/illustration"
import { PageHeader } from "@/components/mirai/page-header"
import { StatusPill } from "@/components/mirai/status-pill"
import { useApp } from "@/components/app/app-context"
import { useShell } from "@/components/app/shell-store"
import { createClient } from "@/utils/supabase/client"
import { Chips } from "@/features/ayuda/ui"
import { ESTADOS, TIPOS, casoNumero, type FeedbackEstado, type FeedbackTipo, type SoporteCtx } from "@/lib/content/opiniones"
import { fmtDate } from "@/lib/format"
import { useMyFeedback } from "./feedback-dialog"
import { Stars } from "./stars"

export function OpinionesView() {
  const { user, isAdmin } = useApp()
  const qc = useQueryClient()
  const open = useShell((s) => s.openFeedback)
  const setHelp = useShell((s) => s.setHelp)
  const { data, isPending } = useMyFeedback()
  const [filtro, setFiltro] = useState<"todas" | "abiertas" | "respondidas" | "soporte">("todas")
  const abierta = (e: string) => !["hecho", "descartado"].includes(e)
  const list = (data ?? []).filter((f) => filtro === "todas" || (filtro === "abiertas" ? abierta(f.estado) : filtro === "respondidas" ? !!f.respuesta : f.tipo === "soporte"))
  const quitar = async (id: string) => {
    const { error } = await createClient().from("feedback").delete().eq("id", id)
    if (error) return toast.error("No se pudo borrar", { description: error.message })
    toast("Opinión borrada"); qc.invalidateQueries({ queryKey: ["feedback", user.id] })
  }
  return (
    <div className="grid gap-6">
      <PageHeader id="opiniones" title="Tu opinión" description="Califica Mirai, cuéntanos qué falla o qué te gustaría. Aquí ves lo que nos has enviado y nuestras respuestas."
        actions={<>
          <Button onClick={() => open()}><Send /> Enviar una opinión</Button>
          <Button variant="outline" onClick={() => setHelp("@soporte")}><LifeBuoy /> Contactar soporte</Button>
          {isAdmin && <Button variant="outline" asChild><Link href="/admin/opiniones"><ShieldCheck /> Ver en la consola</Link></Button>}
        </>} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["calificacion", "error", "funcion", "elogio"] as const).map((k) => (
          <button key={k} type="button" onClick={() => open({ tipo: k })} className="press flex items-center gap-3 rounded-xl bg-card p-4 text-left shadow-card hover:bg-hover">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><Icon name={TIPOS[k].icon} className="size-5" /></span>
            <span><span className="block font-semibold">{TIPOS[k].label}</span><span className="text-sm text-muted-foreground">{TIPOS[k].desc}</span></span>
          </button>
        ))}
      </div>
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Lo que nos has enviado</h2>
          {!!data?.length && <Chips label="Filtrar lo enviado" value={filtro} onChange={setFiltro} items={[
            { value: "todas", label: "Todo", n: data.length },
            { value: "abiertas", label: "Sin resolver", n: data.filter((f) => abierta(f.estado)).length },
            { value: "respondidas", label: "Con respuesta", n: data.filter((f) => !!f.respuesta).length },
            { value: "soporte", label: "Casos de soporte", n: data.filter((f) => f.tipo === "soporte").length },
          ]} />}
        </div>
        {isPending ? <div className="grid gap-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div> : !data?.length ? (
          <Card className="items-center gap-3 p-8 text-center shadow-card ring-0">
            <Illustration k="vacio" width={180} />
            <p className="max-w-sm text-muted-foreground">Todavía no nos has enviado nada. Tu opinión nos ayuda a decidir qué mejorar primero.</p>
            <Button onClick={() => open()}><Send /> Enviar mi primera opinión</Button>
          </Card>
        ) : !list.length ? (
          <Card className="p-6 text-center text-sm text-muted-foreground shadow-card ring-0">No hay nada con este filtro.</Card>
        ) : (
          <ul className="grid gap-3">
            {list.map((f) => {
              const t = TIPOS[f.tipo as FeedbackTipo] ?? TIPOS.otro
              const sop = ((f.contexto ?? {}) as { soporte?: SoporteCtx }).soporte
              const e = ESTADOS[f.estado as FeedbackEstado] ?? ESTADOS.nuevo
              return (
                <li key={f.id}>
                  <Card className="gap-3 p-4 shadow-card ring-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid size-8 place-items-center rounded-lg bg-secondary text-muted-foreground"><Icon name={t.icon} className="size-4" /></span>
                      <p className="min-w-0 font-semibold break-words">{f.tipo === "soporte" ? `Caso ${casoNumero(f.id)}${sop?.asunto ? ` · ${sop.asunto}` : ""}` : t.label}</p>
                      {f.rating && <Stars value={f.rating} />}
                      <StatusPill tone={e.tone}>{e.label}</StatusPill>
                      <span className="ml-auto text-xs text-muted-foreground">{fmtDate(f.created_at.slice(0, 10))}</span>
                    </div>
                    {f.mensaje && <p className="text-sm whitespace-pre-wrap">{f.mensaje}</p>}
                    {(f.captura || f.pagina) && (
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {f.pagina && <span className="flex items-center gap-1 break-all"><MapPin className="size-3.5 shrink-0" /> Desde {f.pagina}</span>}
                        {f.captura && <span className="flex items-center gap-1"><Paperclip className="size-3.5" /> Con captura adjunta</span>}
                      </p>
                    )}
                    {f.respuesta && (
                      <div className="grid gap-1 rounded-lg bg-brand-soft p-3">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-link"><MessageSquareReply className="size-4" /> Respuesta del equipo de Mirai{f.respondido_at && <span className="font-normal text-muted-foreground"> · {fmtDate(f.respondido_at.slice(0, 10))}</span>}</p>
                        <p className="text-sm whitespace-pre-wrap">{f.respuesta}</p>
                      </div>
                    )}
                    {f.estado === "nuevo" && <Button size="sm" variant="ghost" className="w-fit text-danger" onClick={() => quitar(f.id)}><Trash2 /> Borrar</Button>}
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
