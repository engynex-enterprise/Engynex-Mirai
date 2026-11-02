"use client"

import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { EmptyState } from "@/components/mirai/empty-state"
import { ListRow } from "@/components/mirai/list-row"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { DataTable, catalogMatch, catalogOptions } from "@/components/mirai/data-table"
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook, useList, useSave, useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { createClient } from "@/utils/supabase/client"
import { addMonths, conv, detectSubs, iso, parseDate, subMensual, subsMes } from "@/lib/domain"
import { fmtDate, fmtMoney, todayISO } from "@/lib/format"
import { DUE_HINT, DUE_TONE, dueState, dueText } from "@/lib/list-helpers"
import type { Row } from "@/lib/supabase/tables"
import { useCategories, usePaymentMethods, useProviders, useSettings } from "@/features/catalogs/hooks"
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
  const { data: providers = [] } = useProviders()
  const del = useSoftDelete("subscriptions", "Suscripción eliminada")
  const add = useSave("subscriptions", { created: "Suscripción agregada" })
  const trm = (cfg?.trm ?? {}) as Record<string, number>
  const anticipo = Number(cfg?.anticipo ?? 5)
  const activas = subs.filter((s) => s.activa)
  const mensual = subsMes(activas.map((s) => ({ ...s, valor: Number(s.valor), proximo: s.proximo ?? today })), trm)
  const sugeridas = useMemo(() => detectSubs(expenses.map((g) => ({ ...g, valor: Number(g.valor) })), subs), [expenses, subs])

  /** "Ya se cobró": registra el gasto en Suscripciones (en COP) y avanza el próximo cobro (subdone de la v4). */
  const cobrada = async (s: Row<"subscriptions">) => {
    const sb = createClient()
    const valor = Math.round(conv(Number(s.valor), s.currency, trm) / Math.max(1, s.comparte))
    const fecha = s.proximo && s.proximo <= today ? s.proximo : today
    const { error } = await sb.from("expenses").insert({ book_id: bookId, fecha, descripcion: s.nombre, valor, category_id: s.category_id ?? cats.find((c) => c.nombre === "Suscripciones")?.id ?? null, payment_method_id: s.payment_method_id, provider_id: s.provider_id, hormiga: false })
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
      <KpiGrid cols={3}>
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
                <ListRow key={d.desc} icon="repeat" media={<EntityLogo name={d.desc} icon="repeat" seed={d.desc} />} title={d.desc} subtitle={`Se repite en ${d.meses} meses · ${cats.find((c) => c.id === d.category_id)?.nombre ?? "Sin categoría"}`}
                  value={<Money value={d.valor} className="font-bold" />}
                  actions={canEdit ? [{ label: `Agregar ${d.desc} como suscripción`, icon: "plus", onClick: () => add.mutate({ nombre: d.desc, valor: d.valor, ciclo: "mensual", currency: "COP", proximo: iso(new Date(Date.now() + 15 * 864e5)), category_id: cats.find((c) => c.nombre === "Suscripciones")?.id ?? null } as never) }] : []} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <DataTable<Row<"subscriptions">>
        title="Tus suscripciones" info="Servicios que se cobran solos. Usa “Ya se cobró” cuando llegue el cobro: queda en tus gastos y pasa al siguiente."
        data={subs} loading={isPending} rowKey={(s) => s.id} noun={["suscripción", "suscripciones"]} exportName="suscripciones"
        columns={[
          { id: "proximo", header: "Próximo cobro", sort: (s) => (s.activa ? s.proximo ?? "9999" : "99999"), csv: (s) => s.proximo },
          { id: "nombre", header: "Servicio", sort: (s) => s.nombre.toLowerCase(), csv: (s) => s.nombre },
          { id: "valor", header: "Valor", sort: (s) => conv(Number(s.valor), s.currency, trm), csv: (s) => Number(s.valor) },
          { id: "moneda", header: "Moneda", csv: (s) => s.currency },
          { id: "mensual", header: "Al mes (tu parte)", sort: (s) => subMensual({ ...s, valor: Number(s.valor) }, trm) / Math.max(1, s.comparte), csv: (s) => Math.round(subMensual({ ...s, valor: Number(s.valor) }, trm) / Math.max(1, s.comparte)) },
          { id: "ciclo", header: "Cobro", csv: (s) => (s.ciclo === "anual" ? "Anual" : "Mensual") },
          { id: "medio", header: "Medio de pago", csv: (s) => methods.find((m) => m.id === s.payment_method_id)?.nombre ?? "" },
          { id: "estado", header: "Estado", csv: (s) => (s.activa ? "Activa" : "Pausada") },
        ]}
        initialSort={{ id: "proximo", dir: "asc" }}
        total={{ value: (s) => (s.activa ? subMensual({ ...s, valor: Number(s.valor) }, trm) / Math.max(1, s.comparte) : 0), label: "te cuestan al mes" }}
        search={{ placeholder: "Buscar suscripción", text: (s) => `${s.nombre} ${methods.find((m) => m.id === s.payment_method_id)?.nombre ?? ""} ${providers.find((p) => p.id === s.provider_id)?.nombre ?? ""}` }}
        views={[
          { id: "todas", label: "Todas" },
          { id: "mes", label: "Se cobran este mes", match: (s) => s.activa && !!s.proximo && s.proximo.slice(0, 7) <= today.slice(0, 7) },
          { id: "compartidas", label: "Compartidas", match: (s) => s.comparte > 1, hint: "Las que pagas entre varias personas: contamos solo tu parte." },
        ]}
        filters={[
          { id: "ciclo", label: "Cada cuánto", options: [{ value: "mensual", label: "Mensual" }, { value: "anual", label: "Anual" }], match: (s, v) => s.ciclo === v },
          { id: "moneda", label: "Moneda", options: [...new Set(subs.map((s) => s.currency))].map((c) => ({ value: c, label: c === "COP" ? "Pesos (COP)" : c })), match: (s, v) => s.currency === v },
          { id: "medio", label: "Medio de pago", options: catalogOptions(subs, methods, (s) => s.payment_method_id, "Sin medio de pago"), match: catalogMatch((s) => s.payment_method_id) },
          { id: "estado", label: "Estado", options: [{ value: "on", label: "Activas" }, { value: "off", label: "Pausadas" }], match: (s, v) => (v === "on") === s.activa },
          { id: "proximo", label: "Próximo cobro", kind: "dates", value: (s) => s.proximo },
          { id: "valor", label: "Valor", kind: "range", money: true, value: (s) => conv(Number(s.valor), s.currency, trm) },
        ]}
        emptyState={<EmptyState iso="suscripciones" title="Sin suscripciones registradas" description="Agrega lo que se cobra solo para que no te lleguen cobros olvidados." action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar suscripción</Button>} />}
        item={(s) => {
          const anual = (subMensual({ ...s, valor: Number(s.valor) }, trm) * 12) / Math.max(1, s.comparte)
          const due = s.activa && s.proximo ? dueState(s.proximo, today, anticipo) : null
          return (
            <ListRow key={s.id} icon="repeat" media={<EntityLogo name={s.nombre} src={s.logo_path} provider={providers.find((p) => p.id === s.provider_id)} icon="repeat" seed={s.nombre} />} title={s.nombre}
              badges={<>
                {s.comparte > 1 && <StatusPill tone="info" hint="La pagas entre varias personas: en tu presupuesto contamos solo tu parte.">compartida entre {s.comparte}</StatusPill>}
                {!s.activa && <StatusPill tone="gray" hint="Pausada: no cuenta en lo que pagas al mes.">pausada</StatusPill>}
                {due && due !== "luego" && <StatusPill tone={DUE_TONE[due]} hint={due === "vencido" ? "La fecha del cobro ya pasó. Si ya te cobraron, toca “Ya se cobró”." : DUE_HINT[due]}>{due === "vencido" ? "cobro pendiente" : dueText(s.proximo!, today)}</StatusPill>}
              </>}
              subtitle={[s.ciclo === "anual" ? "Anual" : "Mensual", s.proximo && `próximo cobro ${fmtDate(s.proximo)}`, methods.find((m) => m.id === s.payment_method_id)?.nombre, s.comparte > 1 && `tu parte: ${fmtMoney(anual)} al año`].filter(Boolean).join(" · ")}
              value={<Money value={Number(s.valor)} currency={s.currency} className="font-bold" />}
              onClick={canEdit ? () => setEditing(s) : undefined}
              actions={canEdit ? [
                { label: `Ya se cobró ${s.nombre}`, tip: "Ya se cobró: registrarlo en mis gastos", icon: "circle-check", className: "text-success", onClick: () => cobrada(s) },
                { label: `Editar ${s.nombre}`, tip: "Editar", icon: "pencil", onClick: () => setEditing(s) },
                { label: `Eliminar ${s.nombre}`, tip: "Eliminar", icon: "trash-2", onClick: () => del.mutate(s), destructive: true },
              ] : []} />
          )
        }}
      />
      <SubscriptionForm open={nuevo || !!editing} onOpenChange={(o) => { if (!o) { setNuevo(false); setEditing(null) } }} sub={editing} />
    </div>
  )
}
