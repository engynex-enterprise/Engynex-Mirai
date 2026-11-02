"use client"

import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { toast } from "@/components/mirai/toast"
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
import { invalidateBook, useList, useSave, useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { createClient } from "@/utils/supabase/client"
import { addMonths, conv, detectSubs, iso, parseDate, subMensual, subsMes } from "@/lib/domain"
import { fmtDate, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { useCategories, usePaymentMethods, useSettings } from "@/features/catalogs/hooks"
import { SubAvatar } from "./sub-avatar"
import { SubscriptionForm } from "./subscription-form"

export function SubscriptionsView() {
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const today = todayISO()
  const [nuevo, setNuevo] = useNewParam()
  const [editing, setEditing] = useState<Row<"subscriptions"> | null>(null)
  const { data: subs = [], isPending } = useList("subscriptions", { order: { column: "proximo" } })
  const { data: expenses = [] } = useList("expenses")
  const { data: cfg } = useSettings()
  const { data: methods = [] } = usePaymentMethods()
  const { data: cats = [] } = useCategories()
  const del = useSoftDelete("subscriptions", "Suscripción eliminada")
  const add = useSave("subscriptions", { created: "Suscripción agregada" })
  const trm = (cfg?.trm ?? {}) as Record<string, number>
  const activas = subs.filter((s) => s.activa)
  const mensual = subsMes(activas.map((s) => ({ ...s, valor: Number(s.valor), proximo: s.proximo ?? today })), trm)
  const sugeridas = useMemo(() => detectSubs(expenses.map((g) => ({ ...g, valor: Number(g.valor) })), subs), [expenses, subs])

  /** "Ya se cobró": registra el gasto en Suscripciones (en COP) y avanza el próximo cobro (subdone de la v4). */
  const cobrada = async (s: Row<"subscriptions">) => {
    const sb = createClient()
    const valor = Math.round(conv(Number(s.valor), s.currency, trm) / Math.max(1, s.comparte))
    const fecha = s.proximo && s.proximo <= today ? s.proximo : today
    const { error } = await sb.from("expenses").insert({ book_id: bookId, fecha, descripcion: s.nombre, valor, category_id: s.category_id ?? cats.find((c) => c.nombre === "Suscripciones")?.id ?? null, payment_method_id: s.payment_method_id, hormiga: false })
    if (error) return toast.error("No se pudo registrar", { description: error.message })
    const next = iso(addMonths(parseDate(s.proximo ?? today), s.ciclo === "anual" ? 12 : 1))
    await sb.from("subscriptions").update({ proximo: next }).eq("id", s.id)
    toast.success("Cobro registrado", { description: `Quedó en tus gastos. Próximo cobro: ${fmtDate(next)}.` })
    invalidateBook(qc, bookId, "subscriptions"); invalidateBook(qc, bookId, "expenses")
  }

  return (
    <div className="grid gap-6">
      <PageHeader id="suscripciones" description="Streaming, apps, gimnasio y servicios que se cobran solos. Las que encontramos repetidas en tus gastos aparecen como sugerencia."
        actions={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar</Button>} />
      <KpiGrid className="xl:grid-cols-3">
        <Kpi icon="repeat" tone="blue" label="Te cuestan al mes" loading={isPending} value={<Money value={mensual} />} sub={`${activas.length} activas`} />
        <Kpi icon="calendar" tone="amber" label="En un año" loading={isPending} value={<Money value={mensual * 12} />} sub="Si no cancelas ninguna" />
        <Kpi icon="search" tone="brand" label="Detectadas en tus gastos" loading={isPending} value={sugeridas.length} sub="Cobros que se repiten" />
      </KpiGrid>
      {sugeridas.length > 0 && (
        <Card className="shadow-card ring-0">
          <CardHeader><CardTitle className="text-base">¿Las sigues usando?</CardTitle></CardHeader>
          <CardContent>
            <ul className="-mx-2 grid">
              {sugeridas.map((d) => (
                <ListRow key={d.desc} icon="repeat" title={d.desc} subtitle={`Se repite en ${d.meses} meses · ${cats.find((c) => c.id === d.category_id)?.nombre ?? "Sin categoría"}`}
                  value={<Money value={d.valor} className="font-bold" />}
                  actions={canEdit ? [{ label: `Agregar ${d.desc} como suscripción`, icon: "plus", onClick: () => add.mutate({ nombre: d.desc, valor: d.valor, ciclo: "mensual", currency: "COP", proximo: iso(new Date(Date.now() + 15 * 864e5)), category_id: cats.find((c) => c.nombre === "Suscripciones")?.id ?? null } as never) }] : []} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <Card className="shadow-card ring-0">
        <CardContent>
          {isPending ? (
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="flex items-center gap-3 py-3"><Skeleton className="size-10 rounded-full" /><div className="grid flex-1 gap-1.5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/2" /></div></div>)
          ) : !subs.length ? (
            <EmptyState iso="suscripciones" title="Sin suscripciones registradas" description="Agrega lo que se cobra solo para que no te lleguen cobros olvidados." action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar suscripción</Button>} />
          ) : (
            <ul className="-mx-2 grid">
              {subs.map((s) => {
                const anual = subMensual({ ...s, valor: Number(s.valor) }, trm) * 12
                return (
                    <ListRow key={s.id} icon="repeat" media={<SubAvatar nombre={s.nombre} logo={s.logo_path} />} title={s.nombre}
                      badges={s.comparte > 1 ? <StatusPill tone="info">compartida entre {s.comparte}</StatusPill> : null}
                      subtitle={[s.ciclo === "anual" ? "Anual" : "Mensual", s.proximo && `próximo cobro ${fmtDate(s.proximo)}`, methods.find((m) => m.id === s.payment_method_id)?.nombre, s.comparte > 1 && `tu parte: ${new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(anual)} al año`].filter(Boolean).join(" · ")}
                      value={<Money value={Number(s.valor)} currency={s.currency} className="font-bold" />}
                      onClick={canEdit ? () => setEditing(s) : undefined}
                      actions={canEdit ? [
                        { label: `Ya se cobró ${s.nombre}`, icon: "circle-check", onClick: () => cobrada(s) },
                        { label: `Editar ${s.nombre}`, icon: "pencil", onClick: () => setEditing(s) },
                        { label: `Eliminar ${s.nombre}`, icon: "trash-2", onClick: () => del.mutate(s), destructive: true },
                      ] : []} />
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <SubscriptionForm open={nuevo || !!editing} onOpenChange={(o) => { if (!o) { setNuevo(false); setEditing(null) } }} sub={editing} />
    </div>
  )
}
