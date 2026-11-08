"use client"

import { useMemo } from "react"
import { parseAsString, useQueryState } from "nuqs"
import { Plus } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { EmptyState } from "@/components/mirai/empty-state"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { Icon } from "@/components/mirai/icon"
import { DataTable } from "@/components/mirai/data-table"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { initials } from "@/components/app/app-sidebar"
import { useCanEdit } from "@/components/app/app-context"
import { useIdParam, useNewParam } from "@/hooks/use-new-param"
import { cuotasDelMes, cuotasMes, esTipo, loanEngine, norm, loanName, loanStatus, loanTipo, loanTitulo, tipoDef, tiposDe, type LoanTipo, type Prenda } from "@/lib/domain"
import { fmtDate, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"
import { useBookData } from "@/features/book/use-book-data"
import { useProviders } from "@/features/catalogs/hooks"
import { avatarTone } from "@/features/contacts/contacts-view"
import { LoanDetail, type LoanRow } from "./loan-detail"
import { LoanForm, type LoanKind } from "./loan-form"

const HINT = {
  ok: "Ya está pagado por completo.", bad: "Hay cuotas cuya fecha ya pasó sin pago registrado.",
  warn: "La próxima cuota se acerca: te avisamos con anticipación.", info: "Va al día con las cuotas.",
} as const
type Item = { L: LoanRow; e: ReturnType<typeof loanEngine> }
type Grupo = { key: string; items: Item[] }
const RANK = { bad: 0, warn: 1, info: 2, ok: 3 } as const
const DOT = { ok: "bg-success", bad: "bg-danger", warn: "bg-warning", info: "bg-info" } as const
const DOT_TXT = { ok: "text-success", bad: "text-danger", warn: "text-warning", info: "text-muted-foreground" } as const

/** Agrupa conservando el orden (la primera deuda de cada grupo define su posición). */
function agrupar(list: Item[], key: (x: Item) => string): Grupo[] {
  const m = new Map<string, Item[]>()
  for (const x of list) { const k = key(x); m.set(k, [...(m.get(k) ?? []), x]) }
  return [...m].map(([k, items]) => ({ key: k, items }))
}

/** Pestañas con las deudas de una misma entidad o persona, encima del detalle. */
function DeudasTabs({ isC, grupo, sel, onSel, total, nombre }: { isC: boolean; grupo: Grupo; sel: string; onSel: (id: string) => void; total: number; nombre: string }) {
  return (
    <Card className="min-w-0 gap-2 p-3 shadow-card ring-0">
      <p className="px-1 text-sm text-muted-foreground"><b className="text-foreground">{grupo.items.length} {isC ? "préstamos" : "deudas"}</b> con {nombre} · {isC ? "te debe" : "debes"} <Money value={total} className="font-semibold text-foreground" /> en total</p>
      <div role="tablist" aria-label={isC ? "Préstamos de esta persona" : "Deudas con esta entidad"} className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {grupo.items.map((x) => {
          const on = x.L.id === sel
          const td = tipoDef(loanTipo(x.L))
          // Sin repetir el nombre (ya está arriba): "Crédito de vehículo · $ 20 M" o "Empeño: reloj".
          const pr = x.L.prenda as Prenda | null
          const label = loanTipo(x.L) === "empeno" && pr?.obj ? `Empeño: ${pr.obj}` : x.L.concepto?.trim() || td?.corto || (isC ? "Préstamo" : "Deuda")
          return (
            <button key={x.L.id} type="button" role="tab" aria-selected={on} onClick={() => onSel(x.L.id)}
              className={cn("grid max-w-60 shrink-0 gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors", on ? "border-brand bg-brand-soft" : "hover:bg-hover", x.e.done && "opacity-70")}>
              <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold"><Icon name={td?.icon ?? "landmark"} className="size-3.5 shrink-0" /><span className="truncate">{label}</span></span>
              <span className="text-xs text-muted-foreground">{x.e.done ? `Pagada · desde ${fmtDate(x.L.inicio)}` : <>Saldo <Money value={x.e.saldo} className="font-medium text-foreground" /> · {fmtDate(x.L.inicio)}</>}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

export function LoansView({ kind }: { kind: LoanKind }) {
  const isC = kind === "cobrar"
  const today = todayISO()
  const canEdit = useCanEdit()
  const [nuevo, setNuevo, nuevoV] = useNewParam()
  const [id, setId] = useIdParam()
  const [cid] = useQueryState("cid", parseAsString)
  const [prov, setProv] = useQueryState("prov", parseAsString)
  const { data: providers = [] } = useProviders()
  // Enlaces que abren un tipo ya escogido: ?nuevo=1&empeno=1 (los de antes), ?nuevo=1&tipo=fiado o ?nuevo=empeno.
  const [tipoQ, setTipoQ] = useQueryState("tipo", parseAsString)
  const [empenoQ, setEmpenoQ] = useQueryState("empeno", parseAsString)
  const tipoIni: LoanTipo | null = esTipo(tipoQ, kind) ? tipoQ : empenoQ && !isC ? "empeno" : esTipo(nuevoV, kind) ? nuevoV : null
  const { data: book, isPending } = useBookData()

  const list = useMemo(() => {
    if (!book) return []
    return (book.loans.filter((L) => L.kind === kind) as unknown as LoanRow[]).map((L) => ({ L, e: loanEngine(L, today) }))
      .sort((a, b) => Number(a.e.done) - Number(b.e.done) || b.e.mora - a.e.mora)
  }, [book, kind, today])
  if (isPending || !book) return <PageSkeleton kpis={3} />
  const contacts = book.contacts as unknown as Row<"contacts">[]
  const entities = book.entities as unknown as Row<"entities">[]
  const anticipo = book.settings.anticipo
  const sel = list.find((x) => x.L.id === id) ?? list[0]
  const total = list.reduce((a, x) => a + x.e.saldo, 0)
  const atrasados = list.filter((x) => x.e.mora > 0).length
  const nameOf = (x: Item) => loanName(x.L, contacts, entities)
  const provOf = (x: Item) => providers.find((p) => p.id === (x.L as { provider_id?: string | null }).provider_id)
  const tipoOf = (x: Item) => loanTipo(x.L)
  const tituloOf = (x: Item) => loanTitulo(tipoOf(x), nameOf(x), { concepto: x.L.concepto, prenda: x.L.prenda as Prenda | null })
  // Las deudas con la misma entidad, persona o proveedor van juntas: una tarjeta a la izquierda y una pestaña por deuda.
  const groups = agrupar(list, (x) => x.L.provider_id ? `p:${x.L.provider_id}` : x.L.entity_id ? `e:${x.L.entity_id}` : x.L.contact_id ? `c:${x.L.contact_id}` : `n:${norm(nameOf(x))}`)
  const selG = groups.find((g) => g.items.some((x) => x.L.id === sel?.L.id))
  const statusG = (g: Grupo) => g.items.map((x) => loanStatus(x.e, today, anticipo)).sort((a, b) => RANK[a[0]] - RANK[b[0]])[0]
  const saldoG = (g: Grupo) => g.items.reduce((a, x) => a + x.e.saldo, 0)
  const proxG = (g: Grupo) => g.items.filter((x) => !x.e.done).map((x) => x.e.vencidas[0] ?? x.e.next).filter(Boolean).sort((a, b) => (a!.fecha < b!.fecha ? -1 : 1))[0]
  const progG = (g: Grupo) => { const m = g.items.reduce((a, x) => a + Number(x.L.monto), 0); return m ? g.items.reduce((a, x) => a + x.e.progreso * Number(x.L.monto), 0) / m : 0 }

  return (
    <div className="grid gap-6">
      <PageHeader id={kind === "cobrar" ? "me-deben" : "le-debo"}
        description={isC ? "Personas o clientes que te deben dinero. Registra cada pago, sea la cuota exacta o un abono." : "Créditos con bancos y deudas con personas. Registra cada pago y mira cuánto te falta."}
        actions={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> {isC ? "Nuevo préstamo" : "Nueva deuda"}</Button>} />
      <KpiGrid cols={3}>
        <Kpi icon={isC ? "hand-coins" : "landmark"} tone={isC ? "income" : "expense"} label={isC ? "Total que te deben" : "Total que debes"} value={<Money value={total} />} sub={`${list.length} ${isC ? "préstamo" : "deuda"}${list.length === 1 ? "" : "s"}`} />
        <Kpi icon="calendar-clock" tone="amber" label="Cuotas de este mes" value={<Money value={cuotasDelMes(book.loans, kind, today)} />} sub={<>{isC ? "Lo que te toca recibir" : "Lo que te toca pagar"} · al mes en promedio <Money value={cuotasMes(book.loans, kind, today)} short /></>}
          info="Este mes: las cuotas que el plan de cada préstamo pone en este mes (un pago único solo cuenta el mes en que vence). En promedio: lo que pesan al mes, repartiendo los pagos únicos entre los meses que faltan." />
        <Kpi icon="circle-alert" tone={atrasados ? "red" : "green"} label="Atrasados" value={atrasados} valueClassName={atrasados ? "text-danger" : "text-success"} sub={atrasados ? (isC ? "Préstamos con pagos atrasados" : "Deudas en mora") : "Ninguno"} />
      </KpiGrid>
      {!list.length ? (
        <Card className="shadow-card ring-0"><EmptyState iso={isC ? "me-deben" : "le-debo"} title={isC ? "Aún no registras préstamos" : "Aún no registras deudas"}
          description={isC ? "Registra a quién le prestaste dinero y lleva el control de cada pago." : "Registra tus créditos y deudas para saber cuánto debes y cuándo pagar."}
          action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> {isC ? "Nuevo préstamo" : "Nueva deuda"}</Button>} /></Card>
      ) : (
        // minmax(0,…): la columna del detalle no se estira con la tabla de cuotas (antes empujaba y cortaba la lista).
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]">
          <Card className="min-w-0 gap-0 p-0 shadow-card ring-0">
            <DataTable<Grupo>
              bare narrow listClassName="grid gap-1 px-2 pb-3" title={isC ? "Quién me debe" : "A quién le debo"} data={groups} rowKey={(g) => g.key} noun={isC ? ["persona", "personas"] : ["acreedor", "acreedores"]} exportName={isC ? "me-deben" : "le-debo"}
              total={{ value: saldoG, label: isC ? "te deben" : "debes" }}
              columns={[
                { id: "nombre", header: "Nombre", sort: (g) => nameOf(g.items[0]).toLowerCase(), csv: (g) => nameOf(g.items[0]) },
                { id: "deudas", header: isC ? "Préstamos" : "Deudas", sort: (g) => g.items.length, csv: (g) => g.items.length },
                { id: "saldo", header: "Saldo", sort: saldoG, csv: (g) => Math.round(saldoG(g)) },
                { id: "proxima", header: "Próxima cuota", sort: (g) => proxG(g)?.fecha ?? "9999", csv: (g) => proxG(g)?.fecha ?? "" },
                { id: "cuota", header: "Valor de la cuota", csv: (g) => Math.round(proxG(g)?.valor ?? 0) },
                { id: "tipo", header: "Tipo", csv: (g) => [...new Set(g.items.map((x) => tipoDef(tipoOf(x))?.label ?? ""))].join(", ") },
                { id: "estado", header: "Estado", csv: (g) => statusG(g)[1] },
              ]}
              search={{ placeholder: "Buscar", text: (g) => g.items.map((x) => `${nameOf(x)} ${x.L.concepto ?? ""} ${provOf(x)?.nombre ?? ""} ${tituloOf(x)}`).join(" ") }}
              initialView={list.some((x) => !x.e.done) ? "activos" : "todos"}
              views={[
                { id: "todos", label: "Todos" },
                { id: "activos", label: "Activos", match: (g) => g.items.some((x) => !x.e.done) },
                { id: "atrasados", label: "Atrasados", match: (g) => g.items.some((x) => x.e.mora > 0 && !x.e.done), hint: "Tienen cuotas cuya fecha ya pasó sin pago registrado." },
                { id: "pagados", label: "Pagados", match: (g) => g.items.every((x) => x.e.done) },
              ]}
              filters={[
                { id: "tipo", label: "Tipo", options: tiposDe(kind).map((t) => ({ value: t.value, label: t.label })), match: (g, v) => g.items.some((x) => tipoOf(x) === v) },
                { id: "con", label: isC ? "Quién" : "Con quién", options: [...(!isC ? [{ value: "ent", label: "Bancos y entidades" }] : []), { value: "ct", label: "Personas" }, { value: "prov", label: "Proveedores" }], match: (g, v) => { const x = g.items[0]; return v === "ent" ? !!x.L.entity_id : v === "ct" ? !!x.L.contact_id : !!provOf(x) } },
                { id: "prenda", label: "Garantía", options: [{ value: "si", label: "Con objeto en garantía (empeño)" }, { value: "no", label: "Sin garantía" }], match: (g, v) => g.items.some((x) => (v === "si") === !!x.L.prenda) },
                { id: "saldo", label: "Saldo", kind: "range", money: true, value: saldoG },
              ]}
              item={(g) => {
                const x = g.items[0]
                const nm = nameOf(x)
                const [st, txt] = statusG(g)
                const pv = provOf(x)
                const on = selG?.key === g.key
                const n = g.items.length
                const tp = tipoOf(x), td = tipoDef(tp)
                const pr = x.L.prenda as Prenda | null
                const prox = proxG(g)
                // Una sola deuda: "Crédito · Vehículo" o "Empeño: reloj"; varias: "3 deudas · Empeño, Crédito".
                const sub = n > 1 ? `${n} ${isC ? "préstamos" : "deudas"} · ${[...new Set(g.items.map((y) => tipoDef(tipoOf(y))?.corto).filter(Boolean))].join(", ")}`
                  : tp === "empeno" ? tituloOf(x) + (pr?.limite && !x.e.done ? ` · hasta el ${fmtDate(pr.limite)}` : "")
                  : [td?.corto, x.L.concepto && x.L.concepto !== td?.corto ? x.L.concepto : ""].filter(Boolean).join(" · ")
                const prog = progG(g)
                return (
                  <li key={g.key}>
                    {/* Tarjeta compacta: nombre y saldo arriba, tipo y estado abajo. La seleccionada lleva franja de color. */}
                    <button type="button" onClick={() => setId((g.items.find((y) => !y.e.done) ?? x).L.id)} aria-current={on || undefined}
                      className={cn("relative grid w-full grid-cols-[minmax(0,1fr)] gap-2 overflow-hidden rounded-lg px-3 py-2.5 text-left transition-colors", on ? "bg-brand-soft" : "hover:bg-hover")}>
                      {on && <span aria-hidden className={cn("absolute inset-y-2 left-0 w-1 rounded-r-full", isC ? "bg-forest" : "bg-expense")} />}
                      <span className="flex items-center gap-2.5">
                        {x.L.contact_id && !pv ? <Avatar className="size-9 shrink-0"><AvatarFallback className={cn("bg-gradient-to-br text-xs text-white", avatarTone(nm))}>{initials(nm)}</AvatarFallback></Avatar>
                          : <EntityLogo name={nm} provider={pv} icon={td?.icon ?? "landmark"} seed={nm} size={36} />}
                        <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2">
                          <span className="truncate text-sm font-semibold" title={nm}>{nm}</span>
                          <span className={cn("flex items-center gap-1 justify-self-end text-[11px] font-medium whitespace-nowrap", DOT_TXT[st])} title={HINT[st]}>
                            <span aria-hidden className={cn("size-1.5 rounded-full", DOT[st])} />{txt}
                          </span>
                          <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground" data-testid="loan-tipo">
                            <Icon name={n > 1 ? "layers" : td?.icon ?? "landmark"} className={cn("size-3 shrink-0", tp === "gota" && n === 1 && "text-danger")} /><span className="truncate">{sub}</span>
                          </span>
                          <Money value={saldoG(g)} className="justify-self-end text-sm font-bold tabular-nums" />
                        </span>
                      </span>
                      {prog < 1 && (
                        <span className="flex items-center gap-2 pl-[46px] text-[11px] text-muted-foreground">
                          <Progress value={prog * 100} className={cn("h-1 flex-1", isC ? "[&>div]:bg-forest" : "[&>div]:bg-expense")} aria-label={`${Math.round(prog * 100)} % pagado`} />
                          {prox ? <span className="shrink-0">{fmtDate(prox.fecha)}</span> : <span className="shrink-0">{Math.round(prog * 100)} %</span>}
                        </span>
                      )}
                    </button>
                  </li>
                )
              }}
            />
          </Card>
          {sel && (
            <div className="grid min-w-0 gap-3">
              {selG && selG.items.length > 1 && (
                <DeudasTabs isC={isC} grupo={selG} sel={sel.L.id} onSel={setId} total={saldoG(selG)} nombre={nameOf(selG.items[0])} />
              )}
              <LoanDetail key={sel.L.id} loan={sel.L} contacts={contacts} entities={entities} anticipo={anticipo} onDeleted={() => setId(null)} />
            </div>
          )}
        </div>
      )}
      <LoanForm kind={kind} open={nuevo} tipo={tipoIni} contactId={cid} providerId={prov} onSaved={(x) => setId(x)}
        onOpenChange={(o) => { if (!o) { setNuevo(false); if (prov) setProv(null); if (tipoQ) setTipoQ(null); if (empenoQ) setEmpenoQ(null) } }} />
    </div>
  )
}
