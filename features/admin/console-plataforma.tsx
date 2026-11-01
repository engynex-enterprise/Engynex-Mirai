"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNowStrict } from "date-fns"
import { es } from "date-fns/locale"
import { CircleCheck, CircleX, FlaskConical, Plus, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { BrandLogo } from "@/components/mirai/brand-logo"
import { DataTable, DTTwoLine } from "@/components/mirai/data-table"
import { Combobox } from "@/components/mirai/combobox"
import { FormField } from "@/components/mirai/field"
import { Icon } from "@/components/mirai/icon"
import { MoneyInput } from "@/components/mirai/money-input"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { Segmented } from "@/components/mirai/choice-cards"
import { StatusPill } from "@/components/mirai/status-pill"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { useApp } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { CATS, INTEGRATIONS, type IntegrationDef } from "@/lib/integrations/registry"
import { MODES, type GlobalMode } from "@/lib/integrations/resolve"
import { INTEGRATION_BRAND } from "@/lib/brands"
import { FEATURES, FEATURE_LIST, ahorroAnual, precio } from "@/lib/plans"
import { fmtDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { usePlanOptions } from "./console-negocio"
import { adminAddAdminByEmail, adminAdmins, adminAuditLog, adminBroadcast, adminCleanOrphanHouseholds, adminGlobalIntegrations, adminSaveGlobalIntegration, adminSaveSettings, adminSetPlatformAdmin, adminSystem, adminTestGlobal } from "./server"

const rel = (d?: string | null) => (d ? formatDistanceToNowStrict(new Date(d), { locale: es, addSuffix: true }) : "—")

// ── Planes ──────────────────────────────────────────────────────────────────────────────────────────────────────

type Plan = { id: string; nombre: string; descripcion: string; precio_mes: number; precio_anio: number; funciones: string[]; anuncios: boolean; limites: { libros?: number; personas?: number }; activo: boolean; publico: boolean; destacado: boolean; orden: number }
const NEW_PLAN: Plan = { id: "", nombre: "", descripcion: "", precio_mes: 9900, precio_anio: 99000, funciones: [], anuncios: false, limites: {}, activo: true, publico: true, destacado: false, orden: 3 }

function PlanDialog({ p, isNew, onClose }: { p: Plan; isNew: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [v, setV] = useState(p)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Plan>(k: K, x: Plan[K]) => setV({ ...v, [k]: x })
  const gratis = v.id === "gratis"
  const save = async () => {
    const id = isNew ? v.nombre.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) : v.id
    if (v.nombre.trim().length < 2 || id.length < 2) return toast.error("Escribe el nombre del plan")
    if (!gratis && v.precio_mes < 1000) return toast.error("El precio mensual debe ser de al menos $1.000")
    setBusy(true)
    const row = { ...v, id, nombre: v.nombre.trim(), descripcion: v.descripcion.trim(), precio_mes: gratis ? 0 : v.precio_mes, precio_anio: gratis ? 0 : v.precio_anio, limites: Object.fromEntries(Object.entries(v.limites).filter(([, x]) => x)) }
    const sb = createClient()
    const { error } = isNew ? await sb.from("plans").insert(row) : await sb.from("plans").update(row).eq("id", p.id)
    setBusy(false)
    if (error) return toast.error("No se pudo guardar", { description: error.code === "23505" ? "Ya existe un plan con ese nombre." : error.message })
    toast.success("Plan guardado"); qc.invalidateQueries({ queryKey: ["admin"] }); qc.invalidateQueries({ queryKey: ["plans"] }); onClose()
  }
  const ahorro = ahorroAnual(v.precio_mes, v.precio_anio)
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title={isNew ? "Nuevo plan" : `Plan ${p.nombre}`} description="Lo que incluye, cuánto cuesta y dónde se muestra. Los cambios de precio aplican a los pagos nuevos." wide>
      <FieldGroup className="pb-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nombre" htmlFor="pl-n" required tip={false}><Input id="pl-n" className="h-11" maxLength={30} value={v.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Familia" /></FormField>
          <FormField label="Descripción corta" htmlFor="pl-d" tip={false}><Input id="pl-d" className="h-11" maxLength={120} value={v.descripcion} onChange={(e) => set("descripcion", e.target.value)} /></FormField>
        </div>
        {!gratis && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Precio mensual (COP)" htmlFor="pl-m" tip={false}><MoneyInput id="pl-m" value={v.precio_mes} onChange={(n) => set("precio_mes", n ?? 0)} /></FormField>
            <FormField label="Precio anual (COP)" htmlFor="pl-a" tip={false} hint={ahorro.pesos > 0 ? `Ahorro de ${precio(ahorro.pesos)} (${ahorro.meses} meses gratis)` : "Sin ahorro frente a 12 meses"}><MoneyInput id="pl-a" value={v.precio_anio} onChange={(n) => set("precio_anio", n ?? 0)} /></FormField>
          </div>
        )}
        <FormField label="Funciones incluidas" tip={false}>
          <div className="grid gap-2 sm:grid-cols-2">{FEATURE_LIST.map((f) => (
            <label key={f} className="flex cursor-pointer items-start gap-2 rounded-lg bg-secondary/60 p-3 text-sm">
              <Checkbox checked={v.funciones.includes(f)} onCheckedChange={(x) => set("funciones", x ? [...v.funciones, f] : v.funciones.filter((y) => y !== f))} aria-label={FEATURES[f].label} />
              <span><b>{FEATURES[f].label}</b><span className="block text-muted-foreground">{FEATURES[f].beneficios.slice(0, 2).join(" · ")}</span></span>
            </label>
          ))}</div>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Libros por hogar" htmlFor="pl-l" tip={false} hint="Vacío = ilimitado"><Input id="pl-l" type="number" min={1} className="h-11" value={v.limites.libros ?? ""} onChange={(e) => set("limites", { ...v.limites, libros: e.target.value ? +e.target.value : undefined })} /></FormField>
          <FormField label="Personas por hogar" htmlFor="pl-p" tip={false} hint="Vacío = ilimitado"><Input id="pl-p" type="number" min={1} className="h-11" value={v.limites.personas ?? ""} onChange={(e) => set("limites", { ...v.limites, personas: e.target.value ? +e.target.value : undefined })} /></FormField>
          <FormField label="Orden en Planes" htmlFor="pl-o" tip={false}><Input id="pl-o" type="number" className="h-11" value={v.orden} onChange={(e) => set("orden", +e.target.value || 0)} /></FormField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {([["anuncios", "Muestra anuncios"], ["publico", "Visible en la página de Planes"], ["activo", "Se puede comprar"], ["destacado", "Destacado (recomendado)"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-3 text-sm"><Switch checked={v[k]} disabled={gratis && (k === "activo")} onCheckedChange={(x) => set(k, x)} aria-label={l} />{l}</label>
          ))}
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={busy} onClick={save}>{busy && <Spinner />} Guardar plan</Button></div>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

export function PlanesPanel() {
  const qc = useQueryClient()
  const { data, isPending } = useQuery({ queryKey: ["admin", "plans-full"], queryFn: async () => ((await createClient().from("plans").select("*").order("orden").order("precio_mes")).data ?? []) as unknown as Plan[] })
  const [edit, setEdit] = useState<{ p: Plan; isNew: boolean } | null>(null)
  return (
    <div className="grid gap-4">
      <div className="flex justify-end"><Button onClick={() => setEdit({ p: { ...NEW_PLAN }, isNew: true })}><Plus /> Nuevo plan</Button></div>
      {isPending ? <Skeleton className="h-60" /> : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{data!.map((p) => (
          <Card key={p.id} className={cn("gap-3 p-5 shadow-card", p.destacado ? "ring-2 ring-amber-400" : "ring-0")}>
            <div className="flex items-start justify-between gap-2"><div><h2 className="text-lg font-semibold">{p.nombre}</h2><p className="text-xs text-muted-foreground">id: {p.id}</p></div><div className="flex flex-wrap justify-end gap-1">{!p.activo && <StatusPill tone="gray">No se vende</StatusPill>}{!p.publico && <StatusPill tone="gray">Oculto</StatusPill>}{p.destacado && <StatusPill tone="porVencer">Destacado</StatusPill>}</div></div>
            <p className="text-2xl font-bold">{p.precio_mes ? precio(p.precio_mes) : "$0"} <span className="text-sm font-normal text-muted-foreground">{p.precio_mes ? `al mes · ${precio(p.precio_anio)} al año` : "para siempre"}</span></p>
            {p.descripcion && <p className="text-sm text-muted-foreground">{p.descripcion}</p>}
            <div className="flex flex-wrap gap-1">{p.funciones.length ? p.funciones.map((f) => <StatusPill key={f} tone="pagado">{FEATURES[f as keyof typeof FEATURES]?.label ?? f}</StatusPill>) : <StatusPill tone="gray">Solo lo básico</StatusPill>}{p.anuncios && <StatusPill tone="gray">Con anuncios</StatusPill>}</div>
            <p className="text-xs text-muted-foreground">{p.limites.libros ? `${p.limites.libros} libro(s)` : "Libros ilimitados"} · {p.limites.personas ? `${p.limites.personas} personas` : "personas ilimitadas"}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEdit({ p, isNew: false })}>Editar</Button>
              {!["gratis", "premium"].includes(p.id) && <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { if (!confirm(`¿Borrar el plan ${p.nombre}? Si hay hogares con este plan, mejor ocúltalo y deja de venderlo.`)) return; const { error } = await createClient().from("plans").delete().eq("id", p.id); if (error) toast.error("No se pudo borrar", { description: error.code === "23503" ? "Hay suscripciones o pagos con este plan: ocúltalo y deja de venderlo." : error.message }); else { toast("Plan borrado"); qc.invalidateQueries({ queryKey: ["admin"] }) } }}><Trash2 /> Borrar</Button>}
            </div>
          </Card>
        ))}</div>
      )}
      {edit && <PlanDialog p={edit.p} isNew={edit.isNew} onClose={() => setEdit(null)} />}
    </div>
  )
}

// ── Integraciones globales ──────────────────────────────────────────────────────────────────────────────────────

type GlobalRow = Awaited<ReturnType<typeof adminGlobalIntegrations>>[number]

function GlobalDialog({ def, row, onClose }: { def: IntegrationDef; row: GlobalRow; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: plans = [] } = usePlanOptions()
  const [modo, setModo] = useState<GlobalMode>(row.modo as GlobalMode)
  const [planes, setPlanes] = useState<string[]>(row.planes)
  const [vals, setVals] = useState<Record<string, string | number | boolean>>({})
  const [busy, setBusy] = useState(false)
  const v = (k: string, d?: unknown) => (k in vals ? vals[k] : (row.config[k] as string | undefined) ?? d ?? "")
  const save = async () => {
    setBusy(true)
    try { const r = await adminSaveGlobalIntegration(def.kind, { modo, planes, values: vals }); if (!r.ok) return void toast.error(r.msg); toast.success("Integración global guardada"); qc.invalidateQueries({ queryKey: ["admin", "globals"] }); onClose() }
    catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }) }
    finally { setBusy(false) }
  }
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title={`${def.n} para toda la plataforma`} description="Configura la cuenta de Mirai y decide cómo la reciben los hogares." wide>
      <FieldGroup className="pb-2">
        <FormField label="¿Cómo la reciben los hogares?" tip={false}>
          <div className="grid gap-2 sm:grid-cols-2">{MODES.map((m) => (
            <button key={m.value} type="button" role="radio" aria-checked={modo === m.value} onClick={() => setModo(m.value)} className={cn("grid gap-0.5 rounded-lg p-3 text-left text-sm ring-1 ring-border", modo === m.value && "bg-brand-soft ring-2 ring-brand")}><b>{m.label}</b><span className="text-muted-foreground">{m.desc}</span></button>
          ))}</div>
        </FormField>
        {modo !== "apagada" && (
          <FormField label="Planes a los que aplica (ninguno marcado = todos)" tip={false}>
            <div className="flex flex-wrap gap-3">{plans.map((p) => <label key={p.value} className="flex items-center gap-2 text-sm"><Checkbox checked={planes.includes(p.value)} onCheckedChange={(x) => setPlanes(x ? [...planes, p.value] : planes.filter((y) => y !== p.value))} />{p.label}</label>)}</div>
          </FormField>
        )}
        {def.url && <a href={def.url} target="_blank" rel="noreferrer" className="w-fit text-sm text-link underline">Dónde obtener los datos</a>}
        {def.fields.filter((f) => f.type !== "model").map((f) => (
          <FormField key={f.k} label={f.l} htmlFor={`gi-${f.k}`} tip={f.help ?? false} required={f.required}>
            {f.type === "select" ? <Combobox id={`gi-${f.k}`} value={String(v(f.k, f.def))} onChange={(x) => setVals({ ...vals, [f.k]: x })} options={f.options ?? []} />
              : f.type === "boolean" ? <Switch id={`gi-${f.k}`} checked={v(f.k, f.def) === true || v(f.k, f.def) === "true"} onCheckedChange={(x) => setVals({ ...vals, [f.k]: x })} />
              : <Input id={`gi-${f.k}`} className="h-11" type={f.type === "secret" ? "password" : f.type === "number" ? "number" : "text"} autoComplete="off"
                  placeholder={f.type === "secret" ? (row.meta[f.k] ? `${row.meta[f.k]} (déjalo vacío para conservarla)` : "Pega aquí la clave") : f.placeholder ?? String(f.def ?? "")}
                  value={f.type === "secret" ? String(vals[f.k] ?? "") : String(v(f.k, f.def))} onChange={(e) => setVals({ ...vals, [f.k]: f.type === "number" ? +e.target.value : e.target.value })} />}
          </FormField>
        ))}
        {def.fields.some((f) => f.type === "model") && <FormField label="Modelo" htmlFor="gi-model" tip="Escribe el id del modelo (por ejemplo el recomendado en Ajustes › Integraciones de un hogar)."><Input id="gi-model" className="h-11" value={String(v("model", def.fields.find((f) => f.k === "model")?.def))} onChange={(e) => setVals({ ...vals, model: e.target.value })} /></FormField>}
        <p className="text-xs text-muted-foreground">Las claves se guardan cifradas y nunca llegan al navegador de nadie. Los hogares solo ven que Mirai incluye el servicio.</p>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={busy} onClick={save}>{busy && <Spinner />} Guardar</Button></div>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

export function IntegracionesPanel() {
  const { data, isPending } = useQuery({ queryKey: ["admin", "globals"], queryFn: () => adminGlobalIntegrations() })
  const [edit, setEdit] = useState<IntegrationDef | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const qc = useQueryClient()
  if (isPending) return <Skeleton className="h-96" />
  const tone: Record<string, Parameters<typeof StatusPill>[0]["tone"]> = { apagada: "gray", opcional: "info", por_defecto: "pagado", obligatoria: "porVencer" }
  return (
    <div className="grid gap-6">
      <Card className="gap-1 p-4 text-sm shadow-card ring-0"><p><b>Cómo funciona:</b> si configuras aquí un servicio (por ejemplo un correo o una IA que te salga barato), los hogares lo reciben según el modo: <b>opcional</b> (lo activan con un clic), <b>activo por defecto</b> (lo tienen sin hacer nada y pueden apagarlo o usar el suyo) u <b>obligatorio</b> (todos lo usan y no lo pueden cambiar). Puedes limitarlo a ciertos planes.</p></Card>
      {(Object.keys(CATS) as (keyof typeof CATS)[]).map((c) => (
        <section key={c} className="grid gap-3">
          <h2 className="flex items-center gap-2 font-semibold"><Icon name={CATS[c].icon} className="size-5 text-brand" />{CATS[c].n}</h2>
          <div className="grid gap-3 xl:grid-cols-2">
            {INTEGRATIONS.filter((i) => i.cat === c).map((def) => {
              const r = data!.find((x) => x.kind === def.kind)!
              const meta = r.meta as { lastOk?: boolean; lastMsg?: string }
              return (
                <Card key={def.kind} className="gap-3 p-4 shadow-card ring-0">
                  <div className="flex items-start gap-3">
                    {INTEGRATION_BRAND[def.kind] ? <BrandLogo k={INTEGRATION_BRAND[def.kind]} size={40} /> : <span className="grid size-10 place-items-center rounded-lg bg-muted"><Icon name={def.icon} className="size-5" /></span>}
                    <div className="grid min-w-0 flex-1 gap-1">
                      <p className="flex flex-wrap items-center gap-1.5 font-semibold">{def.n}<StatusPill tone={tone[r.modo]}>{MODES.find((m) => m.value === r.modo)?.label}</StatusPill>{r.env && <StatusPill tone="info">Variable del despliegue</StatusPill>}</p>
                      <p className="text-xs text-muted-foreground">{r.planes.length ? `Solo planes: ${r.planes.join(", ")}` : "Todos los planes"} · {r.hogaresPropios} {r.hogaresPropios === 1 ? "hogar" : "hogares"} con cuenta propia{r.hogaresApagada ? ` · ${r.hogaresApagada} la ${r.hogaresApagada === 1 ? "apagó" : "apagaron"}` : ""}</p>
                    </div>
                  </div>
                  {meta.lastMsg && <p className={cn("flex items-start gap-1.5 text-xs", meta.lastOk ? "text-success" : "text-danger")}>{meta.lastOk ? <CircleCheck className="size-3.5 shrink-0" /> : <CircleX className="size-3.5 shrink-0" />}{meta.lastMsg}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEdit(def)}>Configurar</Button>
                    {r.modo !== "apagada" && <Button size="sm" variant="soft" disabled={testing === def.kind} onClick={async () => { setTesting(def.kind); const t = await adminTestGlobal(def.kind); setTesting(null); toast[t.ok ? "success" : "error"](t.msg); qc.invalidateQueries({ queryKey: ["admin", "globals"] }) }}>{testing === def.kind ? <Spinner /> : <FlaskConical />} Probar</Button>}
                  </div>
                </Card>
              )
            })}
          </div>
        </section>
      ))}
      {edit && <GlobalDialog def={edit} row={data!.find((x) => x.kind === edit.kind)!} onClose={() => setEdit(null)} />}
    </div>
  )
}

// ── Comunicados ─────────────────────────────────────────────────────────────────────────────────────────────────

export function ComunicadosPanel() {
  const qc = useQueryClient()
  const { data: plans = [] } = usePlanOptions()
  const { data: hist, isPending } = useQuery({ queryKey: ["admin", "broadcasts"], queryFn: async () => (await createClient().from("broadcasts").select("*").order("created_at", { ascending: false }).limit(100)).data ?? [] })
  const [v, setV] = useState({ titulo: "", cuerpo: "", href: "", segmento: "todos", correo: false })
  const [busy, setBusy] = useState(false)
  const send = async () => {
    if (v.titulo.trim().length < 2) return toast.error("Escribe el título")
    if (!confirm(`¿Enviar "${v.titulo}" a ${v.segmento === "todos" ? "todas las personas" : v.segmento === "admins" ? "los administradores" : `el plan ${v.segmento.slice(5)}`}?`)) return
    setBusy(true)
    try { const r = await adminBroadcast(v); toast.success(`Enviado a ${r.personas} personas${r.correos ? ` (${r.correos} correos)` : ""}`); setV({ ...v, titulo: "", cuerpo: "", href: "" }); qc.invalidateQueries({ queryKey: ["admin", "broadcasts"] }) }
    catch (e) { toast.error("No se pudo enviar", { description: (e as Error).message }) }
    finally { setBusy(false) }
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="gap-4 p-5 shadow-card ring-0">
        <h2 className="font-semibold">Nuevo comunicado</h2>
        <FieldGroup>
          <FormField label="Para" tip={false}><Combobox value={v.segmento} onChange={(x) => setV({ ...v, segmento: x })} options={[{ value: "todos", label: "Todas las personas" }, ...plans.map((p) => ({ value: `plan:${p.value}`, label: `Plan ${p.label}` })), { value: "admins", label: "Solo administradores (prueba)" }]} /></FormField>
          <FormField label="Título" htmlFor="bc-t" required tip={false}><Input id="bc-t" className="h-11" maxLength={120} value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} placeholder="Ej. Nueva función: tus metas con fecha" /></FormField>
          <FormField label="Mensaje" htmlFor="bc-c" tip={false}><Textarea id="bc-c" rows={4} maxLength={1000} value={v.cuerpo} onChange={(e) => setV({ ...v, cuerpo: e.target.value })} /></FormField>
          <FormField label="Enlace dentro de Mirai (opcional)" htmlFor="bc-h" tip={false}><Input id="bc-h" className="h-11" value={v.href} onChange={(e) => setV({ ...v, href: e.target.value })} placeholder="/metas" /></FormField>
          <label className="flex items-center gap-3 text-sm"><Switch checked={v.correo} onCheckedChange={(x) => setV({ ...v, correo: x })} aria-label="También por correo" />También por correo (usa el correo global de la plataforma)</label>
          <Button className="w-fit" disabled={busy} onClick={send}>{busy ? <Spinner /> : <Send />} Enviar</Button>
        </FieldGroup>
      </Card>
      <Card className="gap-3 p-5 shadow-card ring-0">
        <h2 className="font-semibold">Enviados</h2>
        {isPending ? <Skeleton className="h-40" /> : !hist?.length ? <p className="text-sm text-muted-foreground">Aún no hay comunicados.</p> : <ul className="grid gap-2">{hist.map((b) => <li key={b.id} className="rounded-lg bg-secondary/40 p-3 text-sm"><p className="font-medium">{b.titulo}</p><p className="text-xs text-muted-foreground">{b.segmento} · {b.enviados} personas · {rel(b.created_at)}</p></li>)}</ul>}
      </Card>
    </div>
  )
}

// ── Administradores ─────────────────────────────────────────────────────────────────────────────────────────────

export function AdminsPanel() {
  const qc = useQueryClient()
  const { user } = useApp()
  const { data, isPending } = useQuery({ queryKey: ["admin", "admins"], queryFn: () => adminAdmins() })
  const [email, setEmail] = useState("")
  return (
    <Card className="gap-4 p-5 shadow-card ring-0">
      <div className="flex flex-wrap gap-2">
        <Input className="h-10 min-w-56 flex-1" type="email" placeholder="Correo de la persona (debe tener cuenta en Mirai)" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Correo del nuevo administrador" />
        <Button disabled={!email.includes("@")} onClick={async () => { try { await adminAddAdminByEmail(email); toast.success("Administrador agregado"); setEmail(""); qc.invalidateQueries({ queryKey: ["admin", "admins"] }) } catch (e) { toast.error((e as Error).message) } }}><Plus /> Agregar</Button>
      </div>
      {isPending ? <Skeleton className="h-32" /> : <ul className="grid gap-2">{data!.map((a) => (
        <li key={a.user_id} className="flex items-center gap-3 rounded-lg bg-secondary/40 p-3">
          <UserAvatar src={a.perfil?.avatar_url ?? null} name={a.perfil?.nombre || a.perfil?.email || "?"} className="size-9" />
          <div className="grid min-w-0 flex-1"><Link href={`/admin/usuarios/${a.user_id}`} className="truncate font-medium text-link hover:underline">{a.perfil?.nombre || "Sin nombre"}{a.user_id === user.id ? " (tú)" : ""}</Link><span className="truncate text-xs text-muted-foreground">{a.perfil?.email} · desde {fmtDate(a.created_at.slice(0, 10), { year: true })}</span></div>
          {a.user_id !== user.id && <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { if (!confirm("¿Quitarle la administración?")) return; try { await adminSetPlatformAdmin(a.user_id, false); toast("Administración retirada"); qc.invalidateQueries({ queryKey: ["admin", "admins"] }) } catch (e) { toast.error((e as Error).message) } }}>Quitar</Button>}
        </li>
      ))}</ul>}
      <p className="text-xs text-muted-foreground">Los administradores ven la consola completa: clientes, pagos e integraciones. Dalo solo a personas de confianza.</p>
    </Card>
  )
}

// ── Auditoría ───────────────────────────────────────────────────────────────────────────────────────────────────

export function AuditPanel() {
  const { data, isPending } = useQuery({ queryKey: ["admin", "audit"], queryFn: () => adminAuditLog() })
  type A = NonNullable<typeof data>[number]
  return (
    <DataTable<A>
      title="Auditoría" info="Todo lo que hacen los administradores en la consola (últimos 500 registros)." data={data} loading={isPending} rowKey={(a) => String(a.id)}
      search={{ placeholder: "Buscar acción, persona o detalle", text: (a) => `${a.accion} ${a.quien} ${a.objetivo ?? ""} ${JSON.stringify(a.detalle ?? {})}` }}
      filters={[{ id: "acc", label: "Acción", options: [...new Set((data ?? []).map((a) => a.accion))].map((x) => ({ value: x, label: x })), match: (a, v) => a.accion === v }, { id: "quien", label: "Quién", options: [...new Set((data ?? []).map((a) => a.quien))].map((x) => ({ value: x, label: x })), match: (a, v) => a.quien === v }]}
      exportName="mirai-auditoria" initialSort={{ id: "cuando", dir: "desc" }}
      columns={[
        { id: "cuando", header: "Cuándo", sort: (a) => a.created_at, csv: (a) => a.created_at, cell: (a) => <DTTwoLine top={fmtDate(a.created_at.slice(0, 10), { year: true })} bottom={rel(a.created_at)} /> },
        { id: "quien", header: "Quién", sort: (a) => a.quien, csv: (a) => a.quien, cell: (a) => a.quien },
        { id: "accion", header: "Acción", sort: (a) => a.accion, csv: (a) => a.accion, cell: (a) => <span className="font-medium">{a.accion}</span> },
        { id: "detalle", header: "Detalle", csv: (a) => `${a.objetivo ?? ""} ${JSON.stringify(a.detalle ?? {})}`, cell: (a) => <span className="line-clamp-2 max-w-md font-mono text-xs text-muted-foreground">{a.objetivo ? `${a.objetivo} ` : ""}{Object.keys(a.detalle ?? {}).length ? JSON.stringify(a.detalle) : ""}</span> },
      ]}
    />
  )
}

// ── Sistema ─────────────────────────────────────────────────────────────────────────────────────────────────────

export function SistemaPanel() {
  const qc = useQueryClient()
  const { data: plans = [] } = usePlanOptions()
  const { data, isPending } = useQuery({ queryKey: ["admin", "system"], queryFn: () => adminSystem() })
  const [aviso, setAviso] = useState<string | null>(null)
  const [tono, setTono] = useState<string | null>(null)
  if (isPending || !data) return <Skeleton className="h-96" />
  const s = data.settings!
  const save = async (p: Parameters<typeof adminSaveSettings>[0], ok: string) => { try { await adminSaveSettings(p); toast.success(ok); qc.invalidateQueries({ queryKey: ["admin", "system"] }); qc.invalidateQueries({ queryKey: ["platform-settings"] }) } catch (e) { toast.error((e as Error).message) } }
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="gap-4 p-5 shadow-card ring-0">
        <h2 className="font-semibold">Aviso para todos</h2>
        <p className="text-sm text-muted-foreground">Un mensaje arriba de todas las pantallas de Mirai (por ejemplo, mantenimiento programado). Déjalo vacío para quitarlo.</p>
        <Textarea rows={2} maxLength={300} value={aviso ?? s.aviso_global} onChange={(e) => setAviso(e.target.value)} aria-label="Aviso para todos" />
        <Segmented value={tono ?? s.aviso_tono} onChange={setTono} items={[{ value: "info", label: "Información" }, { value: "warn", label: "Advertencia" }, { value: "ok", label: "Buena noticia" }]} />
        <Button className="w-fit" onClick={() => save({ aviso_global: aviso ?? s.aviso_global, aviso_tono: (tono ?? s.aviso_tono) as "info" }, "Aviso guardado")}>Guardar aviso</Button>
      </Card>
      <Card className="gap-4 p-5 shadow-card ring-0">
        <h2 className="font-semibold">Acceso y límites</h2>
        <label className="flex items-start justify-between gap-4 text-sm"><span><b>Registro abierto</b><span className="block text-muted-foreground">Si lo apagas, nadie nuevo puede crear cuenta (las cuentas existentes siguen entrando).</span></span><Switch checked={s.registro_abierto} onCheckedChange={(x) => save({ registro_abierto: x }, x ? "Registro abierto" : "Registro cerrado")} aria-label="Registro abierto" /></label>
        <label className="flex items-start justify-between gap-4 text-sm"><span><b>Límites de los planes también en la base de datos</b><span className="block text-muted-foreground">La app ya respeta los límites. Esto los hace cumplir aunque alguien use la API directamente. Enciéndelo al publicar los planes en producción.</span></span><Switch checked={s.limites_db} onCheckedChange={(x) => save({ limites_db: x }, x ? "Límites activos en la base" : "Límites de la base apagados")} aria-label="Límites en la base de datos" /></label>
      </Card>
      <Card className="gap-4 p-5 shadow-card ring-0">
        <div><h2 className="font-semibold">Programa de referidos</h2><p className="text-sm text-muted-foreground">{data.referidos} personas llegaron invitadas · {data.premiados} invitaciones premiadas. Quien invita y quien llega reciben días del plan elegido (máximo 12 premios por persona).</p></div>
        <label className="flex items-center justify-between gap-4 text-sm"><b>Programa activo</b><Switch checked={s.referidos_activo} onCheckedChange={(x) => save({ referidos_activo: x }, x ? "Referidos activos" : "Referidos en pausa")} aria-label="Programa de referidos activo" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Plan que se regala" tip={false}><Combobox value={s.referidos_plan} onChange={(x) => save({ referidos_plan: x }, "Plan del premio guardado")} options={plans.filter((p) => p.value !== "gratis")} /></FormField>
          <FormField label="Días de premio" htmlFor="rf-d" tip={false}><Input id="rf-d" type="number" min={1} max={365} className="h-11" defaultValue={s.referidos_dias} onBlur={(e) => { const n = +e.target.value; if (n >= 1 && n <= 365 && n !== s.referidos_dias) save({ referidos_dias: n }, "Días del premio guardados") }} /></FormField>
        </div>
      </Card>
      <Card className="gap-3 p-5 shadow-card ring-0">
        <h2 className="font-semibold">Estado de la configuración</h2>
        <p className="text-xs text-muted-foreground">Ambiente: {data.ambiente} · rama {data.rama}{data.commit ? ` · ${data.commit}` : ""}</p>
        <ul className="grid gap-1.5 text-sm">{data.estado.map((e) => <li key={e.k} className="flex items-center justify-between gap-2"><span>{e.k}</span>{e.ok ? <StatusPill tone="pagado">Configurado</StatusPill> : <StatusPill tone="gray">Pendiente</StatusPill>}</li>)}</ul>
        <p className="text-xs text-muted-foreground">Las variables se configuran en Vercel › Environment Variables (guía en docs/DEPLOY-VERCEL.md).</p>
      </Card>
      <Card className="gap-3 p-5 shadow-card ring-0">
        <h2 className="font-semibold">Mantenimiento</h2>
        <div className="flex flex-wrap items-center gap-3"><StatusPill tone={data.huerfanos ? "porVencer" : "pagado"}>{data.huerfanos} hogares sin integrantes</StatusPill><Button variant="outline" className="text-danger" disabled={!data.huerfanos} onClick={async () => { if (!confirm(`¿Borrar ${data.huerfanos} hogares sin integrantes y todos sus datos? No se puede deshacer.`)) return; try { const n = await adminCleanOrphanHouseholds(); toast.success(`${n} hogares borrados`); qc.invalidateQueries({ queryKey: ["admin"] }) } catch (e) { toast.error((e as Error).message) } }}><Trash2 /> Borrar hogares vacíos</Button></div>
        <h3 className="pt-2 text-sm font-semibold">Migraciones aplicadas ({data.migraciones.length})</h3>
        <ul className="max-h-48 overflow-y-auto font-mono text-xs text-muted-foreground">{data.migraciones.map((m) => <li key={m.name}>{m.name}</li>)}</ul>
      </Card>
    </div>
  )
}
