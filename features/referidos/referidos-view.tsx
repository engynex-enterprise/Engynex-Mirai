"use client"

import { useQuery } from "@tanstack/react-query"
import { Copy, Gift, MessageCircle, Share2 } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/mirai/empty-state"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { ListToolbar, NoResults, useListControls, type ListFilter, type ListSort } from "@/components/mirai/list-toolbar"
import { Notice } from "@/components/mirai/notice"
import { PageHeader } from "@/components/mirai/page-header"
import { Panel } from "@/components/mirai/panel"
import { StatusPill, type PillTone } from "@/components/mirai/status-pill"
import { Tip } from "@/components/mirai/tip"
import { ToneIcon, toneFor } from "@/components/mirai/tone-icon"
import { fmtDate } from "@/lib/format"
import { misReferidos } from "./actions"

type Data = Awaited<ReturnType<typeof misReferidos>>
type Invitado = Data["invitados"][number]

const ESTADO: Record<string, { tone: PillTone; label: string; help: string }> = {
  recompensado: { tone: "pagado", label: "Ganaron los dos", help: "Creó su hogar: los dos recibieron el premio." },
  registrado: { tone: "info", label: "Se registró", help: "Ya tiene cuenta. El premio llega cuando cree su hogar." },
  sin_recompensa: { tone: "gray", label: "Sin premio", help: "Se registró, pero no dio premio (programa en pausa o ya llegaste al máximo)." },
}
const estadoDe = (e: string) => ESTADO[e] ?? { tone: "gray" as const, label: e, help: e }

const FILTROS: ListFilter<Invitado>[] = [
  { value: "todos", label: "Todos" },
  { value: "recompensado", label: "Con premio", match: (i) => i.estado === "recompensado" },
  { value: "registrado", label: "Falta su hogar", match: (i) => i.estado === "registrado" },
]
const ORDEN: ListSort<Invitado>[] = [
  { value: "recientes", label: "Más recientes", by: (a, b) => b.fecha.localeCompare(a.fecha) },
  { value: "nombre", label: "Por nombre", by: (a, b) => a.nombre.localeCompare(b.nombre, "es") },
]

function Invitados({ list }: { list: Invitado[] }) {
  const c = useListControls(list, { text: (i) => i.nombre, filters: FILTROS, sorts: ORDEN })
  return (
    <Panel title={`Tus invitados (${list.length})`} icon="users" description="Por privacidad solo ves su primer nombre.">
      {!list.length ? (
        <EmptyState iso="referidos" title="Todavía nadie se ha registrado con tu enlace" description="Compártelo por WhatsApp con tu familia y amigos: cuando creen su hogar, los dos ganan." />
      ) : (
        <div className="grid gap-4">
          {list.length > 4 && <ListToolbar c={c} placeholder="Buscar por nombre" filters={FILTROS} sorts={ORDEN} />}
          {!c.rows.length ? <NoResults c={c} /> : (
            <ul className="grid gap-2">
              {c.rows.map((i) => {
                const e = estadoDe(i.estado)
                return (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-secondary/40 p-3">
                    <ToneIcon icon="user-round" tone={toneFor(i.nombre)} size="sm" />
                    <div className="grid min-w-0 flex-1"><b className="truncate">{i.nombre}</b><span className="text-xs text-muted-foreground">Se unió el {fmtDate(i.fecha.slice(0, 10), { year: true })}</span></div>
                    <Tip label={e.help}><span tabIndex={0} className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><StatusPill tone={e.tone}>{e.label}</StatusPill></span></Tip>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Panel>
  )
}

/** Invita y gana: tu enlace de invitación, cómo funciona y a quiénes has invitado. */
export function ReferidosView() {
  const { data, isPending } = useQuery({ queryKey: ["referidos"], queryFn: () => misReferidos() })
  const texto = data ? `Estoy usando Mirai para ordenar mi plata y me está sirviendo mucho. Regístrate con mi enlace y los dos ganamos ${data.dias} días de Mirai ${data.plan}: ${data.link}` : ""
  const copy = async (t: string, msg: string) => { try { await navigator.clipboard.writeText(t); toast.success(msg) } catch { toast.error("No se pudo copiar") } }
  const share = async () => { if (navigator.share) { try { await navigator.share({ title: "Te invito a Mirai", text: texto }); return } catch { return } } copy(texto, "Invitación copiada: pégala en WhatsApp") }
  const premios = data?.invitados.filter((i) => i.estado === "recompensado").length ?? 0
  return (
    <div className="grid gap-6">
      <PageHeader id="referidos" title="Invita y gana" description={data ? `Por cada persona que se registre con tu enlace y cree su hogar, los dos ganan ${data.dias} días de Mirai ${data.plan}.` : "Invita a tu familia y amigos a ordenar su plata."} />
      {isPending || !data ? (
        <div className="grid gap-6" aria-busy="true" aria-label="Cargando">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[88px] rounded-lg" />)}</div>
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : (
        <>
          {!data.activo && <Notice tone="warn" title="El programa de invitaciones está en pausa">Tus invitaciones se registran, pero por ahora no dan premio.</Notice>}
          <KpiGrid className="min-[520px]:grid-cols-1 md:grid-cols-3 xl:grid-cols-3">
            <Kpi icon="users" tone="blue" label="Invitados" value={data.invitados.length} sub="Se registraron con tu enlace" />
            <Kpi icon="gift" tone="amber" label="Premios ganados" value={`${premios} de ${data.max}`} sub={premios >= data.max ? "Llegaste al máximo" : `Te quedan ${data.max - premios}`} />
            <Kpi icon="crown" tone="green" label="Días ganados" value={premios * data.dias} sub={`De Mirai ${data.plan}`} />
          </KpiGrid>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card className="h-full gap-5 p-5 shadow-card ring-0">
              <div className="flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-2xl bg-[linear-gradient(135deg,#FFD36B,#E08A00)] text-white"><Gift className="size-6" /></span>
                <div><p className="text-sm text-muted-foreground">Tu código</p><p className="font-mono text-2xl font-bold tracking-widest">{data.codigo}</p></div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input readOnly value={data.link} aria-label="Tu enlace de invitación" onFocus={(e) => e.target.select()} className="h-11" />
                <Button className="h-11" variant="outline" onClick={() => copy(data.link, "Enlace copiado")}><Copy /> Copiar enlace</Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button size="lg" asChild><a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer"><MessageCircle /> Invitar por WhatsApp</a></Button>
                <Button size="lg" variant="outline" onClick={share}><Share2 /> Compartir de otra forma</Button>
              </div>
            </Card>
            <Panel title="Cómo funciona" icon="list-ordered">
              <ol className="grid gap-3">
                {[
                  "Comparte tu enlace por WhatsApp o donde quieras.",
                  "Tu invitado se registra y crea su hogar en Mirai.",
                  `Los dos reciben ${data.dias} días de Mirai ${data.plan} (hasta ${data.max} premios para ti).`,
                ].map((t, i) => (
                  <li key={t} className="flex gap-3 text-sm">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-navy text-xs font-semibold text-white dark:bg-lime dark:text-navy">{i + 1}</span>
                    <span className="pt-1">{t}</span>
                  </li>
                ))}
              </ol>
            </Panel>
          </div>
          <Invitados list={data.invitados} />
        </>
      )}
    </div>
  )
}
