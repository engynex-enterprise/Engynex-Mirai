"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CircleCheck, CircleX, FlaskConical, MessageCircle, Pencil, Plus, Send, Trash2 } from "lucide-react"
import { toast } from "@/components/mirai/toast"
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
import { DataTable, DTPrimary, DTTwoLine } from "@/components/mirai/data-table"
import { ChoiceCards, Segmented } from "@/components/mirai/choice-cards"
import { Combobox } from "@/components/mirai/combobox"
import { FormField } from "@/components/mirai/field"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { ListToolbar, NoResults, useListControls, type ListFilter } from "@/components/mirai/list-toolbar"
import { MoneyInput } from "@/components/mirai/money-input"
import { Notice } from "@/components/mirai/notice"
import { Panel, SectionTitle } from "@/components/mirai/panel"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill, type PillTone } from "@/components/mirai/status-pill"
import { SubmitButton } from "@/components/mirai/submit-button"
import { IconButton, Tip } from "@/components/mirai/tip"
import { ToneIcon, toneFor, type IconTone } from "@/components/mirai/tone-icon"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { useApp } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { CATS, INTEGRATIONS, type IntegrationDef } from "@/lib/integrations/registry"
import { ADMIN_MODES, MODES, type GlobalMode } from "@/lib/integrations/resolve"
import { integrationBrand } from "@/lib/brands"
import { FEATURES, FEATURE_LIST, ahorroAnual, precio } from "@/lib/plans"
import { fmtDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { usePlanOptions } from "./console-negocio"
import { adminAddAdminByEmail, adminAdmins, adminAuditLog, adminBroadcast, adminCleanOrphanHouseholds, adminGlobalIntegrations, adminNotifyLog, adminSaveGlobalIntegration, adminSaveSettings, adminSendTest, adminSetPlatformAdmin, adminSystem, adminTestDefaults, adminTestGlobal } from "./server"
import { EMAIL_KINDS } from "@/lib/notify/email-kinds"
import { CheckGroup, Empty, fday, nf, plural, rel, ToggleRow, useAsk, useDialogTarget } from "./ui"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Planes ──────────────────────────────────────────────────────────────────────────────────────────────────────

type Plan = { id: string; nombre: string; descripcion: string; precio_mes: number; precio_anio: number; funciones: string[]; anuncios: boolean; limites: { libros?: number; personas?: number }; activo: boolean; publico: boolean; destacado: boolean; orden: number }
const NEW_PLAN: Plan = { id: "", nombre: "", descripcion: "", precio_mes: 9900, precio_anio: 99000, funciones: [], anuncios: false, limites: {}, activo: true, publico: true, destacado: false, orden: 3 }
const slug = (x: string) => x.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30)

function PlanDialog({ p, isNew, open, onOpenChange }: { p: Plan; isNew: boolean; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const [v, setV] = useState(p)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Plan>(k: K, x: Plan[K]) => setV({ ...v, [k]: x })
  const gratis = v.id === "gratis"
  const id = isNew ? slug(v.nombre) : v.id
  const nombreOk = v.nombre.trim().length >= 2 && id.length >= 2
  const precioOk = gratis || v.precio_mes >= 1000
  const save = async () => {
    setBusy(true)
    const row = { ...v, id, nombre: v.nombre.trim(), descripcion: v.descripcion.trim(), precio_mes: gratis ? 0 : v.precio_mes, precio_anio: gratis ? 0 : v.precio_anio, limites: Object.fromEntries(Object.entries(v.limites).filter(([, x]) => x)) }
    const sb = createClient()
    const { error } = isNew ? await sb.from("plans").insert(row) : await sb.from("plans").update(row).eq("id", p.id)
    setBusy(false)
    if (error) return toast.error("No se pudo guardar", { description: error.code === "23505" ? "Ya existe un plan con ese nombre." : error.message })
    toast.success("Plan guardado"); qc.invalidateQueries({ queryKey: ["admin"] }); qc.invalidateQueries({ queryKey: ["plans"] }); onOpenChange(false)
  }
  const ahorro = ahorroAnual(v.precio_mes, v.precio_anio)
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={isNew ? "Nuevo plan" : `Plan ${p.nombre}`} description="Lo que incluye, cuánto cuesta y dónde se muestra. Los cambios de precio aplican a los pagos nuevos." wide
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!nombreOk || !precioOk} loading={busy} hint={!nombreOk ? "Escribe el nombre del plan" : "El precio mensual debe ser de al menos $1.000"} onClick={save}>Guardar plan</SubmitButton></>}>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nombre" htmlFor="pl-n" required tip={false} hint={isNew && id ? `Identificador: ${id}` : undefined}><Input id="pl-n" className="h-11" maxLength={30} value={v.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Familia" /></FormField>
          <FormField label="Descripción corta" htmlFor="pl-d" tip={false}><Input id="pl-d" className="h-11" maxLength={120} value={v.descripcion} onChange={(e) => set("descripcion", e.target.value)} placeholder="Ej. Para toda la familia" /></FormField>
        </div>
        {!gratis && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Precio mensual (COP)" htmlFor="pl-m" required tip={false} error={!precioOk ? "Debe ser de al menos $1.000" : undefined}><MoneyInput id="pl-m" value={v.precio_mes} onChange={(n) => set("precio_mes", n ?? 0)} /></FormField>
            <FormField label="Precio anual (COP)" htmlFor="pl-a" tip={false} hint={ahorro.pesos > 0 ? `Ahorro de ${precio(ahorro.pesos)} (${ahorro.meses} meses gratis)` : "Sin ahorro frente a 12 meses"}><MoneyInput id="pl-a" value={v.precio_anio} onChange={(n) => set("precio_anio", n ?? 0)} /></FormField>
          </div>
        )}
        <FormField label="Funciones incluidas" tip={false}>
          <div className="grid gap-2 sm:grid-cols-2">{FEATURE_LIST.map((f) => (
            <label key={f} className="flex cursor-pointer items-start gap-2 rounded-lg bg-secondary/60 p-3 text-sm has-[[data-state=checked]]:bg-brand-soft">
              <Checkbox checked={v.funciones.includes(f)} onCheckedChange={(x) => set("funciones", x ? [...v.funciones, f] : v.funciones.filter((y) => y !== f))} aria-label={FEATURES[f].label} />
              <span><b>{FEATURES[f].label}</b><span className="block text-muted-foreground">{FEATURES[f].beneficios.slice(0, 2).join(" · ")}</span></span>
            </label>
          ))}</div>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Libros por hogar" htmlFor="pl-l" tip={false} hint="Vacío = ilimitado"><Input id="pl-l" type="number" min={1} className="h-11" value={v.limites.libros ?? ""} onChange={(e) => set("limites", { ...v.limites, libros: e.target.value ? +e.target.value : undefined })} /></FormField>
          <FormField label="Personas por hogar" htmlFor="pl-p" tip={false} hint="Vacío = ilimitado"><Input id="pl-p" type="number" min={1} className="h-11" value={v.limites.personas ?? ""} onChange={(e) => set("limites", { ...v.limites, personas: e.target.value ? +e.target.value : undefined })} /></FormField>
          <FormField label="Orden en Planes" htmlFor="pl-o" tip={false} hint="Menor = sale primero"><Input id="pl-o" type="number" className="h-11" value={v.orden} onChange={(e) => set("orden", +e.target.value || 0)} /></FormField>
        </div>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <ToggleRow title="Muestra anuncios" checked={v.anuncios} onChange={(x) => set("anuncios", x)} />
          <ToggleRow title="Visible en la página de Planes" checked={v.publico} onChange={(x) => set("publico", x)} />
          <ToggleRow title="Se puede comprar" checked={v.activo} disabled={gratis} onChange={(x) => set("activo", x)} />
          <ToggleRow title="Destacado (recomendado)" checked={v.destacado} onChange={(x) => set("destacado", x)} />
        </div>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

export function PlanesPanel() {
  const qc = useQueryClient()
  const ask = useAsk()
  const { data, isPending } = useQuery({ queryKey: ["admin", "plans-full"], queryFn: async () => ((await createClient().from("plans").select("*").order("orden").order("precio_mes")).data ?? []) as unknown as Plan[] })
  const edit = useDialogTarget<{ p: Plan; isNew: boolean }>()
  const borrar = async (p: Plan) => {
    if (!(await ask.confirm({ title: `¿Borrar el plan ${p.nombre}?`, description: "Si hay hogares con este plan, mejor ocúltalo y deja de venderlo.", confirmLabel: "Borrar", destructive: true }))) return
    const { error } = await createClient().from("plans").delete().eq("id", p.id)
    if (error) toast.error("No se pudo borrar", { description: error.code === "23503" ? "Hay suscripciones o pagos con este plan: ocúltalo y deja de venderlo." : error.message })
    else { toast("Plan borrado"); qc.invalidateQueries({ queryKey: ["admin"] }) }
  }
  return (
    <div className="grid gap-6">
      <SectionTitle icon="crown" description="Lo que ve la gente en Planes. Gratis y Premium son fijos: se pueden editar pero no borrar."
        action={<Button onClick={() => edit.show({ p: { ...NEW_PLAN }, isNew: true })}><Plus /> Nuevo plan</Button>}>
        {isPending ? "Planes" : plural(data?.length ?? 0, "plan", "planes")}
      </SectionTitle>
      {isPending ? <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 rounded-lg" />)}</div> : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{data!.map((p) => (
          <Card key={p.id} className={cn("h-full gap-3 p-5 shadow-card", p.destacado ? "ring-2 ring-amber-400" : "ring-0")}>
            <div className="flex items-start gap-3">
              <ToneIcon icon={p.precio_mes ? "crown" : "sprout"} tone={p.precio_mes ? (p.destacado ? "amber" : "violet") : "green"} />
              <div className="grid min-w-0 flex-1"><h2 className="truncate text-lg font-semibold">{p.nombre}</h2><p className="text-xs text-muted-foreground">id: {p.id}</p></div>
              <div className="flex flex-wrap justify-end gap-1">
                {!p.activo && <Tip label="No aparece el botón de pagar"><span className="inline-flex"><StatusPill tone="gray">No se vende</StatusPill></span></Tip>}
                {!p.publico && <Tip label="No sale en la página de Planes"><span className="inline-flex"><StatusPill tone="gray">Oculto</StatusPill></span></Tip>}
                {p.destacado && <StatusPill tone="porVencer">Destacado</StatusPill>}
              </div>
            </div>
            <p className="text-2xl font-bold tabular-nums">{p.precio_mes ? precio(p.precio_mes) : "$0"} <span className="text-sm font-normal text-muted-foreground">{p.precio_mes ? `al mes · ${precio(p.precio_anio)} al año` : "para siempre"}</span></p>
            {p.descripcion && <p className="text-sm text-muted-foreground">{p.descripcion}</p>}
            <div className="flex flex-wrap gap-1">{p.funciones.length ? p.funciones.map((f) => <StatusPill key={f} tone="pagado">{FEATURES[f as keyof typeof FEATURES]?.label ?? f}</StatusPill>) : <StatusPill tone="gray">Solo lo básico</StatusPill>}{p.anuncios && <StatusPill tone="gray">Con anuncios</StatusPill>}</div>
            <p className="text-xs text-muted-foreground">{p.limites.libros ? `${p.limites.libros} libro(s)` : "Libros ilimitados"} · {p.limites.personas ? `${p.limites.personas} personas` : "personas ilimitadas"}</p>
            <div className="mt-auto flex gap-2 border-t pt-3">
              <Button size="sm" variant="outline" onClick={() => edit.show({ p, isNew: false })}><Pencil /> Editar</Button>
              {!["gratis", "premium"].includes(p.id) && <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => borrar(p)}><Trash2 /> Borrar</Button>}
            </div>
          </Card>
        ))}</div>
      )}
      {edit.value && <PlanDialog key={edit.key} p={edit.value.p} isNew={edit.value.isNew} open={edit.open} onOpenChange={edit.onOpenChange} />}
      {ask.node}
    </div>
  )
}

// ── Integraciones globales ──────────────────────────────────────────────────────────────────────────────────────

type GlobalRow = Awaited<ReturnType<typeof adminGlobalIntegrations>>[number]
const MODE_TONE: Record<string, PillTone> = { apagada: "gray", opcional: "info", por_defecto: "pagado", obligatoria: "porVencer" }

function GlobalDialog({ def, row, open, onOpenChange }: { def: IntegrationDef; row: GlobalRow; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const { data: plans = [] } = usePlanOptions()
  // La IA conserva los 4 modos (el hogar puede usar la suya); el resto solo se apaga o se activa.
  const modes = row.adminOnly ? ADMIN_MODES : MODES
  const [modo, setModo] = useState<GlobalMode>(row.adminOnly && row.modo !== "apagada" ? "obligatoria" : row.modo as GlobalMode)
  const [planes, setPlanes] = useState<string[]>(row.planes)
  const [vals, setVals] = useState<Record<string, string | number | boolean>>({})
  const [busy, setBusy] = useState(false)
  const v = (k: string, d?: unknown) => (k in vals ? vals[k] : (row.config[k] as string | undefined) ?? d ?? "")
  // Datos obligatorios que faltan (si la integración queda encendida y no viene de una variable del despliegue).
  const faltan = modo === "apagada" || row.env ? [] : def.fields.filter((f) => f.required && f.type !== "model" && (f.type === "secret"
    ? !String(vals[f.k] ?? "").trim() && !row.meta[f.k] && !row.guardada
    : !String(v(f.k, f.def)).trim())).map((f) => f.l)
  const save = async () => {
    setBusy(true)
    try {
      const r = await adminSaveGlobalIntegration(def.kind, { modo, planes, values: vals }); if (!r.ok) return void toast.error(r.msg)
      if (r.warn) toast.warning("Integración global guardada", { description: r.warn }); else toast.success("Integración global guardada")
      qc.invalidateQueries({ queryKey: ["admin", "globals"] }); onOpenChange(false)
    }
    catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }) }
    finally { setBusy(false) }
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={`${def.n} para toda la plataforma`} wide
      description={row.adminOnly ? "Configura la cuenta de Mirai. Los hogares no ven ni cambian esta integración: solo eligen en Ajustes › Alertas si reciben avisos por este medio." : "Configura la cuenta de Mirai y decide cómo la reciben los hogares."}
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={faltan.length > 0} loading={busy} hint={`Falta: ${faltan.join(", ")}`} onClick={save}>Guardar</SubmitButton></>}>
      <FieldGroup>
        <FormField label={row.adminOnly ? "¿Mirai la usa?" : "¿Cómo la reciben los hogares?"} tip={false}>
          <ChoiceCards value={modo} onChange={(x) => setModo(x as GlobalMode)} items={modes.map((m) => ({ value: m.value, label: m.label, desc: m.desc }))} />
        </FormField>
        {modo !== "apagada" && (
          <FormField label="Planes a los que aplica (ninguno marcado = todos)" tip={false}>
            <CheckGroup options={plans} value={planes} onChange={setPlanes} />
          </FormField>
        )}
        {def.url && <a href={def.url} target="_blank" rel="noreferrer" className="w-fit text-sm font-medium text-link underline">Dónde obtener los datos</a>}
        {def.fields.filter((f) => f.type !== "model").map((f) => (
          <FormField key={f.k} label={f.l} htmlFor={`gi-${f.k}`} tip={f.help ?? false} required={f.required}>
            {f.type === "select" ? <Combobox id={`gi-${f.k}`} value={String(v(f.k, f.def))} onChange={(x) => setVals({ ...vals, [f.k]: x })} options={f.options ?? []} />
              : f.type === "boolean" ? <Switch id={`gi-${f.k}`} checked={v(f.k, f.def) === true || v(f.k, f.def) === "true"} onCheckedChange={(x) => setVals({ ...vals, [f.k]: x })} />
              : <Input id={`gi-${f.k}`} className="h-11" type={f.type === "secret" ? "password" : f.type === "number" ? "number" : "text"} autoComplete="off"
                  placeholder={f.type === "secret" ? (row.meta[f.k] ? `${row.meta[f.k]} (déjalo vacío para conservarla)` : "Pega aquí la clave") : f.placeholder ?? String(f.def ?? "")}
                  value={f.type === "secret" ? String(vals[f.k] ?? "") : String(v(f.k, f.def))} onChange={(e) => setVals({ ...vals, [f.k]: f.type === "number" ? +e.target.value : e.target.value })} />}
          </FormField>
        ))}
        {def.fields.some((f) => f.type === "model") && <FormField label="Modelo" htmlFor="gi-model" tip="Escribe el id del modelo (por ejemplo el recomendado en Ajustes › Inteligencia artificial de un hogar)."><Input id="gi-model" className="h-11" value={String(v("model", def.fields.find((f) => f.k === "model")?.def))} onChange={(e) => setVals({ ...vals, model: e.target.value })} /></FormField>}
        <p className="text-xs text-muted-foreground">Las claves se guardan cifradas y nunca llegan al navegador de nadie.{row.adminOnly ? "" : " Los hogares solo ven que Mirai incluye el servicio."}</p>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

/** "Enviar prueba" (correo y WhatsApp): un mensaje real al destino que escribas, con la configuración guardada. */
function SendTestDialog({ def, open, onOpenChange }: { def: IntegrationDef; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const wa = def.kind === "whatsapp"
  const { data: defs } = useQuery({ queryKey: ["admin", "test-defaults"], queryFn: () => adminTestDefaults() })
  const [to, setTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const val = to ?? (wa ? defs?.whatsapp : defs?.email) ?? ""
  const valid = wa ? val.replace(/\D/g, "").length >= 10 : EMAIL_RE.test(val.trim())
  const send = async () => {
    setBusy(true)
    const r = await adminSendTest(def.kind, val).catch((e) => ({ ok: false, msg: (e as Error).message }))
    setBusy(false)
    toast[r.ok ? "success" : "error"](r.ok ? "Prueba enviada" : "No se pudo enviar", { description: r.msg, duration: 12000 })
    qc.invalidateQueries({ queryKey: ["admin", "envios"] })
    if (r.ok) onOpenChange(false)
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={`Enviar prueba · ${def.n}`} description={wa ? "Envía la plantilla del caso “Mensaje de prueba” (consola › WhatsApp) con datos de prueba a un celular. Meta cobra el mensaje." : "Envía un correo de prueba con la plantilla de Mirai."}
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!valid} loading={busy} loadingText="Enviando…" hint={wa ? "Escribe un celular de 10 dígitos" : "Escribe un correo válido"} onClick={send}><Send /> Enviar prueba</SubmitButton></>}>
      <FieldGroup>
        <FormField label={wa ? "Celular (Colombia)" : "Correo"} htmlFor="st-to" required tip={false} hint="Funciona aunque la integración esté apagada, para que la pruebes antes de activarla. El resultado queda en Registro de envíos.">
          <Input id="st-to" className="h-11" type={wa ? "tel" : "email"} inputMode={wa ? "numeric" : "email"} placeholder={wa ? "315 123 4567" : "tu@correo.com"} value={val} onChange={(e) => setTo(e.target.value)} />
        </FormField>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

type IntItem = { def: IntegrationDef; r: GlobalRow; estado: "activa" | "apagada" | "sin" ; label: string; tone: PillTone; libre: boolean; keyless: boolean }
const INT_FILTERS: ListFilter<IntItem>[] = [
  { value: "todas", label: "Todas", icon: "list" },
  { value: "activa", label: "Activas", icon: "circle-check", match: (x) => x.estado === "activa" },
  { value: "apagada", label: "Apagadas", icon: "circle-dashed", match: (x) => x.estado === "apagada" },
  { value: "sin", label: "Sin configurar", icon: "circle-alert", match: (x) => x.estado === "sin" },
]

function intItem(def: IntegrationDef, r: GlobalRow): IntItem {
  const keyless = !def.fields.some((f) => f.required)
  // Solo admin: activa · apagada (fila guardada) · sin fila: disponible (sin claves o variable de entorno) o sin configurar.
  const libre = !r.existe && (keyless || r.env)
  const label = r.adminOnly ? (r.modo !== "apagada" ? "Activa" : r.existe ? "Apagada" : libre ? "Disponible" : "Sin configurar") : MODES.find((m) => m.value === r.modo)?.label ?? r.modo
  const estado = r.modo !== "apagada" || libre ? "activa" : r.existe || r.guardada ? "apagada" : "sin"
  const tone: PillTone = r.adminOnly ? (r.modo !== "apagada" || libre ? "pagado" : "gray") : MODE_TONE[r.modo] ?? "gray"
  return { def, r, estado, label, tone, libre, keyless }
}

export function IntegracionesPanel() {
  const { data, isPending } = useQuery({ queryKey: ["admin", "globals"], queryFn: () => adminGlobalIntegrations() })
  const edit = useDialogTarget<IntegrationDef>()
  const sendTo = useDialogTarget<IntegrationDef>()
  const [testing, setTesting] = useState<string | null>(null)
  const qc = useQueryClient()
  const items = (data ? INTEGRATIONS.map((def) => intItem(def, data.find((x) => x.kind === def.kind)!)) : undefined)
  const c = useListControls(items, { text: (x) => `${x.def.n} ${CATS[x.def.cat].n} ${x.label}`, filters: INT_FILTERS })
  if (isPending || !data) return <div className="grid gap-6"><Skeleton className="h-24 rounded-lg" /><div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-lg" />)}</div></div>
  const probar = async (def: IntegrationDef) => {
    setTesting(def.kind)
    const t = await adminTestGlobal(def.kind)
    setTesting(null)
    toast[t.ok ? "success" : "error"](t.ok ? "Prueba exitosa" : "La prueba falló", { description: t.msg, duration: 12000 })
    qc.invalidateQueries({ queryKey: ["admin", "globals"] })
  }
  const editRow = edit.value ? data.find((x) => x.kind === edit.value!.kind) : undefined
  return (
    <div className="grid gap-6">
      <Notice tone="info" title="Cómo funciona">
        <p>Los hogares solo configuran la <b>inteligencia artificial</b> (pueden usar su propia clave). Para la IA decides cómo reciben la de Mirai: <b>opcional</b>, <b>activa por defecto</b> u <b>obligatoria</b>.</p>
        <p className="mt-1">Todo lo demás (correo, WhatsApp, Telegram, push, datos, Google e infraestructura) <b>solo lo configuras tú</b>: si está <b>activa</b>, Mirai la usa para los planes elegidos. Cada persona decide en Ajustes › Alertas si recibe avisos por correo, WhatsApp, Telegram o push.</p>
      </Notice>
      <ListToolbar c={c} placeholder="Buscar integración" filters={INT_FILTERS} />
      {!c.rows.length && <NoResults c={c}>No hay integraciones con esa búsqueda o ese filtro.</NoResults>}
      {(Object.keys(CATS) as (keyof typeof CATS)[]).map((cat) => {
        const list = c.rows.filter((x) => x.def.cat === cat)
        if (!list.length) return null
        return (
          <section key={cat} className="grid gap-3" aria-label={CATS[cat].n}>
            <SectionTitle icon={CATS[cat].icon} description={CATS[cat].d}>{CATS[cat].n}</SectionTitle>
            <div className="grid gap-4 lg:grid-cols-2">
              {list.map(({ def, r, label, tone, keyless }) => {
                const meta = r.meta as { lastOk?: boolean; lastMsg?: string }
                const canSend = r.guardada && (EMAIL_KINDS.includes(def.kind) || def.kind === "whatsapp")
                const brand = integrationBrand(def.kind, r.config)
                return (
                  <Card key={def.kind} className="h-full gap-3 p-5 shadow-card ring-0">
                    <div className="flex items-start gap-3">
                      {brand ? <BrandLogo k={brand} size={40} /> : <ToneIcon icon={def.icon} tone={toneFor(def.kind)} />}
                      <div className="grid min-w-0 flex-1 gap-1">
                        <p className="flex flex-wrap items-center gap-1.5 font-semibold">{def.n}
                          <Tip label={r.adminOnly ? "Si está activa, Mirai la usa para los planes elegidos" : MODES.find((m) => m.value === r.modo)?.desc}><span className="inline-flex"><StatusPill tone={tone}>{label}</StatusPill></span></Tip>
                          {r.env && <Tip label="Los datos vienen de una variable de entorno de Vercel"><span className="inline-flex"><StatusPill tone="info">Variable del despliegue</StatusPill></span></Tip>}
                          {r.adminOnly && r.guardada && <StatusPill tone="gray">Datos guardados</StatusPill>}
                        </p>
                        <p className="text-xs text-muted-foreground">{r.planes.length ? `Solo planes: ${r.planes.join(", ")}` : "Todos los planes"}{r.adminOnly ? "" : ` · ${r.hogaresPropios} ${r.hogaresPropios === 1 ? "hogar" : "hogares"} con cuenta propia${r.hogaresApagada ? ` · ${r.hogaresApagada} la ${r.hogaresApagada === 1 ? "apagó" : "apagaron"}` : ""}`}</p>
                      </div>
                    </div>
                    {meta.lastMsg && <p className={cn("flex items-start gap-1.5 text-xs", meta.lastOk ? "text-success" : "text-danger")}>{meta.lastOk ? <CircleCheck className="size-3.5 shrink-0" /> : <CircleX className="size-3.5 shrink-0" />}<span className="min-w-0 break-words">Última prueba: {meta.lastMsg}</span></p>}
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => edit.show(def)}>Configurar</Button>
                      {(r.modo !== "apagada" || r.guardada || (r.adminOnly && keyless)) && <Button size="sm" variant="soft" disabled={testing === def.kind} onClick={() => probar(def)}>{testing === def.kind ? <Spinner /> : <FlaskConical />} Probar</Button>}
                      {canSend && <Button size="sm" variant="soft" onClick={() => sendTo.show(def)}><Send /> Enviar prueba</Button>}
                      {def.kind === "whatsapp" && <Button size="sm" variant="soft" asChild><Link href="/admin/whatsapp"><MessageCircle /> Plantillas y casos</Link></Button>}
                    </div>
                  </Card>
                )
              })}
            </div>
          </section>
        )
      })}
      {edit.value && editRow && <GlobalDialog key={edit.key} def={edit.value} row={editRow} open={edit.open} onOpenChange={edit.onOpenChange} />}
      {sendTo.value && <SendTestDialog key={sendTo.key} def={sendTo.value} open={sendTo.open} onOpenChange={sendTo.onOpenChange} />}
    </div>
  )
}

// ── Registro de envíos ──────────────────────────────────────────────────────────────────────────────────────────

const CANAL: Record<string, { n: string; icon: string; tone: IconTone }> = {
  email: { n: "Correo", icon: "mail", tone: "blue" }, whatsapp: { n: "WhatsApp", icon: "message-circle", tone: "green" },
  telegram: { n: "Telegram", icon: "send", tone: "violet" }, push: { n: "Push", icon: "bell-ring", tone: "amber" },
}
const TIPO_N: Record<string, string> = { resumen: "Resumen", prueba: "Prueba del usuario", prueba_admin: "Prueba de la consola", invitacion: "Invitación", contador: "Contador" }

export function EnviosPanel() {
  const { data, isPending } = useQuery({ queryKey: ["admin", "envios"], queryFn: () => adminNotifyLog() })
  type E = NonNullable<typeof data>[number]
  const all = data ?? []
  const fallidos = all.filter((e) => e.status === "fallido").length
  const por = (ch: string) => all.filter((e) => e.channel === ch).length
  return (
    <div className="grid gap-6">
      <KpiGrid>
        <Kpi icon="send" tone="green" label="Enviados" value={nf(all.length - fallidos)} sub={`De los últimos ${nf(all.length)} intentos`} loading={isPending} />
        <Kpi icon="circle-x" tone="red" label="Fallidos" value={nf(fallidos)} sub={all.length ? `${nf(Math.round((fallidos / all.length) * 100))} % de los intentos` : "Sin intentos"} loading={isPending} />
        <Kpi icon="mail" tone="blue" label="Correos" value={nf(por("email"))} sub={`${nf(por("push"))} push`} loading={isPending} />
        <Kpi icon="message-circle" tone="violet" label="WhatsApp y Telegram" value={nf(por("whatsapp") + por("telegram"))} sub={`${nf(por("whatsapp"))} WhatsApp · ${nf(por("telegram"))} Telegram`} loading={isPending} />
      </KpiGrid>
      <DataTable<E>
        title="Registro de envíos" info="Correos, WhatsApp, Telegram y push que Mirai intentó enviar (últimos 500). Sin el contenido de los mensajes." data={data} loading={isPending} rowKey={(e) => String(e.id)}
        search={{ placeholder: "Buscar persona, destino o error", text: (e) => `${e.quien} ${e.destino ?? ""} ${e.error ?? ""} ${e.provider ?? ""}` }}
        filters={[
          { id: "canal", label: "Canal", options: Object.entries(CANAL).map(([value, c]) => ({ value, label: c.n })), match: (e, v) => e.channel === v },
          { id: "estado", label: "Estado", options: [{ value: "enviado", label: "Enviado" }, { value: "fallido", label: "Fallido" }], match: (e, v) => e.status === v },
          { id: "tipo", label: "Tipo", options: Object.entries(TIPO_N).map(([value, label]) => ({ value, label })), match: (e, v) => e.kind === v },
        ]}
        exportName="mirai-envios" initialSort={{ id: "cuando", dir: "desc" }}
        columns={[
          { id: "canal", header: "Canal", sort: (e) => e.channel, csv: (e) => e.channel, cell: (e) => <DTPrimary media={<ToneIcon icon={CANAL[e.channel]?.icon ?? "send"} tone={CANAL[e.channel]?.tone ?? "gray"} />} title={CANAL[e.channel]?.n ?? e.channel} sub={`${TIPO_N[e.kind] ?? e.kind}${e.provider ? ` · ${e.provider}` : ""}`} /> },
          { id: "cuando", header: "Cuándo", sort: (e) => e.created_at, csv: (e) => e.created_at, cell: (e) => <DTTwoLine top={fday(e.created_at)} bottom={rel(e.created_at)} /> },
          { id: "quien", header: "Persona", sort: (e) => e.quien, csv: (e) => e.quien, cell: (e) => <DTTwoLine top={e.quien} bottom={e.destino ?? ""} /> },
          { id: "estado", header: "Estado", sort: (e) => e.status, csv: (e) => e.status, cell: (e) => e.status === "enviado" ? <StatusPill tone="pagado" check>Enviado</StatusPill> : <Tip label={e.error ?? "Falló sin detalle"}><span className="inline-flex"><StatusPill tone="vencido">Fallido</StatusPill></span></Tip> },
          { id: "detalle", header: "Detalle", csv: (e) => e.error ?? e.ref ?? "", cell: (e) => <span className={cn("line-clamp-3 max-w-md text-xs break-words", e.error ? "text-danger" : "text-muted-foreground")}>{e.error ?? (e.ref ? `Id ${e.ref}` : "")}</span> },
        ]}
      />
    </div>
  )
}

// ── Comunicados ─────────────────────────────────────────────────────────────────────────────────────────────────

const segLabel = (seg: string, plans: { value: string; label: string }[]) => seg === "todos" ? "Todas las personas" : seg === "admins" ? "Solo administradores" : `Plan ${plans.find((p) => `plan:${p.value}` === seg)?.label ?? seg.replace(/^plan:/, "")}`

export function ComunicadosPanel() {
  const qc = useQueryClient()
  const ask = useAsk()
  const { data: plans = [] } = usePlanOptions()
  const { data: hist, isPending } = useQuery({ queryKey: ["admin", "broadcasts"], queryFn: async () => (await createClient().from("broadcasts").select("*").order("created_at", { ascending: false }).limit(100)).data ?? [] })
  const [v, setV] = useState({ titulo: "", cuerpo: "", href: "", segmento: "todos", correo: false })
  const [busy, setBusy] = useState(false)
  const hrefOk = !v.href.trim() || v.href.trim().startsWith("/")
  const valid = v.titulo.trim().length >= 2 && hrefOk
  const send = async () => {
    if (!(await ask.confirm({ title: `¿Enviar “${v.titulo.trim()}”?`, description: `Le llega a: ${segLabel(v.segmento, plans).toLowerCase()}${v.correo ? ", también por correo" : ""}. No se puede deshacer.`, confirmLabel: "Enviar" }))) return
    setBusy(true)
    try { const r = await adminBroadcast(v); toast.success(`Enviado a ${r.personas} personas${r.correos ? ` (${r.correos} correos)` : ""}`); setV({ ...v, titulo: "", cuerpo: "", href: "" }); qc.invalidateQueries({ queryKey: ["admin", "broadcasts"] }) }
    catch (e) { toast.error("No se pudo enviar", { description: (e as Error).message }) }
    finally { setBusy(false) }
  }
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Panel title="Nuevo comunicado" icon="megaphone" description="Llega como aviso en la campana de Mirai (y por correo si lo eliges).">
        <FieldGroup>
          <FormField label="Para" tip={false}><Combobox value={v.segmento} onChange={(x) => setV({ ...v, segmento: x })} options={[{ value: "todos", label: "Todas las personas" }, ...plans.map((p) => ({ value: `plan:${p.value}`, label: `Plan ${p.label}` })), { value: "admins", label: "Solo administradores (prueba)" }]} /></FormField>
          <FormField label="Título" htmlFor="bc-t" required tip={false} hint={`${v.titulo.length}/120`}><Input id="bc-t" className="h-11" maxLength={120} value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} placeholder="Ej. Nueva función: tus metas con fecha" /></FormField>
          <FormField label="Mensaje" htmlFor="bc-c" tip={false} hint={`${v.cuerpo.length}/1000`}><Textarea id="bc-c" rows={4} maxLength={1000} value={v.cuerpo} onChange={(e) => setV({ ...v, cuerpo: e.target.value })} placeholder="Cuéntalo en pocas palabras y en lenguaje sencillo." /></FormField>
          <FormField label="Enlace dentro de Mirai (opcional)" htmlFor="bc-h" tip={false} error={!hrefOk ? "Debe empezar por / (por ejemplo /metas)" : undefined}><Input id="bc-h" className="h-11" value={v.href} onChange={(e) => setV({ ...v, href: e.target.value })} placeholder="/metas" /></FormField>
          <ToggleRow title="También por correo" desc="Usa el correo global de la plataforma." checked={v.correo} onChange={(x) => setV({ ...v, correo: x })} />
          <div className="grid gap-2">
            <p className="text-sm font-semibold">Así se verá</p>
            <div className="flex items-start gap-3 rounded-lg bg-secondary/60 p-3">
              <ToneIcon icon="megaphone" tone="brand" size="sm" />
              <div className="grid min-w-0 gap-0.5"><p className="text-sm font-semibold break-words">{v.titulo.trim() || "Título del comunicado"}</p>{v.cuerpo.trim() && <p className="line-clamp-3 text-sm text-muted-foreground break-words">{v.cuerpo}</p>}<p className="text-xs text-muted-foreground">Ahora{v.href.trim() && hrefOk ? ` · abre ${v.href.trim()}` : ""}</p></div>
            </div>
          </div>
          <SubmitButton className="w-fit" disabled={!valid} loading={busy} loadingText="Enviando…" hint="Escribe el título (y un enlace que empiece por /)" onClick={send}><Send /> Enviar</SubmitButton>
        </FieldGroup>
      </Panel>
      <Panel title="Enviados" icon="history" action={hist?.length ? <span className="text-sm text-muted-foreground">{hist.length}</span> : undefined}>
        {isPending ? <div className="grid gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div> : !hist?.length ? <Empty>Aún no hay comunicados.</Empty> : (
          <ul className="grid max-h-[640px] gap-2 overflow-y-auto pr-1">{hist.map((b) => (
            <li key={b.id} className="flex items-start gap-3 rounded-lg bg-secondary/40 p-3 text-sm">
              <ToneIcon icon={b.segmento === "admins" ? "shield-check" : "users"} tone={b.segmento === "admins" ? "gray" : "blue"} size="sm" />
              <div className="grid min-w-0 gap-0.5"><p className="font-medium break-words">{b.titulo}</p><p className="text-xs text-muted-foreground">{segLabel(b.segmento, plans)} · {plural(b.enviados, "persona")} · {rel(b.created_at)}</p></div>
            </li>
          ))}</ul>
        )}
      </Panel>
      {ask.node}
    </div>
  )
}

// ── Administradores ─────────────────────────────────────────────────────────────────────────────────────────────

export function AdminsPanel() {
  const qc = useQueryClient()
  const ask = useAsk()
  const { user } = useApp()
  const { data, isPending } = useQuery({ queryKey: ["admin", "admins"], queryFn: () => adminAdmins() })
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const valid = EMAIL_RE.test(email.trim())
  const add = async () => {
    setBusy(true)
    try { await adminAddAdminByEmail(email.trim()); toast.success("Administrador agregado"); setEmail(""); qc.invalidateQueries({ queryKey: ["admin", "admins"] }) }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  const quitar = async (a: NonNullable<typeof data>[number]) => {
    if (!(await ask.confirm({ title: `¿Quitarle la administración a ${a.perfil?.nombre || a.perfil?.email || "esta persona"}?`, description: "Ya no podrá entrar a la consola. Su cuenta de Mirai sigue igual.", confirmLabel: "Quitar", destructive: true }))) return
    try { await adminSetPlatformAdmin(a.user_id, false); toast("Administración retirada"); qc.invalidateQueries({ queryKey: ["admin", "admins"] }) } catch (e) { toast.error((e as Error).message) }
  }
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Panel title={isPending ? "Administradores" : plural(data?.length ?? 0, "administrador", "administradores")} icon="shield-check">
        {isPending ? <div className="grid gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div> : <ul className="grid gap-2">{data!.map((a) => (
          <li key={a.user_id} className="flex items-center gap-3 rounded-lg bg-secondary/40 p-3">
            <UserAvatar src={a.perfil?.avatar_url ?? null} name={a.perfil?.nombre || a.perfil?.email || "?"} className="size-10" />
            <div className="grid min-w-0 flex-1"><Link href={`/admin/usuarios/${a.user_id}`} className="truncate font-medium text-link hover:underline">{a.perfil?.nombre || "Sin nombre"}{a.user_id === user.id ? " (tú)" : ""}</Link><span className="truncate text-xs text-muted-foreground">{a.perfil?.email} · desde {fday(a.created_at)}</span></div>
            {a.user_id !== user.id && <IconButton label={`Quitar la administración a ${a.perfil?.nombre || a.perfil?.email || "esta persona"}`} icon="user-x" destructive onClick={() => quitar(a)} />}
          </li>
        ))}</ul>}
      </Panel>
      <Panel title="Agregar administrador" icon="user-plus" description="La persona debe tener cuenta en Mirai. Verá la consola completa: clientes, pagos e integraciones. Dalo solo a personas de confianza." className="xl:h-auto xl:self-start">
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (valid && !busy) void add() }}>
          <FormField label="Correo" htmlFor="ad-email" required tip={false}><Input id="ad-email" className="h-11" type="email" autoComplete="off" placeholder="persona@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Correo del nuevo administrador" /></FormField>
          <SubmitButton className="w-fit" disabled={!valid} loading={busy} loadingText="Agregando…" hint="Escribe un correo válido" onClick={add}><Plus /> Agregar</SubmitButton>
        </form>
      </Panel>
      {ask.node}
    </div>
  )
}

// ── Auditoría ───────────────────────────────────────────────────────────────────────────────────────────────────

const auditIcon = (a: string) => /borr|elimin|quit|anul|termin/i.test(a) ? ["trash-2", "red"] as const : /plan|pago|cup|suscrip|premium/i.test(a) ? ["crown", "amber"] as const : /admin/i.test(a) ? ["shield-check", "violet"] as const : /integra|whatsapp|ajust/i.test(a) ? ["plug", "blue"] as const : ["scroll-text", "gray"] as const

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
        { id: "accion", header: "Acción", sort: (a) => a.accion, csv: (a) => a.accion, cell: (a) => { const [icon, tone] = auditIcon(a.accion); return <DTPrimary media={<ToneIcon icon={icon} tone={tone} />} title={a.accion} sub={a.quien} /> } },
        { id: "cuando", header: "Cuándo", sort: (a) => a.created_at, csv: (a) => a.created_at, cell: (a) => <DTTwoLine top={fday(a.created_at)} bottom={rel(a.created_at)} /> },
        { id: "quien", header: "Quién", hidden: true, sort: (a) => a.quien, csv: (a) => a.quien, cell: (a) => a.quien },
        { id: "detalle", header: "Detalle", csv: (a) => `${a.objetivo ?? ""} ${JSON.stringify(a.detalle ?? {})}`, cell: (a) => <span className="line-clamp-2 max-w-md font-mono text-xs break-all text-muted-foreground">{a.objetivo ? `${a.objetivo} ` : ""}{Object.keys(a.detalle ?? {}).length ? JSON.stringify(a.detalle) : ""}</span> },
      ]}
    />
  )
}

// ── Sistema ─────────────────────────────────────────────────────────────────────────────────────────────────────

const AVISO_TONOS = [{ value: "info", label: "Información" }, { value: "warn", label: "Advertencia" }, { value: "ok", label: "Buena noticia" }] as const

export function SistemaPanel() {
  const qc = useQueryClient()
  const ask = useAsk()
  const { data: plans = [] } = usePlanOptions()
  const { data, isPending } = useQuery({ queryKey: ["admin", "system"], queryFn: () => adminSystem() })
  const [aviso, setAviso] = useState<string | null>(null)
  const [tono, setTono] = useState<string | null>(null)
  const [savingAviso, setSavingAviso] = useState(false)
  if (isPending || !data) return <div className="grid gap-6 xl:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-56 rounded-lg" />)}</div>
  const s = data.settings!
  const save = async (p: Parameters<typeof adminSaveSettings>[0], ok: string) => { try { await adminSaveSettings(p); toast.success(ok); qc.invalidateQueries({ queryKey: ["admin", "system"] }); qc.invalidateQueries({ queryKey: ["platform-settings"] }); return true } catch (e) { toast.error((e as Error).message); return false } }
  const avisoV = aviso ?? s.aviso_global
  const tonoV = (tono ?? s.aviso_tono) as "info" | "warn" | "ok"
  const avisoDirty = avisoV !== s.aviso_global || tonoV !== s.aviso_tono
  const pendientes = data.estado.filter((e) => !e.ok).length
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Aviso para todos" icon="megaphone" description="Un mensaje arriba de todas las pantallas de Mirai (por ejemplo, mantenimiento programado). Déjalo vacío para quitarlo.">
        <Textarea rows={2} maxLength={300} value={avisoV} onChange={(e) => setAviso(e.target.value)} aria-label="Aviso para todos" placeholder="Ej. Hoy a las 10 p. m. Mirai estará en mantenimiento unos minutos." />
        <Segmented value={tonoV} onChange={setTono} items={[...AVISO_TONOS]} />
        {avisoV.trim() && <Notice tone={tonoV} title={avisoV.trim()} />}
        <SubmitButton className="w-fit" disabled={!avisoDirty} loading={savingAviso} hint="Cambia el aviso o su tono para guardar"
          onClick={async () => { setSavingAviso(true); if (await save({ aviso_global: avisoV, aviso_tono: tonoV as "info" }, avisoV.trim() ? "Aviso guardado" : "Aviso quitado")) { setAviso(null); setTono(null) } setSavingAviso(false) }}>Guardar aviso</SubmitButton>
      </Panel>
      <Panel title="Acceso y límites" icon="lock">
        <ToggleRow title="Registro abierto" desc="Si lo apagas, nadie nuevo puede crear cuenta (las cuentas existentes siguen entrando)." checked={s.registro_abierto} onChange={(x) => save({ registro_abierto: x }, x ? "Registro abierto" : "Registro cerrado")} />
        <ToggleRow title="Límites de los planes también en la base de datos" label="Límites en la base de datos" desc="La app ya respeta los límites. Esto los hace cumplir aunque alguien use la API directamente. Enciéndelo al publicar los planes en producción." checked={s.limites_db} onChange={(x) => save({ limites_db: x }, x ? "Límites activos en la base" : "Límites de la base apagados")} />
      </Panel>
      <Panel title="Programa de referidos" icon="gift" description={`${plural(data.referidos ?? 0, "persona llegó invitada", "personas llegaron invitadas")} · ${plural(data.premiados ?? 0, "invitación premiada", "invitaciones premiadas")}. Quien invita y quien llega reciben días del plan elegido (máximo 12 premios por persona).`}>
        <ToggleRow title="Programa activo" label="Programa de referidos activo" checked={s.referidos_activo} onChange={(x) => save({ referidos_activo: x }, x ? "Referidos activos" : "Referidos en pausa")} />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Plan que se regala" tip={false}><Combobox value={s.referidos_plan} onChange={(x) => save({ referidos_plan: x }, "Plan del premio guardado")} options={plans.filter((p) => p.value !== "gratis")} /></FormField>
          <FormField label="Días de premio" htmlFor="rf-d" tip={false} hint="De 1 a 365. Se guarda al salir del campo."><Input id="rf-d" type="number" min={1} max={365} className="h-11" defaultValue={s.referidos_dias} onBlur={(e) => { const n = +e.target.value; if (n >= 1 && n <= 365 && n !== s.referidos_dias) save({ referidos_dias: n }, "Días del premio guardados") }} /></FormField>
        </div>
      </Panel>
      <Panel title="Estado de la configuración" icon="server" action={<StatusPill tone={pendientes ? "porVencer" : "pagado"}>{pendientes ? `${pendientes} pendiente${pendientes === 1 ? "" : "s"}` : "Todo listo"}</StatusPill>}
        description={`Ambiente: ${data.ambiente} · rama ${data.rama}${data.commit ? ` · ${data.commit}` : ""}`}>
        <ul className="grid divide-y text-sm">{data.estado.map((e) => <li key={e.k} className="flex items-center justify-between gap-2 py-1.5"><span className="min-w-0 break-words">{e.k}</span>{e.ok ? <StatusPill tone="pagado" check>Configurado</StatusPill> : <StatusPill tone="gray">Pendiente</StatusPill>}</li>)}</ul>
        <p className="text-xs text-muted-foreground">Las variables se configuran en Vercel › Environment Variables (guía en docs/DEPLOY-VERCEL.md).</p>
      </Panel>
      <Panel title="Mantenimiento" icon="wrench" className="xl:col-span-2">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone={data.huerfanos ? "porVencer" : "pagado"}>{plural(data.huerfanos, "hogar sin integrantes", "hogares sin integrantes")}</StatusPill>
          <Button variant="outline" className="text-danger hover:bg-danger-soft hover:text-danger" disabled={!data.huerfanos} onClick={async () => {
            if (!(await ask.confirm({ title: `¿Borrar ${plural(data.huerfanos, "hogar vacío", "hogares vacíos")}?`, description: "Se borran con todos sus datos. No se puede deshacer.", confirmLabel: "Borrar", destructive: true }))) return
            try { const n = await adminCleanOrphanHouseholds(); toast.success(`${n} hogares borrados`); qc.invalidateQueries({ queryKey: ["admin"] }) } catch (e) { toast.error((e as Error).message) }
          }}><Trash2 /> Borrar hogares vacíos</Button>
        </div>
        <SectionTitle as="h3" icon="database" description="Cambios de la base de datos que ya están aplicados.">{`Migraciones aplicadas (${data.migraciones.length})`}</SectionTitle>
        <ul className="grid max-h-48 gap-0.5 overflow-y-auto rounded-lg bg-secondary/40 p-3 font-mono text-xs text-muted-foreground sm:grid-cols-2">{data.migraciones.map((m) => <li key={m.name} className="truncate" title={m.name}>{m.name}</li>)}</ul>
      </Panel>
      {ask.node}
    </div>
  )
}
