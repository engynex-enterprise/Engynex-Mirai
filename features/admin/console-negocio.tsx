"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNowStrict } from "date-fns"
import { es } from "date-fns/locale"
import { Download, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"

import { Combobox } from "@/components/mirai/combobox"
import { DatePicker } from "@/components/mirai/date-picker"
import { FormField } from "@/components/mirai/field"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { MoneyInput } from "@/components/mirai/money-input"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { Segmented } from "@/components/mirai/choice-cards"
import { StatusPill } from "@/components/mirai/status-pill"
import { createClient } from "@/utils/supabase/client"
import { norm } from "@/lib/domain"
import { fmtDate } from "@/lib/format"
import { precio, type Coupon } from "@/lib/plans"
import { adminClients, adminOverview, adminRevenue } from "./actions"
import { adminAssignPlan, adminHouseholds, adminManualPayment, adminSubscriptions, adminUpdatePayment, adminUpdateSubscription } from "./server"

const rel = (d?: string | null) => (d ? formatDistanceToNowStrict(new Date(d), { locale: es, addSuffix: true }) : "Nunca")
const PROV: Record<string, string> = { mercadopago: "Mercado Pago", wompi: "Wompi", manual: "Mirai (manual)" }
const SUB: Record<string, [Parameters<typeof StatusPill>[0]["tone"], string]> = { activa: ["pagado", "Activa"], cortesia: ["estimado", "Cortesía"], cancelada: ["porVencer", "No se renueva"], vencida: ["gray", "Vencida"], pendiente: ["gray", "Pendiente"] }
const PAY: Record<string, [Parameters<typeof StatusPill>[0]["tone"], string]> = { aprobado: ["pagado", "Aprobado"], rechazado: ["vencido", "Rechazado"], reembolsado: ["gray", "Devuelto"], anulado: ["gray", "Anulado"], pendiente: ["porVencer", "Pendiente"] }
const in30 = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

/** Lista de planes (para selectores de la consola). */
export function usePlanOptions() {
  return useQuery({
    queryKey: ["admin", "plan-options"],
    queryFn: async () => ((await createClient().from("plans").select("id,nombre,precio_mes,precio_anio").order("orden")).data ?? []).map((p) => ({ value: p.id, label: p.nombre, mes: p.precio_mes, anio: p.precio_anio })),
  })
}

function csvDownload(name: string, rows: (string | number)[][]) {
  const blob = new Blob(["﻿" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n")], { type: "text/csv;charset=utf-8" })
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
}

async function run(fn: () => Promise<unknown>, ok: string, qc: ReturnType<typeof useQueryClient>) {
  try { await fn(); toast.success(ok); qc.invalidateQueries({ queryKey: ["admin"] }); return true }
  catch (e) { toast.error("No se pudo", { description: (e as Error).message }); return false }
}

// ── Resumen ─────────────────────────────────────────────────────────────────────────────────────────────────────

export function DashboardPanel() {
  const { data: o, isPending: a } = useQuery({ queryKey: ["admin", "overview"], queryFn: () => adminOverview() })
  const { data: r, isPending: b } = useQuery({ queryKey: ["admin", "revenue"], queryFn: () => adminRevenue() })
  const { data: c } = useQuery({ queryKey: ["admin", "clients"], queryFn: () => adminClients() })
  return (
    <div className="grid gap-5">
      <KpiGrid>
        <Kpi icon="users" tone="blue" label="Personas registradas" value={o ? o.personas.toLocaleString("es-CO") : ""} sub={o && `${o.nuevos30} nuevas en 30 días`} loading={a} />
        <Kpi icon="activity" tone="green" label="Activas en 30 días" value={o ? o.activos30.toLocaleString("es-CO") : ""} sub={o && `${o.activos7} esta semana · ${o.hogares} hogares`} loading={a} />
        <Kpi icon="repeat" tone="amber" label="Ingreso mensual recurrente" value={r ? precio(r.mrr) : ""} sub={r && `${r.pagando} hogares pagando · ${r.cortesia} cortesía`} loading={b} />
        <Kpi icon="banknote" tone="violet" label="Cobrado en 30 días" value={r ? precio(r.ingresosMes) : ""} sub={r && `${r.pagosMes} pagos · ${r.rechazadosMes} rechazados`} loading={b} />
      </KpiGrid>
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="gap-3 p-5 shadow-card ring-0">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Personas nuevas</h2><Link href="/admin/usuarios" className="text-sm text-link hover:underline">Ver todas</Link></div>
          {!c ? <Skeleton className="h-40" /> : <ul className="grid gap-2">{c.slice(0, 6).map((u) => <li key={u.id} className="flex items-center justify-between gap-2 text-sm"><Link href={`/admin/usuarios/${u.id}`} className="truncate text-link hover:underline">{u.nombre || u.email}</Link><span className="shrink-0 text-xs text-muted-foreground">{rel(u.creado)}</span></li>)}</ul>}
        </Card>
        <Card className="gap-3 p-5 shadow-card ring-0">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Pagos recientes</h2><Link href="/admin/pagos" className="text-sm text-link hover:underline">Ver todos</Link></div>
          {!r ? <Skeleton className="h-40" /> : !r.pagos.length ? <p className="text-sm text-muted-foreground">Aún no hay pagos.</p> : <ul className="grid gap-2">{r.pagos.slice(0, 6).map((p) => <li key={p.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{p.hogar}</span><span className="shrink-0 tabular-nums">{precio(p.monto)}</span></li>)}</ul>}
        </Card>
        <Card className="gap-3 p-5 shadow-card ring-0">
          <h2 className="font-semibold">Para atender</h2>
          {!o ? <Skeleton className="h-40" /> : (
            <ul className="grid gap-2 text-sm">
              <li className="flex justify-between"><Link href="/admin/opiniones" className="text-link hover:underline">Opiniones sin leer</Link><b>{o.opinionesNuevas}</b></li>
              <li className="flex justify-between"><Link href="/admin/opiniones" className="text-link hover:underline">Errores reportados abiertos</Link><b>{o.erroresAbiertos}</b></li>
              <li className="flex justify-between"><span>Calificación promedio</span><b>{o.rating.count ? `${o.rating.avg.toFixed(1).replace(".", ",")} ★ (${o.rating.count})` : "—"}</b></li>
              <li className="flex justify-between"><Link href="/admin/pagos" className="text-link hover:underline">Pagos rechazados del mes</Link><b>{r?.rechazadosMes ?? "…"}</b></li>
              <li className="flex justify-between"><Link href="/admin/suscripciones" className="text-link hover:underline">Cancelaciones del mes</Link><b>{r?.canceladasMes ?? "…"}</b></li>
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

// ── Asignar plan (cortesía) ─────────────────────────────────────────────────────────────────────────────────────

export function AssignPlanDialog({ householdId, nombre, open, onOpenChange }: { householdId: string; nombre: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const { data: plans = [] } = usePlanOptions()
  const [plan, setPlan] = useState("premium")
  const [hasta, setHasta] = useState(in30())
  const [nota, setNota] = useState("")
  const [busy, setBusy] = useState(false)
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={`Asignar plan a ${nombre}`} description="El hogar tendrá ese plan sin pagar hasta la fecha que elijas (cortesía, convenio o pago por fuera). Le llega un aviso.">
      <FieldGroup className="pb-2">
        <FormField label="Plan" htmlFor="as-plan" tip={false}><Combobox id="as-plan" value={plan} onChange={setPlan} options={plans.filter((p) => p.value !== "gratis")} /></FormField>
        <FormField label="Hasta" htmlFor="as-hasta" tip={false}><DatePicker id="as-hasta" quick="futuro" value={hasta} onChange={(v) => setHasta(v ?? in30())} /></FormField>
        <FormField label="Nota (solo para administradores)" htmlFor="as-nota" tip={false}><Input id="as-nota" className="h-11" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Aliado, soporte, prueba" /></FormField>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={busy} onClick={async () => { setBusy(true); if (await run(() => adminAssignPlan(householdId, plan, hasta, nota), "Plan asignado", qc)) onOpenChange(false); setBusy(false) }}>{busy && <Spinner />} Asignar</Button></div>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

// ── Hogares ─────────────────────────────────────────────────────────────────────────────────────────────────────

export function HogaresPanel() {
  const { data, isPending } = useQuery({ queryKey: ["admin", "households"], queryFn: () => adminHouseholds() })
  const { data: plans = [] } = usePlanOptions()
  const [q, setQ] = useState("")
  const [plan, setPlan] = useState("todos")
  const [assign, setAssign] = useState<{ id: string; nombre: string } | null>(null)
  const list = useMemo(() => (data ?? []).filter((h) => (plan === "todos" || h.plan === plan) && (!q || norm(`${h.nombre} ${h.dueno?.nombre ?? ""} ${h.dueno?.email ?? ""}`).includes(norm(q)))), [data, q, plan])
  const pn = (id: string) => plans.find((p) => p.value === id)?.label ?? id
  return (
    <Card className="gap-4 p-5 shadow-card ring-0">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1"><Search className="absolute top-3 left-3 size-4 text-muted-foreground" /><Input className="h-10 pl-9" placeholder="Buscar hogar o dueño" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar hogares" /></div>
        <div className="w-48"><Combobox value={plan} onChange={setPlan} options={[{ value: "todos", label: "Todos los planes" }, ...plans]} /></div>
        <Button variant="outline" disabled={!list.length} onClick={() => csvDownload("mirai-hogares", [["Hogar", "Dueño", "Correo", "Plan", "Vence", "Integrantes", "Libros", "Acciones 30 d", "Creado"], ...list.map((h) => [h.nombre, h.dueno?.nombre ?? "", h.dueno?.email ?? "", pn(h.plan), h.vence?.slice(0, 10) ?? "", h.integrantes, h.libros, h.acciones30, h.creado.slice(0, 10)])])}><Download /> CSV</Button>
      </div>
      {isPending ? <Skeleton className="h-60" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 font-medium">Hogar</th><th className="font-medium">Dueño</th><th className="font-medium">Plan</th><th className="font-medium">Integrantes</th><th className="font-medium">Libros</th><th className="font-medium">Creado</th><th /></tr></thead>
            <tbody>{list.map((h) => (
              <tr key={h.id} className="border-b last:border-0">
                <td className="py-2.5 font-medium">{h.nombre}</td>
                <td>{h.dueno ? <Link href={`/admin/usuarios/${h.dueno.id}`} className="text-link hover:underline">{h.dueno.nombre || h.dueno.email}</Link> : "—"}</td>
                <td><StatusPill tone={h.plan === "gratis" ? "gray" : "pagado"} title={h.vence ? `Hasta ${fmtDate(h.vence.slice(0, 10), { year: true })}` : undefined}>{pn(h.plan)}</StatusPill></td>
                <td className="tabular-nums">{h.integrantes}</td><td className="tabular-nums">{h.libros}</td>
                <td className="whitespace-nowrap">{fmtDate(h.creado.slice(0, 10))}</td>
                <td className="text-right"><Button size="sm" variant="ghost" onClick={() => setAssign({ id: h.id, nombre: h.nombre })}>Asignar plan</Button></td>
              </tr>
            ))}</tbody>
          </table>
          <p className="pt-3 text-xs text-muted-foreground">{list.length} hogares. Por privacidad, la consola no muestra montos ni movimientos de los hogares.</p>
        </div>
      )}
      {assign && <AssignPlanDialog householdId={assign.id} nombre={assign.nombre} open onOpenChange={(o) => !o && setAssign(null)} />}
    </Card>
  )
}

// ── Suscripciones ───────────────────────────────────────────────────────────────────────────────────────────────

export function SuscripcionesPanel() {
  const qc = useQueryClient()
  const { data, isPending } = useQuery({ queryKey: ["admin", "subs"], queryFn: () => adminSubscriptions() })
  const { data: plans = [] } = usePlanOptions()
  const [f, setF] = useState("vigentes")
  const list = (data ?? []).filter((s) => f === "todas" || (f === "vigentes" ? s.vigente : !s.vigente))
  const pn = (id: string) => plans.find((p) => p.value === id)?.label ?? id
  return (
    <Card className="gap-4 p-5 shadow-card ring-0">
      <Segmented value={f} onChange={setF} items={[{ value: "vigentes", label: "Vigentes" }, { value: "pasadas", label: "Vencidas o pendientes" }, { value: "todas", label: "Todas" }]} />
      {isPending ? <Skeleton className="h-60" /> : !list.length ? <p className="py-6 text-center text-sm text-muted-foreground">No hay suscripciones con este filtro.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 font-medium">Hogar</th><th className="font-medium">Plan</th><th className="font-medium">Cómo</th><th className="font-medium">Estado</th><th className="font-medium">Vence</th><th /></tr></thead>
            <tbody>{list.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="py-2.5">{s.hogar}{s.nota && <span className="block text-xs text-muted-foreground">{s.nota}</span>}</td>
                <td>{pn(s.plan)} <span className="text-xs text-muted-foreground">· {s.periodo === "anio" ? "anual" : "mensual"}</span></td>
                <td>{PROV[s.proveedor] ?? s.proveedor}</td>
                <td><StatusPill tone={SUB[s.estado]?.[0] ?? "gray"}>{SUB[s.estado]?.[1] ?? s.estado}</StatusPill></td>
                <td className="whitespace-nowrap">{s.vence_at ? fmtDate(s.vence_at.slice(0, 10), { year: true }) : "—"}</td>
                <td className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`Acciones de la suscripción de ${s.hogar}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {[7, 30, 365].map((d) => <DropdownMenuItem key={d} onSelect={() => run(() => adminUpdateSubscription(s.id, { kind: "extender", dias: d }), `Extendida ${d} días`, qc)}>Extender {d === 365 ? "1 año" : `${d} días`}</DropdownMenuItem>)}
                      <DropdownMenuSeparator />
                      {plans.filter((p) => p.value !== s.plan && p.value !== "gratis").map((p) => <DropdownMenuItem key={p.value} onSelect={() => run(() => adminUpdateSubscription(s.id, { kind: "plan", plan: p.value }), `Cambiada a ${p.label}`, qc)}>Cambiar a {p.label}</DropdownMenuItem>)}
                      <DropdownMenuSeparator />
                      {s.estado === "activa" && s.proveedor === "mercadopago" && <DropdownMenuItem onSelect={() => run(() => adminUpdateSubscription(s.id, { kind: "cancelar" }), "Renovación cancelada", qc)}>Cancelar renovación</DropdownMenuItem>}
                      <DropdownMenuItem variant="destructive" onSelect={() => { if (confirm("¿Terminar esta suscripción ya? El hogar vuelve al plan Gratis.")) run(() => adminUpdateSubscription(s.id, { kind: "terminar" }), "Suscripción terminada", qc) }}>Terminar ahora</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ── Pagos ───────────────────────────────────────────────────────────────────────────────────────────────────────

function ManualPaymentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const { data: hh = [] } = useQuery({ queryKey: ["admin", "households"], queryFn: () => adminHouseholds(), enabled: open })
  const { data: plans = [] } = usePlanOptions()
  const [v, setV] = useState({ householdId: "", plan: "premium", periodo: "mes" as "mes" | "anio", monto: 0, nota: "" })
  const [busy, setBusy] = useState(false)
  const pl = plans.find((p) => p.value === v.plan)
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Registrar un pago" description="Para pagos recibidos por fuera de las pasarelas (transferencia, efectivo, convenio). Extiende el plan del hogar.">
      <FieldGroup className="pb-2">
        <FormField label="Hogar" htmlFor="mp-h" required tip={false}><Combobox id="mp-h" value={v.householdId} onChange={(x) => setV({ ...v, householdId: x })} options={hh.map((h) => ({ value: h.id, label: h.nombre, hint: h.dueno?.email }))} placeholder="Busca el hogar" /></FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Plan" htmlFor="mp-p" tip={false}><Combobox id="mp-p" value={v.plan} onChange={(x) => setV({ ...v, plan: x })} options={plans.filter((p) => p.value !== "gratis")} /></FormField>
          <FormField label="Periodo" tip={false}><Segmented value={v.periodo} onChange={(x) => setV({ ...v, periodo: x as "mes" | "anio" })} items={[{ value: "mes", label: "1 mes" }, { value: "anio", label: "1 año" }]} /></FormField>
        </div>
        <FormField label="Monto recibido (COP)" htmlFor="mp-m" tip={false} hint={pl ? `Precio de lista: ${precio(v.periodo === "anio" ? pl.anio : pl.mes)}` : undefined}><MoneyInput id="mp-m" value={v.monto} onChange={(n) => setV({ ...v, monto: n ?? 0 })} /></FormField>
        <FormField label="Nota" htmlFor="mp-n" tip={false}><Input id="mp-n" className="h-11" value={v.nota} onChange={(e) => setV({ ...v, nota: e.target.value })} placeholder="Ej. Transferencia Bancolombia 12 nov" /></FormField>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={busy || !v.householdId} onClick={async () => { setBusy(true); if (await run(() => adminManualPayment(v), "Pago registrado", qc)) onOpenChange(false); setBusy(false) }}>{busy && <Spinner />} Registrar</Button></div>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

export function PagosPanel() {
  const qc = useQueryClient()
  const { data: r, isPending } = useQuery({ queryKey: ["admin", "revenue"], queryFn: () => adminRevenue() })
  const [manual, setManual] = useState(false)
  const [estado, setEstado] = useState("todos")
  const [q, setQ] = useState("")
  const list = (r?.pagos ?? []).filter((x) => (estado === "todos" || x.estado === estado) && (!q || norm(`${x.hogar} ${x.pagador ?? ""} ${x.referencia}`).includes(norm(q))))
  return (
    <div className="grid gap-5">
      <KpiGrid>
        <Kpi icon="repeat" tone="green" label="Ingreso mensual recurrente" value={r ? precio(r.mrr) : ""} sub="MRR estimado (anuales ÷ 12)" loading={isPending} />
        <Kpi icon="banknote" tone="blue" label="Cobrado en 30 días" value={r ? precio(r.ingresosMes) : ""} sub={r && `${r.pagosMes} pagos`} loading={isPending} />
        <Kpi icon="wallet" tone="violet" label="Total histórico" value={r ? precio(r.ingresosTotal) : ""} sub={r && r.porProveedor.map((x) => `${PROV[x.p]}: ${x.n}`).join(" · ")} loading={isPending} />
        <Kpi icon="circle-alert" tone="red" label="Problemas del mes" value={r ? String(r.rechazadosMes + r.canceladasMes) : ""} sub={r && `${r.rechazadosMes} rechazados · ${r.canceladasMes} cancelaciones`} loading={isPending} />
      </KpiGrid>
      <Card className="gap-4 p-5 shadow-card ring-0">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-56 flex-1"><Search className="absolute top-3 left-3 size-4 text-muted-foreground" /><Input className="h-10 pl-9" placeholder="Buscar hogar, correo o referencia" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar pagos" /></div>
          <div className="w-44"><Combobox value={estado} onChange={setEstado} options={[{ value: "todos", label: "Todos los estados" }, ...Object.entries(PAY).map(([k, v]) => ({ value: k, label: v[1] }))]} /></div>
          <Button variant="outline" disabled={!list.length} onClick={() => csvDownload("mirai-pagos", [["Fecha", "Hogar", "Pasarela", "Plan", "Periodo", "Monto", "Estado", "Método", "Pagador", "Cupón", "Factura", "Referencia"], ...list.map((x) => [(x.paid_at ?? x.created_at).slice(0, 10), x.hogar, PROV[x.proveedor] ?? x.proveedor, (x as { plan?: string }).plan ?? "", x.periodo ?? "", x.monto, x.estado, x.metodo ?? "", x.pagador ?? "", (x as { cupon?: string }).cupon ?? "", (x as { factura_ref?: string }).factura_ref ?? "", x.referencia])])}><Download /> CSV</Button>
          <Button onClick={() => setManual(true)}><Plus /> Registrar pago</Button>
        </div>
        {isPending ? <Skeleton className="h-60" /> : !list.length ? <p className="py-6 text-center text-sm text-muted-foreground">No hay pagos con estos filtros.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 font-medium">Fecha</th><th className="font-medium">Hogar</th><th className="font-medium">Pasarela</th><th className="font-medium">Estado</th><th className="text-right font-medium">Monto</th><th /></tr></thead>
              <tbody>{list.map((x) => (
                <tr key={x.id} className="border-b last:border-0">
                  <td className="py-2 whitespace-nowrap">{fmtDate((x.paid_at ?? x.created_at).slice(0, 10))}</td>
                  <td className="max-w-56 truncate">{x.hogar}<span className="block truncate text-xs text-muted-foreground">{x.pagador}</span></td>
                  <td>{PROV[x.proveedor] ?? x.proveedor}{x.metodo ? <span className="block text-xs text-muted-foreground">{x.metodo}</span> : null}</td>
                  <td><StatusPill tone={PAY[x.estado]?.[0] ?? "gray"}>{PAY[x.estado]?.[1] ?? x.estado}</StatusPill></td>
                  <td className="text-right font-semibold tabular-nums">{precio(x.monto)}</td>
                  <td className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`Acciones del pago de ${x.hogar}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => { const f = prompt("Número de la factura electrónica:"); if (f) run(() => adminUpdatePayment(x.id, { factura_ref: f }), "Factura anotada", qc) }}>Anotar factura</DropdownMenuItem>
                        {x.estado === "aprobado" && <DropdownMenuItem onSelect={() => { const n = prompt("Nota de la devolución (la devolución real se hace en la pasarela):"); if (n !== null) run(() => adminUpdatePayment(x.id, { estado: "reembolsado", nota: n }), "Marcado como devuelto", qc) }}>Marcar como devuelto</DropdownMenuItem>}
                        {x.estado !== "anulado" && <DropdownMenuItem variant="destructive" onSelect={() => { if (confirm("¿Anular este pago en Mirai?")) run(() => adminUpdatePayment(x.id, { estado: "anulado" }), "Pago anulado", qc) }}>Anular</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Las devoluciones de dinero se hacen en el panel de Mercado Pago o Wompi; aquí se anotan para que los informes cuadren.</p>
      </Card>
      <ManualPaymentDialog open={manual} onOpenChange={setManual} />
    </div>
  )
}

// ── Cupones ─────────────────────────────────────────────────────────────────────────────────────────────────────

const NEW_COUPON: Coupon & { descripcion: string } = { codigo: "", descripcion: "", tipo: "porcentaje", valor: 20, planes: [], periodos: ["mes", "anio"], desde: null, hasta: null, max_usos: null, usos: 0, activo: true }

function CouponDialog({ c, onClose, isNew }: { c: Coupon & { descripcion: string }; onClose: () => void; isNew: boolean }) {
  const qc = useQueryClient()
  const { data: plans = [] } = usePlanOptions()
  const [v, setV] = useState(c)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const codigo = v.codigo.trim().toUpperCase()
    if (!/^[A-Z0-9_-]{3,30}$/.test(codigo)) return toast.error("El código debe tener de 3 a 30 letras, números, - o _")
    if (!v.periodos.length) return toast.error("Elige al menos un periodo")
    setBusy(true)
    const row = { ...v, codigo, descripcion: v.descripcion.trim() }
    const sb = createClient()
    const { error } = isNew ? await sb.from("coupons").insert(row) : await sb.from("coupons").update(row).eq("codigo", c.codigo)
    setBusy(false)
    if (error) return toast.error("No se pudo guardar", { description: error.code === "23505" ? "Ya existe un cupón con ese código." : error.message })
    toast.success("Cupón guardado"); qc.invalidateQueries({ queryKey: ["admin", "coupons"] }); onClose()
  }
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title={isNew ? "Nuevo cupón" : `Cupón ${c.codigo}`} description="El cliente lo escribe en Planes antes de pagar.">
      <FieldGroup className="pb-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Código" htmlFor="cp-c" required tip={false}><Input id="cp-c" className="h-11 uppercase" disabled={!isNew} value={v.codigo} onChange={(e) => setV({ ...v, codigo: e.target.value.toUpperCase() })} placeholder="LANZAMIENTO" /></FormField>
          <FormField label="Descripción" htmlFor="cp-d" tip={false}><Input id="cp-d" className="h-11" value={v.descripcion} onChange={(e) => setV({ ...v, descripcion: e.target.value })} placeholder="Ej. 50 % el primer año" /></FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Tipo" tip={false}><Segmented value={v.tipo} onChange={(x) => setV({ ...v, tipo: x as Coupon["tipo"] })} items={[{ value: "porcentaje", label: "Porcentaje" }, { value: "valor", label: "Valor fijo" }]} /></FormField>
          <FormField label={v.tipo === "porcentaje" ? "Descuento (%)" : "Descuento (COP)"} htmlFor="cp-v" tip={false}>{v.tipo === "porcentaje" ? <Input id="cp-v" type="number" min={1} max={100} className="h-11" value={v.valor} onChange={(e) => setV({ ...v, valor: Math.min(100, Math.max(1, +e.target.value || 1)) })} /> : <MoneyInput id="cp-v" value={v.valor} onChange={(n) => setV({ ...v, valor: n ?? 0 })} />}</FormField>
        </div>
        <FormField label="Planes (vacío = todos)" tip={false}>
          <div className="flex flex-wrap gap-3">{plans.filter((p) => p.value !== "gratis").map((p) => <label key={p.value} className="flex items-center gap-2 text-sm"><Checkbox checked={v.planes.includes(p.value)} onCheckedChange={(x) => setV({ ...v, planes: x ? [...v.planes, p.value] : v.planes.filter((y) => y !== p.value) })} />{p.label}</label>)}</div>
        </FormField>
        <FormField label="Aplica al pago" tip={false}>
          <div className="flex gap-4">{(["mes", "anio"] as const).map((k) => <label key={k} className="flex items-center gap-2 text-sm"><Checkbox checked={v.periodos.includes(k)} onCheckedChange={(x) => setV({ ...v, periodos: x ? [...v.periodos, k] : v.periodos.filter((y) => y !== k) })} />{k === "mes" ? "Mensual" : "Anual"}</label>)}</div>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Desde" htmlFor="cp-de" tip={false}><DatePicker id="cp-de" quick="futuro" clearable value={v.desde} onChange={(x) => setV({ ...v, desde: x })} placeholder="Desde ya" /></FormField>
          <FormField label="Hasta" htmlFor="cp-ha" tip={false}><DatePicker id="cp-ha" quick="futuro" clearable value={v.hasta} onChange={(x) => setV({ ...v, hasta: x })} placeholder="Sin fin" /></FormField>
          <FormField label="Máximo de usos" htmlFor="cp-mx" tip={false}><Input id="cp-mx" type="number" min={1} className="h-11" placeholder="Sin límite" value={v.max_usos ?? ""} onChange={(e) => setV({ ...v, max_usos: e.target.value ? +e.target.value : null })} /></FormField>
        </div>
        <label className="flex items-center gap-3 text-sm"><Switch checked={v.activo} onCheckedChange={(x) => setV({ ...v, activo: x })} aria-label="Cupón activo" />Activo</label>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={busy} onClick={save}>{busy && <Spinner />} Guardar</Button></div>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

export function CuponesPanel() {
  const qc = useQueryClient()
  const { data, isPending } = useQuery({ queryKey: ["admin", "coupons"], queryFn: async () => ((await createClient().from("coupons").select("*").order("created_at", { ascending: false })).data ?? []) as (Coupon & { descripcion: string })[] })
  const [edit, setEdit] = useState<{ c: Coupon & { descripcion: string }; isNew: boolean } | null>(null)
  return (
    <Card className="gap-4 p-5 shadow-card ring-0">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">Los cupones se aplican al precio de los pagos nuevos. En suscripciones con tarjeta, el descuento queda en todas las renovaciones.</p><Button onClick={() => setEdit({ c: { ...NEW_COUPON }, isNew: true })}><Plus /> Nuevo cupón</Button></div>
      {isPending ? <Skeleton className="h-40" /> : !data?.length ? <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay cupones.</p> : (
        <ul className="grid gap-2">{data.map((c) => (
          <li key={c.codigo} className="flex flex-wrap items-center gap-3 rounded-lg bg-secondary/40 p-3">
            <span className="rounded-md bg-background px-2 py-1 font-mono text-sm font-semibold">{c.codigo}</span>
            <div className="grid min-w-0 flex-1"><p className="text-sm font-medium">{c.tipo === "porcentaje" ? `${c.valor} % de descuento` : `${precio(c.valor)} de descuento`}{c.descripcion ? ` · ${c.descripcion}` : ""}</p><p className="text-xs text-muted-foreground">{c.planes.length ? c.planes.join(", ") : "Todos los planes"} · {c.periodos.map((p) => (p === "mes" ? "mensual" : "anual")).join(" y ")}{c.hasta ? ` · hasta ${fmtDate(c.hasta)}` : ""}</p></div>
            <span className="text-sm tabular-nums text-muted-foreground">{c.usos}{c.max_usos ? ` / ${c.max_usos}` : ""} usos</span>
            <StatusPill tone={c.activo ? "pagado" : "gray"}>{c.activo ? "Activo" : "Pausado"}</StatusPill>
            <Button size="sm" variant="ghost" onClick={() => setEdit({ c, isNew: false })}>Editar</Button>
            <Button size="icon-sm" variant="ghost" className="text-danger" aria-label={`Borrar cupón ${c.codigo}`} onClick={async () => { if (!confirm(`¿Borrar el cupón ${c.codigo}?`)) return; const { error } = await createClient().from("coupons").delete().eq("codigo", c.codigo); if (error) toast.error(error.message); else { toast("Cupón borrado"); qc.invalidateQueries({ queryKey: ["admin", "coupons"] }) } }}><Trash2 /></Button>
          </li>
        ))}</ul>
      )}
      {edit && <CouponDialog c={edit.c} isNew={edit.isNew} onClose={() => setEdit(null)} />}
    </Card>
  )
}

