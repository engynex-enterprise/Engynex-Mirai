"use client"

import { useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { EmptyState } from "@/components/mirai/empty-state"
import { ListRow } from "@/components/mirai/list-row"
import { useCanEdit } from "@/components/app/app-context"
import { useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { incomeCuando, incomeReparto, ingresoBrutoMensual, ingresoMensual, quincena, type Deducciones } from "@/lib/domain"
import { fmtMoney, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { memberName, useIncomeCategories, useMembers } from "@/features/catalogs/hooks"
import { useBookData } from "@/features/book/use-book-data"
import { IncomeForm } from "./income-form"
import { AdSlot } from "@/features/ads/ad-slot"

/** "1ª quincena $X · 2ª quincena $Y" cuando cambia entre quincenas. */
const quincLine = (x: Row<"incomes">) => {
  const R = incomeReparto(x)
  if (x.frec !== "quincenal" || R.n1 == null || R.n2 == null || R.n1 === R.n2) return null
  const desc = R.ded === "q2" ? " · descuentos en la 2ª" : R.ded === "q1" ? " · descuentos en la 1ª" : ""
  return `1ª quincena ${fmtMoney(R.n1)} · 2ª quincena ${fmtMoney(R.n2)}${desc}`
}

/** "Bruto $X − descuentos $Y: Salud, Pensión, …" (dedLine de la v4). */
const dedLine = (x: Row<"incomes">) => {
  if (!x.bruto) return null
  const D = x.deducciones as Deducciones | null
  const names = [D?.salud !== false && D?.tipo !== "otro" && "Salud", D?.pension !== false && (D?.tipo === "empleado" || D?.tipo === "independiente") && "Pensión", D?.ret !== false && D?.tipo !== "pensionado" && "Retención", ...(D?.otros ?? []).filter((o) => o.n && +(o.v ?? 0)).map((o) => o.n)].filter(Boolean)
  const R = incomeReparto(x)
  if (x.frec === "quincenal" && R.b1 != null && R.b2 != null && R.n1 != null && R.n2 != null)
    return `Bruto ${fmtMoney(R.b1 + R.b2)} al mes − descuentos ${fmtMoney(R.b1 + R.b2 - R.n1 - R.n2)}: ${names.join(", ")}`
  return `Bruto ${fmtMoney(Number(x.bruto))} − descuentos ${fmtMoney(Number(x.bruto) - Number(x.valor))}: ${names.join(", ")}`
}

export function IncomesView() {
  const canEdit = useCanEdit()
  const [nuevo, setNuevo] = useNewParam()
  const [editing, setEditing] = useState<Row<"incomes"> | null>(null)
  const { data: book, isPending } = useBookData()
  const { data: cats = [] } = useIncomeCategories()
  const { data: members = [] } = useMembers()
  const del = useSoftDelete("incomes", "Ingreso eliminado")
  const today = todayISO()
  const incomes = (book?.incomes ?? []) as unknown as Row<"incomes">[]

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
      <KpiGrid className="xl:grid-cols-3">
        <Kpi icon="wallet" tone="income" label="Ingreso mensual" loading={isPending}
          value={<>{<Money value={k?.mes} />} <span className="text-[12px] font-medium text-muted-foreground">con descuentos</span></>} valueClassName="text-success"
          sub={k && k.bruto - k.mes >= 1
            ? <>Sin descuentos <Money value={k.bruto} className="font-semibold text-foreground" /> · descuentos <Money value={k.bruto - k.mes} /></>
            : `${incomes.length} fuente${incomes.length === 1 ? "" : "s"} · sin descuentos de nómina`} />
        <Kpi icon="calendar" tone="blue" label={`1ª quincena (1–${k?.corte ?? 15})`} loading={isPending} value={<Money value={k?.q1} />} />
        <Kpi icon="calendar" tone="blue" label={`2ª quincena (${(k?.corte ?? 15) + 1}–fin)`} loading={isPending} value={<Money value={k?.q2} />} />
      </KpiGrid>
      <Card className="shadow-card ring-0">
        <CardContent className="grid gap-1">
          {isPending ? (
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="flex items-center gap-3 py-2"><Skeleton className="size-10 rounded-full" /><div className="grid flex-1 gap-1.5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/2" /></div><Skeleton className="h-5 w-24" /></div>)
          ) : !incomes.length ? (
            <EmptyState iso="ingresos" title="Aún no registras ingresos" description="Es lo más importante: sin esto no podemos decirte cuánto te queda." action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar el primero</Button>} />
          ) : (
            <ul className="-mx-2 grid">
              {incomes.map((x) => {
                const cat = cats.find((c) => c.id === x.category_id)
                return (
                  <ListRow key={x.id} icon={cat?.icon ?? "coins"} iconClassName="bg-success-soft text-success" title={x.concepto}
                    badges={x.bruto ? <StatusPill tone="estimado">neto</StatusPill> : null}
                    subtitle={[cat?.nombre, incomeCuando(x), memberName(x.member_id, members)].filter(Boolean).join(" · ")}
                    extra={quincLine(x) || dedLine(x) ? <>{quincLine(x) && <span className="block">{quincLine(x)}</span>}{dedLine(x) && <span className="block">{dedLine(x)}</span>}</> : null}
                    value={quincLine(x)
                      ? <span className="grid text-right"><Money value={Number(incomeReparto(x).n1) + Number(incomeReparto(x).n2)} currency={x.currency} className="font-bold text-success" /><span className="text-xs text-muted-foreground">al mes</span></span>
                      : <Money value={Number(x.valor)} currency={x.currency} className="font-bold text-success" />}
                    onClick={canEdit ? () => setEditing(x) : undefined}
                    actions={canEdit ? [
                      { label: `Editar ${x.concepto}`, icon: "pencil", onClick: () => setEditing(x) },
                      { label: `Eliminar ${x.concepto}`, icon: "trash-2", onClick: () => del.mutate(x), destructive: true },
                    ] : []} />
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <IncomeForm open={nuevo || !!editing} onOpenChange={(o) => { if (!o) { setNuevo(false); setEditing(null) } }} income={editing} />
      <AdSlot slot="lista" />
    </div>
  )
}
