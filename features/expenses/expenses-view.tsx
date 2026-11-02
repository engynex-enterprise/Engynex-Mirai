"use client"

import { useMemo, useState } from "react"
import { parseAsString, useQueryState } from "nuqs"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Coffee, Pencil, Plus, Sparkles, Trash2 } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PageHeader } from "@/components/mirai/page-header"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { Notice } from "@/components/mirai/notice"
import { EmptyState } from "@/components/mirai/empty-state"
import { Icon } from "@/components/mirai/icon"
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { useList, useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { createClient } from "@/utils/supabase/client"
import { fmtDate, fmtMoney, fmtMonth, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"
import { memberName, useCategories, useMembers, usePaymentMethods, useSettings } from "@/features/catalogs/hooks"
import { reviewMonthHormiga } from "@/features/ai/actions"
import { ExpenseForm } from "./expense-form"
import { isHormiga } from "./logic"
import { AdSlot } from "@/features/ads/ad-slot"

const lastMonths = (n: number) => {
  const [y, m] = todayISO().split("-").map(Number)
  return Array.from({ length: n }, (_, i) => { const d = new Date(y, m - 1 - i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` })
}

export function ExpensesView() {
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const [mes, setMes] = useQueryState("mes", parseAsString.withDefault(todayISO().slice(0, 7)))
  const [nuevo, setNuevo] = useNewParam()
  const [editing, setEditing] = useState<Row<"expenses"> | null>(null)
  const { data: all, isPending } = useList("expenses", { order: { column: "fecha", ascending: false } })
  const { data: cats = [] } = useCategories()
  const { data: methods = [] } = usePaymentMethods()
  const { data: members = [] } = useMembers()
  const { data: cfg } = useSettings()
  const del = useSoftDelete("expenses", "Gasto eliminado")
  const umbral = Number(cfg?.umbral ?? 25000)
  const limite = Number(cfg?.limite ?? 250000)

  const toggleH = useMutation({
    mutationFn: async (g: Row<"expenses">) => {
      const next = !isHormiga(g, cats, umbral)
      const { error } = await createClient().from("expenses").update({ hormiga: next, hormiga_src: "manual", hormiga_razon: null }).eq("id", g.id)
      if (error) throw new Error(error.message)
      return next
    },
    onSuccess: (next) => toast(next ? "Marcado como gasto hormiga" : "Ya no es gasto hormiga"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["b", bookId, "expenses"] }),
  })

  const rows = useMemo(() => (all ?? []).filter((g) => g.fecha.startsWith(mes)), [all, mes])
  const stats = useMemo(() => {
    const today = todayISO()
    const [y, m] = mes.split("-").map(Number)
    const dim = new Date(y, m, 0).getDate()
    const isCurrent = today.startsWith(mes)
    const elapsed = isCurrent ? Number(today.slice(8, 10)) : dim
    const h = rows.filter((g) => isHormiga(g, cats, umbral))
    const llevas = h.reduce((s, g) => s + Number(g.valor), 0)
    const proy = isCurrent ? (llevas / Math.max(1, elapsed)) * dim : llevas
    const byCat = new Map<string, { n: number; v: number }>()
    for (const g of h) { const k = cats.find((c) => c.id === g.category_id)?.nombre ?? "Otros"; const e = byCat.get(k) ?? { n: 0, v: 0 }; byCat.set(k, { n: e.n + 1, v: e.v + Number(g.valor) }) }
    const cat = [...byCat.entries()].sort((a, b) => b[1].v - a[1].v)
    return { llevas, proy, anio: proy * 12, over: proy > limite, cat, elapsed, total: rows.reduce((s, g) => s + Number(g.valor), 0) }
  }, [rows, cats, umbral, limite, mes])

  const days = useMemo(() => {
    const map = new Map<string, Row<"expenses">[]>()
    for (const g of rows) map.set(g.fecha, [...(map.get(g.fecha) ?? []), g])
    return [...map.entries()]
  }, [rows])
  const today = todayISO()
  const yest = new Date(new Date(today + "T12:00:00").getTime() - 864e5).toISOString().slice(0, 10)
  const maxCat = Math.max(1, ...stats.cat.map(([, v]) => v.v))

  return (
    <div className="grid gap-6">
      <PageHeader id="gastos" description="Todo lo que gastas. Mirai detecta los gastos “hormiga”: pequeños, frecuentes y evitables, que juntos suman mucho. También puedes marcarlos tú con la taza."
        actions={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Registrar gasto</Button>} />

      <Card className="shadow-card ring-0">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Gastos hormiga de {today.startsWith(mes) ? "este mes" : fmtMonth(mes)}</CardTitle>
          <div className="flex items-center gap-2">
            {canEdit && <ReviewAI mes={mes} />}
            {!isPending && <StatusPill tone={stats.over ? "vencido" : "pagado"}>{stats.over ? "Sobre el límite" : "En rango"}</StatusPill>}
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid grid-cols-3 gap-3">
            {[["Llevas", stats.llevas], ["Proyección del mes", stats.proy], ["En un año", stats.anio]].map(([l, v]) => (
              <div key={l as string} className="rounded-md bg-muted p-3">
                <p className="text-xs text-muted-foreground">{l}</p>
                {isPending ? <Skeleton className="mt-1 h-5 w-20" /> : <Money value={v as number} className="text-base font-semibold" />}
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
              <Notice tone="warn" title={`Vas camino a gastar ${fmtMoney(stats.proy)} en gastos hormiga este mes`}>
                Tu límite es {fmtMoney(limite)}. En un año serían {fmtMoney(stats.anio)}.
              </Notice>
            )}
            {stats.cat.filter(([, v]) => v.n >= 6).map(([k, v]) => (
              <Notice key={k} tone="info" title={`${k}: ${v.n} compras este mes`}>
                Suman {fmtMoney(v.v)}. Al año serían unos {fmtMoney((v.v / Math.max(1, stats.elapsed)) * 30 * 12)}.
              </Notice>
            ))}
            {!isPending && !stats.over && !stats.cat.some(([, v]) => v.n >= 6) && <Notice tone="ok" title="Sin alertas">Tus gastos pequeños están bajo control.</Notice>}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card ring-0">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Movimientos</CardTitle>
            <p className="text-sm text-muted-foreground">{rows.length} gastos · <Money value={stats.total} /></p>
          </div>
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-48" aria-label="Mes"><SelectValue /></SelectTrigger>
            <SelectContent>{lastMonths(12).map((m) => <SelectItem key={m} value={m} className="capitalize">{fmtMonth(m)}</SelectItem>)}</SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="grid gap-4">
          {isPending ? (
            Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex items-center gap-3"><Skeleton className="size-10 rounded-full" /><div className="grid flex-1 gap-1.5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/4" /></div><Skeleton className="h-5 w-20" /></div>)
          ) : !rows.length ? (
            <EmptyState iso="gastos" title="No hay gastos en este mes" description="Registra lo que pagas y Mirai te ayuda a ver en qué se va tu plata." action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Registrar gasto</Button>} />
          ) : (
            days.map(([d, list]) => (
              <section key={d} className="grid gap-1">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase">
                  {d === today ? "Hoy · " : d === yest ? "Ayer · " : ""}{fmtDate(d, { long: true })}
                </h3>
                <ul className="-mx-2 grid">
                  {list.map((g) => {
                    const cat = cats.find((c) => c.id === g.category_id)
                    const h = isHormiga(g, cats, umbral)
                    return (
                      <li key={g.id} className="group flex items-center gap-3 rounded-md px-2 py-2 hover:bg-hover">
                        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", h ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground")}>
                          <Icon name={cat?.icon ?? "receipt"} className="size-5" />
                        </span>
                        <button type="button" className="grid min-w-0 flex-1 text-left" onClick={() => canEdit && setEditing(g)} disabled={!canEdit}>
                          <span className="flex flex-wrap items-center gap-1.5 font-semibold">
                            <span className="truncate">{g.descripcion || "Gasto"}</span>
                            {h && <StatusPill tone="porVencer" title={g.hormiga_razon ?? undefined}>{g.hormiga_src === "ia" ? <Sparkles className="size-3" /> : g.hormiga_src === "manual" ? <Pencil className="size-3" /> : null}hormiga</StatusPill>}
                            {g.fixed_expense_id && <StatusPill tone="info">fijo</StatusPill>}
                          </span>
                          <span className="truncate text-[13px] text-muted-foreground">
                            {[cat?.nombre ?? "Sin categoría", memberName(g.member_id, members), methods.find((x) => x.id === g.payment_method_id)?.nombre].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                        <Money value={Number(g.valor)} className="font-bold" />
                        {canEdit && (
                          <div className="flex shrink-0 gap-0.5">
                            {!g.fixed_expense_id && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" aria-label={h ? "Quitar de hormiga" : "Marcar como hormiga"} onClick={() => toggleH.mutate(g)} className={cn(h && "text-[#D98300]")}>
                                    <Coffee />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{h ? "Quitar de hormiga" : "Marcar como hormiga"}</TooltipContent>
                              </Tooltip>
                            )}
                            <Button variant="ghost" size="icon" aria-label="Eliminar gasto" onClick={() => del.mutate(g)}><Trash2 /></Button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))
          )}
        </CardContent>
      </Card>

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
