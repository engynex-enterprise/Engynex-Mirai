"use client"

import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Lightbulb, Plus } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { MoneyInput } from "@/components/mirai/money-input"
import { DatePicker } from "@/components/mirai/date-picker"
import { Combobox } from "@/components/mirai/combobox"
import { ChoiceCards, Segmented } from "@/components/mirai/choice-cards"
import { FormField, InfoTip } from "@/components/mirai/field"
import { EmptyState } from "@/components/mirai/empty-state"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { IconAction } from "@/components/mirai/list-row"
import { StatusPill } from "@/components/mirai/status-pill"
import { SubmitButton } from "@/components/mirai/submit-button"
import { DataTable, catalogMatch, catalogOptions } from "@/components/mirai/data-table"
import { brandFor } from "@/lib/brands"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook, useSave, useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { apiUpdateRow } from "@/lib/api/book-rows"
import { conv, inv, type InvestmentIn } from "@/lib/domain"
import { fmtDate, fmtMoney, fmtPct, todayISO } from "@/lib/format"
import INVT_RAW from "@/lib/data/legacy-invt.json"
import type { Row } from "@/lib/supabase/tables"
import { useBookData } from "@/features/book/use-book-data"
import { CURRENCY_OPTIONS, entityOptions, useEntities } from "@/features/catalogs/hooks"

const INVT = INVT_RAW as Record<string, { l: string; icon: string; ib: string; d: string }>
const GLOSARIO = [
  ["E.A. (efectiva anual)", "Lo que gana tu dinero en un año completo. Si te dicen 9% E.A., por cada $1.000.000 ganas unos $90.000 al año."],
  ["Plazo", "El tiempo que tu dinero queda guardado. En un CDT no lo puedes sacar antes."],
  ["Retención en la fuente", "Un descuento del 4% sobre lo que ganas que el banco le entrega a la DIAN."],
  ["Renovar", "Cuando el CDT vence, puedes volver a invertir el dinero en otro CDT."],
  ["Riesgo", "Qué tan posible es que pierdas plata. CDT y cuentas de ahorro: bajo. Acciones y cripto: alto."],
]
const UNIT = { dias: 1, semanas: 7, meses: 30, anos: 365 } as const
/** Color de referencia de cada tipo (para el ícono cuando la entidad no tiene logo). */
const TONE_HEX: Record<string, string> = { "t-blue": "#1B7FCC", "t-green": "#2E9E5B", "t-violet": "#7A4BE0", "t-amber": "#C99400", "t-red": "#D0243F", "t-gray": "#5A6C9E" }
type Inv = { x: Row<"investments">; v: ReturnType<typeof inv> }

function InvestmentForm({ open, onOpenChange, x }: { open: boolean; onOpenChange: (o: boolean) => void; x?: Row<"investments"> | null }) {
  return <ResponsiveDialog open={open} onOpenChange={onOpenChange} wide mdesc="inversion" title={x ? "Editar inversión" : "Agregar inversión"}>{open && <InvBody x={x} onOpenChange={onOpenChange} />}</ResponsiveDialog>
}
function InvBody({ x, onOpenChange }: { x?: Row<"investments"> | null; onOpenChange: (o: boolean) => void }) {
  const save = useSave("investments")
  const { data: entities = [] } = useEntities()
  const today = todayISO()
  const [tipo, setTipo] = useState(x?.tipo ?? "cdt")
  const [nombre, setNombre] = useState(x?.nombre ?? "")
  const [entity, setEntity] = useState<string | null>(x?.entity_id ?? null)
  const [capital, setCapital] = useState(Number(x?.capital ?? 0))
  const [inicio, setInicio] = useState(x?.inicio ?? today)
  const [tasa, setTasa] = useState(String(x?.tasa ?? "").replace(".", ","))
  const [plazoN, setPlazoN] = useState(String(x?.dias ? Math.round(x.dias / 30) : 6))
  const [plazoU, setPlazoU] = useState<keyof typeof UNIT>("meses")
  const [currency, setCurrency] = useState(x?.currency ?? "COP")
  const [actual, setActual] = useState(Number(x?.actual ?? 0))
  const submit = async () => {
    if (!nombre.trim()) return toast.error("Escribe el nombre")
    if (!capital) return toast.error("Escribe cuánto invertiste")
    const dias = tipo === "cdt" ? Math.max(1, Math.round((+plazoN || 0) * UNIT[plazoU])) : null
    await save.mutateAsync({ ...(x ? { id: x.id } : {}), tipo, nombre: nombre.trim(), entity_id: entity, capital, inicio, currency,
      tasa: tipo === "cdt" || tipo === "ahorro" ? +tasa.replace(",", ".") || 0 : 0, dias, ret: tipo === "cdt" ? 4 : 0, actual: tipo !== "cdt" && tipo !== "ahorro" ? actual || capital : null } as never)
    toast.success(x ? "Inversión actualizada" : "Inversión agregada")
    onOpenChange(false)
  }
  return (
    <FieldGroup className="pb-2">
      <ChoiceCards value={tipo} onChange={setTipo} cols={3} items={Object.entries(INVT).map(([k, t]) => ({ value: k, label: t.l, desc: t.d, icon: t.icon }))} />
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Nombre" htmlFor="in-n" required><Input id="in-n" className="h-11" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. CDT 180 días" /></FormField>
        <FormField label="Entidad" htmlFor="in-e"><Combobox id="in-e" value={entity} onChange={setEntity} options={entityOptions(entities)} /></FormField>
        <FormField label="¿Cuánto invertiste?" htmlFor="in-c" required><MoneyInput id="in-c" value={capital} onChange={setCapital} currency={currency} /></FormField>
        <FormField label="Moneda" htmlFor="in-m"><Combobox id="in-m" value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} /></FormField>
        <FormField label="¿Desde cuándo?" htmlFor="in-i"><DatePicker id="in-i" value={inicio} onChange={(v) => setInicio(v ?? today)} /></FormField>
        {(tipo === "cdt" || tipo === "ahorro") && <FormField label="Tasa E.A. (%)" htmlFor="in-t" tip="Efectiva anual: lo que gana tu dinero en un año completo."><Input id="in-t" className="h-11" inputMode="decimal" value={tasa} onChange={(e) => setTasa(e.target.value)} /></FormField>}
        {tipo === "cdt" && (
          <FormField label="Plazo" htmlFor="in-p" className="sm:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input id="in-p" className="h-11 w-24" type="number" min={1} value={plazoN} onChange={(e) => setPlazoN(e.target.value)} />
              <Segmented value={plazoU} onChange={(v) => setPlazoU(v as keyof typeof UNIT)} items={[{ value: "dias", label: "Días" }, { value: "semanas", label: "Semanas" }, { value: "meses", label: "Meses" }, { value: "anos", label: "Años" }]} />
              <Segmented value={`${plazoN}${plazoU}`} onChange={(v) => { const m = v.match(/^(\d+)(\w+)$/)!; setPlazoN(m[1]); setPlazoU(m[2] as keyof typeof UNIT) }} items={[["3", "meses", "3 m"], ["6", "meses", "6 m"], ["1", "anos", "1 año"], ["18", "meses", "18 m"], ["2", "anos", "2 años"]].map(([n, u, l]) => ({ value: `${n}${u}`, label: l }))} />
            </div>
          </FormField>
        )}
        {tipo !== "cdt" && tipo !== "ahorro" && <FormField label="¿Cuánto vale hoy?" htmlFor="in-a"><MoneyInput id="in-a" value={actual} onChange={setActual} currency={currency} /></FormField>}
      </div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!nombre.trim() || !(capital > 0)} loading={save.isPending} onClick={submit} /></div>
    </FieldGroup>
  )
}

export function InvestmentsView() {
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const today = todayISO()
  const [nuevo, setNuevo] = useNewParam()
  const [editing, setEditing] = useState<Row<"investments"> | null>(null)
  const [sim, setSim] = useState({ c: 5000000, t: "10", d: "180" })
  const { data: book, isPending } = useBookData()
  const del = useSoftDelete("investments", "Inversión eliminada")
  const rows: Inv[] = useMemo(() => (book?.investments ?? []).map((x) => ({ x: x as unknown as Row<"investments">, v: inv(x as InvestmentIn, today) })), [book, today])
  if (isPending || !book) return <PageSkeleton kpis={3} />
  const trm = book.settings.trm
  const entName = (x: Row<"investments">) => book.entities.find((e) => e.id === x.entity_id)?.nombre ?? ""
  const puesto = rows.reduce((a, r) => a + conv(Number(r.x.capital), r.x.currency, trm), 0)
  const vale = rows.reduce((a, r) => a + conv(r.v.valor, r.x.currency, trm), 0)
  const prox = rows.filter((r) => r.v.venc && r.v.venc >= today).sort((a, b) => a.v.venc!.localeCompare(b.v.venc!))[0]
  const setActual = async (id: string, v: number) => {
    await apiUpdateRow(bookId, "investments", id, { actual: v })
    invalidateBook(qc, bookId, "investments")
  }
  const sv = (() => { const c = sim.c, t = +sim.t.replace(",", ".") / 100, d = +sim.d; const b = c * (Math.pow(1 + t, d / 365) - 1); return { final: c + b * 0.96, gan: b * 0.96, ret: b * 0.04 } })()

  return (
    <div className="grid gap-6">
      <PageHeader id="inversiones" description="Mira cuánto está creciendo tu dinero, explicado sin palabras raras." actions={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar inversión</Button>} />
      <KpiGrid cols={3}>
        <Kpi icon="trending-up" tone="income" label="Tu dinero invertido vale hoy" value={<Money value={vale} />} sub={<>Pusiste <Money value={puesto} /></>} />
        <Kpi icon="sparkles" tone={vale >= puesto ? "green" : "red"} label="Has ganado" value={<Money value={vale - puesto} />} valueClassName={vale >= puesto ? "text-success" : "text-danger"} sub={`${fmtPct(puesto ? ((vale - puesto) / puesto) * 100 : 0, 1)} sobre lo que pusiste`} />
        <Kpi icon="calendar-clock" tone="amber" label="Próximo vencimiento" value={prox ? fmtDate(prox.v.venc) : "—"} sub="Te avisamos 10 días antes" />
      </KpiGrid>
      <DataTable<Inv>
        bare title="Tus inversiones" info="CDT, cuentas que rinden, fondos, acciones o cripto. Mira cuánto vale hoy cada una."
        data={rows} rowKey={(r) => r.x.id} noun={["inversión", "inversiones"]} exportName="inversiones" listClassName="grid gap-6 lg:grid-cols-2"
        total={{ value: (r) => conv(r.v.valor, r.x.currency, trm), label: "valen hoy" }}
        columns={[
          { id: "nombre", header: "Inversión", sort: (r) => r.x.nombre.toLowerCase(), csv: (r) => r.x.nombre },
          { id: "tipo", header: "Tipo", csv: (r) => (INVT[r.x.tipo] ?? INVT.otro).l },
          { id: "entidad", header: "Entidad", csv: (r) => entName(r.x) },
          { id: "capital", header: "Pusiste", sort: (r) => conv(Number(r.x.capital), r.x.currency, trm), csv: (r) => Number(r.x.capital) },
          { id: "valor", header: "Vale hoy", sort: (r) => conv(r.v.valor, r.x.currency, trm), csv: (r) => Math.round(r.v.valor) },
          { id: "ganancia", header: "Ganancia", sort: (r) => conv(r.v.valor - Number(r.x.capital), r.x.currency, trm), csv: (r) => Math.round(r.v.valor - Number(r.x.capital)) },
          { id: "venc", header: "Vencimiento", sort: (r) => r.v.venc ?? "9999", csv: (r) => r.v.venc ?? "" },
          { id: "moneda", header: "Moneda", csv: (r) => r.x.currency },
        ]}
        initialSort={{ id: "valor", dir: "desc" }}
        search={{ placeholder: "Buscar inversión", text: (r) => `${r.x.nombre} ${(INVT[r.x.tipo] ?? INVT.otro).l} ${entName(r.x)}` }}
        filters={[
          { id: "tipo", label: "Tipo", options: Object.entries(INVT).filter(([k]) => rows.some((r) => r.x.tipo === k)).map(([value, t]) => ({ value, label: t.l })), match: (r, v) => r.x.tipo === v },
          { id: "entidad", label: "Entidad", options: catalogOptions(rows, book.entities as never, (r) => r.x.entity_id, "Sin entidad"), match: catalogMatch((r) => r.x.entity_id) },
          { id: "moneda", label: "Moneda", options: [...new Set(rows.map((r) => r.x.currency))].map((c) => ({ value: c, label: c === "COP" ? "Pesos (COP)" : c })), match: (r, v) => r.x.currency === v },
          { id: "venc", label: "Vencimiento", kind: "dates", value: (r) => r.v.venc },
        ]}
        emptyState={<Card className="shadow-card ring-0"><EmptyState iso="inversiones" title="Aún no registras inversiones" description="CDT, cuentas que rinden, fondos, acciones o cripto." action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar inversión</Button>} /></Card>}
        item={({ x, v }) => {
            const t = INVT[x.tipo] ?? INVT.otro
            return (
              <li key={x.id} className="grid"><Card className="h-full gap-4 p-5 shadow-card ring-0">
                <div className="flex items-center gap-3">
                  <EntityLogo brand={brandFor(entName(x))} icon={t.icon} color={TONE_HEX[t.ib]} size={44} />
                  <div className="grid flex-1"><b className="text-lg">{x.nombre}</b><span className="text-sm text-muted-foreground">{t.l}{x.entity_id && ` · ${entName(x)}`}</span></div>
                  {x.tipo === "cdt" && v.venc && v.venc >= today && v.rest != null && v.rest <= 10 && <StatusPill tone="porVencer" hint="El CDT vence pronto: decide si lo renuevas o lo retiras.">vence pronto</StatusPill>}
                  {x.tipo === "cdt" && v.venc && v.venc < today && <StatusPill tone="vencido" hint="El CDT ya venció. Decide si lo renuevas o retiras el dinero.">vencido</StatusPill>}
                  {canEdit && <><IconAction a={{ label: `Editar ${x.nombre}`, tip: "Editar", icon: "pencil", onClick: () => setEditing(x) }} /><IconAction a={{ label: `Eliminar ${x.nombre}`, tip: "Eliminar", icon: "trash-2", destructive: true, onClick: () => del.mutate(x) }} /></>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">Pusiste</p><Money value={Number(x.capital)} currency={x.currency} className="font-semibold" /></div>
                  <div className="rounded-md bg-success-soft p-3"><p className="text-xs text-muted-foreground">Vale hoy</p><Money value={v.valor} currency={x.currency} className="font-semibold text-success" /></div>
                </div>
                {x.tipo === "cdt" && (
                  <div className="grid gap-2 text-sm">
                    <Progress value={(v.prog ?? 0) * 100} className="h-2 [&>div]:bg-info" />
                    <p>{v.rest ? `Faltan ${v.rest} días · vence el ${fmtDate(v.venc)}` : "¡Ya venció! Decide si lo renuevas o retiras."}</p>
                    <p>Al final recibirás <b>{fmtMoney(v.final ?? 0)}</b>: ganas {fmtMoney(v.bruto)} y el banco descuenta {fmtMoney(v.ret)} de retención en la fuente <InfoTip text="Es un impuesto que el banco cobra por adelantado sobre lo que ganas: 4% de los rendimientos. Lo puedes descontar en tu declaración de renta." /></p>
                    <p className="text-muted-foreground">Equivale a unos {fmtMoney(v.mes ?? 0)} por mes · tasa {fmtPct(Number(x.tasa), 2)} E.A.</p>
                  </div>
                )}
                {x.tipo === "ahorro" && <p className="text-sm">Llevas ganados <b>{fmtMoney(v.ganHoy)}</b>. Al {fmtPct(Number(x.tasa), 2)} E.A. tu plata crece unos {fmtMoney(v.mes ?? 0)} al mes y la puedes retirar cuando quieras.</p>}
                {x.tipo !== "cdt" && x.tipo !== "ahorro" && (
                  <div className="grid gap-2 text-sm">
                    <p>{(v.rent ?? 0) >= 0 ? "Ha subido" : "Ha bajado"} <b>{fmtPct(Math.abs((v.rent ?? 0) * 100), 1)}</b> desde que invertiste. Actualiza el valor cuando revises tu extracto.</p>
                    {canEdit && <ActualEditor value={Number(x.actual ?? x.capital)} currency={x.currency} onSave={(val) => setActual(x.id, val)} />}
                  </div>
                )}
              </Card></li>
            )
        }}
      />
      <Card className="shadow-card ring-0">
        <CardHeader><CardTitle className="text-base">¿Cuánto ganaría en un CDT?</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Si pongo" htmlFor="sim-c"><MoneyInput id="sim-c" value={sim.c} onChange={(c) => setSim((s) => ({ ...s, c }))} /></FormField>
            <FormField label="A una tasa E.A. de (%)" htmlFor="sim-t"><Input id="sim-t" className="h-11" inputMode="decimal" value={sim.t} onChange={(e) => setSim((s) => ({ ...s, t: e.target.value }))} /></FormField>
            <FormField label="Por (días)" htmlFor="sim-d"><Combobox id="sim-d" value={sim.d} onChange={(d) => setSim((s) => ({ ...s, d }))} options={[30, 60, 90, 180, 360, 540, 720].map((d) => ({ value: String(d), label: `${d} días` }))} /></FormField>
          </div>
          <div className="rounded-lg border-l-4 border-lime bg-brand-soft p-4"><p>Al final recibirías <b className="text-lg"><Money value={sv.final} /></b></p><p className="text-sm text-muted-foreground">Ganas {fmtMoney(sv.gan)} después de la retención ({fmtMoney(sv.ret)}).</p></div>
        </CardContent>
      </Card>
      <Card className="shadow-card ring-0">
        <CardHeader><CardTitle className="text-base">Palabras que vas a escuchar</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {GLOSARIO.map(([t, d]) => <div key={t} className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-info-soft text-info"><Lightbulb className="size-4" /></span><div><b>{t}</b><p className="text-sm text-muted-foreground">{d}</p></div></div>)}
        </CardContent>
      </Card>
      <InvestmentForm open={nuevo || !!editing} onOpenChange={(o) => { if (!o) { setNuevo(false); setEditing(null) } }} x={editing} />
    </div>
  )
}

function ActualEditor({ value, currency, onSave }: { value: number; currency: string; onSave: (v: number) => void }) {
  const [v, setV] = useState(value)
  return (
    <div className="flex items-end gap-2">
      <FormField label="¿Cuánto vale hoy?" className="flex-1"><MoneyInput value={v} onChange={setV} currency={currency} /></FormField>
      <Button variant="soft" className="h-11" disabled={v === value} onClick={() => { onSave(v); toast.success("Valor actualizado") }}>Actualizar</Button>
    </div>
  )
}
