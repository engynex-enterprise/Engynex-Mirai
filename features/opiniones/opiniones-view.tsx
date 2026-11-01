"use client"

import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { MessageSquareReply, Paperclip, Send, ShieldCheck, Trash2 } from "lucide-react"
import { toast } from "sonner"
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
import { ESTADOS, TIPOS, type FeedbackEstado, type FeedbackTipo } from "@/lib/content/opiniones"
import { fmtDate } from "@/lib/format"
import { useMyFeedback } from "./feedback-dialog"
import { Stars } from "./stars"

export function OpinionesView() {
  const { user, isAdmin } = useApp()
  const qc = useQueryClient()
  const open = useShell((s) => s.openFeedback)
  const { data, isPending } = useMyFeedback()
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
          {isAdmin && <Button variant="outline" asChild><Link href="/admin?tab=opiniones"><ShieldCheck /> Panel de administración</Link></Button>}
        </>} />
      <div className="grid gap-3 sm:grid-cols-3">
        {(["calificacion", "error", "funcion"] as const).map((k) => (
          <button key={k} type="button" onClick={() => open({ tipo: k })} className="press flex items-center gap-3 rounded-xl bg-card p-4 text-left shadow-card hover:bg-hover">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><Icon name={TIPOS[k].icon} className="size-5" /></span>
            <span><span className="block font-semibold">{TIPOS[k].label}</span><span className="text-sm text-muted-foreground">{TIPOS[k].desc}</span></span>
          </button>
        ))}
      </div>
      <section className="grid gap-3">
        <h2 className="font-semibold">Lo que nos has enviado</h2>
        {isPending ? <Skeleton className="h-40" /> : !data?.length ? (
          <Card className="items-center gap-3 p-8 text-center shadow-card ring-0">
            <Illustration k="vacio" width={180} />
            <p className="max-w-sm text-muted-foreground">Todavía no nos has enviado nada. Tu opinión nos ayuda a decidir qué mejorar primero.</p>
            <Button onClick={() => open()}><Send /> Enviar mi primera opinión</Button>
          </Card>
        ) : (
          <ul className="grid gap-3">
            {data.map((f) => {
              const t = TIPOS[f.tipo as FeedbackTipo] ?? TIPOS.otro
              const e = ESTADOS[f.estado as FeedbackEstado] ?? ESTADOS.nuevo
              return (
                <li key={f.id}>
                  <Card className="gap-3 p-4 shadow-card ring-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid size-8 place-items-center rounded-lg bg-secondary text-muted-foreground"><Icon name={t.icon} className="size-4" /></span>
                      <p className="font-semibold">{t.label}</p>
                      {f.rating && <Stars value={f.rating} />}
                      <StatusPill tone={e.tone}>{e.label}</StatusPill>
                      <span className="ml-auto text-xs text-muted-foreground">{fmtDate(f.created_at.slice(0, 10))}</span>
                    </div>
                    {f.mensaje && <p className="text-sm whitespace-pre-wrap">{f.mensaje}</p>}
                    {f.captura && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Paperclip className="size-3.5" /> Con captura adjunta</p>}
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
