"use client"

import { useState } from "react"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNowStrict } from "date-fns"
import { es } from "date-fns/locale"
import { Search, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { Combobox } from "@/components/mirai/combobox"
import { Icon } from "@/components/mirai/icon"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Segmented } from "@/components/mirai/choice-cards"
import { StatusPill } from "@/components/mirai/status-pill"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { ESTADOS, ESTADO_LIST, TIPOS, TIPO_LIST, type FeedbackEstado, type FeedbackTipo, SOPORTE_TEMAS, casoNumero, type SoporteCtx } from "@/lib/content/opiniones"
import { norm } from "@/lib/domain"
import { fmtDate } from "@/lib/format"
import { Stars } from "@/features/opiniones/stars"
import { adminClients, adminFeedback, adminOverview, adminUpdateFeedback } from "./actions"
import { DataTable, DTPrimary, DTTwoLine } from "@/components/mirai/data-table"
import { FormField } from "@/components/mirai/field"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { AssignPlanDialog } from "./console-negocio"
import { adminInviteUser, adminRecoveryLink } from "./server"
import { tablaLabel } from "@/lib/admin-nav"

const rel = (d?: string | null) => (d ? formatDistanceToNowStrict(new Date(d), { locale: es, addSuffix: true }) : "Nunca")
const n = (x: number) => x.toLocaleString("es-CO")

export function UsoPanel() {
  const { data: o, isPending } = useQuery({ queryKey: ["admin", "overview"], queryFn: () => adminOverview() })
  const max = Math.max(1, ...(o?.byDay.map((d) => d.acciones) ?? [1]))
  return (
    <div className="grid gap-5">
      <KpiGrid>
        <Kpi icon="users" tone="blue" label="Personas registradas" value={o ? n(o.personas) : ""} sub={o && `${n(o.nuevos30)} nuevas en 30 días · ${n(o.nuevos7)} en 7`} loading={isPending} />
        <Kpi icon="activity" tone="green" label="Activas (últimos 30 días)" value={o ? n(o.activos30) : ""} sub={o && `${n(o.activos7)} entraron esta semana`} loading={isPending} />
        <Kpi icon="house" tone="violet" label="Hogares" value={o ? n(o.hogares) : ""} sub={o && `${n(o.libros)} libros de cuentas`} loading={isPending} />
        <Kpi icon="star" tone="amber" label="Calificación promedio" value={o ? (o.rating.count ? o.rating.avg.toFixed(1).replace(".", ",") + " / 5" : "Sin datos") : ""} sub={o && `${n(o.rating.count)} calificaciones · ${n(o.opinionesNuevas)} opiniones sin leer`} loading={isPending} />
      </KpiGrid>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="gap-3 p-5 shadow-card ring-0">
          <div><h2 className="font-semibold">Uso en los últimos 30 días</h2><p className="text-sm text-muted-foreground">Registros creados, editados o borrados por día{o ? ` · ${n(o.acciones30)} en total` : ""}.</p></div>
          {isPending ? <Skeleton className="h-40" /> : (
            <div className="flex h-40 items-end gap-1" role="img" aria-label="Actividad diaria de los últimos 30 días">
              {o!.byDay.map((d) => (
                <div key={d.d} className="group relative flex h-full flex-1 items-end" title={`${fmtDate(d.d)}: ${d.acciones} acciones de ${d.personas} persona${d.personas === 1 ? "" : "s"}`}>
                  <span className="w-full rounded-t bg-brand/80 transition group-hover:bg-brand" style={{ height: `${Math.max(2, (d.acciones / max) * 100)}%` }} />
                </div>
              ))}
            </div>
          )}
          {o && <div className="flex justify-between text-xs text-muted-foreground"><span>{fmtDate(o.byDay[0].d)}</span><span>Hoy</span></div>}
        </Card>
        <Card className="gap-3 p-5 shadow-card ring-0">
          <h2 className="font-semibold">Lo más usado</h2>
          {isPending ? <Skeleton className="h-40" /> : !o!.porSeccion.length ? <p className="text-sm text-muted-foreground">Aún no hay actividad este mes.</p> : (
            <ul className="grid gap-2">
              {o!.porSeccion.map((s) => (
                <li key={s.tabla} className="grid gap-1">
                  <div className="flex justify-between text-sm"><span>{tablaLabel(s.tabla)}</span><span className="font-semibold tabular-nums">{n(s.n)}</span></div>
                  <span className="h-1.5 rounded-full bg-secondary"><span className="block h-full rounded-full bg-brand" style={{ width: `${(s.n / o!.porSeccion[0].n) * 100}%` }} /></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {o && o.erroresAbiertos > 0 && <Card className="flex-row items-center gap-3 p-4 shadow-card ring-0"><Icon name="bug" className="size-5 text-danger" /><p className="text-sm"><b>{o.erroresAbiertos}</b> error{o.erroresAbiertos === 1 ? "" : "es"} reportado{o.erroresAbiertos === 1 ? "" : "s"} sin resolver. Revísalos en la pestaña Opiniones.</p></Card>}
    </div>
  )
}

export function ClientesPanel() {
  const qc = useQueryClient()
  const { data, isPending } = useQuery({ queryKey: ["admin", "clients"], queryFn: () => adminClients() })
  const [assign, setAssign] = useState<{ id: string; nombre: string } | null>(null)
  const [invite, setInvite] = useState(false)
  const activo = (d: string | null) => !!d && Date.now() - new Date(d).getTime() < 7 * 86_400_000
  type C = NonNullable<typeof data>[number]
  return (
    <>
      <DataTable<C>
        title="Personas" info="Todas las cuentas de Mirai. Por privacidad no se muestran montos ni movimientos." data={data} loading={isPending} rowKey={(c) => c.id}
        search={{ placeholder: "Buscar por nombre, correo u hogar", text: (c) => `${c.nombre} ${c.email} ${c.hogares.join(" ")} ${c.telefono}` }}
        filters={[
          { id: "plan", label: "Plan", options: [...new Set((data ?? []).map((c) => c.plan))].map((p) => ({ value: p, label: p })), match: (c, v) => c.plan === v },
          { id: "act", label: "Actividad", options: [{ value: "7", label: "Activas esta semana" }, { value: "30", label: "Sin entrar hace 30 días" }], match: (c, v) => (v === "7" ? activo(c.ultimoIngreso) : !c.ultimoIngreso || Date.now() - new Date(c.ultimoIngreso).getTime() > 30 * 86_400_000) },
          { id: "acc", label: "Entra con", options: [{ value: "email", label: "Correo" }, { value: "google", label: "Google" }], match: (c, v) => c.acceso.includes(v) },
        ]}
        create={{ label: "Invitar persona", onClick: () => setInvite(true) }} exportName="mirai-personas" initialSort={{ id: "creado", dir: "desc" }}
        details={(c) => `/admin/usuarios/${c.id}`}
        actions={[
          { label: "Asignar plan", onSelect: (c) => c.hogarPropio && setAssign({ id: c.hogarPropio, nombre: c.nombre || c.email }), hidden: (c) => !c.hogarPropio },
          { label: "Copiar correo", onSelect: (c) => { navigator.clipboard.writeText(c.email); toast.success("Correo copiado") } },
          { label: "Enviar enlace de contraseña", onSelect: async (c) => { try { const r = await adminRecoveryLink(c.id); toast.success(r.msg); if (r.link) { navigator.clipboard.writeText(r.link); toast("Enlace copiado al portapapeles") } } catch (e) { toast.error((e as Error).message) } } },
        ]}
        columns={[
          { id: "persona", header: "Nombre", sort: (c) => (c.nombre || c.email).toLowerCase(), csv: (c) => c.nombre, cell: (c) => <DTPrimary media={<UserAvatar src={c.avatar} name={c.nombre || c.email} className="size-10" />} title={c.nombre || "Sin nombre"} sub={c.email} href={`/admin/usuarios/${c.id}`} /> },
          { id: "email", header: "Correo", hidden: true, csv: (c) => c.email, cell: (c) => c.email },
          { id: "hogar", header: "Hogar", info: "Hogares a los que pertenece (y su rol si no es dueño).", csv: (c) => c.hogares.join(" | "), cell: (c) => <DTTwoLine top={c.hogares[0] ?? "—"} bottom={c.hogares.length > 1 ? `y ${c.hogares.length - 1} más` : c.acceso} /> },
          { id: "plan", header: "Plan", sort: (c) => c.plan, csv: (c) => c.plan, cell: (c) => <DTTwoLine top={<StatusPill tone={c.plan === "Premium" ? "pagado" : "gray"}>{c.plan}</StatusPill>} bottom={c.premiumHasta ? `hasta ${fmtDate(c.premiumHasta.slice(0, 10))}` : undefined} /> },
          { id: "creado", header: "Registro", sort: (c) => c.creado, csv: (c) => c.creado.slice(0, 10), cell: (c) => fmtDate(c.creado.slice(0, 10), { year: true }) },
          { id: "ultimo", header: "Última actividad", info: "Último inicio de sesión. Activa = entró en los últimos 7 días.", sort: (c) => c.ultimoIngreso ?? "", csv: (c) => c.ultimoIngreso?.slice(0, 10) ?? "", cell: (c) => <DTTwoLine top={c.ultimoIngreso ? fmtDate(c.ultimoIngreso.slice(0, 10), { year: true }) : "Nunca"} bottom={activo(c.ultimoIngreso) ? <StatusPill tone="pagado">Activa</StatusPill> : rel(c.ultimoIngreso)} /> },
          { id: "acciones", header: "Acciones (30 d)", align: "right", sort: (c) => c.acciones30, csv: (c) => c.acciones30, cell: (c) => <span className="font-semibold tabular-nums">{n(c.acciones30)}</span> },
          { id: "tel", header: "Teléfono", hidden: true, csv: (c) => c.telefono, cell: (c) => c.telefono || "—" },
        ]}
      />
      {assign && <AssignPlanDialog householdId={assign.id} nombre={assign.nombre} open onOpenChange={(o) => !o && setAssign(null)} />}
      <InviteDialog open={invite} onOpenChange={setInvite} onDone={() => qc.invalidateQueries({ queryKey: ["admin", "clients"] })} />
    </>
  )
}

function InviteDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [email, setEmail] = useState("")
  const [nombre, setNombre] = useState("")
  const [busy, setBusy] = useState(false)
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Invitar a una persona" description="Le llega un correo para crear su cuenta en Mirai.">
      <div className="grid gap-4 pb-2">
        <FormField label="Nombre" htmlFor="inv-n" tip={false}><Input id="inv-n" className="h-11" value={nombre} onChange={(e) => setNombre(e.target.value)} /></FormField>
        <FormField label="Correo" htmlFor="inv-e" required tip={false}><Input id="inv-e" type="email" className="h-11" value={email} onChange={(e) => setEmail(e.target.value)} /></FormField>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={busy || !email.includes("@")} onClick={async () => { setBusy(true); try { await adminInviteUser(email, nombre); toast.success(`Invitación enviada a ${email}`); setEmail(""); setNombre(""); onOpenChange(false); onDone() } catch (e) { toast.error("No se pudo invitar", { description: (e as Error).message }) } finally { setBusy(false) } }}>{busy && <Spinner />} Enviar invitación</Button></div>
      </div>
    </ResponsiveDialog>
  )
}

type Fb = Awaited<ReturnType<typeof adminFeedback>>[number]

function FeedbackItem({ f }: { f: Fb }) {
  const qc = useQueryClient()
  const [resp, setResp] = useState(f.respuesta ?? "")
  const [busy, setBusy] = useState(false)
  const t = TIPOS[f.tipo as FeedbackTipo] ?? TIPOS.otro
  const ctx = (f.contexto ?? {}) as { version?: string; pantalla?: string; tema?: string; soporte?: SoporteCtx }
  const sop = ctx.soporte
  const update = async (patch: { estado?: FeedbackEstado; respuesta?: string }, msg: string) => {
    setBusy(true)
    try { await adminUpdateFeedback(f.id, patch); toast.success(msg); qc.invalidateQueries({ queryKey: ["admin"] }) }
    catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }) }
    finally { setBusy(false) }
  }
  return (
    <Card className="gap-3 p-4 shadow-card ring-0">
      <div className="flex flex-wrap items-center gap-2">
        <UserAvatar src={f.autor?.avatar_url ?? null} name={f.autor?.nombre || f.autor?.email || "?"} className="size-8" />
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{f.autor?.nombre || "Sin nombre"}</p><p className="truncate text-xs text-muted-foreground">{f.autor?.email} · {rel(f.created_at)}</p></div>
        <span className="ml-auto flex flex-wrap items-center gap-1.5"><StatusPill tone="info"><Icon name={t.icon} className="size-3" />{t.label}</StatusPill>{f.rating && <Stars value={f.rating} />}</span>
      </div>
      {sop && <p className="flex flex-wrap items-center gap-2 text-sm font-semibold"><StatusPill tone="porVencer">Caso {casoNumero(f.id)}</StatusPill>{SOPORTE_TEMAS.find((t) => t.value === sop.tema)?.label ?? sop.tema}</p>}
      {f.mensaje ? <p className="text-sm whitespace-pre-wrap">{f.mensaje}</p> : <p className="text-sm text-muted-foreground italic">Sin comentario.</p>}
      {f.capturaUrl && (
        <a href={f.capturaUrl} target="_blank" rel="noreferrer" className="w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.capturaUrl} alt="Captura enviada" className="max-h-48 rounded-lg border object-contain" />
        </a>
      )}
      <p className="text-xs text-muted-foreground">{[f.pagina && `Página ${f.pagina}`, ctx.version && `v${ctx.version}`, ctx.pantalla, ctx.tema].filter(Boolean).join(" · ")}</p>
      <div className="grid gap-2 rounded-lg bg-secondary/60 p-3 sm:grid-cols-[12rem_1fr]">
        <Combobox value={f.estado} onChange={(v) => update({ estado: v as FeedbackEstado }, "Estado actualizado")} disabled={busy}
          options={ESTADO_LIST.map((e) => ({ value: e, label: ESTADOS[e].label }))} />
        <div className="grid gap-2">
          <Textarea rows={2} placeholder="Escribe una respuesta. La persona la verá en Tu opinión y le llegará un aviso." value={resp} onChange={(e) => setResp(e.target.value)} aria-label={`Respuesta a ${f.autor?.nombre || "la persona"}`} />
          <Button size="sm" className="w-fit" disabled={busy || !resp.trim() || resp.trim() === (f.respuesta ?? "")} onClick={() => update({ respuesta: resp, ...(f.estado === "nuevo" ? { estado: "revisando" } : {}) }, "Respuesta enviada")}>{busy ? <Spinner /> : <Send />} {f.respuesta ? "Actualizar respuesta" : "Responder"}</Button>
        </div>
      </div>
    </Card>
  )
}

export function OpinionesPanel() {
  const { data, isPending } = useQuery({ queryKey: ["admin", "feedback"], queryFn: () => adminFeedback() })
  const [tipo, setTipo] = useState("todas")
  const [estado, setEstado] = useState("abiertas")
  const [q, setQ] = useState("")
  const list = (data ?? []).filter((f) => (tipo === "todas" || f.tipo === tipo)
    && (estado === "todas" || (estado === "abiertas" ? !["hecho", "descartado"].includes(f.estado) : f.estado === estado))
    && (!q || norm(`${f.mensaje} ${f.autor?.nombre ?? ""} ${f.autor?.email ?? ""}`).includes(norm(q))))
  const rated = (data ?? []).filter((f) => f.tipo === "calificacion" && f.rating)
  const dist = [5, 4, 3, 2, 1].map((s) => ({ s, c: rated.filter((f) => f.rating === s).length }))
  const avg = rated.length ? rated.reduce((a, f) => a + f.rating!, 0) / rated.length : 0
  return (
    <div className="grid gap-4">
      <Card className="grid gap-4 p-5 shadow-card ring-0 sm:grid-cols-[12rem_1fr]">
        <div className="grid content-center justify-items-center gap-1 text-center"><p className="text-4xl font-bold">{rated.length ? avg.toFixed(1).replace(".", ",") : "—"}</p><Stars value={avg} /><p className="text-xs text-muted-foreground">{rated.length} calificaciones</p></div>
        <ul className="grid gap-1.5">
          {dist.map((d) => (
            <li key={d.s} className="grid grid-cols-[3rem_1fr_2rem] items-center gap-2 text-sm"><span>{d.s} ★</span><span className="h-2 rounded-full bg-secondary"><span className="block h-full rounded-full bg-amber-400" style={{ width: `${rated.length ? (d.c / rated.length) * 100 : 0}%` }} /></span><span className="text-right tabular-nums">{d.c}</span></li>
          ))}
        </ul>
      </Card>
      <div className="grid gap-2">
        <Segmented value={tipo} onChange={setTipo} items={[{ value: "todas", label: "Todas" }, ...TIPO_LIST.map((k) => ({ value: k, label: TIPOS[k].label }))]} />
        <div className="flex flex-wrap gap-2">
          <div className="w-48"><Combobox value={estado} onChange={setEstado} options={[{ value: "abiertas", label: "Sin resolver" }, { value: "todas", label: "Todos los estados" }, ...ESTADO_LIST.map((e) => ({ value: e, label: ESTADOS[e].label }))]} /></div>
          <div className="relative min-w-56 flex-1"><Search className="absolute top-3.5 left-3 size-4 text-muted-foreground" /><Input className="h-11 pl-9" placeholder="Buscar en las opiniones" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar opiniones" /></div>
        </div>
      </div>
      {isPending ? <Skeleton className="h-60" /> : !list.length ? <Card className="p-8 text-center text-sm text-muted-foreground shadow-card ring-0">No hay opiniones con estos filtros.</Card> : (
        <ul className="grid gap-3">{list.map((f) => <li key={f.id}><FeedbackItem key={`${f.id}-${f.updated_at}`} f={f} /></li>)}</ul>
      )}
    </div>
  )
}
