"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@/lib/query"
import { CircleCheck, CircleX, ExternalLink, FlaskConical, Lock, Settings2, Trash2 } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Combobox } from "@/components/mirai/combobox"
import { FormField } from "@/components/mirai/field"
import { BrandLogo } from "@/components/mirai/brand-logo"
import { Icon } from "@/components/mirai/icon"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill } from "@/components/mirai/status-pill"
import { SubmitButton } from "@/components/mirai/submit-button"
import { Tip } from "@/components/mirai/tip"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { ListToolbar, NoResults, useListControls, type ListFilter } from "@/components/mirai/list-toolbar"
import { Notice } from "@/components/mirai/notice"
import { useApp } from "@/components/app/app-context"
import { can } from "@/lib/household/roles"
import { fetchHouseholdIntegrations, fetchPlatformIntegrations } from "../api"
import { CATS, CLIENT_INTEGRATIONS, type IntegrationCategory, type IntegrationDef } from "@/lib/integrations/registry"
import { deleteIntegration, listModels, saveIntegration, testIntegration, toggleIntegration } from "@/features/integrations/api"
import { FreeBadge } from "@/features/integrations/free-badge"
import { MODEL_LIST } from "@/lib/ai/models"
import { integrationBrand } from "@/lib/brands"
import { cn } from "@/lib/utils"

type Pub = { kind: string; enabled: boolean; config: Record<string, unknown>; meta: Record<string, unknown> }
/** Integraciones que ofrece la plataforma (sin secretos). */
function useGlobalIntegrations() {
  return useQuery({
    queryKey: ["platform-integrations"],
    queryFn: fetchPlatformIntegrations,
    staleTime: 5 * 60_000,
  })
}

export function useIntegrations() {
  const { household, book } = useApp()
  return useQuery({
    queryKey: ["h", household.id, "integrations"],
    queryFn: async () => (await fetchHouseholdIntegrations(household.id, book.id)) as unknown as Record<string, Pub>,
  })
}

/**
 * Modelos de la cuenta del usuario en el proveedor de IA. Se piden al pegar la clave (con una pausa
 * para no consultar en cada tecla) o de una vez si ya hay una clave guardada o el proveedor no la pide.
 */
function useModels(kind: string, typedKey: string, hasSaved: boolean) {
  const [key, setKey] = useState(typedKey.trim())
  useEffect(() => { const t = setTimeout(() => setKey(typedKey.trim()), 600); return () => clearTimeout(t) }, [typedKey])
  const src = MODEL_LIST[kind]
  const ready = !!src && (!!src.keyless || hasSaved || key.length >= 10)
  const q = useQuery({ queryKey: ["ai-models", kind, key], queryFn: () => listModels(kind, key || undefined), enabled: ready, staleTime: 10 * 60_000, retry: false })
  return { ...q, ready, loading: ready && q.isFetching }
}

/** Campos obligatorios que aún faltan (una clave guardada cuenta como llena). */
function missingFields(def: IntegrationDef, vals: Record<string, string | number | boolean>, cur: Pub | undefined, modelVal: string) {
  return def.fields.filter((f) => {
    if (!f.required || f.type === "boolean") return false
    if (f.type === "secret") return !String(vals[f.k] ?? "").trim() && !cur?.meta?.[f.k]
    if (f.type === "model") return !modelVal
    const x = f.k in vals ? vals[f.k] : (cur?.config?.[f.k] as string | undefined) ?? f.def ?? ""
    return !String(x).trim()
  })
}

function ConfigDialog({ def, cur, open, onOpenChange }: { def: IntegrationDef; cur?: Pub; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { household } = useApp()
  const qc = useQueryClient()
  const [vals, setVals] = useState<Record<string, string | number | boolean>>({})
  const [pending, start] = useTransition()
  const hasModel = def.fields.some((f) => f.type === "model")
  const models = useModels(hasModel ? def.kind : "", String(vals.apiKey ?? ""), !!cur?.meta?.apiKey)
  const v = (k: string, d?: unknown) => (k in vals ? vals[k] : (cur?.config?.[k] as string | undefined) ?? d ?? "")
  // Si el modelo guardado (o el de fábrica) no está en la cuenta, se propone el recomendado.
  const list = models.data?.ok ? models.data.models : []
  const savedModel = String(v("model", def.fields.find((f) => f.k === "model")?.def))
  const modelVal = "model" in vals || !list.length || list.some((m) => m.value === savedModel) ? savedModel : models.data?.rec ?? savedModel
  const missing = missingFields(def, vals, cur, modelVal)
  const close = () => onOpenChange(false)
  const save = () => start(async () => {
    try { await saveIntegration(def.kind, hasModel ? { ...vals, model: modelVal } : vals, true); toast.success(`${def.n} guardado`); qc.invalidateQueries({ queryKey: ["h", household.id, "integrations"] }); close() }
    catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }) }
  })
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={`Configurar ${def.n}`} description={def.d}
      footer={<><Button variant="outline" onClick={close}>Cancelar</Button>
        <SubmitButton onClick={save} disabled={missing.length > 0} loading={pending} hint={missing.length ? `Falta: ${missing.map((f) => f.l).join(", ")}` : undefined}>Guardar y activar</SubmitButton></>}>
      <form className="contents" onSubmit={(e) => { e.preventDefault(); if (!missing.length && !pending) save() }}>
      <FieldGroup className="pb-2">
        {def.url && <a href={def.url} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-sm text-link underline">Dónde obtener los datos <ExternalLink className="size-3.5" /><span className="sr-only">(se abre en otra pestaña)</span></a>}
        {!def.fields.length && <p className="text-sm text-muted-foreground">No necesita datos: solo actívala.</p>}
        {def.fields.map((f) => (
          <FormField key={f.k} label={f.l} htmlFor={`int-${f.k}`} tip={f.help ?? false} required={f.required}>
            {f.type === "model" ? (
              <div className="grid gap-1.5">
                <Combobox id={`int-${f.k}`} value={modelVal} onChange={(x) => setVals({ ...vals, [f.k]: x })} disabled={!list.length}
                  options={list.length ? list : [{ value: modelVal, label: modelVal }]} searchPlaceholder="Buscar modelo…" emptyText="Ningún modelo con ese nombre"
                  placeholder={!models.ready ? "Pega la clave para ver los modelos" : models.loading ? "Cargando modelos…" : "Selecciona un modelo"} />
                {models.loading ? <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Spinner className="size-3" /> Buscando los modelos de tu cuenta…</p>
                  : models.data && !models.data.ok ? <p className="text-xs text-danger">{models.data.msg}</p>
                  : list.length ? <p className="text-xs text-muted-foreground">{list.length} modelo{list.length === 1 ? "" : "s"} disponible{list.length === 1 ? "" : "s"} en tu cuenta.</p>
                  : !models.ready && <p className="text-xs text-muted-foreground">Cuando pegues la clave, aquí aparecen los modelos que puedes usar.</p>}
              </div>
            ) : f.type === "select" ? <Combobox id={`int-${f.k}`} value={String(v(f.k, f.def))} onChange={(x) => setVals({ ...vals, [f.k]: x })} options={f.options ?? []} />
              : f.type === "boolean" ? <Switch id={`int-${f.k}`} checked={v(f.k, f.def) === true || v(f.k, f.def) === "true"} onCheckedChange={(x) => setVals({ ...vals, [f.k]: x })} />
              : <Input id={`int-${f.k}`} className="h-11" type={f.type === "secret" ? "password" : f.type === "number" ? "number" : f.type === "email" ? "email" : "text"} autoComplete="off"
                  placeholder={f.type === "secret" ? (cur?.meta?.[f.k] ? `${cur.meta[f.k]} (déjalo vacío para conservarla)` : "Pega aquí la clave") : f.placeholder ?? String(f.def ?? "")}
                  value={f.type === "secret" ? String(vals[f.k] ?? "") : String(v(f.k, f.def))} onChange={(e) => setVals({ ...vals, [f.k]: f.type === "number" ? +e.target.value : e.target.value })} />}
          </FormField>
        ))}
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Lock className="mt-px size-3.5 shrink-0" aria-hidden /> Las claves se guardan cifradas en el servidor; nunca quedan en tu navegador.</p>
      </FieldGroup>
      </form>
    </ResponsiveDialog>
  )
}

type Row = { def: IntegrationDef; cur?: Pub; on: boolean; offered: boolean; locked: boolean; usesMirai: boolean; modo?: string }
const FILTERS: ListFilter<Row>[] = [
  { value: "todos", label: "Todos" },
  { value: "activos", label: "Activos", match: (r) => r.on },
  { value: "gratis", label: "Gratis o con plan gratis", match: (r) => r.def.free !== "pago" },
]
const SEARCH = (r: Row) => `${r.def.n} ${r.def.d} ${r.def.para}`

/** Proveedores que el hogar puede configurar: solo IA (el resto lo administra Mirai en la consola). */
export function IntegrationsTab({ only = ["ia"] }: { only?: IntegrationCategory[] }) {
  const { household, plan } = useApp()
  const qc = useQueryClient()
  const isOwner = can(household.access, "ajustes")
  const { data: state, isPending } = useIntegrations()
  const { data: globals } = useGlobalIntegrations()
  // La ventana se cierra con su animación sin perder lo que mostraba; `n` la reinicia cada vez que se abre.
  const [editing, setEditing] = useState<{ def: IntegrationDef; open: boolean; n: number } | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ["h", household.id, "integrations"] })
  const edit = (def: IntegrationDef) => setEditing((e) => ({ def, open: true, n: (e?.n ?? 0) + 1 }))
  const rows = useMemo<Row[]>(() => CLIENT_INTEGRATIONS.filter((i) => only.includes(i.cat)).map((def) => {
    const cur = state?.[def.kind]
    const g = globals?.[def.kind]
    const offered = !!g && g.modo !== "apagada" && (!g.planes?.length || g.planes.includes(plan.id))
    const locked = offered && g!.modo === "obligatoria"
    const usesMirai = offered && (locked || (g!.modo === "por_defecto" && !cur) || cur?.config?.usa_plataforma === true)
    const on = locked || (cur ? !!cur.enabled : offered && g!.modo === "por_defecto")
    return { def, cur, on, offered, locked, usesMirai, modo: g?.modo }
  }), [only, state, globals, plan.id])
  const c = useListControls(rows, { text: SEARCH, filters: FILTERS })
  if (isPending) return <div className="grid gap-3 xl:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}</div>
  const cats = only.filter((x) => CLIENT_INTEGRATIONS.some((i) => i.cat === x))

  return (
    <div className="grid gap-6">
      {!isOwner && <Notice tone="info" title="Solo el dueño del hogar puede cambiar los proveedores de IA">Puedes ver cuáles están activos; para cambiarlos, pídeselo a quien administra el hogar.</Notice>}
      {rows.length > 4 && <ListToolbar c={c} placeholder="Buscar proveedor" filters={FILTERS} />}
      {cats.map((cat) => {
        const list = c.rows.filter((r) => r.def.cat === cat)
        return (
        <section key={cat} className="grid gap-3" aria-labelledby={`int-cat-${cat}`}>
          <div className="flex items-start gap-3">
            <ToneIcon icon={CATS[cat].icon} tone="brand" />
            <div className="grid gap-0.5"><h3 id={`int-cat-${cat}`} className="text-[17px] leading-6 font-semibold">{CATS[cat].n}</h3><p className="text-sm text-muted-foreground">{CATS[cat].d}</p></div>
          </div>
          {!list.length ? <NoResults c={c} /> : (
          <div className="grid gap-3 xl:grid-cols-2">
            {list.map(({ def, cur, on, offered, locked, usesMirai, modo }) => {
              const meta = (cur?.meta ?? {}) as { lastOk?: boolean; lastMsg?: string }
              const brand = integrationBrand(def.kind, cur?.config)
              return (
                <Card key={def.kind} className={cn("h-full gap-3 p-4 shadow-card ring-0", on && "ring-1 ring-brand")}>
                  <div className="flex items-start gap-3">
                    {brand ? <BrandLogo k={brand} size={40} className={cn(!on && "opacity-80 grayscale-[.35]")} /> : <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", on ? "bg-brand-soft text-brand" : "bg-muted text-muted-foreground")}><Icon name={def.icon} className="size-5" /></span>}
                    <div className="grid min-w-0 flex-1 gap-1">
                      <p className="flex flex-wrap items-center gap-1.5 font-semibold">{def.n}
                        <FreeBadge free={def.free} />
                        {def.scope === "platform" && <Tip label="La configura quien administra Mirai para todos"><span><StatusPill tone="info">Del despliegue</StatusPill></span></Tip>}
                        {offered && <Tip label={locked ? "Mirai la deja siempre activa para tu plan" : "Mirai la incluye: no necesitas clave propia"}><span><StatusPill tone="pagado">{locked ? "Incluida por Mirai · obligatoria" : "Incluida por Mirai"}</StatusPill></span></Tip>}
                      </p>
                      <p className="text-sm text-muted-foreground">{def.d}</p>
                      <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Para qué sirve: </span>{def.para}</p>
                      {usesMirai && on && <p className="text-xs font-medium text-success">Usas el servicio de Mirai: no tienes que configurar nada.</p>}
                      {offered && !usesMirai && modo === "opcional" && !on && <p className="text-xs text-muted-foreground">Mirai la ofrece: actívala y listo, sin claves.</p>}
                    </div>
                    <Switch checked={on} disabled={!isOwner || locked} aria-label={`Activar ${def.n}`} onCheckedChange={async (v) => {
                      if (v && !offered && def.fields.some((f) => f.required) && !cur?.config) return edit(def)
                      try { await toggleIntegration(def.kind, v); toast(v ? `${def.n} activado` : `${def.n} apagado`); refresh() } catch (e) { toast.error((e as Error).message); edit(def) }
                    }} />
                  </div>
                  {meta.lastMsg && <p role="status" className={cn("flex items-start gap-1.5 text-xs", meta.lastOk ? "text-success" : "text-danger")}>{meta.lastOk ? <CircleCheck className="size-3.5 shrink-0" aria-hidden /> : <CircleX className="size-3.5 shrink-0" aria-hidden />}{meta.lastMsg}</p>}
                  {isOwner && (
                    <div className="mt-auto flex flex-wrap gap-2">
                      {def.fields.length > 0 && !locked && <Button size="sm" variant="outline" onClick={() => edit(def)}><Settings2 /> {offered ? "Usar mi propia cuenta" : "Configurar"}</Button>}
                      {def.testable && on && <Button size="sm" variant="soft" disabled={testing === def.kind} onClick={async () => {
                        setTesting(def.kind); const r = await testIntegration(def.kind); setTesting(null); toast[r.ok ? "success" : "error"](r.ok ? "Conexión exitosa" : "La prueba falló", { description: r.msg }); refresh()
                      }}>{testing === def.kind ? <Spinner /> : <FlaskConical />} Probar conexión</Button>}
                      {cur && def.fields.length > 0 && <Button size="sm" variant="ghost" className="text-danger" onClick={async () => {
                        try { await deleteIntegration(def.kind); toast("Datos borrados"); refresh() } catch (e) { toast.error("No se pudieron borrar", { description: (e as Error).message }) }
                      }}><Trash2 /> Borrar datos</Button>}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
          )}
        </section>
        )
      })}
      {editing && <ConfigDialog key={`${editing.def.kind}-${editing.n}`} def={editing.def} cur={state?.[editing.def.kind]} open={editing.open} onOpenChange={(o) => setEditing((e) => (e ? { ...e, open: o } : e))} />}
    </div>
  )
}
