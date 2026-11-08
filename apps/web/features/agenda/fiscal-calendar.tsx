"use client"

import { fetchRentaData, rentaInput } from "@/features/renta/data"
import { calcRenta, titularId } from "@/lib/domain"
import { qk } from "@/lib/supabase/tables"
import Link from "next/link"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@/lib/query"
import { BellPlus, ExternalLink, Plus, Trash2 } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
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
import { ListToolbar, NoResults, useListControls, type ListFilter, type ListSort } from "@/components/mirai/list-toolbar"
import { Panel, SectionTitle } from "@/components/mirai/panel"
import { SubmitButton } from "@/components/mirai/submit-button"
import { IconButton, Tip } from "@/components/mirai/tip"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useApp, useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook, useList, useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { insertBookRows, saveDigitos, updateBookRow } from "./api"
import { fetchProfile } from "@/features/profile/api"
import { fetchRentaCalendar, fetchRentaRegimenes } from "@/lib/ref-data"
import { smmlvFor } from "@/lib/domain"
import { fmtDate, fmtMoney, monthName, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { useBookData } from "@/features/book/use-book-data"
import { useCategories, useIncomeCategories, useSettings } from "@/features/catalogs/hooks"
import { FCAT, FPL, calEst, fcatOf, nextOcc, type FCatKey } from "./fiscal"

type FRow = { e: Row<"calendar_events">; nx: string; cat: FCatKey }
const ORDEN: ListSort<FRow>[] = [
  { value: "fecha", label: "Más próximas primero", by: (a, b) => a.nx.localeCompare(b.nx) },
  { value: "lejos", label: "Más lejanas primero", by: (a, b) => b.nx.localeCompare(a.nx) },
  { value: "nombre", label: "Nombre (A-Z)", by: (a, b) => a.e.titulo.localeCompare(b.e.titulo, "es") },
]
const rel = (d: string, t: string) => { const n = Math.round((new Date(d + "T12:00:00").getTime() - new Date(t + "T12:00:00").getTime()) / 864e5); return n === 0 ? "Hoy" : n > 0 ? `En ${n} días` : `Hace ${-n} días` }

function useRenta(digitos: string) {
  return useQuery({
    queryKey: ["ref", "renta", digitos],
    enabled: /^\d{2}$/.test(digitos),
    // /v1/refs/renta-calendar y /v1/refs/renta-regimenes de la API.
    queryFn: async () => {
      const [rows, reg] = await Promise.all([fetchRentaCalendar(digitos), fetchRentaRegimenes()])
      return { rows, reg }
    },
  })
}

function RentaCard({ events, today }: { events: Row<"calendar_events">[]; today: string }) {
  const { user } = useApp()
  const bookId = useBookId()
  const qc = useQueryClient()
  const { data: prof } = useQuery({ queryKey: ["profile", user.id], queryFn: async () => { const p = await fetchProfile(user.id); return p ? { digitos: p.digitos, ciudad: p.ciudad } : null } })
  const [dig, setDig] = useState<string | null>(null)
  const digitos = dig ?? prof?.digitos ?? ""
  const { data } = useRenta(digitos)
  const general = data?.rows.find((r) => r.regimen === "general")
  const especial = data?.rows.find((r) => r.regimen !== "general")
  const reg = data?.reg.find((r) => r.key === especial?.regimen)
  const usar = async (fecha: string) => {
    const ex = events.find((e) => e.template_key === "renta")
    const row = { titulo: "Declaración de renta (DIAN)", fecha, tipo: "egreso", cat: "dian", nota: `Según los dígitos ${digitos}. Calendario DIAN ${fecha.slice(0, 4)}; actualízala cuando salga el del próximo año.`, fuente: "https://www.dian.gov.co", template_key: "renta", anual: false }
    const { error } = ex ? await updateBookRow(bookId, "calendar_events", ex.id, row) : await insertBookRows(bookId, "calendar_events", [row])
    if (error) return toast.error("No se pudo guardar", { description: error.message })
    toast.success("Fecha de renta en tu calendario"); invalidateBook(qc, bookId, "calendar_events")
  }
  return (
    <Panel title="¿Cuándo declaras renta?" icon="landmark" description="Depende de los dos últimos dígitos de tu cédula.">
      <div className="grid gap-4">
        <FormField label="Últimos 2 dígitos de tu cédula" htmlFor="rd" tip="Con ellos la DIAN asigna tu fecha límite para declarar renta." className="max-w-56">
          <Input id="rd" className="h-11 text-lg tracking-widest" inputMode="numeric" maxLength={2} value={digitos} onChange={async (e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2); setDig(v)
            if (v.length === 2) await saveDigitos(user.id, v)
          }} />
        </FormField>
        {general && (
          <div className="grid gap-2">
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">Tu fecha límite en {general.year} {general.fecha < today ? "era" : "es"} <b>{fmtDate(general.fecha, { long: true })}</b> {general.fecha < today ? <Tip label="El calendario del año siguiente lo publica la DIAN a inicio de año."><span><StatusPill tone="gray">Ya pasó</StatusPill></span></Tip> : <StatusPill tone="porVencer">{rel(general.fecha, today)}</StatusPill>}</p>
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
      </div>
    </Panel>
  )
}

function TemplatesDialog({ open, onOpenChange, events, today }: { open: boolean; onOpenChange: (o: boolean) => void; events: Row<"calendar_events">[]; today: string }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const tpl = FPL(+today.slice(0, 4), today)
  const has = (k: string, t: string) => events.some((e) => e.template_key === k || e.titulo === t)
  const [sel, setSel] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const rows = tpl.filter((t) => sel.includes(t.k)).map((t) => ({ template_key: t.k, cat: t.cat, titulo: t.titulo, fecha: t.fecha, tipo: t.tipo, nota: t.nota, fuente: t.fuente ?? null, monto: 0, anual: true }))
    if (!rows.length) return onOpenChange(false)
    setBusy(true)
    const { error } = await insertBookRows(bookId, "calendar_events", rows)
    setBusy(false)
    if (error) return toast.error("No se pudieron agregar", { description: error.message })
    toast.success(`Agregamos ${rows.length} fecha${rows.length > 1 ? "s" : ""} a tu calendario`); invalidateBook(qc, bookId, "calendar_events"); setSel([]); onOpenChange(false)
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} wide title="Fechas importantes de Colombia" description="Elige las que te aplican. Puedes cambiar la fecha y el valor después."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!sel.length} loading={busy} loadingText="Agregando…" hint="Elige al menos una fecha" onClick={save}>{sel.length ? `Agregar ${sel.length} fecha${sel.length > 1 ? "s" : ""}` : "Agregar"}</SubmitButton></>}>
      <div className="grid gap-4 pb-2">
        {(Object.keys(FCAT) as FCatKey[]).map((c) => (
          <div key={c} className="grid gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold"><span className="grid size-7 place-items-center rounded-full text-white" style={{ background: FCAT[c].color }}><Icon name={FCAT[c].icon} className="size-4" /></span>{FCAT[c].n}</p>
            {tpl.filter((t) => t.cat === c).map((t) => { const ya = has(t.k, t.titulo); return (
              <label key={t.k} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-hover has-[:disabled]:cursor-default has-[:disabled]:opacity-60 has-[[data-state=checked]:not(:disabled)]:border-brand has-[[data-state=checked]:not(:disabled)]:bg-brand-soft/50">
                <Checkbox disabled={ya} checked={ya || sel.includes(t.k)} onCheckedChange={(v) => setSel((s) => (v === true ? [...s, t.k] : s.filter((x) => x !== t.k)))} className="mt-0.5" />
                <span className="grid"><b>{t.titulo} <span className="font-normal text-muted-foreground">· {fmtDate(t.fecha, { year: false })}</span></b><span className="text-muted-foreground">{ya ? "Ya la tienes" : t.nota}</span></span>
              </label>) })}
          </div>
        ))}
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
  const [busy, setBusy] = useState(false)
  const valido = !!titulo.trim() && !!fecha
  const save = async () => {
    if (!valido || busy) return
    setBusy(true)
    const { error } = await insertBookRows(bookId, "calendar_events", [{ titulo: titulo.trim(), fecha, tipo, monto, anual, cat: fcatOf({ titulo }) }])
    setBusy(false)
    if (error) return toast.error("No se pudo guardar", { description: error.message })
    toast.success("Fecha agregada"); invalidateBook(qc, bookId, "calendar_events"); setTitulo(""); setMonto(0); onOpenChange(false)
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} mdesc="cal" title="Nueva fecha importante"
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!valido} loading={busy} onClick={save} hint={!titulo.trim() ? "Escribe qué pasa ese día" : "Elige la fecha"} /></>}>
      <FieldGroup className="pb-2">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="¿Qué pasa ese día?" htmlFor="ce-t" required><Input id="ce-t" className="h-11" maxLength={120} value={titulo} onKeyDown={(e) => { if (e.key === "Enter") void save() }} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Pago del SOAT" /></FormField>
          <FormField label="Fecha" htmlFor="ce-f" required><DatePicker id="ce-f" value={fecha} onChange={setFecha} quick="futuro" /></FormField>
          <FormField label="¿Te pagan o pagas?"><Segmented value={tipo} onChange={setTipo} items={[{ value: "egreso", label: "Pago yo" }, { value: "ingreso", label: "Me pagan" }]} /></FormField>
          <FormField label="Valor (opcional)" htmlFor="ce-m"><MoneyInput id="ce-m" value={monto} onChange={setMonto} /></FormField>
        </div>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={anual} onCheckedChange={(c) => setAnual(c === true)} /> Se repite cada año</label>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

const fRowText = (r: FRow) => `${r.e.titulo} ${r.e.nota ?? ""} ${FCAT[r.cat].n}`

export function FiscalCalendar() {
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const today = todayISO()
  const [nuevo, setNuevo] = useNewParam()
  const [tplOpen, setTplOpen] = useState(false)
  const { data: book, isPending } = useBookData()
  const { data: events = [] } = useList("calendar_events")
  const { data: assets = [] } = useList("tax_assets")
  const { data: cfg } = useSettings()
  const { data: incCats = [] } = useIncomeCategories()
  const { data: cats = [] } = useCategories()
  const del = useSoftDelete("calendar_events", "Fecha eliminada")
  const smmlv = smmlvFor(+today.slice(0, 4), cfg?.smmlv as Record<string, number>)

  const rows: FRow[] = events.map((e) => ({ e, nx: nextOcc(e, today), cat: fcatOf(e) })).sort((a, b) => a.nx.localeCompare(b.nx))
  const filtros: ListFilter<FRow>[] = [{ value: "todas", label: "Todas", icon: "list" }, ...(Object.keys(FCAT) as FCatKey[]).filter((k) => rows.some((r) => r.cat === k)).map((k) => ({ value: k, label: FCAT[k].n, icon: FCAT[k].icon, match: (r: FRow) => r.cat === k }))]
  const ctl = useListControls(rows, { text: fRowText, filters: filtros, sorts: ORDEN })
  // Renta: estimado con el borrador de la Declaración del año anterior a la fecha (calEst de la v4).
  const isRenta = (e: Row<"calendar_events">) => e.template_key === "renta" || /declaraci[oó]n de renta/i.test(e.titulo)
  const { data: renta } = useQuery({ queryKey: qk(bookId, "renta"), enabled: events.some(isRenta), queryFn: () => fetchRentaData(bookId) })
  const rentaEst = (nx: string) => {
    if (!renta) return null
    const y = +nx.slice(0, 4) - 1, mid = titularId(renta.members)
    const C = calcRenta(rentaInput(renta, y, mid), y, mid, today)
    return C.saldo > 0 ? { v: C.saldo, how: `Estimado con el borrador del año ${y}: impuesto ${fmtMoney(C.imp)} − retenciones ${fmtMoney(C.ret)}.` } : { v: 0, how: `Con tus datos del año ${y} quedaría saldo a favor de ${fmtMoney(-C.saldo)}.` }
  }
  if (isPending || !book) return <PageSkeleton kpis={3} />
  const est = (e: Row<"calendar_events">) => (isRenta(e) ? rentaEst(nextOcc(e, today)) : null) ?? calEst(e, book, assets.map((a) => ({ ...a, avaluo: Number(a.avaluo), predial: a.predial == null ? null : Number(a.predial), imp_veh: a.imp_veh == null ? null : Number(a.imp_veh), soat: a.soat == null ? null : Number(a.soat), pct: Number(a.pct) })), smmlv, incCats)
  const val = (e: Row<"calendar_events">) => Number(e.monto) || est(e)?.v || 0
  const in365 = rows.filter((r) => r.nx <= new Date(new Date(today).getTime() + 365 * 864e5).toISOString().slice(0, 10))
  const prox = rows.find((r) => r.nx >= today)
  const vis = ctl.rows
  // Por fecha se agrupa por mes; por nombre, una sola tarjeta.
  const groups = ctl.sort === "nombre" ? ["todas"] : [...new Set(vis.map((r) => r.nx.slice(0, 7)))]
  const upd = async (id: string, p: Partial<Row<"calendar_events">>) => { await updateBookRow(bookId, "calendar_events", id, p); invalidateBook(qc, bookId, "calendar_events") }
  const recordar = async (e: Row<"calendar_events">, nx: string) => {
    await insertBookRows(bookId, "fixed_expenses", [{ nombre: e.titulo, category_id: cats.find((c) => c.nombre === "Otros")?.id ?? null, valor: val(e), frec: "anual", dia: +nx.slice(8), mes: +nx.slice(5, 7), variable: true, desde: today.slice(0, 7), inicio: today }])
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
      <section className="grid gap-4" aria-label="Tus fechas">
        <SectionTitle icon="calendar-days" description="Cambia la fecha o el valor aquí mismo: se guarda al salir del campo.">Tus fechas importantes</SectionTitle>
        {rows.length > 0 && <ListToolbar c={ctl} placeholder="Buscar fecha" filters={filtros} sorts={ORDEN} />}
        {!rows.length ? (
          <Panel><EmptyState iso="calendario" title="Aún no tienes fechas importantes" description="Agrega las fechas importantes de Colombia: primas, cesantías, renta, predial, SOAT…" action={canEdit && <Button onClick={() => setTplOpen(true)}><Icon name="calendar-plus" /> Ver fechas de Colombia</Button>} /></Panel>
        ) : !vis.length ? <NoResults c={ctl} /> : groups.map((g) => (
          <Panel key={g} title={g === "todas" ? `Todas (${vis.length})` : <span className="capitalize">{monthName(+g.slice(5))} {g.slice(0, 4)}</span>} as="h3" className="gap-0">
            <div className="grid divide-y">
              {vis.filter((r) => g === "todas" || r.nx.startsWith(g)).map(({ e, nx, cat }) => { const E = est(e); return (
                <div key={e.id} className="grid gap-3 py-4 last:pb-0 md:grid-cols-[3.5rem_minmax(0,1fr)_auto]">
                  <Tip label={FCAT[cat].n}>
                    <div className="grid h-14 w-14 place-content-center rounded-xl text-center text-white shadow-card" style={{ background: FCAT[cat].color }}><b className="text-xl leading-6">{+nx.slice(8)}</b><span className="text-[10px] uppercase">{monthName(+nx.slice(5, 7), false)}</span></div>
                  </Tip>
                  <div className="grid min-w-0 gap-1">
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold"><span className="min-w-0 break-words">{e.titulo}</span><StatusPill tone="gray">{FCAT[cat].n}</StatusPill><StatusPill tone={e.tipo === "ingreso" ? "pagado" : "vencido"}>{e.tipo === "ingreso" ? "Te pagan" : "Pagas"}</StatusPill>{e.anual && <Tip label="Se repite cada año en la misma fecha."><span><StatusPill tone="info">Cada año</StatusPill></span></Tip>}</p>
                    <p className="text-sm text-muted-foreground">{rel(nx, today)}{e.nota && ` · ${e.nota}`} {e.fuente && <a href={e.fuente} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-link underline">Fuente <ExternalLink className="size-3" aria-hidden /><span className="sr-only">(se abre en otra pestaña)</span></a>}</p>
                    {E && !Number(e.monto) && <p className="text-sm"><Tip label="Calculado con tus datos. Escribe el valor real cuando lo sepas."><span><StatusPill tone="estimado">Estimado</StatusPill></span></Tip> <b data-money>{fmtMoney(E.v)}</b> <span className="text-muted-foreground">· {E.how}</span>{canEdit && E.v > 0 && <Button variant="link" size="sm" onClick={() => upd(e.id, { monto: Math.round(E.v) })}>Usar este valor</Button>}</p>}
                    {!canEdit && Number(e.monto) > 0 && <Money value={Number(e.monto)} className="font-semibold" />}
                  </div>
                  {canEdit && (
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 md:w-[26rem]">
                      <FormField label="Fecha" htmlFor={`fe-${e.id}`} tip={false}><DatePicker id={`fe-${e.id}`} value={e.fecha} onChange={(v) => v && upd(e.id, { fecha: v })} quick="ninguno" /></FormField>
                      <FormField label="Valor" htmlFor={`fv-${e.id}`} tip={false}><MoneyAutosave id={`fv-${e.id}`} value={Number(e.monto)} onSave={(v) => upd(e.id, { monto: v })} placeholder={E ? `Estimado ${new Intl.NumberFormat("es-CO").format(Math.round(E.v))}` : "0"} /></FormField>
                      <div className="flex h-11 items-center">
                        {e.tipo === "egreso" && <IconButton icon={<BellPlus />} label="Recordar como gasto fijo anual" aria-label={`Recordar ${e.titulo} como gasto fijo`} onClick={() => recordar(e, nx)} />}
                        <IconButton icon={<Trash2 />} destructive label="Eliminar" aria-label={`Eliminar ${e.titulo}`} onClick={() => del.mutate({ id: e.id, nombre: e.titulo })} />
                      </div>
                    </div>
                  )}
                </div>) })}
            </div>
          </Panel>
        ))}
      </section>
      <TemplatesDialog open={tplOpen} onOpenChange={setTplOpen} events={events} today={today} />
      <EventDialog open={nuevo} onOpenChange={(o) => !o && setNuevo(false)} />
    </div>
  )
}
