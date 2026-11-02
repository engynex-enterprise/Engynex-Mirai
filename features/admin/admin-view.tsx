"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Send } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Combobox } from "@/components/mirai/combobox"
import { Segmented } from "@/components/mirai/choice-cards"
import { Icon } from "@/components/mirai/icon"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { ListToolbar, NoResults, useListControls, type ListFilter, type ListSort } from "@/components/mirai/list-toolbar"
import { Notice } from "@/components/mirai/notice"
import { Panel } from "@/components/mirai/panel"
import { StatusPill } from "@/components/mirai/status-pill"
import { SubmitButton } from "@/components/mirai/submit-button"
import { Tip } from "@/components/mirai/tip"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { ESTADOS, ESTADO_LIST, TIPOS, TIPO_LIST, type FeedbackEstado, type FeedbackTipo, SOPORTE_TEMAS, casoNumero, type SoporteCtx } from "@/lib/content/opiniones"
import { fmtDate } from "@/lib/format"
import { Stars } from "@/features/opiniones/stars"
import { adminClients, adminFeedback, adminOverview, adminUpdateFeedback } from "./actions"
import { DataTable, DTPrimary, DTTwoLine } from "@/components/mirai/data-table"
import { FormField } from "@/components/mirai/field"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { AssignPlanDialog } from "./console-negocio"
import { adminInviteUser, adminRecoveryLink } from "./server"
import { tablaLabel } from "@/lib/admin-nav"
import { BarList, dec, DayBars, nf, rel, useDialogTarget } from "./ui"

const ACTIVA_DIAS = 7
const activa = (d: string | null) => !!d && Date.now() - new Date(d).getTime() < ACTIVA_DIAS * 86_400_000

export function UsoPanel() {
  const { data: o, isPending } = useQuery({ queryKey: ["admin", "overview"], queryFn: () => adminOverview() })
  return (
    <div className="grid gap-6">
      <KpiGrid>
        <Kpi icon="users" tone="blue" label="Personas registradas" value={o ? nf(o.personas) : ""} sub={o && `${nf(o.nuevos30)} nuevas en 30 días · ${nf(o.nuevos7)} en 7`} loading={isPending} />
        <Kpi icon="activity" tone="green" label="Activas (últimos 30 días)" value={o ? nf(o.activos30) : ""} sub={o && `${nf(o.activos7)} entraron esta semana`} loading={isPending} />
        <Kpi icon="house" tone="violet" label="Hogares" value={o ? nf(o.hogares) : ""} sub={o && `${nf(o.libros)} libros de cuentas`} loading={isPending} />
        <Kpi icon="star" tone="amber" label="Calificación promedio" value={o ? (o.rating.count ? `${dec(o.rating.avg.toFixed(1))} / 5` : "Sin datos") : ""} sub={o && `${nf(o.rating.count)} calificaciones · ${nf(o.opinionesNuevas)} opiniones sin leer`} loading={isPending} />
      </KpiGrid>
      {o && o.erroresAbiertos > 0 && (
        <Notice tone="bad" title={`${o.erroresAbiertos} error${o.erroresAbiertos === 1 ? "" : "es"} reportado${o.erroresAbiertos === 1 ? "" : "s"} sin resolver`}
          action={<Button size="sm" variant="outline" asChild><Link href="/admin/opiniones">Ver en Opiniones</Link></Button>}>
          Las personas los reportaron desde Tu opinión. Respóndeles para que sepan que los estás revisando.
        </Notice>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Uso en los últimos 30 días" icon="chart-column" description={`Registros creados, editados o borrados por día${o ? ` · ${nf(o.acciones30)} en total` : ""}.`}>
          <DayBars loading={isPending} label="Actividad diaria de los últimos 30 días"
            data={o?.byDay.map((d) => ({ d: d.d, a: d.acciones, title: `${fmtDate(d.d)}: ${d.acciones} acciones de ${d.personas} persona${d.personas === 1 ? "" : "s"}` }))} />
        </Panel>
        <Panel title="Lo más usado" icon="flame" description="Secciones con más registros este mes.">
          {isPending ? <Skeleton className="h-44" /> : <BarList rows={(o?.porSeccion ?? []).map((s) => ({ k: s.tabla, label: tablaLabel(s.tabla), v: s.n }))} empty="Aún no hay actividad este mes." />}
        </Panel>
      </div>
    </div>
  )
}

export function ClientesPanel() {
  const qc = useQueryClient()
  const { data, isPending } = useQuery({ queryKey: ["admin", "clients"], queryFn: () => adminClients() })
  const assign = useDialogTarget<{ id: string; nombre: string }>()
  const [invite, setInvite] = useState(false)
  type C = NonNullable<typeof data>[number]
  return (
    <>
      <DataTable<C>
        title="Personas" info="Todas las cuentas de Mirai. Por privacidad no se muestran montos ni movimientos." data={data} loading={isPending} rowKey={(c) => c.id}
        search={{ placeholder: "Buscar por nombre, correo u hogar", text: (c) => `${c.nombre} ${c.email} ${c.hogares.join(" ")} ${c.telefono}` }}
        filters={[
          { id: "plan", label: "Plan", options: [...new Set((data ?? []).map((c) => c.plan))].map((p) => ({ value: p, label: p })), match: (c, v) => c.plan === v },
          { id: "act", label: "Actividad", options: [{ value: "7", label: "Activas esta semana" }, { value: "30", label: "Sin entrar hace 30 días" }, { value: "nunca", label: "Nunca han entrado" }], match: (c, v) => (v === "7" ? activa(c.ultimoIngreso) : v === "nunca" ? !c.ultimoIngreso : !c.ultimoIngreso || Date.now() - new Date(c.ultimoIngreso).getTime() > 30 * 86_400_000) },
          { id: "acc", label: "Entra con", options: [{ value: "email", label: "Correo" }, { value: "google", label: "Google" }], match: (c, v) => c.acceso.includes(v) },
          { id: "hog", label: "Hogar", options: [{ value: "si", label: "Con hogar" }, { value: "no", label: "Sin hogar" }], match: (c, v) => (v === "si" ? c.hogares.length > 0 : !c.hogares.length) },
        ]}
        create={{ label: "Invitar persona", onClick: () => setInvite(true) }} exportName="mirai-personas" initialSort={{ id: "creado", dir: "desc" }}
        details={(c) => `/admin/usuarios/${c.id}`}
        actions={[
          { label: "Asignar plan", onSelect: (c) => c.hogarPropio && assign.show({ id: c.hogarPropio, nombre: c.nombre || c.email }), hidden: (c) => !c.hogarPropio },
          { label: "Copiar correo", onSelect: (c) => { navigator.clipboard.writeText(c.email); toast.success("Correo copiado") } },
          { label: "Enviar enlace de contraseña", onSelect: async (c) => { try { const r = await adminRecoveryLink(c.id); toast.success(r.msg); if (r.link) { navigator.clipboard.writeText(r.link); toast("Enlace copiado al portapapeles") } } catch (e) { toast.error((e as Error).message) } } },
        ]}
        columns={[
          { id: "persona", header: "Nombre", sort: (c) => (c.nombre || c.email).toLowerCase(), csv: (c) => c.nombre, cell: (c) => <DTPrimary media={<UserAvatar src={c.avatar} name={c.nombre || c.email} className="size-10" />} title={c.nombre || "Sin nombre"} sub={c.email} href={`/admin/usuarios/${c.id}`} /> },
          { id: "email", header: "Correo", hidden: true, csv: (c) => c.email, cell: (c) => c.email },
          { id: "hogar", header: "Hogar", info: "Hogares a los que pertenece (y su rol si no es dueño).", sort: (c) => c.hogares[0] ?? "", csv: (c) => c.hogares.join(" | "), cell: (c) => <DTTwoLine top={c.hogares[0] ?? "—"} bottom={c.hogares.length > 1 ? `y ${c.hogares.length - 1} más` : c.acceso} /> },
          { id: "plan", header: "Plan", sort: (c) => c.plan, csv: (c) => c.plan, cell: (c) => <DTTwoLine top={<StatusPill tone={c.plan === "Premium" ? "pagado" : "gray"}>{c.plan}</StatusPill>} bottom={c.premiumHasta ? `hasta ${fmtDate(c.premiumHasta.slice(0, 10))}` : undefined} /> },
          { id: "creado", header: "Registro", sort: (c) => c.creado, csv: (c) => c.creado.slice(0, 10), cell: (c) => fmtDate(c.creado.slice(0, 10), { year: true }) },
          { id: "ultimo", header: "Última actividad", info: `Último inicio de sesión. Activa = entró en los últimos ${ACTIVA_DIAS} días.`, sort: (c) => c.ultimoIngreso ?? "", csv: (c) => c.ultimoIngreso?.slice(0, 10) ?? "", cell: (c) => <DTTwoLine top={c.ultimoIngreso ? fmtDate(c.ultimoIngreso.slice(0, 10), { year: true }) : "Nunca"} bottom={activa(c.ultimoIngreso) ? <Tip label={`Entró ${rel(c.ultimoIngreso)}`}><span className="inline-flex"><StatusPill tone="pagado">Activa</StatusPill></span></Tip> : rel(c.ultimoIngreso)} /> },
          { id: "acciones", header: "Acciones (30 d)", info: "Registros que creó, editó o borró en los últimos 30 días.", align: "right", sort: (c) => c.acciones30, csv: (c) => c.acciones30, cell: (c) => <span className="font-semibold tabular-nums">{nf(c.acciones30)}</span> },
          { id: "tel", header: "Teléfono", hidden: true, csv: (c) => c.telefono, cell: (c) => c.telefono || "—" },
        ]}
      />
      <AssignPlanDialog key={assign.key} householdId={assign.value?.id ?? ""} nombre={assign.value?.nombre ?? ""} open={assign.open} onOpenChange={assign.onOpenChange} />
      <InviteDialog open={invite} onOpenChange={setInvite} onDone={() => qc.invalidateQueries({ queryKey: ["admin", "clients"] })} />
    </>
  )
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function InviteDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [email, setEmail] = useState("")
  const [nombre, setNombre] = useState("")
  const [busy, setBusy] = useState(false)
  const valid = EMAIL_RE.test(email.trim())
  const send = async () => {
    setBusy(true)
    try { await adminInviteUser(email.trim(), nombre.trim()); toast.success(`Invitación enviada a ${email.trim()}`); setEmail(""); setNombre(""); onOpenChange(false); onDone() }
    catch (e) { toast.error("No se pudo invitar", { description: (e as Error).message }) }
    finally { setBusy(false) }
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Invitar a una persona" description="Le llega un correo para crear su cuenta en Mirai."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!valid} loading={busy} loadingText="Enviando…" hint="Escribe un correo válido" onClick={send}><Send /> Enviar invitación</SubmitButton></>}>
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (valid && !busy) void send() }}>
        <FormField label="Nombre" htmlFor="inv-n" tip={false}><Input id="inv-n" className="h-11" autoComplete="off" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Laura Gómez" /></FormField>
        <FormField label="Correo" htmlFor="inv-e" required tip={false} error={email && !valid ? "Escribe un correo válido" : undefined}><Input id="inv-e" type="email" className="h-11" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="laura@correo.com" /></FormField>
      </form>
    </ResponsiveDialog>
  )
}

type Fb = Awaited<ReturnType<typeof adminFeedback>>[number]
type FbCtx = { version?: string; pantalla?: string; tema?: string; soporte?: SoporteCtx }
const ABIERTA = (f: Fb) => !["hecho", "descartado"].includes(f.estado)

function FeedbackItem({ f }: { f: Fb }) {
  const qc = useQueryClient()
  const [resp, setResp] = useState(f.respuesta ?? "")
  const [busy, setBusy] = useState(false)
  const t = TIPOS[f.tipo as FeedbackTipo] ?? TIPOS.otro
  const ctx = (f.contexto ?? {}) as FbCtx
  const sop = ctx.soporte
  const update = async (patch: { estado?: FeedbackEstado; respuesta?: string }, msg: string) => {
    setBusy(true)
    try { await adminUpdateFeedback(f.id, patch); toast.success(msg); qc.invalidateQueries({ queryKey: ["admin"] }) }
    catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }) }
    finally { setBusy(false) }
  }
  const est = ESTADOS[f.estado as FeedbackEstado]
  const sinCambio = !resp.trim() || resp.trim() === (f.respuesta ?? "")
  return (
    <Card className="gap-3 p-5 shadow-card ring-0">
      <div className="flex flex-wrap items-center gap-3">
        <UserAvatar src={f.autor?.avatar_url ?? null} name={f.autor?.nombre || f.autor?.email || "?"} className="size-10" />
        <div className="grid min-w-0 flex-1"><p className="truncate text-[15px] font-semibold">{f.autor?.nombre || "Sin nombre"}</p><p className="truncate text-xs text-muted-foreground">{f.autor?.email} · {rel(f.created_at)}</p></div>
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusPill tone="info"><Icon name={t.icon} className="size-3" />{t.label}</StatusPill>
          {est && <Tip label="Estado del caso (la persona lo ve en Tu opinión)"><span className="inline-flex"><StatusPill tone={est.tone}>{est.label}</StatusPill></span></Tip>}
          {f.rating && <Stars value={f.rating} />}
        </span>
      </div>
      {sop && <p className="flex flex-wrap items-center gap-2 text-sm font-semibold"><StatusPill tone="porVencer">Caso {casoNumero(f.id)}</StatusPill>{SOPORTE_TEMAS.find((x) => x.value === sop.tema)?.label ?? sop.tema}</p>}
      {f.mensaje ? <p className="text-[15px] whitespace-pre-wrap">{f.mensaje}</p> : <p className="text-sm text-muted-foreground italic">Sin comentario.</p>}
      {f.capturaUrl && (
        <a href={f.capturaUrl} target="_blank" rel="noreferrer" className="w-fit rounded-lg focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none" aria-label="Abrir la captura en una pestaña nueva">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.capturaUrl} alt="Captura enviada" className="max-h-48 rounded-lg border object-contain" />
        </a>
      )}
      {[f.pagina && `Página ${f.pagina}`, ctx.version && `v${ctx.version}`, ctx.pantalla, ctx.tema].some(Boolean) && <p className="text-xs text-muted-foreground">{[f.pagina && `Página ${f.pagina}`, ctx.version && `v${ctx.version}`, ctx.pantalla, ctx.tema].filter(Boolean).join(" · ")}</p>}
      <div className="grid gap-3 rounded-lg bg-secondary/60 p-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <FormField label="Estado" tip={false}>
          <Combobox value={f.estado} onChange={(v) => update({ estado: v as FeedbackEstado }, "Estado actualizado")} disabled={busy}
            options={ESTADO_LIST.map((e) => ({ value: e, label: ESTADOS[e].label }))} />
        </FormField>
        <div className="grid gap-2">
          <Textarea rows={2} placeholder="Escribe una respuesta. La persona la verá en Tu opinión y le llegará un aviso." value={resp} onChange={(e) => setResp(e.target.value)} aria-label={`Respuesta a ${f.autor?.nombre || "la persona"}`} />
          <SubmitButton className="w-fit" disabled={sinCambio} loading={busy} loadingText="Enviando…" hint={resp.trim() ? "Cambia la respuesta para volver a enviarla" : "Escribe una respuesta"}
            onClick={() => update({ respuesta: resp, ...(f.estado === "nuevo" ? { estado: "revisando" } : {}) }, "Respuesta enviada")}>
            <Send /> {f.respuesta ? "Actualizar respuesta" : "Responder"}
          </SubmitButton>
        </div>
      </div>
    </Card>
  )
}

const FB_FILTERS: ListFilter<Fb>[] = [
  { value: "abiertas", label: "Sin resolver", icon: "circle-dot", match: ABIERTA },
  { value: "todas", label: "Todas", icon: "list" },
  ...ESTADO_LIST.map((e) => ({ value: e, label: ESTADOS[e].label, match: (f: Fb) => f.estado === e })),
]
const FB_SORTS: ListSort<Fb>[] = [
  { value: "recientes", label: "Más recientes", by: (a, b) => b.created_at.localeCompare(a.created_at) },
  { value: "antiguas", label: "Más antiguas primero", by: (a, b) => a.created_at.localeCompare(b.created_at) },
  { value: "peor", label: "Peor calificación", by: (a, b) => (a.rating ?? 6) - (b.rating ?? 6) },
]

export function OpinionesPanel() {
  const { data, isPending } = useQuery({ queryKey: ["admin", "feedback"], queryFn: () => adminFeedback() })
  const [tipo, setTipo] = useState("todas")
  const byTipo = (data ?? []).filter((f) => tipo === "todas" || f.tipo === tipo)
  const c = useListControls(byTipo, { text: (f) => `${f.mensaje} ${f.autor?.nombre ?? ""} ${f.autor?.email ?? ""}`, filters: FB_FILTERS, sorts: FB_SORTS })
  const all = data ?? []
  const rated = all.filter((f) => f.tipo === "calificacion" && f.rating)
  const dist = [5, 4, 3, 2, 1].map((s) => ({ s, c: rated.filter((f) => f.rating === s).length }))
  const avg = rated.length ? rated.reduce((a, f) => a + f.rating!, 0) / rated.length : 0
  const abiertas = all.filter(ABIERTA)
  const ideas = all.filter((f) => f.tipo === "funcion" || f.tipo === "sugerencia")
  return (
    <div className="grid gap-6">
      <KpiGrid>
        <Kpi icon="inbox" tone="blue" label="Sin resolver" value={nf(abiertas.length)} sub={`${nf(all.filter((f) => f.estado === "nuevo").length)} sin leer`} loading={isPending} />
        <Kpi icon="bug" tone="red" label="Errores abiertos" value={nf(abiertas.filter((f) => f.tipo === "error").length)} sub="Reportes de algo que no funciona" loading={isPending} />
        <Kpi icon="lightbulb" tone="violet" label="Ideas y funciones" value={nf(ideas.length)} sub={`${nf(ideas.filter((f) => f.estado === "planeado").length)} planeadas`} loading={isPending} />
        <Kpi icon="star" tone="amber" label="Calificación promedio" value={rated.length ? `${dec(avg.toFixed(1))} / 5` : "Sin datos"} sub={`${nf(rated.length)} calificaciones`} loading={isPending} />
      </KpiGrid>
      <div className="grid items-start gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Panel title="Calificaciones" icon="star" className="xl:sticky xl:top-4 xl:h-auto">
          <div className="grid justify-items-center gap-1 text-center"><p className="text-4xl font-bold tabular-nums">{rated.length ? dec(avg.toFixed(1)) : "—"}</p><Stars value={avg} /><p className="text-xs text-muted-foreground">{nf(rated.length)} calificaciones</p></div>
          <ul className="grid gap-1.5" aria-label="Distribución de estrellas">
            {dist.map((d) => (
              <li key={d.s} className="grid grid-cols-[2.5rem_1fr_2rem] items-center gap-2 text-sm"><span>{d.s} ★</span><span className="h-2 rounded-full bg-secondary" aria-hidden><span className="block h-full rounded-full bg-amber-400" style={{ width: `${rated.length ? (d.c / rated.length) * 100 : 0}%` }} /></span><span className="text-right tabular-nums">{d.c}</span></li>
            ))}
          </ul>
        </Panel>
        <div className="grid min-w-0 gap-4">
          <div className="grid gap-3">
            <Segmented value={tipo} onChange={setTipo} items={[{ value: "todas", label: "Todos los tipos" }, ...TIPO_LIST.map((k) => ({ value: k, label: TIPOS[k].label, icon: TIPOS[k].icon }))]} />
            <ListToolbar c={c} placeholder="Buscar en las opiniones" filters={FB_FILTERS} sorts={FB_SORTS} />
          </div>
          {isPending ? <div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-lg" />)}</div>
            : !c.rows.length ? <NoResults c={c}>{c.filtered || tipo !== "todas" ? "No hay opiniones con estos filtros." : "Aún no hay opiniones."}</NoResults>
            : <ul className="grid gap-3">{c.rows.map((f) => <li key={f.id}><FeedbackItem key={`${f.id}-${f.updated_at}`} f={f} /></li>)}</ul>}
        </div>
      </div>
    </div>
  )
}
