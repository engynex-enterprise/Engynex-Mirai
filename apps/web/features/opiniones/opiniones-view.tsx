"use client"

import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { LifeBuoy, MapPin, MessageSquareReply, Paperclip, Send, ShieldCheck, Trash2 } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/mirai/empty-state"
import { ListToolbar, NoResults, useListControls, type ListFilter, type ListSort } from "@/components/mirai/list-toolbar"
import { PageHeader } from "@/components/mirai/page-header"
import { Panel, SectionTitle } from "@/components/mirai/panel"
import { StatusPill } from "@/components/mirai/status-pill"
import { Tip } from "@/components/mirai/tip"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { useApp } from "@/components/app/app-context"
import { useShell } from "@/components/app/shell-store"
import { deleteFeedback } from "./api"
import { ESTADOS, TIPOS, casoNumero, type FeedbackEstado, type FeedbackTipo, type SoporteCtx } from "@/lib/content/opiniones"
import { fmtDate } from "@/lib/format"
import { useMyFeedback } from "./feedback-dialog"
import { Stars } from "./stars"
import { TIPO_TONE } from "./tones"

type Fb = NonNullable<ReturnType<typeof useMyFeedback>["data"]>[number]

const ATAJOS = ["calificacion", "error", "funcion", "elogio"] as const
/** Qué significa cada estado (tooltip en la pill). */
const ESTADO_AYUDA: Record<FeedbackEstado, string> = {
  nuevo: "Ya nos llegó. Pronto lo revisamos.",
  revisando: "Lo estamos revisando con el equipo.",
  planeado: "Nos gustó: está en el plan para una próxima versión.",
  hecho: "Listo: ya está resuelto o publicado.",
  descartado: "Por ahora no lo vamos a hacer. Gracias por la idea.",
}
const abierta = (f: Fb) => !["hecho", "descartado"].includes(f.estado)
const titulo = (f: Fb) => {
  const t = TIPOS[f.tipo as FeedbackTipo] ?? TIPOS.otro
  const sop = ((f.contexto ?? {}) as { soporte?: SoporteCtx }).soporte
  return f.tipo === "soporte" ? `Caso ${casoNumero(f.id)}${sop?.asunto ? ` · ${sop.asunto}` : ""}` : t.label
}

const FILTROS: ListFilter<Fb>[] = [
  { value: "todas", label: "Todo" },
  { value: "abiertas", label: "Sin resolver", match: abierta },
  { value: "respondidas", label: "Con respuesta", match: (f) => !!f.respuesta },
  { value: "soporte", label: "Casos de soporte", match: (f) => f.tipo === "soporte" },
]
const ORDEN: ListSort<Fb>[] = [
  { value: "recientes", label: "Más recientes", by: (a, b) => b.created_at.localeCompare(a.created_at) },
  { value: "antiguas", label: "Más antiguas", by: (a, b) => a.created_at.localeCompare(b.created_at) },
  { value: "respuesta", label: "Con respuesta primero", by: (a, b) => Number(!!b.respuesta) - Number(!!a.respuesta) || b.created_at.localeCompare(a.created_at) },
]
const texto = (f: Fb) => `${titulo(f)} ${f.mensaje ?? ""} ${f.respuesta ?? ""}`

function OpinionCard({ f, onDelete }: { f: Fb; onDelete: (id: string) => void }) {
  const tipo = (f.tipo as FeedbackTipo) in TIPOS ? (f.tipo as FeedbackTipo) : "otro"
  const e = ESTADOS[f.estado as FeedbackEstado] ?? ESTADOS.nuevo
  return (
    <Card className="gap-3 p-5 shadow-card ring-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ToneIcon icon={TIPOS[tipo].icon} tone={TIPO_TONE[tipo]} size="sm" label={TIPOS[tipo].label} />
        <p className="min-w-0 flex-1 basis-40 font-semibold break-words">{titulo(f)}</p>
        {f.rating ? <Stars value={f.rating} /> : null}
        <Tip label={ESTADO_AYUDA[f.estado as FeedbackEstado] ?? e.label}><span tabIndex={0} className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><StatusPill tone={e.tone}>{e.label}</StatusPill></span></Tip>
        <span className="text-xs text-muted-foreground">{fmtDate(f.created_at.slice(0, 10))}</span>
      </div>
      {f.mensaje && <p className="text-sm break-words whitespace-pre-wrap">{f.mensaje}</p>}
      {(f.captura || f.pagina) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {f.pagina && <span className="flex items-center gap-1 break-all"><MapPin className="size-3.5 shrink-0" /> Desde {f.pagina}</span>}
          {f.captura && <span className="flex items-center gap-1"><Paperclip className="size-3.5" /> Con captura adjunta</span>}
        </p>
      )}
      {f.respuesta && (
        <div className="grid gap-1 rounded-lg bg-brand-soft p-3">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-link"><MessageSquareReply className="size-4" /> Respuesta del equipo de Mirai{f.respondido_at && <span className="font-normal text-muted-foreground"> · {fmtDate(f.respondido_at.slice(0, 10))}</span>}</p>
          <p className="text-sm break-words whitespace-pre-wrap">{f.respuesta}</p>
        </div>
      )}
      {f.estado === "nuevo" && (
        <Tip label="Puedes borrarla mientras no la hayamos revisado">
          <Button size="sm" variant="ghost" className="w-fit text-danger hover:bg-danger-soft hover:text-danger" onClick={() => onDelete(f.id)}><Trash2 /> Borrar</Button>
        </Tip>
      )}
    </Card>
  )
}

export function OpinionesView() {
  const { user, isAdmin } = useApp()
  const qc = useQueryClient()
  const open = useShell((s) => s.openFeedback)
  const setHelp = useShell((s) => s.setHelp)
  const { data, isPending } = useMyFeedback()
  const c = useListControls(data, { text: texto, filters: FILTROS, sorts: ORDEN })
  const quitar = async (id: string) => {
    try { await deleteFeedback(id) } catch (e) { return toast.error("No se pudo borrar", { description: (e as Error).message }) }
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

      <section className="grid gap-3" aria-label="¿Qué nos quieres contar?">
        <SectionTitle icon="message-square-heart">¿Qué nos quieres contar?</SectionTitle>
        <ul className="grid gap-4 min-[520px]:grid-cols-2 xl:grid-cols-4">
          {ATAJOS.map((k) => (
            <li key={k}>
              <button type="button" onClick={() => open({ tipo: k })}
                className="press lift flex h-full w-full items-center gap-3 rounded-xl bg-card p-4 text-left shadow-card hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none">
                <ToneIcon icon={TIPOS[k].icon} tone={TIPO_TONE[k]} />
                <span className="min-w-0"><span className="block font-semibold">{TIPOS[k].label}</span><span className="text-sm text-muted-foreground">{TIPOS[k].desc}</span></span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Sin tarjeta contenedora: cada opinión es su propia tarjeta (las pruebas y el lector de pantalla las ubican así). */}
      <section className="grid gap-4" aria-label="Lo que nos has enviado">
        <SectionTitle icon="inbox" description={data?.length ? `${data.length} en total · ${data.filter(abierta).length} sin resolver` : undefined}>Lo que nos has enviado</SectionTitle>
        {isPending ? <div className="grid gap-3" aria-busy="true" aria-label="Cargando"><Skeleton className="h-10" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div> : !data?.length ? (
          <Panel>
            <EmptyState art="vacio" title="Todavía no nos has enviado nada" description="Tu opinión nos ayuda a decidir qué mejorar primero."
              action={<Button onClick={() => open()}><Send /> Enviar mi primera opinión</Button>} />
          </Panel>
        ) : (
          <>
            <ListToolbar c={c} placeholder="Buscar en lo que enviaste" filters={FILTROS} sorts={ORDEN} />
            {!c.rows.length ? <NoResults c={c} /> : (
              <ul className="grid gap-3">{c.rows.map((f) => <li key={f.id}><OpinionCard f={f} onDelete={quitar} /></li>)}</ul>
            )}
          </>
        )}
      </section>
    </div>
  )
}
