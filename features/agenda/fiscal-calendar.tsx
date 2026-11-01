"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { BellPlus, ExternalLink, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { MoneyAutosave } from "@/components/mirai/money-autosave"
import { DatePicker } from "@/components/mirai/date-picker"
import { StatusPill } from "@/components/mirai/status-pill"
import { Segmented } from "@/components/mirai/choice-cards"
import { FormField } from "@/components/mirai/field"
import { Notice } from "@/components/mirai/notice"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { EmptyState } from "@/components/mirai/empty-state"
import { MoneyInput } from "@/components/mirai/money-input"
import { Icon } from "@/components/mirai/icon"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useApp, useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook, useList, useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { createClient } from "@/utils/supabase/client"
import { smmlvFor } from "@/lib/domain"
import { fmtDate, fmtMoney, monthName, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { useBookData } from "@/features/book/use-book-data"
import { useCategories, useIncomeCategories, useSettings } from "@/features/catalogs/hooks"
import { FCAT, FPL, calEst, fcatOf, nextOcc, type FCatKey } from "./fiscal"

const rel = (d: string, t: string) => { const n = Math.round((new Date(d + "T12:00:00").getTime() - new Date(t + "T12:00:00").getTime()) / 864e5); return n === 0 ? "Hoy" : n > 0 ? `En ${n} días` : `Hace ${-n} días` }

function useRenta(digitos: string) {
  return useQuery({
    queryKey: ["ref", "renta", digitos],
    enabled: /^\d{2}$/.test(digitos),
    queryFn: async () => {
      const { data } = await createClient().from("ref_renta_calendar").select("year,regimen,fecha").eq("digitos", digitos).order("year", { ascending: false })
      const { data: reg } = await createClient().from("ref_renta_regimenes").select("*")
      return { rows: data ?? [], reg: reg ?? [] }
    },
  })
}

function RentaCard({ events, today }: { events: Row<"calendar_events">[]; today: string }) {
  const { user } = useApp()
  const bookId = useBookId()
  const qc = useQueryClient()
  const sb = createClient()
  const { data: prof } = useQuery({ queryKey: ["profile", user.id], queryFn: async () => (await sb.from("profiles").select("digitos,ciudad").eq("id", user.id).single()).data })
  const [dig, setDig] = useState<string | null>(null)
  const digitos = dig ?? prof?.digitos ?? ""
  const { data } = useRenta(digitos)
  const general = data?.rows.find((r) => r.regimen === "general")
  const especial = data?.rows.find((r) => r.regimen !== "general")
  const reg = data?.reg.find((r) => r.key === especial?.regimen)
  const usar = async (fecha: string) => {
    const ex = events.find((e) => e.template_key === "renta")
    const row = { titulo: "Declaración de renta (DIAN)", fecha, tipo: "egreso", cat: "dian", nota: `Según los dígitos ${digitos}. Calendario DIAN ${fecha.slice(0, 4)}; actualízala cuando salga el del próximo año.`, fuente: "https://www.dian.gov.co", template_key: "renta", anual: false }
    if (ex) await sb.from("calendar_events").update(row).eq("id", ex.id); else await sb.from("calendar_events").insert({ ...row, book_id: bookId })
    toast.success("Fecha de renta en tu calendario"); invalidateBook(qc, bookId, "calendar_events")
  }
  return (
    <Card className="shadow-card ring-0">
      <CardHeader><CardTitle className="text-base">¿Cuándo declaras renta?</CardTitle><CardDescription>Depende de los dos últimos dígitos de tu cédula.</CardDescription></CardHeader>
      <CardContent className="grid gap-4">
        <FormField label="Últimos 2 dígitos de tu cédula" htmlFor="rd" tip="Con ellos la DIAN asigna tu fecha límite para declarar renta." className="max-w-56">
          <Input id="rd" className="h-11 text-lg tracking-widest" inputMode="numeric" maxLength={2} value={digitos} onChange={async (e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2); setDig(v)
            if (v.length === 2) await sb.from("profiles").update({ digitos: v }).eq("id", user.id)
          }} />
        </FormField>
        {general && (
          <div className="grid gap-2">
            <p>Tu fecha límite en {general.year} {general.fecha < today ? "era" : "es"} <b>{fmtDate(general.fecha, { long: true })}</b> <StatusPill tone={general.fecha < today ? "gray" : "porVencer"}>{general.fecha < today ? "Ya pasó · el calendario siguiente lo publica la DIAN a inicio de año" : rel(general.fecha, today)}</StatusPill></p>
            <Button variant="soft" className="w-fit" onClick={() => usar(general.fecha)}>Usar esta fecha en mi calendario</Button>
            {especial && reg && (
              <Notice tone="warn" title={`${reg.nombre}: ${fmtDate(especial.fecha, { long: true })}`}>
                {reg.descripcion} Seccionales: {reg.seccionales.join(", ")}. ({reg.norma}){prof?.ciudad && reg.seccionales.some((s) => prof.ciudad?.toLowerCase().includes(s.toLowerCase())) && <> <b>Tu ciudad está en la lista.</b></>}
                <Button size="sm" variant="outline" className="mt-2 w-fit" onClick={() => usar(especial.fecha)}>Usar el plazo especial</Button>
              </Notice>
            )}
          </div>
        )}
        <p className="text-sm text-muted-foreground">¿No sabes si debes declarar? Revisa los topes en <Link href="/renta" className="text-link underline">Declaración de renta</Link>.</p>
      </CardContent>
    </Card>
  )
}

function TemplatesDialog({ open, onOpenChange, events, today }: { open: boolean; onOpenChange: (o: boolean) => void; events: Row<"calendar_events">[]; today: string }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const tpl = FPL(+today.slice(0, 4), today)
  const has = (k: string, t: string) => events.some((e) => e.template_key === k || e.titulo === t)
  const [sel, setSel] = useState<string[]>([])
  const save = async () => {
    const rows = tpl.filter((t) => sel.includes(t.k)).map((t) => ({ book_id: bookId, template_key: t.k, cat: t.cat, titulo: t.titulo, fecha: t.fecha, tipo: t.tipo, nota: t.nota, fuente: t.fuente ?? null, monto: 0, anual: true }))
    if (!rows.length) return onOpenChange(false)
    const { error } = await createClient().from("calendar_events").insert(rows)
    if (error) return toast.error("No se pudieron agregar", { description: error.message })
    toast.success(`Agregamos ${rows.length} fecha${rows.length > 1 ? "s" : ""} a tu calendario`); invalidateBook(qc, bookId, "calendar_events"); setSel([]); onOpenChange(false)
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} wide title="Fechas importantes de Colombia" description="Elige las que te aplican. Puedes cambiar la fecha y el valor después.">
      <div className="grid gap-4 pb-2">
        {(Object.keys(FCAT) as FCatKey[]).map((c) => (
          <div key={c} className="grid gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: FCAT[c].color }}><Icon name={FCAT[c].icon} className="size-4" />{FCAT[c].n}</p>
            {tpl.filter((t) => t.cat === c).map((t) => { const ya = has(t.k, t.titulo); return (
              <label key={t.k} className="flex items-start gap-3 rounded-lg border p-3 text-sm has-[:disabled]:opacity-60">
                <Checkbox disabled={ya} checked={ya || sel.includes(t.k)} onCheckedChange={(v) => setSel((s) => (v === true ? [...s, t.k] : s.filter((x) => x !== t.k)))} className="mt-0.5" />
                <span className="grid"><b>{t.titulo} <span className="font-normal text-muted-foreground">· {fmtDate(t.fecha, { year: false })}</span></b><span className="text-muted-foreground">{ya ? "Ya la tienes" : t.nota}</span></span>
              </label>) })}
          </div>
        ))}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save} disabled={!sel.length}>Agregar {sel.length || ""}</Button></div>
      </div>
    </ResponsiveDialog>
  )
}

function EventDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const [titulo, setTitulo] = useState("")
  const [fecha, setFecha] = useState<string | null>(todayISO())
  const [tipo, setTipo] = useState("egreso")
  const [monto, setMonto] = useState(0)
  const [anual, setAnual] = useState(true)
  const save = async () => {
    if (!titulo.trim() || !fecha) return toast.error("Escribe el nombre y la fecha")
    const { error } = await createClient().from("calendar_events").insert({ book_id: bookId, titulo: titulo.trim(), fecha, tipo, monto, anual, cat: fcatOf({ titulo }) })
    if (error) return toast.error("No se pudo guardar", { description: error.message })
    toast.success("Fecha agregada"); invalidateBook(qc, bookId, "calendar_events"); setTitulo(""); onOpenChange(false)
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} mdesc="cal" title="Nueva fecha importante">
      <FieldGroup className="pb-2">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="¿Qué pasa ese día?" htmlFor="ce-t" required><Input id="ce-t" className="h-11" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Pago del SOAT" /></FormField>
          <FormField label="Fecha" htmlFor="ce-f"><DatePicker id="ce-f" value={fecha} onChange={setFecha} quick="futuro" /></FormField>
          <FormField label="¿Te pagan o pagas?"><Segmented value={tipo} onChange={setTipo} items={[{ value: "egreso", label: "Pago yo" }, { value: "ingreso", label: "Me pagan" }]} /></FormField>
          <FormField label="Valor (opcional)" htmlFor="ce-m"><MoneyInput id="ce-m" value={monto} onChange={setMonto} /></FormField>
        </div>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={anual} onCheckedChange={(c) => setAnual(c === true)} /> Se repite cada año</label>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save}>Guardar</Button></div>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

export function FiscalCalendar() {
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const today = todayISO()
  const [nuevo, setNuevo] = useNewParam()
  const [tplOpen, setTplOpen] = useState(false)
  const [filtro, setFiltro] = useState("todas")
  const { data: book, isPending } = useBookData()
  const { data: events = [] } = useList("calendar_events")
  const { data: assets = [] } = useList("tax_assets")
  const { data: cfg } = useSettings()
  const { data: incCats = [] } = useIncomeCategories()
  const { data: cats = [] } = useCategories()
  const del = useSoftDelete("calendar_events", "Fecha eliminada")
  const smmlv = smmlvFor(+today.slice(0, 4), cfg?.smmlv as Record<string, number>)

  const rows = useMemo(() => events.map((e) => ({ e, nx: nextOcc(e, today), cat: fcatOf(e) })).sort((a, b) => a.nx.localeCompare(b.nx)), [events, today])
  if (isPending || !book) return <PageSkeleton kpis={3} />
  const est = (e: Row<"calendar_events">) => calEst(e, book, assets.map((a) => ({ ...a, avaluo: Number(a.avaluo), predial: a.predial == null ? null : Number(a.predial), imp_veh: a.imp_veh == null ? null : Number(a.imp_veh), soat: a.soat == null ? null : Number(a.soat), pct: Number(a.pct) })), smmlv, incCats)
  const val = (e: Row<"calendar_events">) => Number(e.monto) || est(e)?.v || 0
  const in365 = rows.filter((r) => r.nx <= new Date(new Date(today).getTime() + 365 * 864e5).toISOString().slice(0, 10))
  const prox = rows.find((r) => r.nx >= today)
  const vis = rows.filter((r) => filtro === "todas" || r.cat === filtro)
  const groups = [...new Set(vis.map((r) => r.nx.slice(0, 7)))]
  const upd = async (id: string, p: Partial<Row<"calendar_events">>) => { await createClient().from("calendar_events").update(p).eq("id", id); invalidateBook(qc, bookId, "calendar_events") }
  const recordar = async (e: Row<"calendar_events">, nx: string) => {
    await createClient().from("fixed_expenses").insert({ book_id: bookId, nombre: e.titulo, category_id: cats.find((c) => c.nombre === "Otros")?.id ?? null, valor: val(e), frec: "anual", dia: +nx.slice(8), mes: +nx.slice(5, 7), variable: true, desde: today.slice(0, 7), inicio: today })
    toast.success("Quedó en tus gastos fijos anuales"); invalidateBook(qc, bookId, "fixed_expenses")
  }

  return (
    <div className="grid gap-6">
      <PageHeader id="calendario" actions={canEdit && <><Button variant="outline" onClick={() => setTplOpen(true)}><Icon name="calendar-plus" /> Fechas de Colombia</Button><Button onClick={() => setNuevo(true)}><Plus /> Agregar fecha</Button></>} />
      <KpiGrid className="xl:grid-cols-3">
        <Kpi icon="calendar-clock" tone="amber" label="Próxima fecha" value={prox ? rel(prox.nx, today) : "—"} sub={prox ? `${prox.e.titulo} · ${fmtDate(prox.nx)}` : "Agrega fechas importantes"} />
        <Kpi icon="arrow-down-to-line" tone="income" label="Te van a pagar (12 meses)" value={<Money value={in365.filter((r) => r.e.tipo === "ingreso").reduce((s, r) => s + val(r.e), 0)} />} valueClassName="text-success" />
        <Kpi icon="arrow-up-from-line" tone="expense" label="Vas a pagar (12 meses)" value={<Money value={in365.filter((r) => r.e.tipo === "egreso").reduce((s, r) => s + val(r.e), 0)} />} valueClassName="text-danger" />
      </KpiGrid>
      <RentaCard events={events} today={today} />
      <Segmented value={filtro} onChange={setFiltro} items={[{ value: "todas", label: `Todas (${rows.length})`, icon: "list" }, ...(Object.keys(FCAT) as FCatKey[]).map((k) => ({ value: k, label: `${FCAT[k].n} (${rows.filter((r) => r.cat === k).length})`, icon: FCAT[k].icon }))]} />
      {!vis.length ? (
        <Card className="shadow-card ring-0"><EmptyState iso="calendario" title="Sin fechas en esta categoría" description="Agrega las fechas importantes de Colombia: primas, cesantías, renta, predial, SOAT…" action={canEdit && <Button onClick={() => setTplOpen(true)}>Ver fechas de Colombia</Button>} /></Card>
      ) : groups.map((g) => (
        <Card key={g} className="shadow-card ring-0">
          <CardHeader><CardTitle className="text-base capitalize">{monthName(+g.slice(5))} {g.slice(0, 4)}</CardTitle></CardHeader>
          <CardContent className="grid divide-y">
            {vis.filter((r) => r.nx.startsWith(g)).map(({ e, nx, cat }) => { const E = est(e); return (
              <div key={e.id} className="grid gap-3 py-4 md:grid-cols-[3.5rem_1fr_auto]">
                <div className="grid h-14 w-14 place-content-center rounded-lg text-center text-white" style={{ background: FCAT[cat].color }}><b className="text-xl leading-6">{+nx.slice(8)}</b><span className="text-[10px] uppercase">{monthName(+nx.slice(5, 7), false)}</span></div>
                <div className="grid gap-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-semibold">{e.titulo}<StatusPill tone="gray">{FCAT[cat].n}</StatusPill><StatusPill tone={e.tipo === "ingreso" ? "pagado" : "vencido"}>{e.tipo === "ingreso" ? "Te pagan" : "Pagas"}</StatusPill></p>
                  <p className="text-sm text-muted-foreground">{rel(nx, today)}{e.nota && ` · ${e.nota}`} {e.fuente && <a href={e.fuente} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-link underline">Fuente <ExternalLink className="size-3" /></a>}</p>
                  {E && !Number(e.monto) && <p className="text-sm"><StatusPill tone="estimado">Estimado</StatusPill> <b>{fmtMoney(E.v)}</b> <span className="text-muted-foreground">· {E.how}</span>{canEdit && E.v > 0 && <Button variant="link" size="sm" onClick={() => upd(e.id, { monto: Math.round(E.v) })}>Usar este valor</Button>}</p>}
                </div>
                {canEdit && (
                  <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 md:w-[26rem]">
                    <FormField label="Fecha"><DatePicker value={e.fecha} onChange={(v) => v && upd(e.id, { fecha: v })} quick="ninguno" /></FormField>
                    <FormField label="Valor"><MoneyAutosave value={Number(e.monto)} onSave={(v) => upd(e.id, { monto: v })} placeholder={E ? `Estimado ${new Intl.NumberFormat("es-CO").format(Math.round(E.v))}` : "0"} /></FormField>
                    <div className="flex">
                      {e.tipo === "egreso" && <Button variant="ghost" size="icon" aria-label={`Recordar ${e.titulo} como gasto fijo`} title="Recordar como gasto fijo anual" onClick={() => recordar(e, nx)}><BellPlus /></Button>}
                      <Button variant="ghost" size="icon" aria-label={`Eliminar ${e.titulo}`} onClick={() => del.mutate({ id: e.id, nombre: e.titulo })}><Trash2 /></Button>
                    </div>
                  </div>
                )}
              </div>) })}
          </CardContent>
        </Card>
      ))}
      <TemplatesDialog open={tplOpen} onOpenChange={setTplOpen} events={events} today={today} />
      <EventDialog open={nuevo} onOpenChange={(o) => !o && setNuevo(false)} />
    </div>
  )
}
