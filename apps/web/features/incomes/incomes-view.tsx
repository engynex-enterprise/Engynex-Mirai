"use client"

import { useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { EmptyState } from "@/components/mirai/empty-state"
import { ListRow } from "@/components/mirai/list-row"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { DataTable, catalogMatch, catalogOptions } from "@/components/mirai/data-table"
import { useCanEditRow, useCanRecord } from "@/components/app/app-context"
import { useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { dedCalc, incomeCuando, incomeReparto, ingresoBrutoMensual, ingresoMensual, pagosMes, quincena, smmlvFor, uvtFor, type Deducciones, type IncomeIn, type NominaCfg, type NominaRef } from "@/lib/domain"
import { fmtMoney, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { memberName, useIncomeCategories, useMembers } from "@/features/catalogs/hooks"
import { useBookData } from "@/features/book/use-book-data"
import { IncomeForm } from "./income-form"
import { AdSlot } from "@/features/ads/ad-slot"

const FRECS_ING: Record<string, string> = { mensual: "Cada mes", quincenal: "Cada quincena", semanal: "Cada semana", diario: "Por días", anual: "Una vez al año" }

/** "1ª quincena $X · 2ª quincena $Y" cuando cambia entre quincenas. */
const quincLine = (x: Row<"incomes">) => {
  const R = incomeReparto(x)
  if (x.frec !== "quincenal" || R.n1 == null || R.n2 == null || R.n1 === R.n2) return null
  const desc = R.ded === "q2" ? " · descuentos en la 2ª" : R.ded === "q1" ? " · descuentos en la 1ª" : ""
  return `1ª quincena ${fmtMoney(R.n1)} · 2ª quincena ${fmtMoney(R.n2)}${desc}`
}

/**
 * "Bruto $X al mes − descuentos $Y: Salud, Pensión, …": los nombres salen del cálculo real (dedCalc), solo los que
 * descuentan algo (no dice "Retención" si es $0, sí dice "Fondo de solidaridad" si aplica).
 */
const dedLine = (x: Row<"incomes">, ref: NominaRef) => {
  if (!x.bruto) return null
  const D = x.deducciones as Deducciones | null
  const R = incomeReparto(x)
  const quinc = x.frec === "quincenal" && R.b1 != null && R.b2 != null && R.n1 != null && R.n2 != null
  const brutoMes = quinc ? R.b1! + R.b2! : Number(x.bruto) * (pagosMes(x) || 1)
  const descMes = quinc ? R.b1! + R.b2! - R.n1! - R.n2! : (Number(x.bruto) - Number(x.valor)) * (pagosMes(x) || 1)
  const names = D ? dedCalc(brutoMes, "mensual", D, ref).items.filter((i) => i.v > 0.5).map((i) => i.n) : []
  if (descMes < 1) return null
  return `Bruto ${fmtMoney(brutoMes)} al mes − descuentos ${fmtMoney(descMes)}${names.length ? `: ${names.join(", ")}` : ""}`
}

/** Debajo del valor al mes: cuánto es cada pago ("$1.840.000 cada quincena"), o "al mes" si se paga una vez. */
const POR: Record<string, string> = { quincenal: "cada quincena", semanal: "cada semana", diario: "por día", anual: "una vez al año" }
const porPago = (x: Row<"incomes">) => {
  const R = incomeReparto(x)
  if (x.frec === "quincenal" && R.n1 != null && R.n2 != null && R.n1 !== R.n2) return "al mes (quincenas distintas)"
  const p = POR[x.frec]
  return p ? `al mes · ${fmtMoney(Number(x.valor), x.currency ?? "COP")} ${p}` : "al mes"
}

export function IncomesView() {
  // "Registra sus gastos" agrega y edita solo sus ingresos
  const canEdit = useCanRecord()
  const canRow = useCanEditRow()
  const [nuevo, setNuevo] = useNewParam()
  const [editing, setEditing] = useState<Row<"incomes"> | null>(null)
  const { data: book, isPending } = useBookData()
  const { data: cats = [] } = useIncomeCategories()
  const { data: members = [] } = useMembers()
  const del = useSoftDelete("incomes", "Ingreso eliminado")
  const today = todayISO()
  const incomes = (book?.incomes ?? []) as unknown as Row<"incomes">[]
  const trm = book?.settings.trm ?? {}
  /** Lo que deja el ingreso en un mes, en pesos (quincenas, semanas y monedas convertidas). */
  const mensualDe = (x: Row<"incomes">) => ingresoMensual([x as unknown as IncomeIn], trm)
  const year = Number(today.slice(0, 4))
  const ref: NominaRef = { smmlv: smmlvFor(year, book?.settings.smmlv as Record<string, number>), uvt: uvtFor(year, book?.settings.uvt as Record<string, number>), fsp: ((book?.settings as { nomina?: NominaCfg } | undefined)?.nomina ?? {}).fsp }

  const k = useMemo(() => {
    if (!book) return null
    const [y, m] = today.split("-").map(Number)
    const sumIng = (w: "q1" | "q2") => quincena(book, y, m - 1, w, today).ent.filter((e) => e.icon === "briefcase").reduce((a, e) => a + e.v, 0)
    return { mes: ingresoMensual(book.incomes, book.settings.trm), bruto: ingresoBrutoMensual(book.incomes, book.settings.trm), q1: sumIng("q1"), q2: sumIng("q2"), corte: book.settings.corte_q }
  }, [book, today])

  return (
    <div className="grid gap-6">
      <PageHeader id="ingresos" description="Tu salario, honorarios, arriendos y cualquier dinero que recibas con regularidad."
        actions={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar ingreso</Button>} />
      <KpiGrid cols={3}>
        <Kpi icon="wallet" tone="income" label="Ingreso mensual" loading={isPending}
          value={<>{<Money value={k?.mes} />} <span className="text-[12px] font-medium text-muted-foreground">lo que te llega</span></>} valueClassName="text-success"
          sub={k && k.bruto - k.mes >= 1
            ? <>Sin descuentos <Money value={k.bruto} className="font-semibold text-foreground" /> · descuentos <Money value={k.bruto - k.mes} /></>
            : `${incomes.length} fuente${incomes.length === 1 ? "" : "s"} · sin descuentos de nómina`} />
        <Kpi icon="calendar" tone="blue" label={`1ª quincena (1–${k?.corte ?? 15})`} loading={isPending} value={<Money value={k?.q1} />} />
        <Kpi icon="calendar" tone="blue" label={`2ª quincena (${(k?.corte ?? 15) + 1}–fin)`} loading={isPending} value={<Money value={k?.q2} />} />
      </KpiGrid>
      <DataTable<Row<"incomes">>
        title="Tus ingresos" info="Lo que recibes con regularidad. El total del mes ya convierte las quincenas, semanas y monedas a pesos al mes."
        data={incomes} loading={isPending} rowKey={(x) => x.id} noun={["ingreso", "ingresos"]} exportName="ingresos"
        total={{ value: (x) => mensualDe(x), label: "suman al mes" }}
        columns={[
          { id: "concepto", header: "Concepto", sort: (x) => x.concepto.toLowerCase(), csv: (x) => x.concepto },
          { id: "mensual", header: "Al mes", sort: (x) => mensualDe(x), csv: (x) => Math.round(mensualDe(x)) },
          { id: "valor", header: "Valor por pago", sort: (x) => Number(x.valor), csv: (x) => Number(x.valor) },
          { id: "moneda", header: "Moneda", csv: (x) => x.currency },
          { id: "bruto", header: "Bruto", csv: (x) => (x.bruto ? Number(x.bruto) : "") },
          { id: "cuando", header: "Cuándo", csv: (x) => incomeCuando(x) },
          { id: "categoria", header: "Categoría", sort: (x) => cats.find((c) => c.id === x.category_id)?.nombre ?? "~", csv: (x) => cats.find((c) => c.id === x.category_id)?.nombre ?? "" },
          { id: "persona", header: "Persona", csv: (x) => memberName(x.member_id, members) },
        ]}
        initialSort={{ id: "mensual", dir: "desc" }}
        search={{ placeholder: "Buscar ingreso", text: (x) => `${x.concepto} ${cats.find((c) => c.id === x.category_id)?.nombre ?? ""} ${memberName(x.member_id, members)}` }}
        filters={[
          { id: "cat", label: "Categoría", options: catalogOptions(incomes, cats, (x) => x.category_id, "Sin categoría"), match: catalogMatch((x) => x.category_id) },
          { id: "persona", label: "Persona", options: [...(incomes.some((x) => !x.member_id) ? [{ value: "__none", label: "Familia" }] : []), ...catalogOptions(incomes, members, (x) => x.member_id)], match: catalogMatch((x) => x.member_id) },
          { id: "frec", label: "Frecuencia", options: Object.entries(FRECS_ING).filter(([v]) => incomes.some((x) => x.frec === v)).map(([value, label]) => ({ value, label })), match: (x, v) => x.frec === v },
          { id: "ded", label: "Descuentos de nómina", options: [{ value: "si", label: "Con descuentos (neto)" }, { value: "no", label: "Sin descuentos" }], match: (x, v) => (v === "si") === !!x.bruto },
          { id: "moneda", label: "Moneda", options: [...new Set(incomes.map((x) => x.currency))].map((c) => ({ value: c, label: c === "COP" ? "Pesos (COP)" : c })), match: (x, v) => x.currency === v },
          { id: "valor", label: "Valor al mes", kind: "range", money: true, value: (x) => mensualDe(x) },
        ]}
        emptyState={<EmptyState iso="ingresos" title="Aún no registras ingresos" description="Es lo más importante: sin esto no podemos decirte cuánto te queda." action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar el primero</Button>} />}
        item={(x) => {
          const cat = cats.find((c) => c.id === x.category_id)
          return (
            <ListRow key={x.id} icon={cat?.icon ?? "coins"} media={<EntityLogo icon={cat?.icon ?? "coins"} tone="success" name={x.concepto} />} title={x.concepto}
              badges={x.bruto ? <StatusPill tone="estimado" hint="Es lo que te llega a la cuenta después de los descuentos de nómina (salud, pensión, retención).">neto</StatusPill> : null}
              subtitle={[cat?.nombre, incomeCuando(x), memberName(x.member_id, members)].filter(Boolean).join(" · ")}
              extra={quincLine(x) || dedLine(x, ref) ? <>{quincLine(x) && <span className="block">{quincLine(x)}</span>}{dedLine(x, ref) && <span className="block">{dedLine(x, ref)}</span>}</> : null}
              // Siempre "al mes" (lo que te llega en el mes) y, debajo, cuánto es cada pago: así cuadra con el total de arriba.
              value={<span className="grid text-right"><Money value={mensualDe(x)} className="font-bold text-success" /><span className="text-xs text-muted-foreground">{porPago(x)}</span></span>}
              onClick={canRow(x) ? () => setEditing(x) : undefined}
              actions={canRow(x) ? [
                { label: `Editar ${x.concepto}`, tip: "Editar", icon: "pencil", onClick: () => setEditing(x) },
                { label: `Eliminar ${x.concepto}`, tip: "Eliminar", icon: "trash-2", onClick: () => del.mutate(x), destructive: true },
              ] : []} />
          )
        }}
      />
      <IncomeForm open={nuevo || !!editing} onOpenChange={(o) => { if (!o) { setNuevo(false); setEditing(null) } }} income={editing} />
      <AdSlot slot="lista" />
    </div>
  )
}
