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
import { StatusPill } from "@/components/mirai/status-pill"
import { EmptyState } from "@/components/mirai/empty-state"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { Icon } from "@/components/mirai/icon"
import { DataTable } from "@/components/mirai/data-table"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { initials } from "@/components/app/app-sidebar"
import { useCanEdit } from "@/components/app/app-context"
import { useIdParam, useNewParam } from "@/hooks/use-new-param"
import { cuotasMes, esTipo, loanEngine, loanName, loanStatus, loanTipo, loanTitulo, tipoDef, tiposDe, type LoanTipo, type Prenda } from "@/lib/domain"
import { fmtDate, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"
import { useBookData } from "@/features/book/use-book-data"
import { useProviders } from "@/features/catalogs/hooks"
import { avatarTone } from "@/features/contacts/contacts-view"
import { LoanDetail, type LoanRow } from "./loan-detail"
import { LoanForm, type LoanKind } from "./loan-form"

const PILL = { ok: "pagado", bad: "vencido", warn: "porVencer", info: "info" } as const
const HINT = {
  ok: "Ya está pagado por completo.", bad: "Hay cuotas cuya fecha ya pasó sin pago registrado.",
  warn: "La próxima cuota se acerca: te avisamos con anticipación.", info: "Va al día con las cuotas.",
} as const
type Item = { L: LoanRow; e: ReturnType<typeof loanEngine> }

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

  return (
    <div className="grid gap-6">
      <PageHeader id={kind === "cobrar" ? "me-deben" : "le-debo"}
        description={isC ? "Personas o clientes que te deben dinero. Registra cada pago, sea la cuota exacta o un abono." : "Créditos con bancos y deudas con personas. Registra cada pago y mira cuánto te falta."}
        actions={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> {isC ? "Nuevo préstamo" : "Nueva deuda"}</Button>} />
      <KpiGrid cols={3}>
        <Kpi icon={isC ? "hand-coins" : "landmark"} tone={isC ? "income" : "expense"} label={isC ? "Total que te deben" : "Total que debes"} value={<Money value={total} />} sub={`${list.length} ${isC ? "préstamo" : "deuda"}${list.length === 1 ? "" : "s"}`} />
        <Kpi icon="calendar-clock" tone="amber" label="Cuotas al mes" value={<Money value={cuotasMes(book.loans, kind, today)} />} sub={isC ? "Lo que deberías recibir" : "Lo que debes pagar"} />
        <Kpi icon="circle-alert" tone={atrasados ? "red" : "green"} label="Atrasados" value={atrasados} valueClassName={atrasados ? "text-danger" : "text-success"} sub={atrasados ? (isC ? "Personas con pagos atrasados" : "Deudas en mora") : "Ninguno"} />
      </KpiGrid>
      {!list.length ? (
        <Card className="shadow-card ring-0"><EmptyState iso={isC ? "me-deben" : "le-debo"} title={isC ? "Aún no registras préstamos" : "Aún no registras deudas"}
          description={isC ? "Registra a quién le prestaste dinero y lleva el control de cada pago." : "Registra tus créditos y deudas para saber cuánto debes y cuándo pagar."}
          action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> {isC ? "Nuevo préstamo" : "Nueva deuda"}</Button>} /></Card>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(260px,0.75fr)_2fr]">
          <Card className="gap-0 p-0 shadow-card ring-0">
            <DataTable<Item>
              bare narrow listClassName="grid gap-1.5 px-2 pb-3" title={isC ? "Quién me debe" : "A quién le debo"} data={list} rowKey={(x) => x.L.id} noun={isC ? ["préstamo", "préstamos"] : ["deuda", "deudas"]} exportName={isC ? "me-deben" : "le-debo"}
              total={{ value: (x) => x.e.saldo, label: isC ? "te deben" : "debes" }}
              columns={[
                { id: "nombre", header: "Nombre", sort: (x) => nameOf(x).toLowerCase(), csv: nameOf },
                { id: "saldo", header: "Saldo", sort: (x) => x.e.saldo, csv: (x) => Math.round(x.e.saldo) },
                { id: "proxima", header: "Próxima cuota", sort: (x) => (x.e.done ? "9999" : x.e.next?.fecha ?? "9999"), csv: (x) => x.e.next?.fecha ?? "" },
                { id: "cuota", header: "Valor de la cuota", csv: (x) => Math.round(x.e.next?.valor ?? 0) },
                { id: "tipo", header: "Tipo", sort: (x) => tipoDef(tipoOf(x))?.corto ?? "", csv: (x) => tipoDef(tipoOf(x))?.label ?? "" },
                { id: "concepto", header: "Concepto", csv: (x) => x.L.concepto },
                { id: "estado", header: "Estado", csv: (x) => loanStatus(x.e, today, anticipo)[1] },
              ]}
              search={{ placeholder: "Buscar", text: (x) => `${nameOf(x)} ${x.L.concepto ?? ""} ${provOf(x)?.nombre ?? ""} ${tituloOf(x)}` }}
              initialView={list.some((x) => !x.e.done) ? "activos" : "todos"}
              views={[
                { id: "todos", label: "Todos" },
                { id: "activos", label: "Activos", match: (x) => !x.e.done },
                { id: "atrasados", label: "Atrasados", match: (x) => x.e.mora > 0 && !x.e.done, hint: "Tienen cuotas cuya fecha ya pasó sin pago registrado." },
                { id: "pagados", label: "Pagados", match: (x) => x.e.done },
              ]}
              filters={[
                { id: "tipo", label: "Tipo", options: tiposDe(kind).map((t) => ({ value: t.value, label: t.label })), match: (x, v) => tipoOf(x) === v },
                { id: "con", label: isC ? "Quién" : "Con quién", options: [...(!isC ? [{ value: "ent", label: "Bancos y entidades" }] : []), { value: "ct", label: "Personas" }, { value: "prov", label: "Proveedores" }], match: (x, v) => (v === "ent" ? !!x.L.entity_id : v === "ct" ? !!x.L.contact_id : !!provOf(x)) },
                { id: "prenda", label: "Garantía", options: [{ value: "si", label: "Con objeto en garantía (empeño)" }, { value: "no", label: "Sin garantía" }], match: (x, v) => (v === "si") === !!x.L.prenda },
                { id: "saldo", label: "Saldo", kind: "range", money: true, value: (x) => x.e.saldo },
              ]}
              item={(x) => {
                const { L, e } = x
                const nm = nameOf(x)
                const [st, txt] = loanStatus(e, today, anticipo)
                const pv = provOf(x)
                const on = sel?.L.id === L.id
                const tp = tipoOf(x), td = tipoDef(tp)
                const pr = L.prenda as Prenda | null
                // "Empeño: reloj · hasta el 3 mar" o "Fiado · Mercado".
                const sub = tp === "empeno" ? [tituloOf(x), pr?.limite && !e.done ? `hasta el ${fmtDate(pr.limite)}` : ""].filter(Boolean).join(" · ")
                  : [td?.corto, L.concepto && L.concepto !== td?.corto ? L.concepto : ""].filter(Boolean).join(" · ")
                return (
                  <li key={L.id}>
                    {/* Tarjeta de la deuda: la seleccionada lleva franja de color a la izquierda y fondo suave. */}
                    <button type="button" onClick={() => setId(L.id)} aria-current={on || undefined}
                      className={cn("relative grid w-full gap-2.5 overflow-hidden rounded-xl p-3 pl-4 text-left transition-colors", on ? "bg-brand-soft ring-1 ring-brand/30" : "hover:bg-hover")}>
                      {on && <span aria-hidden className={cn("absolute inset-y-2 left-0 w-1 rounded-r-full", isC ? "bg-forest" : "bg-expense")} />}
                      <span className="flex items-start gap-3">
                        {L.contact_id && !pv ? <Avatar className="size-10 shrink-0"><AvatarFallback className={cn("bg-gradient-to-br text-xs text-white", avatarTone(nm))}>{initials(nm)}</AvatarFallback></Avatar>
                          : <EntityLogo name={nm} provider={pv} icon={td?.icon ?? "landmark"} seed={nm} size={40} />}
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[15px] font-semibold">{nm}</span>
                            <Money value={e.saldo} className="shrink-0 text-[15px] font-bold" />
                          </span>
                          <span className="flex min-w-0 items-center gap-1 text-[13px] text-muted-foreground" data-testid="loan-tipo">
                            <Icon name={td?.icon ?? "landmark"} className={cn("size-3.5 shrink-0", tp === "gota" && "text-danger")} /><span className="truncate">{sub}</span>
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <StatusPill tone={PILL[st]} hint={HINT[st]}>{txt}</StatusPill>
                            {!e.done && e.next && <span>Próxima cuota <Money value={e.next.valor} className="font-medium text-foreground" /> · {fmtDate(e.next.fecha)}</span>}
                          </span>
                        </span>
                      </span>
                      <span className="grid gap-1">
                        <Progress value={e.progreso * 100} className={cn("h-1.5", isC ? "[&>div]:bg-forest" : "[&>div]:bg-expense")} aria-label={`${Math.round(e.progreso * 100)} % pagado`} />
                        <span className="text-[11px] text-muted-foreground">{Math.round(e.progreso * 100)} % pagado</span>
                      </span>
                    </button>
                  </li>
                )
              }}
            />
          </Card>
          {sel && <LoanDetail key={sel.L.id} loan={sel.L} contacts={contacts} entities={entities} anticipo={anticipo} onDeleted={() => setId(null)} />}
        </div>
      )}
      <LoanForm kind={kind} open={nuevo} tipo={tipoIni} contactId={cid} providerId={prov} onSaved={(x) => setId(x)}
        onOpenChange={(o) => { if (!o) { setNuevo(false); if (prov) setProv(null); if (tipoQ) setTipoQ(null); if (empenoQ) setEmpenoQ(null) } }} />
    </div>
  )
}
