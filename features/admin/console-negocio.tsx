"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Combobox } from "@/components/mirai/combobox"
import { DatePicker } from "@/components/mirai/date-picker"
import { FormField } from "@/components/mirai/field"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { MoneyInput } from "@/components/mirai/money-input"
import { Panel } from "@/components/mirai/panel"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { Segmented } from "@/components/mirai/choice-cards"
import { DataTable, DTPrimary, DTTwoLine } from "@/components/mirai/data-table"
import { StatusPill, type PillTone } from "@/components/mirai/status-pill"
import { SubmitButton } from "@/components/mirai/submit-button"
import { Tip } from "@/components/mirai/tip"
import { ToneIcon, toneFor, type IconTone } from "@/components/mirai/tone-icon"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { createClient } from "@/utils/supabase/client"
import { fmtDate, todayISO } from "@/lib/format"
import { precio, type Coupon } from "@/lib/plans"
import { cn } from "@/lib/utils"
import { adminClients, adminOverview, adminRevenue } from "./actions"
import { adminAssignPlan, adminHouseholds, adminManualPayment, adminSubscriptions, adminUpdatePayment, adminUpdateSubscription } from "./server"
import { CheckGroup, Empty, nf, rel, SeeAll, ToggleRow, useAsk, useDialogTarget } from "./ui"

const PROV: Record<string, string> = { mercadopago: "Mercado Pago", wompi: "Wompi", manual: "Mirai (manual)" }
const PROV_TONE: Record<string, IconTone> = { mercadopago: "blue", wompi: "violet", manual: "brand" }
const SUB: Record<string, [PillTone, string, string]> = {
  activa: ["pagado", "Activa", "Al día: se renueva sola."], cortesia: ["estimado", "Cortesía", "Asignada por Mirai sin pago."],
  cancelada: ["porVencer", "No se renueva", "Sigue vigente hasta la fecha de vencimiento."], vencida: ["gray", "Vencida", "El hogar volvió al plan Gratis."], pendiente: ["gray", "Pendiente", "Esperando la confirmación del pago."],
}
const PAY: Record<string, [PillTone, string, string]> = {
  aprobado: ["pagado", "Aprobado", "El dinero llegó."], rechazado: ["vencido", "Rechazado", "La pasarela no aprobó el cobro."], reembolsado: ["gray", "Devuelto", "Se le devolvió el dinero."],
  anulado: ["gray", "Anulado", "Anulado en Mirai."], pendiente: ["porVencer", "Pendiente", "La pasarela aún no confirma."],
}
const in30 = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

/** Pill de estado con su explicación en un tooltip. */
function StatePill({ map, k }: { map: Record<string, [PillTone, string, string]>; k: string }) {
  const m = map[k]
  return <Tip label={m?.[2]}><span className="inline-flex"><StatusPill tone={m?.[0] ?? "gray"}>{m?.[1] ?? k}</StatusPill></span></Tip>
}

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

function AttendRow({ href, icon, tone, label, value }: { href?: string; icon: string; tone: IconTone; label: string; value: React.ReactNode }) {
  const body = <><ToneIcon icon={icon} tone={tone} size="sm" /><span className="min-w-0 flex-1 truncate">{label}</span><b className="shrink-0 tabular-nums">{value}</b></>
  return <li>{href ? <Link href={href} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-hover">{body}</Link> : <span className="flex items-center gap-3 px-2 py-2">{body}</span>}</li>
}

export function DashboardPanel() {
  const { data: o, isPending: a } = useQuery({ queryKey: ["admin", "overview"], queryFn: () => adminOverview() })
  const { data: r, isPending: b } = useQuery({ queryKey: ["admin", "revenue"], queryFn: () => adminRevenue() })
  const { data: c } = useQuery({ queryKey: ["admin", "clients"], queryFn: () => adminClients() })
  const listSk = <div className="grid gap-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9" />)}</div>
  return (
    <div className="grid gap-6">
      <KpiGrid>
        <Kpi icon="users" tone="blue" label="Personas registradas" value={o ? nf(o.personas) : ""} sub={o && `${nf(o.nuevos30)} nuevas en 30 días`} loading={a} />
        <Kpi icon="activity" tone="green" label="Activas en 30 días" value={o ? nf(o.activos30) : ""} sub={o && `${nf(o.activos7)} esta semana · ${nf(o.hogares)} hogares`} loading={a} />
        <Kpi icon="repeat" tone="amber" label="Ingreso mensual recurrente" value={r ? precio(r.mrr) : ""} sub={r && `${r.pagando} hogares pagando · ${r.cortesia} cortesía`} loading={b} />
        <Kpi icon="banknote" tone="violet" label="Cobrado en 30 días" value={r ? precio(r.ingresosMes) : ""} sub={r && `${r.pagosMes} pagos · ${r.rechazadosMes} rechazados`} loading={b} />
      </KpiGrid>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Personas nuevas" icon="user-plus" action={<SeeAll href="/admin/usuarios">Ver todas</SeeAll>}>
          {!c ? listSk : !c.length ? <Empty>Aún no hay personas registradas.</Empty> : (
            <ul className="-mx-2 grid">{c.slice(0, 6).map((u) => (
              <li key={u.id}><Link href={`/admin/usuarios/${u.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-hover">
                <UserAvatar src={u.avatar} name={u.nombre || u.email} className="size-8" />
                <span className="grid min-w-0 flex-1"><span className="truncate text-sm font-medium">{u.nombre || u.email}</span>{u.nombre && <span className="truncate text-xs text-muted-foreground">{u.email}</span>}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{rel(u.creado)}</span>
              </Link></li>
            ))}</ul>
          )}
        </Panel>
        <Panel title="Pagos recientes" icon="banknote" action={<SeeAll href="/admin/pagos" />}>
          {!r ? listSk : !r.pagos.length ? <Empty>Aún no hay pagos.</Empty> : (
            <ul className="-mx-2 grid">{r.pagos.slice(0, 6).map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-2 py-2">
                <ToneIcon icon="receipt" tone={PROV_TONE[p.proveedor] ?? "gray"} size="sm" label={PROV[p.proveedor] ?? p.proveedor} />
                <span className="grid min-w-0 flex-1"><span className="truncate text-sm font-medium">{p.hogar}</span><span className="truncate text-xs text-muted-foreground">{PROV[p.proveedor] ?? p.proveedor} · {rel(p.paid_at ?? p.created_at)}</span></span>
                <span className={cn("shrink-0 text-sm font-semibold tabular-nums", p.estado !== "aprobado" && "text-muted-foreground line-through")}>{precio(p.monto)}</span>
              </li>
            ))}</ul>
          )}
        </Panel>
        <Panel title="Para atender" icon="bell-ring" className="md:col-span-2 xl:col-span-1">
          {!o ? listSk : (
            <ul className="-mx-2 grid">
              <AttendRow href="/admin/opiniones" icon="message-square-heart" tone={o.opinionesNuevas ? "blue" : "gray"} label="Opiniones sin leer" value={o.opinionesNuevas} />
              <AttendRow href="/admin/opiniones" icon="bug" tone={o.erroresAbiertos ? "red" : "gray"} label="Errores reportados abiertos" value={o.erroresAbiertos} />
              <AttendRow icon="star" tone="amber" label="Calificación promedio" value={o.rating.count ? `${o.rating.avg.toFixed(1).replace(".", ",")} ★ (${o.rating.count})` : "—"} />
              <AttendRow href="/admin/pagos" icon="circle-alert" tone={r?.rechazadosMes ? "red" : "gray"} label="Pagos rechazados del mes" value={r?.rechazadosMes ?? "…"} />
              <AttendRow href="/admin/suscripciones" icon="repeat" tone={r?.canceladasMes ? "amber" : "gray"} label="Cancelaciones del mes" value={r?.canceladasMes ?? "…"} />
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

// ── Asignar plan (cortesía) ─────────────────────────────────────────────────────────────────────────────────────

/** Ventana para asignar un plan sin pago. Móntala con `key` distinto en cada apertura (useDialogTarget) para empezar limpia. */
export function AssignPlanDialog({ householdId, nombre, open, onOpenChange }: { householdId: string; nombre: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const { data: plans = [] } = usePlanOptions()
  const [plan, setPlan] = useState("premium")
  const [hasta, setHasta] = useState(in30())
  const [nota, setNota] = useState("")
  const [busy, setBusy] = useState(false)
  const futura = hasta > todayISO()
  const valid = !!householdId && !!plan && futura
  const save = async () => { setBusy(true); if (await run(() => adminAssignPlan(householdId, plan, hasta, nota), "Plan asignado", qc)) onOpenChange(false); setBusy(false) }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={`Asignar plan a ${nombre}`} description="El hogar tendrá ese plan sin pagar hasta la fecha que elijas (cortesía, convenio o pago por fuera). Le llega un aviso."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!valid} loading={busy} loadingText="Asignando…" hint="Elige el plan y una fecha futura" onClick={save}>Asignar</SubmitButton></>}>
      <FieldGroup>
        <FormField label="Plan" htmlFor="as-plan" required tip={false}><Combobox id="as-plan" value={plan} onChange={setPlan} options={plans.filter((p) => p.value !== "gratis")} /></FormField>
        <FormField label="Hasta" htmlFor="as-hasta" required tip={false} error={!futura ? "La fecha debe ser después de hoy" : undefined}><DatePicker id="as-hasta" quick="futuro" value={hasta} onChange={(v) => setHasta(v ?? in30())} /></FormField>
        <FormField label="Nota (solo para administradores)" htmlFor="as-nota" tip={false}><Input id="as-nota" className="h-11" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Aliado, soporte, prueba" /></FormField>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

// ── Hogares ─────────────────────────────────────────────────────────────────────────────────────────────────────

export function HogaresPanel() {
  const { data, isPending } = useQuery({ queryKey: ["admin", "households"], queryFn: () => adminHouseholds() })
  const { data: plans = [] } = usePlanOptions()
  const assign = useDialogTarget<{ id: string; nombre: string }>()
  const pn = (id: string) => plans.find((p) => p.value === id)?.label ?? id
  type H = NonNullable<typeof data>[number]
  return (
    <>
      <DataTable<H>
        title="Hogares" info="Cuentas familiares con al menos un integrante. Por privacidad no se muestran montos." data={data} loading={isPending} rowKey={(h) => h.id}
        search={{ placeholder: "Buscar hogar, dueño o correo", text: (h) => `${h.nombre} ${h.dueno?.nombre ?? ""} ${h.dueno?.email ?? ""}` }}
        filters={[
          { id: "plan", label: "Plan", options: plans.map((p) => ({ value: p.value, label: p.label })), match: (h, v) => h.plan === v },
          { id: "fam", label: "Integrantes", options: [{ value: "1", label: "Una persona" }, { value: "2", label: "Dos o más" }], match: (h, v) => (v === "1" ? h.integrantes === 1 : h.integrantes > 1) },
          { id: "act", label: "Actividad", options: [{ value: "si", label: "Con actividad en 30 días" }, { value: "no", label: "Sin actividad en 30 días" }], match: (h, v) => (v === "si" ? h.acciones30 > 0 : !h.acciones30) },
        ]}
        exportName="mirai-hogares" initialSort={{ id: "creado", dir: "desc" }}
        details={(h) => (h.dueno ? `/admin/usuarios/${h.dueno.id}` : null)}
        actions={[{ label: "Asignar plan", onSelect: (h) => assign.show({ id: h.id, nombre: h.nombre }) }]}
        columns={[
          { id: "hogar", header: "Hogar", sort: (h) => h.nombre.toLowerCase(), csv: (h) => h.nombre, cell: (h) => <DTPrimary media={<ToneIcon icon="house" tone={toneFor(h.nombre)} />} title={h.nombre} sub={`Creado ${fmtDate(h.creado.slice(0, 10), { year: true })}`} /> },
          { id: "dueno", header: "Dueño", sort: (h) => h.dueno?.nombre ?? "", csv: (h) => h.dueno?.email ?? "", cell: (h) => <DTTwoLine top={h.dueno?.nombre || "—"} bottom={h.dueno?.email} /> },
          { id: "plan", header: "Plan", sort: (h) => h.plan, csv: (h) => pn(h.plan), cell: (h) => <DTTwoLine top={<StatusPill tone={h.plan === "gratis" ? "gray" : "pagado"}>{pn(h.plan)}</StatusPill>} bottom={h.vence ? `hasta ${fmtDate(h.vence.slice(0, 10))}` : undefined} /> },
          { id: "integrantes", header: "Integrantes", align: "right", sort: (h) => h.integrantes, csv: (h) => h.integrantes, cell: (h) => <span className="tabular-nums">{h.integrantes}</span> },
          { id: "libros", header: "Libros", info: "Libros de cuentas del hogar (por ejemplo, personal y negocio).", align: "right", sort: (h) => h.libros, csv: (h) => h.libros, cell: (h) => <span className="tabular-nums">{h.libros}</span> },
          { id: "act", header: "Acciones (30 d)", info: "Registros creados, editados o borrados en 30 días. No se muestran montos.", align: "right", sort: (h) => h.acciones30, csv: (h) => h.acciones30, cell: (h) => <span className="font-semibold tabular-nums">{nf(h.acciones30)}</span> },
          { id: "creado", header: "Creado", hidden: true, sort: (h) => h.creado, csv: (h) => h.creado.slice(0, 10), cell: (h) => fmtDate(h.creado.slice(0, 10)) },
        ]}
      />
      <AssignPlanDialog key={assign.key} householdId={assign.value?.id ?? ""} nombre={assign.value?.nombre ?? ""} open={assign.open} onOpenChange={assign.onOpenChange} />
    </>
  )
}

// ── Suscripciones ───────────────────────────────────────────────────────────────────────────────────────────────

export function SuscripcionesPanel() {
  const qc = useQueryClient()
  const ask = useAsk()
  const { data, isPending } = useQuery({ queryKey: ["admin", "subs"], queryFn: () => adminSubscriptions() })
  const { data: plans = [] } = usePlanOptions()
  const pn = (id: string) => plans.find((p) => p.value === id)?.label ?? id
  type S = NonNullable<typeof data>[number]
  const upd = (s: S, a: Parameters<typeof adminUpdateSubscription>[1], ok: string) => run(() => adminUpdateSubscription(s.id, a), ok, qc)
  const vigentes = (data ?? []).filter((s) => s.vigente)
  return (
    <div className="grid gap-6">
      <KpiGrid>
        <Kpi icon="badge-check" tone="green" label="Vigentes" value={nf(vigentes.length)} sub={`${nf(vigentes.filter((s) => s.estado === "activa").length)} pagando`} loading={isPending} />
        <Kpi icon="gift" tone="blue" label="Cortesías" value={nf(vigentes.filter((s) => s.estado === "cortesia").length)} sub="Asignadas por Mirai" loading={isPending} />
        <Kpi icon="calendar-clock" tone="amber" label="Vencen en 7 días" value={nf(vigentes.filter((s) => s.vence_at && new Date(s.vence_at).getTime() - Date.now() < 7 * 86_400_000).length)} sub="Revisa si se renuevan" loading={isPending} />
        <Kpi icon="circle-x" tone="red" label="No se renuevan" value={nf((data ?? []).filter((s) => s.estado === "cancelada").length)} sub="Canceladas por el cliente" loading={isPending} />
      </KpiGrid>
      <DataTable<S>
        title="Suscripciones" info="Qué plan tiene cada hogar, por qué medio y hasta cuándo." data={data} loading={isPending} rowKey={(s) => s.id}
        search={{ placeholder: "Buscar hogar o nota", text: (s) => `${s.hogar} ${s.nota ?? ""}` }}
        filters={[
          { id: "vig", label: "Vigencia", options: [{ value: "si", label: "Vigentes" }, { value: "no", label: "Vencidas o pendientes" }], match: (s, v) => (v === "si" ? s.vigente : !s.vigente) },
          { id: "estado", label: "Estado", options: Object.entries(SUB).map(([k, v]) => ({ value: k, label: v[1] })), match: (s, v) => s.estado === v },
          { id: "prov", label: "Medio", options: Object.entries(PROV).map(([k, v]) => ({ value: k, label: v })), match: (s, v) => s.proveedor === v },
          { id: "plan", label: "Plan", options: plans.map((p) => ({ value: p.value, label: p.label })), match: (s, v) => s.plan === v },
          { id: "per", label: "Periodo", options: [{ value: "mes", label: "Mensual" }, { value: "anio", label: "Anual" }], match: (s, v) => s.periodo === v },
        ]}
        exportName="mirai-suscripciones" initialSort={{ id: "vence", dir: "desc" }}
        actions={[
          { label: "Extender 7 días", onSelect: (s) => upd(s, { kind: "extender", dias: 7 }, "Extendida 7 días") },
          { label: "Extender 30 días", onSelect: (s) => upd(s, { kind: "extender", dias: 30 }, "Extendida 30 días") },
          { label: "Extender 1 año", onSelect: (s) => upd(s, { kind: "extender", dias: 365 }, "Extendida 1 año") },
          ...plans.filter((p) => p.value !== "gratis").map((p) => ({ label: `Cambiar a ${p.label}`, onSelect: (s: S) => upd(s, { kind: "plan", plan: p.value }, `Cambiada a ${p.label}`), hidden: (s: S) => s.plan === p.value })),
          { label: "Cancelar renovación", onSelect: (s) => upd(s, { kind: "cancelar" }, "Renovación cancelada"), hidden: (s) => !(s.estado === "activa" && s.proveedor === "mercadopago") },
          { label: "Terminar ahora", destructive: true, onSelect: async (s) => { if (await ask.confirm({ title: "¿Terminar esta suscripción ya?", description: `${s.hogar} vuelve al plan Gratis de inmediato.`, confirmLabel: "Terminar", destructive: true })) upd(s, { kind: "terminar" }, "Suscripción terminada") } },
        ]}
        columns={[
          { id: "hogar", header: "Hogar", sort: (s) => s.hogar.toLowerCase(), csv: (s) => s.hogar, cell: (s) => <DTPrimary media={<ToneIcon icon="repeat" tone={PROV_TONE[s.proveedor] ?? "gray"} />} title={s.hogar} sub={s.nota || undefined} /> },
          { id: "plan", header: "Plan", sort: (s) => s.plan, csv: (s) => pn(s.plan), cell: (s) => <DTTwoLine top={pn(s.plan)} bottom={s.periodo === "anio" ? "Anual" : "Mensual"} /> },
          { id: "prov", header: "Medio", sort: (s) => s.proveedor, csv: (s) => PROV[s.proveedor] ?? s.proveedor, cell: (s) => PROV[s.proveedor] ?? s.proveedor },
          { id: "estado", header: "Estado", sort: (s) => s.estado, csv: (s) => s.estado, cell: (s) => <StatePill map={SUB} k={s.estado} /> },
          { id: "vence", header: "Vence", sort: (s) => s.vence_at ?? "", csv: (s) => s.vence_at?.slice(0, 10) ?? "", cell: (s) => <DTTwoLine top={s.vence_at ? fmtDate(s.vence_at.slice(0, 10), { year: true }) : "—"} bottom={s.vence_at ? rel(s.vence_at) : undefined} /> },
        ]}
      />
      {ask.node}
    </div>
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
  const valid = !!v.householdId && !!v.plan && v.monto > 0
  const save = async () => { setBusy(true); if (await run(() => adminManualPayment(v), "Pago registrado", qc)) onOpenChange(false); setBusy(false) }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Registrar un pago" description="Para pagos recibidos por fuera de las pasarelas (transferencia, efectivo, convenio). Extiende el plan del hogar."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!valid} loading={busy} loadingText="Registrando…" hint="Elige el hogar y escribe el monto recibido" onClick={save}>Registrar</SubmitButton></>}>
      <FieldGroup>
        <FormField label="Hogar" htmlFor="mp-h" required tip={false}><Combobox id="mp-h" value={v.householdId} onChange={(x) => setV({ ...v, householdId: x })} options={hh.map((h) => ({ value: h.id, label: h.nombre, hint: h.dueno?.email }))} placeholder="Busca el hogar" /></FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Plan" htmlFor="mp-p" required tip={false}><Combobox id="mp-p" value={v.plan} onChange={(x) => setV({ ...v, plan: x })} options={plans.filter((p) => p.value !== "gratis")} /></FormField>
          <FormField label="Periodo" tip={false}><Segmented value={v.periodo} onChange={(x) => setV({ ...v, periodo: x as "mes" | "anio" })} items={[{ value: "mes", label: "1 mes" }, { value: "anio", label: "1 año" }]} /></FormField>
        </div>
        <FormField label="Monto recibido (COP)" htmlFor="mp-m" required tip={false} hint={pl ? `Precio de lista: ${precio(v.periodo === "anio" ? pl.anio : pl.mes)}` : undefined}><MoneyInput id="mp-m" value={v.monto} onChange={(n) => setV({ ...v, monto: n ?? 0 })} /></FormField>
        <FormField label="Nota" htmlFor="mp-n" tip={false}><Input id="mp-n" className="h-11" value={v.nota} onChange={(e) => setV({ ...v, nota: e.target.value })} placeholder="Ej. Transferencia Bancolombia 12 nov" /></FormField>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

export function PagosPanel() {
  const qc = useQueryClient()
  const ask = useAsk()
  const { data: r, isPending } = useQuery({ queryKey: ["admin", "revenue"], queryFn: () => adminRevenue() })
  const manual = useDialogTarget<true>()
  type P = NonNullable<typeof r>["pagos"][number]
  return (
    <div className="grid gap-6">
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
        create={{ label: "Registrar pago", onClick: () => manual.show(true) }} exportName="mirai-pagos" initialSort={{ id: "fecha", dir: "desc" }}
        actions={[
          { label: "Anotar factura", onSelect: async (x) => { const f = await ask.prompt({ title: "Anotar factura", description: `Pago de ${x.hogar} por ${precio(x.monto)}.`, confirmLabel: "Guardar", input: { label: "Número de la factura electrónica", placeholder: "Ej. FE-1024", required: true } }); if (f) run(() => adminUpdatePayment(x.id, { factura_ref: f }), "Factura anotada", qc) } },
          { label: "Copiar referencia", onSelect: (x) => { navigator.clipboard.writeText(x.referencia); toast.success("Referencia copiada") } },
          { label: "Marcar como devuelto", hidden: (x) => x.estado !== "aprobado", onSelect: async (x) => { const n = await ask.prompt({ title: "Marcar como devuelto", description: "La devolución del dinero se hace en la pasarela; aquí solo queda anotada.", confirmLabel: "Marcar como devuelto", input: { label: "Nota de la devolución (opcional)", placeholder: "Ej. Pidió la devolución por correo" } }); if (n !== null) run(() => adminUpdatePayment(x.id, { estado: "reembolsado", nota: n }), "Marcado como devuelto", qc) } },
          { label: "Anular", destructive: true, hidden: (x) => x.estado === "anulado", onSelect: async (x) => { if (await ask.confirm({ title: "¿Anular este pago en Mirai?", description: `Pago de ${x.hogar} por ${precio(x.monto)}. No cambia nada en la pasarela.`, confirmLabel: "Anular", destructive: true })) run(() => adminUpdatePayment(x.id, { estado: "anulado" }), "Pago anulado", qc) } },
        ]}
        columns={[
          { id: "fecha", header: "Fecha", sort: (x) => x.paid_at ?? x.created_at, csv: (x) => (x.paid_at ?? x.created_at).slice(0, 10), cell: (x) => <DTTwoLine top={fmtDate((x.paid_at ?? x.created_at).slice(0, 10), { year: true })} bottom={rel(x.paid_at ?? x.created_at)} /> },
          { id: "hogar", header: "Hogar", sort: (x) => x.hogar.toLowerCase(), csv: (x) => x.hogar, cell: (x) => <DTPrimary media={<ToneIcon icon="receipt" tone={PROV_TONE[x.proveedor] ?? "gray"} />} title={x.hogar} sub={x.pagador || undefined} /> },
          { id: "prov", header: "Pasarela", sort: (x) => x.proveedor, csv: (x) => PROV[x.proveedor] ?? x.proveedor, cell: (x) => <DTTwoLine top={PROV[x.proveedor] ?? x.proveedor} bottom={x.metodo} /> },
          { id: "estado", header: "Estado", sort: (x) => x.estado, csv: (x) => x.estado, cell: (x) => <StatePill map={PAY} k={x.estado} /> },
          { id: "monto", header: "Monto", align: "right", sort: (x) => x.monto, csv: (x) => x.monto, cell: (x) => <span className="font-semibold tabular-nums">{precio(x.monto)}</span> },
          { id: "ref", header: "Referencia", hidden: true, csv: (x) => x.referencia, cell: (x) => <span className="font-mono text-xs">{x.referencia}</span> },
        ]}
      />
      <ManualPaymentDialog key={manual.key} open={manual.open} onOpenChange={manual.onOpenChange} />
      {ask.node}
    </div>
  )
}

// ── Cupones ─────────────────────────────────────────────────────────────────────────────────────────────────────

type CouponRow = Coupon & { descripcion: string }
const NEW_COUPON: CouponRow = { codigo: "", descripcion: "", tipo: "porcentaje", valor: 20, planes: [], periodos: ["mes", "anio"], desde: null, hasta: null, max_usos: null, usos: 0, activo: true }
const CODE_RE = /^[A-Z0-9_-]{3,30}$/
const couponDiscount = (c: Coupon) => (c.tipo === "porcentaje" ? `${c.valor} % de descuento` : `${precio(c.valor)} de descuento`)
const couponState = (c: Coupon): [PillTone, string] => {
  const hoy = todayISO()
  if (!c.activo) return ["gray", "Pausado"]
  if (c.hasta && c.hasta < hoy) return ["gray", "Vencido"]
  if (c.max_usos && c.usos >= c.max_usos) return ["porVencer", "Agotado"]
  if (c.desde && c.desde > hoy) return ["info", "Programado"]
  return ["pagado", "Activo"]
}

function CouponDialog({ c, isNew, open, onOpenChange }: { c: CouponRow; isNew: boolean; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const { data: plans = [] } = usePlanOptions()
  const [v, setV] = useState(c)
  const [busy, setBusy] = useState(false)
  const codigo = v.codigo.trim().toUpperCase()
  const codeOk = CODE_RE.test(codigo)
  const fechasOk = !v.desde || !v.hasta || v.desde <= v.hasta
  const valid = codeOk && v.periodos.length > 0 && v.valor > 0 && fechasOk
  const save = async () => {
    setBusy(true)
    const row = { ...v, codigo, descripcion: v.descripcion.trim() }
    const sb = createClient()
    const { error } = isNew ? await sb.from("coupons").insert(row) : await sb.from("coupons").update(row).eq("codigo", c.codigo)
    setBusy(false)
    if (error) return toast.error("No se pudo guardar", { description: error.code === "23505" ? "Ya existe un cupón con ese código." : error.message })
    toast.success("Cupón guardado"); qc.invalidateQueries({ queryKey: ["admin", "coupons"] }); onOpenChange(false)
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={isNew ? "Nuevo cupón" : `Cupón ${c.codigo}`} description="El cliente lo escribe en Planes antes de pagar."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!valid} loading={busy} hint="Revisa el código, el descuento y al menos un periodo" onClick={save}>Guardar</SubmitButton></>}>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Código" htmlFor="cp-c" required tip={false} hint={isNew ? "De 3 a 30 letras, números, - o _" : "El código no se puede cambiar"} error={v.codigo && !codeOk ? "Usa de 3 a 30 letras, números, - o _" : undefined}><Input id="cp-c" className="h-11 uppercase" disabled={!isNew} value={v.codigo} onChange={(e) => setV({ ...v, codigo: e.target.value.toUpperCase() })} placeholder="LANZAMIENTO" /></FormField>
          <FormField label="Descripción" htmlFor="cp-d" tip={false}><Input id="cp-d" className="h-11" value={v.descripcion} onChange={(e) => setV({ ...v, descripcion: e.target.value })} placeholder="Ej. 50 % el primer año" /></FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Tipo" tip={false}><Segmented value={v.tipo} onChange={(x) => setV({ ...v, tipo: x as Coupon["tipo"] })} items={[{ value: "porcentaje", label: "Porcentaje" }, { value: "valor", label: "Valor fijo" }]} /></FormField>
          <FormField label={v.tipo === "porcentaje" ? "Descuento (%)" : "Descuento (COP)"} htmlFor="cp-v" required tip={false}>{v.tipo === "porcentaje" ? <Input id="cp-v" type="number" min={1} max={100} className="h-11" value={v.valor} onChange={(e) => setV({ ...v, valor: Math.min(100, Math.max(1, +e.target.value || 1)) })} /> : <MoneyInput id="cp-v" value={v.valor} onChange={(n) => setV({ ...v, valor: n ?? 0 })} />}</FormField>
        </div>
        <FormField label="Planes (ninguno marcado = todos)" tip={false}>
          <CheckGroup options={plans.filter((p) => p.value !== "gratis")} value={v.planes} onChange={(x) => setV({ ...v, planes: x })} />
        </FormField>
        <FormField label="Aplica al pago" required tip={false} error={!v.periodos.length ? "Elige al menos un periodo" : undefined}>
          <CheckGroup options={[{ value: "mes", label: "Mensual" }, { value: "anio", label: "Anual" }]} value={v.periodos} onChange={(x) => setV({ ...v, periodos: x as Coupon["periodos"] })} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Desde" htmlFor="cp-de" tip={false}><DatePicker id="cp-de" quick="futuro" clearable value={v.desde} onChange={(x) => setV({ ...v, desde: x })} placeholder="Desde ya" /></FormField>
          <FormField label="Hasta" htmlFor="cp-ha" tip={false} error={!fechasOk ? "Debe ser después de Desde" : undefined}><DatePicker id="cp-ha" quick="futuro" clearable value={v.hasta} onChange={(x) => setV({ ...v, hasta: x })} placeholder="Sin fin" /></FormField>
          <FormField label="Máximo de usos" htmlFor="cp-mx" tip={false}><Input id="cp-mx" type="number" min={1} className="h-11" placeholder="Sin límite" value={v.max_usos ?? ""} onChange={(e) => setV({ ...v, max_usos: e.target.value ? +e.target.value : null })} /></FormField>
        </div>
        <ToggleRow title="Activo" desc="Si lo pausas, nadie lo puede usar hasta que lo actives de nuevo." checked={v.activo} onChange={(x) => setV({ ...v, activo: x })} label="Cupón activo" />
      </FieldGroup>
    </ResponsiveDialog>
  )
}

export function CuponesPanel() {
  const qc = useQueryClient()
  const ask = useAsk()
  const { data: plans = [] } = usePlanOptions()
  const { data, isPending } = useQuery({ queryKey: ["admin", "coupons"], queryFn: async () => ((await createClient().from("coupons").select("*").order("created_at", { ascending: false })).data ?? []) as CouponRow[] })
  const edit = useDialogTarget<{ c: CouponRow; isNew: boolean }>()
  const pn = (id: string) => plans.find((p) => p.value === id)?.label ?? id
  const borrar = async (c: CouponRow) => {
    if (!(await ask.confirm({ title: `¿Borrar el cupón ${c.codigo}?`, description: c.usos ? `Ya se usó ${c.usos} ${c.usos === 1 ? "vez" : "veces"}. Si solo quieres que no se use más, mejor páusalo.` : "No se puede deshacer.", confirmLabel: "Borrar", destructive: true }))) return
    const { error } = await createClient().from("coupons").delete().eq("codigo", c.codigo)
    if (error) toast.error("No se pudo borrar", { description: error.message }); else { toast("Cupón borrado"); qc.invalidateQueries({ queryKey: ["admin", "coupons"] }) }
  }
  const toggle = async (c: CouponRow) => {
    const { error } = await createClient().from("coupons").update({ activo: !c.activo }).eq("codigo", c.codigo)
    if (error) toast.error("No se pudo guardar", { description: error.message }); else { toast.success(c.activo ? "Cupón pausado" : "Cupón activo"); qc.invalidateQueries({ queryKey: ["admin", "coupons"] }) }
  }
  return (
    <>
      <DataTable<CouponRow>
        title="Cupones" info="Se aplican al precio de los pagos nuevos. En suscripciones con tarjeta, el descuento queda en todas las renovaciones." data={data} loading={isPending} rowKey={(c) => c.codigo}
        search={{ placeholder: "Buscar código o descripción", text: (c) => `${c.codigo} ${c.descripcion}` }}
        filters={[
          { id: "estado", label: "Estado", options: ["Activo", "Programado", "Agotado", "Vencido", "Pausado"].map((x) => ({ value: x, label: x })), match: (c, v) => couponState(c)[1] === v },
          { id: "tipo", label: "Tipo", options: [{ value: "porcentaje", label: "Porcentaje" }, { value: "valor", label: "Valor fijo" }], match: (c, v) => c.tipo === v },
        ]}
        create={{ label: "Nuevo cupón", onClick: () => edit.show({ c: { ...NEW_COUPON }, isNew: true }) }} exportName="mirai-cupones" initialSort={{ id: "usos", dir: "desc" }}
        actions={[
          { label: "Editar", onSelect: (c) => edit.show({ c, isNew: false }) },
          { label: "Copiar código", onSelect: (c) => { navigator.clipboard.writeText(c.codigo); toast.success("Código copiado") } },
          { label: "Pausar", hidden: (c) => !c.activo, onSelect: toggle },
          { label: "Activar", hidden: (c) => c.activo, onSelect: toggle },
          { label: "Borrar", destructive: true, onSelect: borrar },
        ]}
        columns={[
          { id: "codigo", header: "Código", sort: (c) => c.codigo, csv: (c) => c.codigo, cell: (c) => <DTPrimary media={<ToneIcon icon="ticket-percent" tone={c.tipo === "porcentaje" ? "violet" : "green"} />} title={<span className="font-mono">{c.codigo}</span>} sub={c.descripcion || couponDiscount(c)} /> },
          { id: "desc", header: "Descuento", sort: (c) => c.valor, csv: (c) => couponDiscount(c), cell: (c) => <DTTwoLine top={<span className="font-semibold">{couponDiscount(c)}</span>} bottom={c.periodos.map((p) => (p === "mes" ? "Mensual" : "Anual")).join(" y ")} /> },
          { id: "planes", header: "Planes", csv: (c) => c.planes.join(" | "), cell: (c) => (c.planes.length ? c.planes.map(pn).join(", ") : "Todos los planes") },
          { id: "vig", header: "Vigencia", sort: (c) => c.hasta ?? "9999", csv: (c) => `${c.desde ?? ""} - ${c.hasta ?? ""}`, cell: (c) => <DTTwoLine top={c.hasta ? `Hasta ${fmtDate(c.hasta, { year: true })}` : "Sin fecha final"} bottom={c.desde ? `Desde ${fmtDate(c.desde, { year: true })}` : undefined} /> },
          { id: "usos", header: "Usos", align: "right", sort: (c) => c.usos, csv: (c) => c.usos, cell: (c) => <span className="tabular-nums">{nf(c.usos)}{c.max_usos ? ` / ${nf(c.max_usos)}` : ""}</span> },
          { id: "estado", header: "Estado", sort: (c) => couponState(c)[1], csv: (c) => couponState(c)[1], cell: (c) => { const [t, l] = couponState(c); return <StatusPill tone={t}>{l}</StatusPill> } },
        ]}
        empty={<p className="text-muted-foreground">Aún no hay cupones. Crea uno con <b>Nuevo cupón</b>.</p>}
      />
      {edit.value && <CouponDialog key={edit.key} c={edit.value.c} isNew={edit.value.isNew} open={edit.open} onOpenChange={edit.onOpenChange} />}
      {ask.node}
    </>
  )
}
