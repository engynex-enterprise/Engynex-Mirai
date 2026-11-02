"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { DataTable, DTTwoLine, catalogMatch, catalogOptions, type DTColumn } from "@/components/mirai/data-table"
import { EmptyState } from "@/components/mirai/empty-state"
import { Icon } from "@/components/mirai/icon"
import { useCanEdit } from "@/components/app/app-context"
import { useList, useSave, useSoftDelete } from "@/hooks/use-book-data"
import { useIdParam, useNewParam } from "@/hooks/use-new-param"
import { brandFor } from "@/lib/brands"
import { PROVIDER_TIPOS, fmtNit, fmtSitio, fmtTelefono, providerUsage, sugerenciasPendientes, tipoLabel, type ProviderUsage } from "@/lib/domain"
import { providerDebts, providerNextPayments, type ProviderDebt, type ProviderNext } from "@/lib/domain/proveedor-pagos"
import { fmtDate, todayISO } from "@/lib/format"
import { DUE_HINT, DUE_TONE, dueState, dueText } from "@/lib/list-helpers"
import { useBookData } from "@/features/book/use-book-data"
import { useCategories, usePaymentMethods, useProviders, useSettings } from "@/features/catalogs/hooks"
import { ProviderDetail } from "./provider-detail"
import { ProviderAvatar } from "./provider-avatar"
import { ProviderDialog } from "./provider-dialog"
import type { Provider } from "./provider-select"

type R = Provider & { u: ProviderUsage; next?: ProviderNext; debt?: ProviderDebt }
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
  const today = todayISO()
  const mes = today.slice(0, 7)
  const { data: list, isPending } = useProviders()
  const { data: fixed = [] } = useList("fixed_expenses")
  const { data: subs = [] } = useList("subscriptions")
  const { data: expenses = [] } = useList("expenses")
  const { data: cats = [] } = useCategories()
  const { data: cfg } = useSettings()
  const { data: methods = [] } = usePaymentMethods()
  const { data: book } = useBookData()
  const save = useSave("providers")
  const [detailId, setDetailId] = useIdParam()
  const del = useSoftDelete("providers", "Proveedor eliminado")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Provider | null>(null)
  const dialogOpen = open || !!nuevo || !!editing
  const closeDialog = () => { setOpen(false); setEditing(null); setNuevo?.(false) }

  const trm = cfg?.trm as Record<string, number> | undefined
  const usage = useMemo(() => providerUsage({ fixed, subs, expenses }, trm ?? {}, mes), [fixed, subs, expenses, trm, mes])
  // Próximo pago (gastos fijos con sus pagos y suscripciones) y deudas enlazadas (Me deben / Le debo).
  const nexts = useMemo(() => providerNextPayments((book?.fixedExpenses ?? []) as never, subs as never, today, trm ?? {}), [book, subs, today, trm])
  const debts = useMemo(() => providerDebts((book?.loans ?? []) as never, today), [book, today])
  const rows: R[] | undefined = useMemo(() => list?.map((p) => ({ ...p, u: usage.get(p.id) ?? NONE, next: nexts.get(p.id), debt: debts.get(p.id) })), [list, usage, nexts, debts])
  const detail = detailId ? rows?.find((r) => r.id === detailId) ?? null : null
  const activos = rows?.filter((r) => r.activo) ?? []
  const mensual = activos.reduce((a, r) => a + r.u.mensual, 0)
  const pagado = (rows ?? []).reduce((a, r) => a + r.u.pagadoMes, 0)
  const sugeridas = useMemo(() => sugerenciasPendientes(list ?? []), [list])
  const catName = (id: string | null) => cats.find((c) => c.id === id)?.nombre
  const methodOf = (r: R) => methods.find((m) => m.id === r.payment_method_id)
  const anticipo = Number(cfg?.anticipo ?? 5)
  const router = useRouter()

  const columns: DTColumn<R>[] = [
    {
      id: "nombre", header: "Proveedor", sort: (r) => r.nombre.toLowerCase(), csv: (r) => r.nombre,
      // Tocar el nombre abre el detalle (por eso no hay botón "Detalles").
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <ProviderAvatar p={r} size={32} />
          <span className="grid min-w-0 leading-tight">
            <button type="button" className="max-w-[18rem] truncate text-left font-semibold hover:text-link hover:underline" title={`Ver el detalle de ${r.nombre}`} onClick={() => setDetailId(r.id)}>{r.nombre}</button>
            <span className="max-w-[18rem] truncate text-xs text-muted-foreground">{[tipoLabel(r.tipo), r.nit && `NIT ${fmtNit(r.nit)}`, r.referencia && `Ref. ${r.referencia}`].filter(Boolean).join(" · ")}</span>
          </span>
        </span>
      ),
    },
    { id: "tipo", header: "Tipo", hidden: true, sort: (r) => tipoLabel(r.tipo), csv: (r) => tipoLabel(r.tipo), cell: (r) => <DTTwoLine top={tipoLabel(r.tipo)} bottom={catName(r.category_id)} /> },
    { id: "uso", header: "Lo usas en", hidden: true, info: "Cuántos gastos fijos, suscripciones y gastos tienen este proveedor.", sort: (r) => r.u.fijos + r.u.suscripciones + r.u.gastos, csv: (r) => usoText(r.u), cell: (r) => <span className={r.u.fijos + r.u.suscripciones + r.u.gastos ? "" : "text-muted-foreground"}>{usoText(r.u)}</span> },
    { id: "mensual", header: "Al mes", hidden: true, info: "Lo que le pagas al mes por tus gastos fijos y suscripciones con este proveedor (los anuales y bimestrales, repartidos por mes).", align: "right", sort: (r) => r.u.mensual, csv: (r) => r.u.mensual, cell: (r) => <Money value={r.u.mensual} /> },
    {
      id: "proximo", header: "Próximo pago", info: "El pago más cercano de sus gastos fijos y suscripciones (si hay uno vencido, sale primero).", sort: (r) => r.next?.fecha ?? "9999", csv: (r) => (r.next ? `${r.next.fecha} ${Math.round(r.next.valor)}` : ""),
      cell: (r) => { if (!r.next) return <span className="text-muted-foreground">—</span>; const st = dueState(r.next.fecha, today, anticipo); return <DTTwoLine top={<span className="flex flex-wrap items-center gap-1.5"><Money value={r.next.valor} /><StatusPill tone={DUE_TONE[st]} hint={`${DUE_HINT[st]} ${r.next.origen === "fijo" ? "Gasto fijo" : "Suscripción"}: ${r.next.nombre}.`}>{dueText(r.next.fecha, today)}</StatusPill></span>} bottom={`${fmtDate(r.next.fecha)} · ${r.next.nombre}`} /> },
    },
    {
      id: "medio", header: "Medio de pago", hidden: true, info: "Con qué le pagas normalmente. Se pone solo cuando registras un gasto con este proveedor.", sort: (r) => methodOf(r)?.nombre ?? "~", csv: (r) => methodOf(r)?.nombre ?? "",
      cell: (r) => { const m = methodOf(r); return m ? <span className="inline-flex items-center gap-2"><Icon name={m.icon || "wallet"} className="size-4 text-muted-foreground" />{m.nombre}</span> : <span className="text-muted-foreground">—</span> },
    },
    {
      id: "deuda", header: "Le debes / Te debe", info: "Préstamos enlazados con este proveedor en Le debo y Me deben.", align: "right", sort: (r) => (r.debt ? r.debt.debes - r.debt.teDebe : 0), csv: (r) => (r.debt ? `Le debes ${Math.round(r.debt.debes)} · Te debe ${Math.round(r.debt.teDebe)}` : ""),
      cell: (r) => !r.debt ? <span className="text-muted-foreground">—</span> : (
        <span className="grid justify-items-end gap-0.5 text-[14px]">
          {r.debt.debes > 0 && <Link href={`/le-debo?id=${r.debt.loans.find((l) => l.kind === "pagar")?.id ?? ""}`} className="hover:underline">Le debes <Money value={r.debt.debes} className="font-semibold text-danger" /></Link>}
          {r.debt.teDebe > 0 && <Link href={`/me-deben?id=${r.debt.loans.find((l) => l.kind === "cobrar")?.id ?? ""}`} className="hover:underline">Te debe <Money value={r.debt.teDebe} className="font-semibold text-success" /></Link>}
          {r.debt.mora && <StatusPill tone="vencido" hint="Hay cuotas cuya fecha ya pasó sin pago registrado.">atrasado</StatusPill>}
          {!r.debt.debes && !r.debt.teDebe && <StatusPill tone="pagado" check>pagado</StatusPill>}
        </span>
      ),
    },
    { id: "pagado", header: "Pagado este mes", hidden: true, align: "right", sort: (r) => r.u.pagadoMes, csv: (r) => r.u.pagadoMes, cell: (r) => <Money value={r.u.pagadoMes} /> },
    {
      id: "contacto", header: "Contacto", hidden: true, csv: (r) => [fmtTelefono(r.telefono), r.correo, r.sitio_web].filter(Boolean).join(" · "),
      cell: (r) => {
        const web = fmtSitio(r.sitio_web)
        if (!r.telefono && !r.correo && !web) return <span className="text-muted-foreground">—</span>
        return (
          <span className="grid gap-0.5 text-[13px] leading-tight">
            {r.telefono && <a href={`tel:${r.telefono.replace(/[^\d+]/g, "")}`} className="tabular-nums hover:underline">{fmtTelefono(r.telefono)}</a>}
            {r.correo && <a href={`mailto:${r.correo.trim().toLowerCase()}`} className="truncate text-muted-foreground hover:underline">{r.correo.trim().toLowerCase()}</a>}
            {web && <a href={web.href} target="_blank" rel="noopener noreferrer" className="truncate text-link hover:underline">{web.texto}</a>}
          </span>
        )
      },
    },
    { id: "estado", header: "Estado", sort: (r) => (r.activo ? 0 : 1), csv: (r) => (r.activo ? "Activo" : "Inactivo"), cell: (r) => <StatusPill tone={r.activo ? "ok" : "gray"}>{r.activo ? "Activo" : "Inactivo"}</StatusPill> },
    { id: "nit", header: "NIT", hidden: true, csv: (r) => r.nit, cell: (r) => (r.nit ? <span className="tabular-nums">{fmtNit(r.nit)}</span> : "—") },
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
          { id: "deuda", label: "Deudas", options: [{ value: "debes", label: "Le debes" }, { value: "tedebe", label: "Te debe" }], match: (r, v) => (v === "debes" ? (r.debt?.debes ?? 0) > 0 : (r.debt?.teDebe ?? 0) > 0) },
          { id: "vencidos", label: "Pagos", options: [{ value: "venc", label: "Con pagos vencidos" }, { value: "mes", label: "Con pago este mes" }], match: (r, v) => (v === "venc" ? !!r.next?.vencido || !!r.debt?.mora : !!r.next && r.next.fecha.slice(0, 7) <= mes) },
          { id: "medio", label: "Medio de pago", options: catalogOptions(rows, methods, (r) => r.payment_method_id, "Sin medio de pago"), match: catalogMatch((r) => r.payment_method_id) },
        ]}
        create={can ? { label: "Agregar proveedor", onClick: () => setOpen(true) } : undefined}
        exportName="proveedores"
        actions={can ? [
          { label: "Editar", onSelect: (r) => setEditing(r) },
          { label: "Registrar una deuda con este proveedor", onSelect: (r) => router.push(`/le-debo?nuevo=1&prov=${r.id}`) },
          { label: "Registrar lo que me debe", onSelect: (r) => router.push(`/me-deben?nuevo=1&prov=${r.id}`) },
          { label: "Desactivar", hidden: (r) => !r.activo, onSelect: (r) => save.mutate({ id: r.id, activo: false } as never, { onSuccess: () => toast(`“${r.nombre}” quedó inactivo`, { description: "Ya no sale en el selector. Lo puedes activar cuando quieras." }) }) },
          { label: "Activar", hidden: (r) => r.activo, onSelect: (r) => save.mutate({ id: r.id, activo: true } as never, { onSuccess: () => toast.success(`“${r.nombre}” está activo`) }) },
          { label: "Eliminar", destructive: true, onSelect: (r) => del.mutate({ id: r.id, nombre: r.nombre }) },
        ] : undefined}
        menuAt="start"
        compact
        initialSort={{ id: "proximo", dir: "asc" }}
        emptyState={<EmptyState iso="proveedores" title="Aún no tienes proveedores" description="Agrega uno o elige uno de los comunes en Colombia aquí abajo." action={can && <Button onClick={() => setOpen(true)}><Plus /> Agregar proveedor</Button>} />}
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
      <ProviderDetail provider={detail} next={detail?.next} debt={detail?.debt} onOpenChange={(o) => !o && setDetailId(null)} onEdit={(p) => { setDetailId(null); setEditing(p) }} />
    </div>
  )
}
