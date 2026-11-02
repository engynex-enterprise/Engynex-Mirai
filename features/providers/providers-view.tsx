"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Plus } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { DataTable, DTPrimary, DTTwoLine, type DTColumn } from "@/components/mirai/data-table"
import { useCanEdit } from "@/components/app/app-context"
import { useList, useSave, useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { brandFor } from "@/lib/brands"
import { PROVIDER_TIPOS, providerUsage, sugerenciasPendientes, tipoLabel, type ProviderUsage } from "@/lib/domain"
import { todayISO } from "@/lib/format"
import { useCategories, useProviders, useSettings } from "@/features/catalogs/hooks"
import { ProviderAvatar } from "./provider-avatar"
import { ProviderDialog } from "./provider-dialog"
import type { Provider } from "./provider-select"

type R = Provider & { u: ProviderUsage }
const NONE: ProviderUsage = { fijos: 0, suscripciones: 0, gastos: 0, mensual: 0, pagadoMes: 0 }
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`
const usoText = (u: ProviderUsage) =>
  [u.fijos && plural(u.fijos, "gasto fijo", "gastos fijos"), u.suscripciones && plural(u.suscripciones, "suscripción", "suscripciones"), u.gastos && plural(u.gastos, "gasto", "gastos")].filter(Boolean).join(" · ") || "Aún no lo usas"

/** Página "Proveedores" (menú Mi dinero). */
export function ProvidersView() {
  const [nuevo, setNuevo] = useNewParam()
  return (
    <div className="grid gap-6">
      <PageHeader id="proveedores" />
      <ProvidersManager nuevo={nuevo} setNuevo={setNuevo} />
    </div>
  )
}

/**
 * Catálogo de proveedores del libro: tabla con búsqueda, filtros por tipo, orden y exportar (tarjetas en el celular),
 * cuánto se le paga a cada uno al mes y sugerencias comunes de Colombia para agregar con un toque. Se usa en la página
 * Proveedores y en Ajustes › Proveedores.
 */
export function ProvidersManager({ nuevo, setNuevo, embedded }: { nuevo?: boolean; setNuevo?: (o: boolean) => void; embedded?: boolean }) {
  const can = useCanEdit()
  const mes = todayISO().slice(0, 7)
  const { data: list, isPending } = useProviders()
  const { data: fixed = [] } = useList("fixed_expenses")
  const { data: subs = [] } = useList("subscriptions")
  const { data: expenses = [] } = useList("expenses")
  const { data: cats = [] } = useCategories()
  const { data: cfg } = useSettings()
  const save = useSave("providers")
  const del = useSoftDelete("providers", "Proveedor eliminado")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Provider | null>(null)
  const dialogOpen = open || !!nuevo || !!editing
  const closeDialog = () => { setOpen(false); setEditing(null); setNuevo?.(false) }

  const trm = cfg?.trm as Record<string, number> | undefined
  const usage = useMemo(() => providerUsage({ fixed, subs, expenses }, trm ?? {}, mes), [fixed, subs, expenses, trm, mes])
  const rows: R[] | undefined = useMemo(() => list?.map((p) => ({ ...p, u: usage.get(p.id) ?? NONE })), [list, usage])
  const activos = rows?.filter((r) => r.activo) ?? []
  const mensual = activos.reduce((a, r) => a + r.u.mensual, 0)
  const pagado = (rows ?? []).reduce((a, r) => a + r.u.pagadoMes, 0)
  const sugeridas = useMemo(() => sugerenciasPendientes(list ?? []), [list])
  const catName = (id: string | null) => cats.find((c) => c.id === id)?.nombre

  const columns: DTColumn<R>[] = [
    {
      id: "nombre", header: "Proveedor", sort: (r) => r.nombre.toLowerCase(), csv: (r) => r.nombre,
      cell: (r) => <DTPrimary media={<ProviderAvatar p={r} size={40} />} title={r.nombre} sub={[r.referencia && `Ref. ${r.referencia}`, r.nit && `NIT ${r.nit}`].filter(Boolean).join(" · ") || tipoLabel(r.tipo)} />,
    },
    { id: "tipo", header: "Tipo", sort: (r) => tipoLabel(r.tipo), csv: (r) => tipoLabel(r.tipo), cell: (r) => <DTTwoLine top={tipoLabel(r.tipo)} bottom={catName(r.category_id)} /> },
    { id: "uso", header: "Lo usas en", info: "Cuántos gastos fijos, suscripciones y gastos tienen este proveedor.", sort: (r) => r.u.fijos + r.u.suscripciones + r.u.gastos, csv: (r) => usoText(r.u), cell: (r) => <span className={r.u.fijos + r.u.suscripciones + r.u.gastos ? "" : "text-muted-foreground"}>{usoText(r.u)}</span> },
    { id: "mensual", header: "Al mes", info: "Lo que le pagas al mes por tus gastos fijos y suscripciones con este proveedor (los anuales y bimestrales, repartidos por mes).", align: "right", sort: (r) => r.u.mensual, csv: (r) => r.u.mensual, cell: (r) => <Money value={r.u.mensual} /> },
    { id: "pagado", header: "Pagado este mes", align: "right", sort: (r) => r.u.pagadoMes, csv: (r) => r.u.pagadoMes, cell: (r) => <Money value={r.u.pagadoMes} /> },
    { id: "contacto", header: "Contacto", csv: (r) => [r.telefono, r.correo, r.sitio_web].filter(Boolean).join(" · "), cell: (r) => <DTTwoLine top={r.telefono || r.correo || "—"} bottom={r.telefono ? r.correo || r.sitio_web : r.sitio_web} /> },
    { id: "estado", header: "Estado", sort: (r) => (r.activo ? 0 : 1), csv: (r) => (r.activo ? "Activo" : "Inactivo"), cell: (r) => <StatusPill tone={r.activo ? "ok" : "gray"}>{r.activo ? "Activo" : "Inactivo"}</StatusPill> },
    { id: "notas", header: "Notas", hidden: true, csv: (r) => r.notas, cell: (r) => r.notas || "—" },
  ]

  const addSugerido = (s: (typeof sugeridas)[number]) =>
    save.mutate({ nombre: s.nombre, tipo: s.tipo, brand: s.brand ?? brandFor(s.nombre), activo: true } as never, { onSuccess: () => toast.success("Proveedor agregado", { description: `“${s.nombre}”` }) })

  return (
    <div className="grid gap-6">
      {!embedded && (
        <KpiGrid>
          <Kpi icon="store" tone="blue" label="Proveedores activos" value={activos.length} sub={rows && rows.length !== activos.length ? `${rows.length - activos.length} inactivos` : "A quién le pagas"} loading={isPending} />
          <Kpi icon="calendar-days" tone="amber" label="Les pagas al mes" value={<Money value={mensual} />} sub="Gastos fijos y suscripciones" loading={isPending} />
          <Kpi icon="receipt" tone="green" label="Pagado este mes" value={<Money value={pagado} />} sub="Gastos registrados con proveedor" loading={isPending} />
        </KpiGrid>
      )}
      <DataTable<R>
        title="Tus proveedores" info="Las empresas o personas a las que les pagas. Elígelos en tus gastos fijos, suscripciones y gastos en vez de escribir el nombre cada vez."
        data={rows} loading={isPending} columns={columns} rowKey={(r) => r.id}
        search={{ placeholder: "Buscar proveedor", text: (r) => `${r.nombre} ${tipoLabel(r.tipo)} ${r.referencia} ${r.nit} ${r.telefono} ${r.correo}` }}
        filters={[
          { id: "tipo", label: "Tipo", options: Object.entries(PROVIDER_TIPOS).map(([value, t]) => ({ value, label: t.label })), match: (r, v) => r.tipo === v },
          { id: "estado", label: "Estado", options: [{ value: "on", label: "Activos" }, { value: "off", label: "Inactivos" }], match: (r, v) => (v === "on" ? r.activo : !r.activo) },
          { id: "uso", label: "Uso", options: [{ value: "si", label: "Con gastos fijos o suscripciones" }, { value: "no", label: "Sin uso" }], match: (r, v) => ((r.u.fijos + r.u.suscripciones > 0) === (v === "si")) },
        ]}
        create={can ? { label: "Agregar proveedor", onClick: () => setOpen(true) } : undefined}
        exportName="proveedores"
        actions={can ? [
          { label: "Editar", onSelect: (r) => setEditing(r) },
          { label: "Desactivar", hidden: (r) => !r.activo, onSelect: (r) => save.mutate({ id: r.id, activo: false } as never, { onSuccess: () => toast(`“${r.nombre}” quedó inactivo`, { description: "Ya no sale en el selector. Lo puedes activar cuando quieras." }) }) },
          { label: "Activar", hidden: (r) => r.activo, onSelect: (r) => save.mutate({ id: r.id, activo: true } as never, { onSuccess: () => toast.success(`“${r.nombre}” está activo`) }) },
          { label: "Eliminar", destructive: true, onSelect: (r) => del.mutate({ id: r.id, nombre: r.nombre }) },
        ] : undefined}
        initialSort={{ id: "mensual", dir: "desc" }}
        empty={<p className="text-muted-foreground">Aún no tienes proveedores. Agrega uno o elige uno de los comunes en Colombia aquí abajo.</p>}
      />
      {can && sugeridas.length > 0 && (
        <Card className="gap-3 p-4 shadow-card ring-0 sm:p-6">
          <div><h2 className="text-lg font-semibold">Comunes en Colombia</h2><p className="text-sm text-muted-foreground">Toca uno para agregarlo a tu lista. Solo se guardan los que elijas.</p></div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Proveedores comunes en Colombia">
            {sugeridas.map((s) => (
              <button key={s.nombre} type="button" disabled={save.isPending} onClick={() => addSugerido(s)} aria-label={`Agregar ${s.nombre}`}
                className="flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm hover:bg-hover disabled:opacity-60">
                <ProviderAvatar p={s} size={24} />{s.nombre}<Plus className="size-3.5 text-muted-foreground" />
              </button>
            ))}
          </div>
        </Card>
      )}
      {embedded && can && <div><Button variant="outline" asChild><Link href="/proveedores">Abrir la sección Proveedores</Link></Button></div>}
      <ProviderDialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()} provider={editing} />
    </div>
  )
}
