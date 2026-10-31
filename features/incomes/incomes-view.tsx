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
import { ingresoMensual, quincena, type Deducciones } from "@/lib/domain"
import { fmtMoney, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { memberName, useIncomeCategories, useMembers } from "@/features/catalogs/hooks"
import { useBookData } from "@/features/book/use-book-data"
import { IncomeForm } from "./income-form"

const frecText = (x: Pick<Row<"incomes">, "frec" | "dia">) =>
  ({ mensual: `Cada mes el día ${x.dia}`, quincenal: "Cada quincena (15 y 30)", semanal: "Cada semana", anual: "Una vez al año" })[x.frec] ?? x.frec

/** "Bruto $X − descuentos $Y: Salud, Pensión, …" (dedLine de la v4). */
const dedLine = (x: Row<"incomes">) => {
  if (!x.bruto) return null
  const D = x.deducciones as Deducciones | null
  const names = [D?.salud !== false && D?.tipo !== "otro" && "Salud", D?.pension !== false && (D?.tipo === "empleado" || D?.tipo === "independiente") && "Pensión", D?.ret !== false && D?.tipo !== "pensionado" && "Retención", ...(D?.otros ?? []).filter((o) => o.n && +(o.v ?? 0)).map((o) => o.n)].filter(Boolean)
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
    return { mes: ingresoMensual(book.incomes, book.settings.trm), q1: sumIng("q1"), q2: sumIng("q2"), corte: book.settings.corte_q }
  }, [book, today])

  return (
    <div className="grid gap-6">
      <PageHeader id="ingresos" description="Tu salario, honorarios, arriendos y cualquier dinero que recibas con regularidad."
        actions={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar ingreso</Button>} />
      <KpiGrid className="xl:grid-cols-3">
        <Kpi icon="wallet" tone="income" label="Ingreso mensual" loading={isPending} value={<Money value={k?.mes} />} valueClassName="text-success" sub={`${incomes.length} fuente${incomes.length === 1 ? "" : "s"}`} />
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
                    subtitle={[cat?.nombre, frecText(x), memberName(x.member_id, members)].filter(Boolean).join(" · ")}
                    extra={dedLine(x)}
                    value={<Money value={Number(x.valor)} currency={x.currency} className="font-bold text-success" />}
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
    </div>
  )
}
