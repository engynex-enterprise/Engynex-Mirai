"use client"

import { useMemo, useState } from "react"
import { parseAsString, useQueryState } from "nuqs"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Sparkles } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { Notice } from "@/components/mirai/notice"
import { EmptyState } from "@/components/mirai/empty-state"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { ListRow } from "@/components/mirai/list-row"
import { DataTable, catalogMatch, catalogOptions, type DTColumn } from "@/components/mirai/data-table"
import { useBookId, useCanEdit, useCanEditRow, useCanRecord } from "@/components/app/app-context"
import { useList, useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { apiUpdateRow } from "@/lib/api/book-rows"
import { fmtMoney, fmtMonth, todayISO } from "@/lib/format"
import { dayHeading, lastMonths } from "@/lib/list-helpers"
import type { Row } from "@/lib/supabase/tables"
import { memberName, useCategories, useContacts, useMembers, usePaymentMethods, useProviders, useSettings } from "@/features/catalogs/hooks"
import { reviewMonthHormiga } from "@/features/ai/api"
import { ExpenseForm } from "./expense-form"
import { isHormiga } from "./logic"
import { hormigas } from "@/lib/domain"
import { AdSlot } from "@/features/ads/ad-slot"

type G = Row<"expenses">
const ORIGEN: Record<string, string> = { manual: "Registrado a mano", tarjeta: "Compra con tarjeta", correo: "Desde el correo", importar: "Extracto importado", fijo: "Pago de un gasto fijo" }
const origenDe = (g: G) => (g.fixed_expense_id ? "fijo" : (g as { origen?: string | null }).origen || "manual")
const HORMIGA_HINT = { ia: "La IA lo vio como gasto hormiga: pequeño, frecuente y evitable.", manual: "Lo marcaste tú como gasto hormiga.", auto: "Gasto pequeño y frecuente que se puede evitar. Juntos suman mucho." }

export function ExpensesView() {
  const bookId = useBookId()
  const canEdit = useCanEdit()
  // "Registra sus gastos" agrega y edita solo los suyos
  const canAdd = useCanRecord()
  const canRow = useCanEditRow()
  const qc = useQueryClient()
  const today = todayISO()
  const [mes, setMes] = useQueryState("mes", parseAsString.withDefault(today.slice(0, 7)))
  const [nuevo, setNuevo] = useNewParam()
  const [editing, setEditing] = useState<G | null>(null)
  const { data: all, isPending } = useList("expenses", { order: { column: "fecha", ascending: false } })
  const { data: cats = [] } = useCategories()
  const { data: methods = [] } = usePaymentMethods()
  const { data: members = [] } = useMembers()
  const { data: providers = [] } = useProviders()
  const { data: contacts = [] } = useContacts()
  const { data: cfg } = useSettings()
  const del = useSoftDelete("expenses", "Gasto eliminado")
  const umbral = Number(cfg?.umbral ?? 25000)
  const limite = Number(cfg?.limite ?? 250000)

  const toggleH = useMutation({
    mutationFn: async (g: G) => {
      const next = !isHormiga(g, cats, umbral)
      const patch = { hormiga: next, hormiga_src: "manual" as const, hormiga_razon: null }
      const { error } = await apiUpdateRow(bookId, "expenses", g.id, patch)
      if (error) throw new Error(error.message)
      return next
    },
    onSuccess: (next) => toast(next ? "Marcado como gasto hormiga" : "Ya no es gasto hormiga"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["b", bookId, "expenses"] }),
  })

  // Del mes elegido; el mismo día, lo último registrado arriba.
  const rows = useMemo(() => (all ?? []).filter((g) => g.fecha.startsWith(mes)).sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.created_at ?? "").localeCompare(a.created_at ?? "")), [all, mes])
  const stats = useMemo(() => {
    const [y, m] = mes.split("-").map(Number)
    const dim = new Date(y, m, 0).getDate()
    const isCurrent = today.startsWith(mes)
    const elapsed = isCurrent ? Number(today.slice(8, 10)) : dim
    const h = rows.filter((g) => isHormiga(g, cats, umbral))
    // La misma cuenta de Inicio, Dashboard y los avisos (@mirai/domain › hormigas/proyectarMes): no infla lo de pocos días.
    const H = hormigas({ expenses: (all ?? []) as never[], categories: cats as never[], settings: { umbral, limite } }, today, mes)
    const llevas = H.totalMes
    const byCat = new Map<string, { n: number; v: number }>()
    for (const g of h) { const k = cats.find((c) => c.id === g.category_id)?.nombre ?? "Otros"; const e = byCat.get(k) ?? { n: 0, v: 0 }; byCat.set(k, { n: e.n + 1, v: e.v + Number(g.valor) }) }
    const cat = [...byCat.entries()].sort((a, b) => b[1].v - a[1].v)
    const total = rows.reduce((s, g) => s + Number(g.valor), 0)
    // Promedio por día del día a día: sin pagos de gastos fijos (el arriendo del día 1 no es un gasto diario) ni fechas futuras.
    const diaADia = rows.filter((g) => !g.fixed_expense_id && g.fecha <= today).reduce((s, g) => s + Number(g.valor), 0)
    const top = rows.reduce<G | null>((a, g) => (!a || Number(g.valor) > Number(a.valor) ? g : a), null)
    return { llevas, proy: H.proy, base: H.base, dias: H.dias, pasado: H.pasado, anio: H.anual, over: H.over, cat, elapsed, total, diario: diaADia / Math.max(1, elapsed), top, nh: h.length, isCurrent }
  }, [rows, all, cats, umbral, limite, mes, today])
  const maxCat = Math.max(1, ...stats.cat.map(([, v]) => v.v))

  const catOf = (g: G) => cats.find((c) => c.id === g.category_id)
  const methodOf = (g: G) => methods.find((x) => x.id === g.payment_method_id)
  const provOf = (g: G) => providers.find((p) => p.id === g.provider_id)
  /** A quién se le pagó: el negocio (Proveedores) o la persona (Contactos); vacío si no hacía falta. */
  const pagadoA = (g: G) => provOf(g)?.nombre ?? contacts.find((c) => c.id === g.contact_id)?.nombre ?? ""
  const pick = {
    cat: (g: G) => g.category_id, member: (g: G) => g.member_id, method: (g: G) => g.payment_method_id, prov: (g: G) => g.provider_id, contact: (g: G) => g.contact_id,
  }
  const columns: DTColumn<G>[] = [
    { id: "fecha", header: "Fecha", sort: (g) => `${g.fecha}${g.created_at ?? ""}`, csv: (g) => g.fecha },
    { id: "descripcion", header: "Descripción", sort: (g) => (g.descripcion ?? "").toLowerCase(), csv: (g) => g.descripcion },
    { id: "valor", header: "Valor", sort: (g) => Number(g.valor), csv: (g) => Number(g.valor) },
    { id: "categoria", header: "Categoría", sort: (g) => catOf(g)?.nombre ?? "~", csv: (g) => catOf(g)?.nombre ?? "Sin categoría" },
    { id: "persona", header: "Persona", csv: (g) => memberName(g.member_id, members) },
    { id: "medio", header: "Medio de pago", csv: (g) => methodOf(g)?.nombre ?? "" },
    { id: "proveedor", header: "Pagado a", csv: (g) => pagadoA(g) },
    { id: "hormiga", header: "Hormiga", csv: (g) => (isHormiga(g, cats, umbral) ? "Sí" : "No") },
    { id: "origen", header: "Origen", csv: (g) => ORIGEN[origenDe(g)] },
  ]

  return (
    <div className="grid gap-6">
      <PageHeader id="gastos" description="Todo lo que gastas. Mirai detecta los gastos “hormiga”: pequeños, frecuentes y evitables, que juntos suman mucho. También puedes marcarlos tú con la taza."
        actions={canAdd && <Button onClick={() => setNuevo(true)}><Plus /> Registrar gasto</Button>} />

      <KpiGrid>
        <Kpi icon="receipt" tone="expense" label={today.startsWith(mes) ? "Gastaste este mes" : `Gastaste en ${fmtMonth(mes)}`} loading={isPending} value={<Money value={stats.total} />} sub={`${rows.length} gasto${rows.length === 1 ? "" : "s"}`} />
        <Kpi icon="coffee" tone="amber" label="Gastos hormiga" loading={isPending} value={<Money value={stats.llevas} />} sub={stats.base === "pronto" ? `${stats.nh} gasto${stats.nh === 1 ? "" : "s"} · aún es pronto para proyectar` : stats.base === "mes-cerrado" ? `${stats.nh} gasto${stats.nh === 1 ? "" : "s"} en el mes` : <>Proyección del mes <Money value={stats.proy} short /></>}
          info="Gastos pequeños, frecuentes y evitables (un tinto, un domicilio, un snack). Juntos suman mucho al año." />
        <Kpi icon="calendar-days" tone="blue" label="Promedio por día" loading={isPending} value={<Money value={stats.diario} />} sub={`Día a día, en ${stats.elapsed} día${stats.elapsed === 1 ? "" : "s"} (sin fijos)`} />
        <Kpi icon="trending-up" tone="violet" label="Gasto más alto" loading={isPending} value={<Money value={stats.top ? Number(stats.top.valor) : 0} />} sub={stats.top?.descripcion || "—"} />
      </KpiGrid>

      <Card className="shadow-card ring-0">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Gastos hormiga de {today.startsWith(mes) ? "este mes" : fmtMonth(mes)}</CardTitle>
          <div className="flex items-center gap-2">
            {canEdit && <ReviewAI mes={mes} />}
            {!isPending && <StatusPill tone={stats.pasado ? "vencido" : stats.over ? "warn" : "pagado"} hint={`Tu límite de gastos hormiga es ${fmtMoney(limite)} al mes. Lo cambias en Ajustes › Alertas.`}>{stats.pasado ? "Pasaste el límite" : stats.over ? "Vas camino a pasarlo" : "En rango"}</StatusPill>}
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid grid-cols-3 gap-3">
            {([
              [stats.isCurrent ? "Llevas" : "Gastaste", stats.llevas, `${stats.nh} gasto${stats.nh === 1 ? "" : "s"}`],
              ["Proyección del mes", stats.base === "pronto" ? null : stats.proy, stats.base === "historial" ? "Por lo que sueles gastar" : stats.base === "ritmo" ? `A tu ritmo de ${stats.dias} días` : stats.base === "mes-cerrado" ? "El mes ya cerró" : "Aún es pronto: necesitamos 7 días de datos"],
              ["Si todos los meses fueran así", stats.base === "pronto" ? null : stats.anio, "Al año"],
            ] as const).map(([l, v, d]) => (
              <div key={l} className="rounded-md bg-muted p-3">
                <p className="text-xs text-muted-foreground">{l}</p>
                {isPending ? <Skeleton className="mt-1 h-5 w-20" /> : v === null ? <p className="text-base font-semibold text-muted-foreground">—</p> : <Money value={v} className="text-base font-semibold" />}
                <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
          {stats.cat.length > 0 && (
            <div className="grid gap-3">
              {stats.cat.map(([k, v]) => (
                <div key={k} className="grid gap-1.5">
                  <div className="flex justify-between text-sm"><span>{k} <span className="text-muted-foreground">×{v.n}</span></span><Money value={v.v} /></div>
                  <Progress value={(v.v / maxCat) * 100} className="h-1.5 [&>div]:bg-[#F7B928]" />
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-3">
            {stats.over && (
              <Notice tone="warn" title={stats.pasado ? `Pasaste tu límite de gastos hormiga: llevas ${fmtMoney(stats.llevas)}` : `Vas camino a gastar ${fmtMoney(stats.proy)} en gastos hormiga este mes`}>
                Tu límite es {fmtMoney(limite)} al mes{stats.pasado ? "" : ` y llevas ${fmtMoney(stats.llevas)}`}.{stats.anio ? ` Si todos los meses fueran así, al año serían ${fmtMoney(stats.anio)}.` : ""}
              </Notice>
            )}
            {stats.cat.filter(([, v]) => v.n >= 6).map(([k, v]) => (
              <Notice key={k} tone="info" title={`${k}: ${v.n} compras este mes`}>
                Suman {fmtMoney(v.v)}{stats.anio && stats.llevas ? `: a este paso, unos ${fmtMoney(Math.round((v.v / stats.llevas) * stats.anio))} al año` : ""}.
              </Notice>
            ))}
            {!isPending && !stats.over && !stats.cat.some(([, v]) => v.n >= 6) && <Notice tone="ok" title="Sin alertas">Tus gastos pequeños están bajo control.</Notice>}
          </div>
        </CardContent>
      </Card>

      <DataTable<G>
        title="Movimientos" info="Todos tus gastos del mes. Búscalos, fíltralos por categoría, persona o medio de pago, y exporta lo que ves."
        data={rows} loading={isPending} columns={columns} rowKey={(g) => g.id} noun={["gasto", "gastos"]} exportName={`gastos-${mes}`}
        total={{ value: (g) => Number(g.valor) }}
        initialSort={{ id: "fecha", dir: "desc" }}
        group={{ by: (g) => g.fecha, sorts: ["fecha"], label: (d, gs) => <><span>{dayHeading(d, today)}</span><Money value={gs.reduce((a, g) => a + Number(g.valor), 0)} className="font-semibold normal-case" /></> }}
        search={{ placeholder: "Buscar gasto", text: (g) => `${g.descripcion} ${catOf(g)?.nombre ?? ""} ${methodOf(g)?.nombre ?? ""} ${pagadoA(g)} ${memberName(g.member_id, members)}` }}
        toolbar={
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="h-10 w-44 rounded-lg" aria-label="Mes"><SelectValue /></SelectTrigger>
            <SelectContent>{lastMonths(12, today).map((m) => <SelectItem key={m} value={m} className="capitalize">{fmtMonth(m)}</SelectItem>)}</SelectContent>
          </Select>
        }
        views={[
          { id: "todos", label: "Todos" },
          { id: "hormiga", label: "Hormiga", match: (g) => isHormiga(g, cats, umbral), hint: HORMIGA_HINT.auto },
          { id: "fijos", label: "De gastos fijos", match: (g) => !!g.fixed_expense_id, hint: "Pagos que registraste desde Gastos fijos." },
        ]}
        filters={[
          { id: "cat", label: "Categoría", options: catalogOptions(rows, cats, pick.cat, "Sin categoría"), match: catalogMatch(pick.cat) },
          { id: "persona", label: "Persona", options: [...(rows.some((g) => !g.member_id) ? [{ value: "__none", label: "Familia" }] : []), ...catalogOptions(rows, members, pick.member)], match: catalogMatch(pick.member) },
          { id: "medio", label: "Medio de pago", options: catalogOptions(rows, methods, pick.method, "Sin medio de pago"), match: catalogMatch(pick.method) },
          { id: "prov", label: "Negocio", options: catalogOptions(rows, providers, pick.prov), match: catalogMatch(pick.prov) },
          { id: "persona", label: "Persona", options: catalogOptions(rows, contacts, pick.contact), match: catalogMatch(pick.contact) },
          { id: "origen", label: "Origen", options: Object.entries(ORIGEN).filter(([k]) => rows.some((g) => origenDe(g) === k)).map(([value, label]) => ({ value, label })), match: (g, v) => origenDe(g) === v },
          { id: "fecha", label: "Fecha", kind: "dates", value: (g) => g.fecha },
          { id: "valor", label: "Valor", kind: "range", money: true, value: (g) => Number(g.valor) },
        ]}
        emptyState={<EmptyState iso="gastos" title="No hay gastos en este mes" description="Registra lo que pagas y Mirai te ayuda a ver en qué se va tu plata." action={canAdd && <Button onClick={() => setNuevo(true)}><Plus /> Registrar gasto</Button>} />}
        item={(g) => {
          const cat = catOf(g)
          const h = isHormiga(g, cats, umbral)
          const can = canRow(g)
          return (
            <ListRow key={g.id} icon="receipt"
              media={<EntityLogo name={g.descripcion} provider={provOf(g)} icon={cat?.icon ?? "receipt"} seed={cat?.id} tone={h ? "warning" : undefined} />}
              title={g.descripcion || "Gasto"}
              badges={<>
                {h && <StatusPill tone="porVencer" hint={g.hormiga_razon || HORMIGA_HINT[g.hormiga_src === "ia" ? "ia" : g.hormiga_src === "manual" ? "manual" : "auto"]}>{g.hormiga_src === "ia" ? <Sparkles /> : g.hormiga_src === "manual" ? <Pencil /> : null}hormiga</StatusPill>}
                {g.fixed_expense_id && <StatusPill tone="info" hint="Viene del pago de un gasto fijo.">fijo</StatusPill>}
              </>}
              subtitle={[cat?.nombre ?? "Sin categoría", memberName(g.member_id, members), methodOf(g)?.nombre, pagadoA(g)].filter(Boolean).join(" · ")}
              value={<Money value={Number(g.valor)} className="font-bold" />}
              onClick={can ? () => setEditing(g) : undefined}
              actions={can ? [
                ...(!g.fixed_expense_id ? [{ label: h ? "Quitar de hormiga" : "Marcar como hormiga", icon: "coffee", inline: true, onClick: () => toggleH.mutate(g), className: h ? "text-[#D98300]" : undefined }] : []),
                { label: "Editar gasto", icon: "pencil", hideOnMobile: true, onClick: () => setEditing(g) },
                { label: "Eliminar gasto", icon: "trash-2", inline: true, destructive: true, onClick: () => del.mutate(g) },
              ] : []} />
          )
        }}
      />

      <ExpenseForm open={nuevo || !!editing} onOpenChange={(o) => { if (!o) { setNuevo(false); setEditing(null) } }} expense={editing} />
      <AdSlot slot="lista" />
    </div>
  )
}

/** "Revisar con IA" los gastos del mes sin veredicto de hormiga (reviewMonth de la v4). */
function ReviewAI({ mes }: { mes: string }) {
  const qc = useQueryClient()
  const bookId = useBookId()
  const [busy, setBusy] = useState(false)
  return (
    <Button size="sm" variant="soft" disabled={busy} onClick={async () => {
      setBusy(true)
      const t = toast.loading("La IA está revisando los gastos del mes…")
      const r = await reviewMonthHormiga(mes).catch((e) => ({ ok: false, msg: (e as Error).message }))
      toast[r.ok ? "success" : "error"](r.msg, { id: t })
      qc.invalidateQueries({ queryKey: ["b", bookId] })
      setBusy(false)
    }}>{busy ? <Spinner /> : <Sparkles />} Revisar con IA</Button>
  )
}
