"use client"

import { useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNowStrict } from "date-fns"
import { es } from "date-fns/locale"
import { Download, ExternalLink, Search, Send } from "lucide-react"
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
import { PageHeader } from "@/components/mirai/page-header"
import { Segmented } from "@/components/mirai/choice-cards"
import { StatusPill } from "@/components/mirai/status-pill"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { ESTADOS, ESTADO_LIST, TIPOS, TIPO_LIST, type FeedbackEstado, type FeedbackTipo } from "@/lib/content/opiniones"
import { norm } from "@/lib/domain"
import { fmtDate } from "@/lib/format"
import { Stars } from "@/features/opiniones/stars"
import { adminClients, adminFeedback, adminOverview, adminUpdateFeedback } from "./actions"
import { GiftPremium, Ingresos, PlanesAdmin } from "./admin-money"
import { AnunciosAdmin } from "./admin-ads"

const TABS = [
  { value: "resumen", label: "Resumen", icon: "gauge" }, { value: "ingresos", label: "Ingresos", icon: "banknote" }, { value: "clientes", label: "Clientes", icon: "users" },
  { value: "opiniones", label: "Opiniones", icon: "message-square-heart" }, { value: "anuncios", label: "Anuncios", icon: "megaphone" }, { value: "planes", label: "Planes", icon: "crown" },
]
const TABLAS: Record<string, string> = {
  expenses: "Gastos", incomes: "Ingresos", extra_incomes: "Ingresos extra", fixed_expenses: "Gastos fijos", loans: "Préstamos", debts: "Deudas", contacts: "Contactos",
  goals: "Metas", subscriptions: "Suscripciones", cards: "Tarjetas", investments: "Inversiones", categories: "Categorías", payment_methods: "Medios de pago",
  budgets: "Presupuesto", family_members: "Familia", challenges: "Retos", allowances: "Mesadas", shared_expenses: "Compartidos", book_settings: "Ajustes",
}
const rel = (d?: string | null) => (d ? formatDistanceToNowStrict(new Date(d), { locale: es, addSuffix: true }) : "Nunca")
const n = (x: number) => x.toLocaleString("es-CO")

function Resumen() {
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
                  <div className="flex justify-between text-sm"><span>{TABLAS[s.tabla] ?? s.tabla}</span><span className="font-semibold tabular-nums">{n(s.n)}</span></div>
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

function Clientes() {
  const { data, isPending } = useQuery({ queryKey: ["admin", "clients"], queryFn: () => adminClients() })
  const [q, setQ] = useState("")
  const list = useMemo(() => (data ?? []).filter((c) => !q || norm(`${c.nombre} ${c.email} ${c.hogares.join(" ")}`).includes(norm(q))), [data, q])
  const csv = () => {
    const rows = [["Nombre", "Correo", "Teléfono", "Hogares", "Plan", "Acceso", "Registro", "Último ingreso", "Acciones 30 días"], ...list.map((c) => [c.nombre, c.email, c.telefono, c.hogares.join(" | "), c.plan, c.acceso, c.creado.slice(0, 10), c.ultimoIngreso?.slice(0, 10) ?? "", String(c.acciones30)])]
    const blob = new Blob(["﻿" + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\n")], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `mirai-clientes-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }
  return (
    <Card className="gap-4 p-5 shadow-card ring-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1"><Search className="absolute top-3 left-3 size-4 text-muted-foreground" /><Input className="h-10 pl-9" placeholder="Buscar por nombre, correo u hogar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar clientes" /></div>
        <Button variant="outline" onClick={csv} disabled={!list.length}><Download /> Descargar CSV</Button>
      </div>
      {isPending ? <Skeleton className="h-60" /> : !list.length ? <p className="py-6 text-center text-sm text-muted-foreground">No hay clientes con esa búsqueda.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 font-medium">Persona</th><th className="font-medium">Hogar</th><th className="font-medium">Plan</th><th className="font-medium">Registro</th><th className="font-medium">Último ingreso</th><th className="text-right font-medium">Acciones (30 d)</th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2.5"><div className="flex items-center gap-2.5"><UserAvatar src={c.avatar} name={c.nombre || c.email} className="size-8" /><div className="min-w-0"><p className="truncate font-medium">{c.nombre || "Sin nombre"}</p><p className="truncate text-xs text-muted-foreground">{c.email} · {c.acceso}</p></div></div></td>
                  <td className="max-w-48 truncate">{c.hogares.join(", ") || "—"}</td>
                  <td><div className="flex items-center gap-1.5"><StatusPill tone={c.plan === "Premium" ? "pagado" : "gray"} title={c.premiumHasta ? `Hasta ${fmtDate(c.premiumHasta.slice(0, 10), { year: true })}` : undefined}>{c.plan}</StatusPill>{c.hogarPropio && <GiftPremium householdId={c.hogarPropio} nombre={c.nombre || c.email} premiumHasta={c.premiumHasta} />}</div></td>
                  <td className="whitespace-nowrap">{fmtDate(c.creado.slice(0, 10))}</td>
                  <td className="whitespace-nowrap">{rel(c.ultimoIngreso)}</td>
                  <td className="text-right font-semibold tabular-nums">{n(c.acciones30)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">El plan es del hogar. El regalo de Premium aplica al hogar del que la persona es dueña.</p>
    </Card>
  )
}

type Fb = Awaited<ReturnType<typeof adminFeedback>>[number]

function FeedbackItem({ f }: { f: Fb }) {
  const qc = useQueryClient()
  const [resp, setResp] = useState(f.respuesta ?? "")
  const [busy, setBusy] = useState(false)
  const t = TIPOS[f.tipo as FeedbackTipo] ?? TIPOS.otro
  const ctx = (f.contexto ?? {}) as { version?: string; pantalla?: string; tema?: string }
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

function Opiniones() {
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

/** Panel del dueño de Mirai: uso de la plataforma, clientes y opiniones. Solo para administradores de la plataforma. */
export function AdminView() {
  const params = useSearchParams()
  const router = useRouter()
  const path = usePathname()
  const tab = TABS.some((t) => t.value === params.get("tab")) ? params.get("tab")! : "resumen"
  return (
    <div className="grid gap-6">
      <PageHeader id="admin" title="Panel de administración" description="Cómo va Mirai: quiénes la usan, cuánto la usan y qué opinan. Solo tú ves esta sección."
        actions={<Button variant="outline" asChild><a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer"><ExternalLink /> Vercel</a></Button>} />
      <Segmented value={tab} onChange={(v) => router.replace(`${path}?tab=${v}`, { scroll: false })} items={TABS} />
      {tab === "resumen" ? <Resumen /> : tab === "ingresos" ? <Ingresos /> : tab === "clientes" ? <Clientes /> : tab === "planes" ? <PlanesAdmin /> : tab === "anuncios" ? <AnunciosAdmin /> : <Opiniones />}
    </div>
  )
}
