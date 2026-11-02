"use client"

import { useState } from "react"
import { Check, ExternalLink, Hourglass, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/mirai/empty-state"
import { FormField } from "@/components/mirai/field"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { MoneyInput } from "@/components/mirai/money-input"
import { PageHeader } from "@/components/mirai/page-header"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { Segmented } from "@/components/mirai/choice-cards"
import { StatusPill } from "@/components/mirai/status-pill"
import { useCanEdit } from "@/components/app/app-context"
import { useList, useSave, useSoftDelete } from "@/hooks/use-book-data"
import { cn } from "@/lib/utils"

const hoyCo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
// Desde la fecha de Colombia (con la de UTC, después de las 7 p. m. sumaba un día de más).
const masDias = (n: number) => new Date(new Date(`${hoyCo()}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10)
const faltan = (hasta: string) => Math.ceil((new Date(`${hasta}T12:00:00`).getTime() - new Date(`${hoyCo()}T12:00:00`).getTime()) / 86_400_000)
const PRIO = { 1: ["Lo necesito", "vencido"], 2: ["Me gustaría", "porVencer"], 3: ["Capricho", "gray"] } as const

function AddDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const save = useSave("wishlist", { created: "Agregado a tu lista de deseos" })
  const [v, setV] = useState({ nombre: "", precio: 0, url: "", prioridad: "2", espera: "30", nota: "" })
  const add = async () => {
    if (!v.nombre.trim()) return
    await save.mutateAsync({ nombre: v.nombre.trim(), precio: v.precio, url: v.url.trim() || null, prioridad: +v.prioridad, esperar_hasta: masDias(+v.espera), nota: v.nota.trim() } as never)
    setV({ nombre: "", precio: 0, url: "", prioridad: "2", espera: "30", nota: "" }); onOpenChange(false)
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="¿Qué te gustaría comprar?" description="Anótalo y espera antes de comprar. Si en unos días lo sigues queriendo y te alcanza, adelante."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={add} disabled={!v.nombre.trim() || save.isPending}>Agregar</Button></>}>
      <FieldGroup>
        <FormField label="Qué es" htmlFor="w-n" required tip={false}><Input id="w-n" className="h-11" maxLength={120} value={v.nombre} onChange={(e) => setV({ ...v, nombre: e.target.value })} placeholder="Ej. Audífonos inalámbricos" /></FormField>
        <FormField label="Cuánto cuesta" htmlFor="w-p" tip={false}><MoneyInput id="w-p" value={v.precio} onChange={(n) => setV({ ...v, precio: n ?? 0 })} /></FormField>
        <FormField label="¿Qué tanto lo necesitas?" tip={false}><Segmented value={v.prioridad} onChange={(x) => setV({ ...v, prioridad: x })} items={[{ value: "1", label: "Lo necesito" }, { value: "2", label: "Me gustaría" }, { value: "3", label: "Capricho" }]} /></FormField>
        <FormField label="Esperar antes de decidir" tip={false} hint="La regla de los 30 días: si sigues queriéndolo después de esperar, no es un impulso."><Segmented value={v.espera} onChange={(x) => setV({ ...v, espera: x })} items={[{ value: "7", label: "7 días" }, { value: "30", label: "30 días" }, { value: "60", label: "60 días" }]} /></FormField>
        <FormField label="Enlace (opcional)" htmlFor="w-u" tip={false}><Input id="w-u" className="h-11" inputMode="url" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} placeholder="https://" /></FormField>
        <FormField label="Nota (opcional)" htmlFor="w-t" tip={false}><Textarea id="w-t" rows={2} value={v.nota} onChange={(e) => setV({ ...v, nota: e.target.value })} placeholder="Ej. Esperar a que baje de precio" /></FormField>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

/** Lista de deseos con la regla de los 30 días: antes de comprar, espera; si lo sigues queriendo, decide con calma. */
export function DeseosView() {
  const can = useCanEdit()
  const { data, isPending } = useList("wishlist")
  const save = useSave("wishlist")
  const del = useSoftDelete("wishlist", "Quitado de tu lista")
  const [add, setAdd] = useState(false)
  const [f, setF] = useState("esperando")
  const list = (data ?? []).filter((w) => w.estado === f).sort((a, b) => (f === "esperando" ? a.esperar_hasta.localeCompare(b.esperar_hasta) : b.updated_at.localeCompare(a.updated_at)))
  const sum = (e: string) => (data ?? []).filter((w) => w.estado === e).reduce((t, w) => t + +w.precio, 0)
  const listos = (data ?? []).filter((w) => w.estado === "esperando" && faltan(w.esperar_hasta) <= 0).length
  return (
    <div className="grid gap-6">
      <PageHeader id="deseos" title="Lista de deseos" description="Antes de comprar algo que no necesitas ya, anótalo y espera. La mayoría de las compras por impulso se olvidan en pocos días: eso es plata que se queda contigo."
        actions={can && <Button onClick={() => setAdd(true)}><Plus /> Agregar deseo</Button>} />
      <KpiGrid className="xl:grid-cols-3">
        <Kpi icon="hourglass" tone="amber" label="Esperando" value={<Money value={sum("esperando")} />} sub={listos ? `${listos} ya ${listos === 1 ? "puede" : "pueden"} decidirse` : "Sigue esperando"} loading={isPending} />
        <Kpi icon="piggy-bank" tone="green" label="Te ahorraste" value={<Money value={sum("descartado")} />} sub="Lo que decidiste no comprar" loading={isPending} />
        <Kpi icon="shopping-bag" tone="blue" label="Compraste con calma" value={<Money value={sum("comprado")} />} sub="Después de pensarlo" loading={isPending} />
      </KpiGrid>
      <Segmented value={f} onChange={setF} items={[{ value: "esperando", label: "Esperando" }, { value: "comprado", label: "Comprados" }, { value: "descartado", label: "Descartados" }]} />
      {isPending ? <Skeleton className="h-40" /> : !list.length ? (
        <Card className="shadow-card ring-0"><EmptyState iso="metas" title={f === "esperando" ? "Tu lista está vacía" : "Nada por aquí todavía"} description={f === "esperando" ? "La próxima vez que algo te antoje, anótalo aquí en vez de comprarlo de una." : undefined} action={can && f === "esperando" ? <Button onClick={() => setAdd(true)}><Plus /> Agregar deseo</Button> : undefined} /></Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((w) => {
            const d = faltan(w.esperar_hasta)
            const p = PRIO[(w.prioridad as 1 | 2 | 3) ?? 2]
            return (
              <li key={w.id}>
                <Card className="gap-3 p-4 shadow-card ring-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-1"><p className="truncate font-semibold">{w.nombre}</p><div className="flex flex-wrap gap-1.5"><StatusPill tone={p[1]}>{p[0]}</StatusPill>{w.estado === "esperando" && <StatusPill tone={d <= 0 ? "pagado" : "info"}><Hourglass className="size-3" />{d <= 0 ? "Ya puedes decidir" : `Faltan ${d} día${d === 1 ? "" : "s"}`}</StatusPill>}</div></div>
                    <Money value={+w.precio} className="shrink-0 text-lg font-bold" />
                  </div>
                  {w.nota && <p className="text-sm text-muted-foreground">{w.nota}</p>}
                  <div className="flex flex-wrap gap-2">
                    {w.url && <Button size="sm" variant="ghost" asChild><a href={w.url} target="_blank" rel="noreferrer"><ExternalLink /> Ver</a></Button>}
                    {can && w.estado === "esperando" && <>
                      <Button size="sm" variant={d <= 0 ? "default" : "outline"} onClick={() => save.mutate({ id: w.id, estado: "comprado" } as never)}><Check /> Lo compré</Button>
                      <Button size="sm" variant="outline" onClick={() => save.mutate({ id: w.id, estado: "descartado" } as never)}><X /> Ya no lo quiero</Button>
                    </>}
                    {can && w.estado !== "esperando" && <Button size="sm" variant="ghost" onClick={() => save.mutate({ id: w.id, estado: "esperando" } as never)}>Volver a la lista</Button>}
                    {can && <Button size="icon-sm" variant="ghost" className={cn("ml-auto text-danger")} aria-label={`Quitar ${w.nombre}`} onClick={() => del.mutate(w)}><Trash2 /></Button>}
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
      <AddDialog open={add} onOpenChange={setAdd} />
    </div>
  )
}
