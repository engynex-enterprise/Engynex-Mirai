"use client"

import { useState } from "react"
import { Check, ExternalLink, Hourglass, Plus, Undo2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
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
import { SubmitButton } from "@/components/mirai/submit-button"
import { IconButton, Tip } from "@/components/mirai/tip"
import { ToneIcon, type IconTone } from "@/components/mirai/tone-icon"
import { ListToolbar, NoResults, useListControls, type ListFilter, type ListSort } from "@/components/mirai/list-toolbar"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useCanEdit } from "@/components/app/app-context"
import { useList, useSave, useSoftDelete } from "@/hooks/use-book-data"
import { fmtDate } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { useOpenKey } from "@/features/extras/use-open-key"

type Wish = Row<"wishlist">

const hoyCo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
// Desde la fecha de Colombia (con la de UTC, después de las 7 p. m. sumaba un día de más).
const masDias = (n: number) => new Date(new Date(`${hoyCo()}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10)
const faltan = (hasta: string) => Math.ceil((new Date(`${hasta}T12:00:00`).getTime() - new Date(`${hoyCo()}T12:00:00`).getTime()) / 86_400_000)

const PRIO: Record<1 | 2 | 3, { label: string; pill: "vencido" | "porVencer" | "gray"; tone: IconTone; tip: string }> = {
  1: { label: "Lo necesito", pill: "vencido", tone: "red", tip: "Es importante: decide con calma cuando se cumpla la espera." },
  2: { label: "Me gustaría", pill: "porVencer", tone: "amber", tip: "Lo quieres, pero puede esperar." },
  3: { label: "Capricho", pill: "gray", tone: "gray", tip: "Un antojo: si en la espera se te olvida, es plata que ahorraste." },
}
const prioOf = (w: Wish) => PRIO[(w.prioridad as 1 | 2 | 3) ?? 2] ?? PRIO[2]

const FILTERS: ListFilter<Wish>[] = [
  { value: "esperando", label: "Esperando", icon: "hourglass", match: (w) => w.estado === "esperando" },
  { value: "comprado", label: "Comprados", icon: "shopping-bag", match: (w) => w.estado === "comprado" },
  { value: "descartado", label: "Descartados", icon: "piggy-bank", match: (w) => w.estado === "descartado" },
]
const SORTS: ListSort<Wish>[] = [
  { value: "decidir", label: "Primero lo que ya puedes decidir", by: (a, b) => a.esperar_hasta.localeCompare(b.esperar_hasta) },
  { value: "recientes", label: "Más recientes", by: (a, b) => b.updated_at.localeCompare(a.updated_at) },
  { value: "caros", label: "Más caros primero", by: (a, b) => +b.precio - +a.precio },
  { value: "baratos", label: "Más baratos primero", by: (a, b) => +a.precio - +b.precio },
  { value: "prioridad", label: "Por prioridad", by: (a, b) => (a.prioridad ?? 2) - (b.prioridad ?? 2) },
]
const ESPERAS = [{ value: "7", label: "7 días" }, { value: "30", label: "30 días" }, { value: "60", label: "60 días" }]

/** Ventana para agregar o editar un deseo. El botón se activa cuando tiene nombre; mientras guarda muestra el indicador. */
function WishDialog(props: { open: boolean; onOpenChange: (o: boolean) => void; item: Wish | null }) {
  // Cada vez que se abre, el formulario empieza limpio; al cerrar conserva lo que mostraba (no parpadea).
  const n = useOpenKey(props.open)
  return <WishForm key={n} {...props} />
}

function WishForm({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item: Wish | null }) {
  const save = useSave("wishlist", { created: "Agregado a tu lista de deseos", updated: "Deseo actualizado" })
  const [v, setV] = useState({
    nombre: item?.nombre ?? "", precio: item ? +item.precio : 0, url: item?.url ?? "", prioridad: String(item?.prioridad ?? 2),
    espera: "30", nota: item?.nota ?? "",
  })
  const valido = !!v.nombre.trim() && (!v.url.trim() || /^https?:\/\/\S+$/i.test(v.url.trim()))
  const submit = async () => {
    if (!valido || save.isPending) return
    const base = { nombre: v.nombre.trim(), precio: v.precio, url: v.url.trim() || null, prioridad: +v.prioridad, nota: v.nota.trim() }
    try {
      await save.mutateAsync((item ? { id: item.id, ...base } : { ...base, esperar_hasta: masDias(+v.espera) }) as never)
      onOpenChange(false)
    } catch { /* useSave ya avisa el error; la ventana queda abierta para reintentar */ }
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={item ? "Editar deseo" : "¿Qué te gustaría comprar?"}
      description={item ? "Cambia lo que necesites. La fecha de espera se mantiene." : "Anótalo y espera antes de comprar. Si en unos días lo sigues queriendo y te alcanza, adelante."}
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <SubmitButton disabled={!valido} loading={save.isPending} onClick={submit} hint="Escribe qué es (y un enlace válido, si pones uno)">{item ? "Guardar" : "Agregar"}</SubmitButton></>}>
      <form id="deseo-form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <FieldGroup>
          <FormField label="Qué es" htmlFor="w-n" required tip={false}><Input id="w-n" className="h-11" maxLength={120} value={v.nombre} onChange={(e) => setV({ ...v, nombre: e.target.value })} placeholder="Ej. Audífonos inalámbricos" /></FormField>
          <FormField label="Cuánto cuesta" htmlFor="w-p" tip={false}><MoneyInput id="w-p" value={v.precio} onChange={(n) => setV({ ...v, precio: n ?? 0 })} /></FormField>
          <FormField label="¿Qué tanto lo necesitas?" tip={false}><Segmented value={v.prioridad} onChange={(x) => setV({ ...v, prioridad: x })} items={[{ value: "1", label: "Lo necesito" }, { value: "2", label: "Me gustaría" }, { value: "3", label: "Capricho" }]} /></FormField>
          {!item && <FormField label="Esperar antes de decidir" tip={false} hint="La regla de los 30 días: si sigues queriéndolo después de esperar, no es un impulso."><Segmented value={v.espera} onChange={(x) => setV({ ...v, espera: x })} items={ESPERAS} /></FormField>}
          <FormField label="Enlace (opcional)" htmlFor="w-u" tip={false} error={v.url.trim() && !/^https?:\/\/\S+$/i.test(v.url.trim()) ? "Escribe el enlace completo, empezando por https://" : undefined}>
            <Input id="w-u" className="h-11" inputMode="url" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} placeholder="https://" />
          </FormField>
          <FormField label="Nota (opcional)" htmlFor="w-t" tip={false}><Textarea id="w-t" rows={2} value={v.nota} onChange={(e) => setV({ ...v, nota: e.target.value })} placeholder="Ej. Esperar a que baje de precio" /></FormField>
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  )
}

function WishCard({ w, can, onEdit }: { w: Wish; can: boolean; onEdit: () => void }) {
  const save = useSave("wishlist")
  const del = useSoftDelete("wishlist", "Quitado de tu lista")
  const d = faltan(w.esperar_hasta)
  const p = prioOf(w)
  const listo = w.estado === "esperando" && d <= 0
  const estado = (estado: string) => save.mutate({ id: w.id, estado } as never)
  return (
    <li>
      <Card className="h-full gap-3 p-4 shadow-card ring-0">
        <div className="flex items-start gap-3">
          <ToneIcon icon={w.estado === "descartado" ? "piggy-bank" : w.estado === "comprado" ? "check" : "shopping-bag"} tone={w.estado === "descartado" ? "green" : w.estado === "comprado" ? "blue" : p.tone} />
          <div className="grid min-w-0 flex-1 gap-1">
            <p className="truncate font-semibold" title={w.nombre}>{w.nombre}</p>
            <div className="flex flex-wrap gap-1.5">
              <Tip label={p.tip}><span tabIndex={0} className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><StatusPill tone={p.pill}>{p.label}</StatusPill></span></Tip>
              {w.estado === "esperando" && (
                <Tip label={`Esperas hasta el ${fmtDate(w.esperar_hasta, { long: true })}`}>
                  <span tabIndex={0} className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><StatusPill tone={listo ? "pagado" : "info"}><Hourglass className="size-3" />{listo ? "Ya puedes decidir" : `Faltan ${d} día${d === 1 ? "" : "s"}`}</StatusPill></span>
                </Tip>
              )}
            </div>
          </div>
          <Money value={+w.precio} className="shrink-0 text-lg font-bold" />
        </div>
        {w.nota && <p className="text-sm text-muted-foreground">{w.nota}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2">
          {can && w.estado === "esperando" && <>
            <Button size="sm" variant={listo ? "default" : "outline"} onClick={() => estado("comprado")}><Check /> Lo compré</Button>
            <Button size="sm" variant="outline" onClick={() => estado("descartado")}><X /> Ya no lo quiero</Button>
          </>}
          {can && w.estado !== "esperando" && <Button size="sm" variant="ghost" onClick={() => estado("esperando")}><Undo2 /> Volver a la lista</Button>}
          <span className="ml-auto flex items-center">
            {w.url && (
              <Tip label="Ver dónde comprarlo">
                <Button size="icon-sm" variant="ghost" asChild><a href={w.url} target="_blank" rel="noreferrer" aria-label={`Ver dónde comprar ${w.nombre}`}><ExternalLink /></a></Button>
              </Tip>
            )}
            {can && <IconButton size="icon-sm" icon="pencil" label={`Editar ${w.nombre}`} onClick={onEdit} />}
            {can && <IconButton size="icon-sm" icon="trash-2" destructive label={`Quitar ${w.nombre}`} onClick={() => del.mutate(w)} />}
          </span>
        </div>
      </Card>
    </li>
  )
}

/** Lista de deseos con la regla de los 30 días: antes de comprar, espera; si lo sigues queriendo, decide con calma. */
export function DeseosView() {
  const can = useCanEdit()
  const { data, isPending } = useList("wishlist")
  const [dialog, setDialog] = useState<{ open: boolean; item: Wish | null }>({ open: false, item: null })
  const c = useListControls(data, { text: (w) => `${w.nombre} ${w.nota ?? ""}`, filters: FILTERS, sorts: SORTS })
  if (isPending) return <PageSkeleton kpis={3} />
  const sum = (e: string) => (data ?? []).filter((w) => w.estado === e).reduce((t, w) => t + +w.precio, 0)
  const listos = (data ?? []).filter((w) => w.estado === "esperando" && faltan(w.esperar_hasta) <= 0).length
  const nuevo = () => setDialog({ open: true, item: null })
  return (
    <div className="grid gap-6">
      <PageHeader id="deseos" title="Lista de deseos" description="Antes de comprar algo que no necesitas ya, anótalo y espera. La mayoría de las compras por impulso se olvidan en pocos días: eso es plata que se queda contigo."
        actions={can && <Button onClick={nuevo}><Plus /> Agregar deseo</Button>} />
      <KpiGrid className="xl:grid-cols-3">
        <Kpi icon="hourglass" tone="amber" label="Esperando" value={<Money value={sum("esperando")} />} sub={listos ? `${listos} ya ${listos === 1 ? "puede" : "pueden"} decidirse` : "Sigue esperando"} />
        <Kpi icon="piggy-bank" tone="green" label="Te ahorraste" value={<Money value={sum("descartado")} />} sub="Lo que decidiste no comprar" />
        <Kpi icon="shopping-bag" tone="blue" label="Compraste con calma" value={<Money value={sum("comprado")} />} sub="Después de pensarlo" />
      </KpiGrid>
      {!data?.length ? (
        <Card className="shadow-card ring-0"><EmptyState iso="deseos" title="Tu lista está vacía" description="La próxima vez que algo te antoje, anótalo aquí en vez de comprarlo de una." action={can ? <Button onClick={nuevo}><Plus /> Agregar deseo</Button> : undefined} /></Card>
      ) : (
        <section className="grid gap-4" aria-label="Tus deseos">
          <ListToolbar c={c} placeholder="Buscar en tu lista" filters={FILTERS} sorts={SORTS} />
          {!c.rows.length ? (
            c.q ? <NoResults c={c} /> : <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{c.filter === "comprado" ? "Aún no has comprado nada de tu lista." : c.filter === "descartado" ? "Aún no has descartado nada. Cuando algo deje de antojarte, márcalo: es plata que ahorras." : "No tienes deseos esperando."}</p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {c.rows.map((w) => <WishCard key={w.id} w={w} can={can} onEdit={() => setDialog({ open: true, item: w })} />)}
            </ul>
          )}
        </section>
      )}
      <WishDialog open={dialog.open} item={dialog.item} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} />
    </div>
  )
}
