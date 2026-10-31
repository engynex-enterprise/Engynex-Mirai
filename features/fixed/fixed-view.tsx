"use client"

import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { EmptyState } from "@/components/mirai/empty-state"
import { ListRow } from "@/components/mirai/list-row"
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook, useSoftDelete } from "@/hooks/use-book-data"
import { useIdParam, useNewParam } from "@/hooks/use-new-param"
import { createClient } from "@/utils/supabase/client"
import { FFREC, fijoStatus, fijosMes, relTime, toDay, type FixedExpenseIn } from "@/lib/domain"
import { fmtDate, todayISO } from "@/lib/format"
import { useBookData } from "@/features/book/use-book-data"
import { useCategories, usePaymentMethods } from "@/features/catalogs/hooks"
import { FixedForm, type FixedRow } from "./fixed-form"
import { PayFixedDialog } from "./pay-fixed-dialog"

const days = (a: string, b: string) => Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 864e5)

export function FixedView() {
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const today = todayISO()
  const [nuevo, setNuevo] = useNewParam()
  const [, setId] = useIdParam()
  const [editing, setEditing] = useState<FixedRow | null>(null)
  const [paying, setPaying] = useState<FixedRow | null>(null)
  const { data: book, isPending } = useBookData()
  const { data: cats = [] } = useCategories()
  const { data: methods = [] } = usePaymentMethods()
  const del = useSoftDelete("fixed_expenses", "Gasto fijo eliminado")
  const fixed = (book?.fixedExpenses ?? []) as unknown as FixedRow[]
  const anticipo = book?.settings.anticipo ?? 5

  const rows = useMemo(() => fixed.map((f) => ({ f, st: fijoStatus(f as unknown as FixedExpenseIn, today) })), [fixed, today])
  const mes = today.slice(0, 7)
  const k = useMemo(() => {
    const pend = rows.flatMap(({ f, st }) => st.periods.filter((p) => !p.pago && p.due.startsWith(mes)).map(() => Number(f.valor))).reduce((a, b) => a + b, 0)
    const pagado = rows.flatMap(({ f }) => f.payments.filter((p) => p.fecha.startsWith(mes))).reduce((a, p) => a + Number(p.valor), 0)
    const venc = rows.reduce((a, { st }) => a + st.venc.length, 0)
    return { total: fijosMes(fixed as unknown as FixedExpenseIn[]), pend, pagado, venc }
  }, [rows, fixed, mes])
  const paidThisMonth = fixed.flatMap((f) => f.payments.filter((p) => p.fecha.startsWith(mes)).map((p) => ({ f, p }))).sort((a, b) => b.p.fecha.localeCompare(a.p.fecha))

  const unpay = async (paymentId: string) => {
    const { error } = await createClient().rpc("unpay_fixed_expense", { p_payment: paymentId })
    if (error) return toast.error("No se pudo deshacer", { description: error.message })
    toast("Pago deshecho")
    invalidateBook(qc, bookId, "fixed_expenses"); invalidateBook(qc, bookId, "expenses")
  }

  return (
    <div className="grid gap-6">
      <PageHeader id="fijos" description="Arriendo, servicios, administración, colegio… lo que pagas cada mes. Te avisamos antes de cada fecha y, al pagar, queda registrado en tus gastos."
        actions={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar gasto fijo</Button>} />
      <KpiGrid className="xl:grid-cols-3">
        <Kpi icon="house" tone="blue" label="Total al mes" loading={isPending} value={<Money value={k.total} />} />
        <Kpi icon="hourglass" tone="amber" label="Falta pagar este mes" loading={isPending} value={<Money value={k.pend} />} sub={<>Ya pagaste <Money value={k.pagado} /></>} />
        <Kpi icon="circle-alert" tone={k.venc ? "red" : "green"} label="Vencidos" loading={isPending} value={k.venc} valueClassName={k.venc ? "text-danger" : "text-success"} sub={k.venc ? "Págalos cuanto antes" : "Todo al día"} />
      </KpiGrid>
      <Card className="shadow-card ring-0">
        <CardContent>
          {isPending ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="flex items-center gap-3 py-3"><Skeleton className="size-10 rounded-full" /><div className="grid flex-1 gap-1.5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/2" /></div><Skeleton className="h-8 w-20" /></div>)
          ) : !rows.length ? (
            <EmptyState iso="fijos" title="Aún no tienes gastos fijos" description="Empieza por el arriendo y los servicios." action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar gasto fijo</Button>} />
          ) : (
            <ul className="-mx-2 grid">
              {rows.map(({ f, st }) => {
                const cat = cats.find((c) => c.id === f.category_id)
                const next = st.venc[0] ?? st.prox
                const q = next?.per.endsWith("Q1") ? " (1ª quinc.)" : next?.per.endsWith("Q2") ? " (2ª quinc.)" : ""
                const pill = st.venc.length ? <StatusPill tone="vencido">Vencido hace {days(st.venc[0].due, today)} días</StatusPill>
                  : !next ? <StatusPill tone="pagado" check>Al día</StatusPill>
                  : days(today, next.due) <= anticipo ? <StatusPill tone="porVencer">{relTime(toDay(next.due), today)}</StatusPill>
                  : <StatusPill tone="gray">{relTime(toDay(next.due), today)}</StatusPill>
                return (
                  <ListRow key={f.id} icon={cat?.icon ?? "house"} iconClassName={st.venc.length ? "bg-danger-soft text-danger" : undefined}
                    title={f.nombre} badges={<>{f.variable && <StatusPill tone="info">varía según consumo</StatusPill>}{f.link_type && <StatusPill tone="estimado">aporte</StatusPill>}{pill}</>}
                    subtitle={[cat?.nombre, FFREC[f.frec], next && `próximo: ${fmtDate(next.due)}${q}`, f.proveedor].filter(Boolean).join(" · ")}
                    value={f.variable && f.vmin ? <span className="grid text-right"><span className="font-bold"><Money value={Number(f.vmin)} short /> – <Money value={Number(f.vmax)} short /></span><span className="text-xs text-muted-foreground">promedio <Money value={Number(f.valor)} /></span></span> : <Money value={Number(f.valor)} className="font-bold" />}
                    onClick={canEdit ? () => setEditing(f) : undefined}
                    actions={canEdit ? [
                      ...(next ? [{ label: `Pagar ${f.nombre}`, icon: "circle-check", onClick: () => setPaying(f), className: st.venc.length ? "text-danger" : "text-success" }] : []),
                      { label: `Editar ${f.nombre}`, icon: "pencil", onClick: () => setEditing(f) },
                      { label: `Eliminar ${f.nombre}`, icon: "trash-2", onClick: () => del.mutate(f), destructive: true },
                    ] : []} />
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card className="shadow-card ring-0">
        <CardHeader><CardTitle className="text-base">Pagos registrados este mes</CardTitle></CardHeader>
        <CardContent>
          {!paidThisMonth.length ? <p className="text-sm text-muted-foreground">Aún no registras pagos este mes.</p> : (
            <ul className="-mx-2 grid">
              {paidThisMonth.map(({ f, p }) => (
                <ListRow key={p.id} icon="circle-check" iconClassName="bg-success-soft text-success" title={f.nombre}
                  subtitle={`Pagado el ${fmtDate(p.fecha)}${methods.find((m) => m.id === p.payment_method_id) ? ` · ${methods.find((m) => m.id === p.payment_method_id)!.nombre}` : ""}`}
                  value={<Money value={Number(p.valor)} className="font-bold" />}
                  actions={canEdit ? [{ label: "Deshacer pago", icon: "undo-2", onClick: () => unpay(p.id) }] : []} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <FixedForm open={nuevo || !!editing} onOpenChange={(o) => { if (!o) { setNuevo(false); setEditing(null); setId(null) } }} fixed={editing} />
      <PayFixedDialog fixed={paying} onOpenChange={(o) => !o && setPaying(null)} onReschedule={(f) => setEditing(f)} />
    </div>
  )
}
