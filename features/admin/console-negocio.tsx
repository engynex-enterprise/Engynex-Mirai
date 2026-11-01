"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNowStrict } from "date-fns"
import { es } from "date-fns/locale"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"

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
import { DataTable, DTPrimary, DTTwoLine } from "@/components/mirai/data-table"
import { Icon } from "@/components/mirai/icon"
import { StatusPill } from "@/components/mirai/status-pill"
import { createClient } from "@/utils/supabase/client"

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
  const [assign, setAssign] = useState<{ id: string; nombre: string } | null>(null)
  const pn = (id: string) => plans.find((p) => p.value === id)?.label ?? id
  type H = NonNullable<typeof data>[number]
  return (
    <>
      <DataTable<H>
        title="Hogares" info="Cuentas familiares con al menos un integrante. Por privacidad no se muestran montos." data={data} loading={isPending} rowKey={(h) => h.id}
        search={{ placeholder: "Buscar hogar, dueño o correo", text: (h) => `${h.nombre} ${h.dueno?.nombre ?? ""} ${h.dueno?.email ?? ""}` }}
        filters={[{ id: "plan", label: "Plan", options: plans.map((p) => ({ value: p.value, label: p.label })), match: (h, v) => h.plan === v }, { id: "fam", label: "Integrantes", options: [{ value: "1", label: "Una persona" }, { value: "2", label: "Dos o más" }], match: (h, v) => (v === "1" ? h.integrantes === 1 : h.integrantes > 1) }]}
        exportName="mirai-hogares" initialSort={{ id: "creado", dir: "desc" }}
        details={(h) => (h.dueno ? `/admin/usuarios/${h.dueno.id}` : null)}
        actions={[{ label: "Asignar plan", onSelect: (h) => setAssign({ id: h.id, nombre: h.nombre }) }]}
        columns={[
          { id: "hogar", header: "Hogar", sort: (h) => h.nombre.toLowerCase(), csv: (h) => h.nombre, cell: (h) => <DTPrimary media={<span className="grid size-10 place-items-center rounded-full bg-secondary"><Icon name="house" className="size-5" /></span>} title={h.nombre} sub={`Creado ${fmtDate(h.creado.slice(0, 10), { year: true })}`} /> },
          { id: "dueno", header: "Dueño", sort: (h) => h.dueno?.nombre ?? "", csv: (h) => h.dueno?.email ?? "", cell: (h) => <DTTwoLine top={h.dueno?.nombre || "—"} bottom={h.dueno?.email} /> },
          { id: "plan", header: "Plan", sort: (h) => h.plan, csv: (h) => pn(h.plan), cell: (h) => <DTTwoLine top={<StatusPill tone={h.plan === "gratis" ? "gray" : "pagado"}>{pn(h.plan)}</StatusPill>} bottom={h.vence ? `hasta ${fmtDate(h.vence.slice(0, 10))}` : undefined} /> },
          { id: "integrantes", header: "Integrantes", align: "right", sort: (h) => h.integrantes, csv: (h) => h.integrantes, cell: (h) => h.integrantes },
          { id: "libros", header: "Libros", align: "right", sort: (h) => h.libros, csv: (h) => h.libros, cell: (h) => h.libros },
          { id: "act", header: "Acciones (30 d)", align: "right", sort: (h) => h.acciones30, csv: (h) => h.acciones30, cell: (h) => <span className="font-semibold tabular-nums">{h.acciones30}</span> },
          { id: "creado", header: "Creado", hidden: true, sort: (h) => h.creado, csv: (h) => h.creado.slice(0, 10), cell: (h) => fmtDate(h.creado.slice(0, 10)) },
        ]}
      />
      {assign && <AssignPlanDialog householdId={assign.id} nombre={assign.nombre} open onOpenChange={(o) => !o && setAssign(null)} />}
    </>
  )
}

// ── Suscripciones ───────────────────────────────────────────────────────────────────────────────────────────────

export function SuscripcionesPanel() {
  const qc = useQueryClient()
  const { data, isPending } = useQuery({ queryKey: ["admin", "subs"], queryFn: () => adminSubscriptions() })
  const { data: plans = [] } = usePlanOptions()
  const pn = (id: string) => plans.find((p) => p.value === id)?.label ?? id
  type S = NonNullable<typeof data>[number]
  const upd = (s: S, a: Parameters<typeof adminUpdateSubscription>[1], ok: string) => run(() => adminUpdateSubscription(s.id, a), ok, qc)
  return (
    <DataTable<S>
      title="Suscripciones" info="Qué plan tiene cada hogar, por qué medio y hasta cuándo." data={data} loading={isPending} rowKey={(s) => s.id}
      search={{ placeholder: "Buscar hogar o nota", text: (s) => `${s.hogar} ${s.nota ?? ""}` }}
      filters={[
        { id: "vig", label: "Vigencia", options: [{ value: "si", label: "Vigentes" }, { value: "no", label: "Vencidas o pendientes" }], match: (s, v) => (v === "si" ? s.vigente : !s.vigente) },
        { id: "estado", label: "Estado", options: Object.entries(SUB).map(([k, v]) => ({ value: k, label: v[1] })), match: (s, v) => s.estado === v },
        { id: "prov", label: "Medio", options: Object.entries(PROV).map(([k, v]) => ({ value: k, label: v })), match: (s, v) => s.proveedor === v },
        { id: "plan", label: "Plan", options: plans.map((p) => ({ value: p.value, label: p.label })), match: (s, v) => s.plan === v },
      ]}
      exportName="mirai-suscripciones" initialSort={{ id: "vence", dir: "desc" }}
      actions={[
        { label: "Extender 7 días", onSelect: (s) => upd(s, { kind: "extender", dias: 7 }, "Extendida 7 días") },
        { label: "Extender 30 días", onSelect: (s) => upd(s, { kind: "extender", dias: 30 }, "Extendida 30 días") },
        { label: "Extender 1 año", onSelect: (s) => upd(s, { kind: "extender", dias: 365 }, "Extendida 1 año") },
        ...plans.filter((p) => p.value !== "gratis").map((p) => ({ label: `Cambiar a ${p.label}`, onSelect: (s: S) => upd(s, { kind: "plan", plan: p.value }, `Cambiada a ${p.label}`), hidden: (s: S) => s.plan === p.value })),
        { label: "Cancelar renovación", onSelect: (s) => upd(s, { kind: "cancelar" }, "Renovación cancelada"), hidden: (s) => !(s.estado === "activa" && s.proveedor === "mercadopago") },
        { label: "Terminar ahora", destructive: true, onSelect: (s) => { if (confirm("¿Terminar esta suscripción ya? El hogar vuelve al plan Gratis.")) upd(s, { kind: "terminar" }, "Suscripción terminada") } },
      ]}
      columns={[
        { id: "hogar", header: "Hogar", sort: (s) => s.hogar.toLowerCase(), csv: (s) => s.hogar, cell: (s) => <DTTwoLine top={<span className="font-medium">{s.hogar}</span>} bottom={s.nota} /> },
        { id: "plan", header: "Plan", sort: (s) => s.plan, csv: (s) => pn(s.plan), cell: (s) => <DTTwoLine top={pn(s.plan)} bottom={s.periodo === "anio" ? "Anual" : "Mensual"} /> },
        { id: "prov", header: "Medio", csv: (s) => PROV[s.proveedor] ?? s.proveedor, cell: (s) => PROV[s.proveedor] ?? s.proveedor },
        { id: "estado", header: "Estado", sort: (s) => s.estado, csv: (s) => s.estado, cell: (s) => <StatusPill tone={SUB[s.estado]?.[0] ?? "gray"}>{SUB[s.estado]?.[1] ?? s.estado}</StatusPill> },
        { id: "vence", header: "Vence", sort: (s) => s.vence_at ?? "", csv: (s) => s.vence_at?.slice(0, 10) ?? "", cell: (s) => <DTTwoLine top={s.vence_at ? fmtDate(s.vence_at.slice(0, 10), { year: true }) : "—"} bottom={s.vence_at ? rel(s.vence_at) : undefined} /> },
      ]}
    />
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
  type P = NonNullable<typeof r>["pagos"][number]
  return (
    <div className="grid gap-5">
      <KpiGrid>
        <Kpi icon="repeat" tone="green" label="Ingreso mensual recurrente" value={r ? precio(r.mrr) : ""} sub="MRR estimado (anuales ÷ 12)" loading={isPending} />
        <Kpi icon="banknote" tone="blue" label="Cobrado en 30 días" value={r ? precio(r.ingresosMes) : ""} sub={r && `${r.pagosMes} pagos`} loading={isPending} />
        <Kpi icon="wallet" tone="violet" label="Total histórico" value={r ? precio(r.ingresosTotal) : ""} sub={r && r.porProveedor.map((x) => `${PROV[x.p]}: ${x.n}`).join(" · ")} loading={isPending} />
        <Kpi icon="circle-alert" tone="red" label="Problemas del mes" value={r ? String(r.rechazadosMes + r.canceladasMes) : ""} sub={r && `${r.rechazadosMes} rechazados · ${r.canceladasMes} cancelaciones`} loading={isPending} />
      </KpiGrid>
      <DataTable<P>
        title="Pagos" info="Cobros de las pasarelas y pagos registrados a mano. Las devoluciones de dinero se hacen en Mercado Pago o Wompi; aquí se anotan." data={r?.pagos} loading={isPending} rowKey={(x) => x.id}
        search={{ placeholder: "Buscar hogar, correo o referencia", text: (x) => `${x.hogar} ${x.pagador ?? ""} ${x.referencia}` }}
        filters={[
          { id: "estado", label: "Estado", options: Object.entries(PAY).map(([k, v]) => ({ value: k, label: v[1] })), match: (x, v) => x.estado === v },
          { id: "prov", label: "Pasarela", options: Object.entries(PROV).map(([k, v]) => ({ value: k, label: v })), match: (x, v) => x.proveedor === v },
          { id: "per", label: "Periodo", options: [{ value: "mes", label: "Mensual" }, { value: "anio", label: "Anual" }], match: (x, v) => x.periodo === v },
        ]}
        create={{ label: "Registrar pago", onClick: () => setManual(true) }} exportName="mirai-pagos" initialSort={{ id: "fecha", dir: "desc" }}
        actions={[
          { label: "Anotar factura", onSelect: (x) => { const f = prompt("Número de la factura electrónica:"); if (f) run(() => adminUpdatePayment(x.id, { factura_ref: f }), "Factura anotada", qc) } },
          { label: "Copiar referencia", onSelect: (x) => { navigator.clipboard.writeText(x.referencia); toast.success("Referencia copiada") } },
          { label: "Marcar como devuelto", hidden: (x) => x.estado !== "aprobado", onSelect: (x) => { const n = prompt("Nota de la devolución:"); if (n !== null) run(() => adminUpdatePayment(x.id, { estado: "reembolsado", nota: n }), "Marcado como devuelto", qc) } },
          { label: "Anular", destructive: true, hidden: (x) => x.estado === "anulado", onSelect: (x) => { if (confirm("¿Anular este pago en Mirai?")) run(() => adminUpdatePayment(x.id, { estado: "anulado" }), "Pago anulado", qc) } },
        ]}
        columns={[
          { id: "fecha", header: "Fecha", sort: (x) => x.paid_at ?? x.created_at, csv: (x) => (x.paid_at ?? x.created_at).slice(0, 10), cell: (x) => fmtDate((x.paid_at ?? x.created_at).slice(0, 10), { year: true }) },
          { id: "hogar", header: "Hogar", sort: (x) => x.hogar.toLowerCase(), csv: (x) => x.hogar, cell: (x) => <DTTwoLine top={<span className="font-medium">{x.hogar}</span>} bottom={x.pagador} /> },
          { id: "prov", header: "Pasarela", csv: (x) => PROV[x.proveedor] ?? x.proveedor, cell: (x) => <DTTwoLine top={PROV[x.proveedor] ?? x.proveedor} bottom={x.metodo} /> },
          { id: "estado", header: "Estado", sort: (x) => x.estado, csv: (x) => x.estado, cell: (x) => <StatusPill tone={PAY[x.estado]?.[0] ?? "gray"}>{PAY[x.estado]?.[1] ?? x.estado}</StatusPill> },
          { id: "monto", header: "Monto", align: "right", sort: (x) => x.monto, csv: (x) => x.monto, cell: (x) => <span className="font-semibold tabular-nums">{precio(x.monto)}</span> },
          { id: "ref", header: "Referencia", hidden: true, csv: (x) => x.referencia, cell: (x) => <span className="font-mono text-xs">{x.referencia}</span> },
        ]}
      />
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

