"use client"

import { useEffect, useState, useTransition } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CircleCheck, CircleX, ExternalLink, FlaskConical, Settings2, Trash2 } from "lucide-react"
import { toast } from "sonner"
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
import { useApp } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { CATS, INTEGRATIONS, type IntegrationCategory, type IntegrationDef } from "@/lib/integrations/registry"
import { deleteIntegration, listModels, saveIntegration, testIntegration, toggleIntegration } from "@/features/integrations/actions"
import { MODEL_LIST } from "@/lib/ai/models"
import { integrationBrand } from "@/lib/brands"
import { cn } from "@/lib/utils"

type Pub = { kind: string; enabled: boolean; config: Record<string, unknown>; meta: Record<string, unknown> }
const FREE = { gratis: ["pagado", "Gratis"], "plan-gratis": ["estimado", "Plan gratis"], pago: ["gray", "De pago"] } as const

/** Integraciones que ofrece la plataforma (sin secretos). */
function useGlobalIntegrations() {
  return useQuery({
    queryKey: ["platform-integrations"],
    queryFn: async () => Object.fromEntries(((await createClient().from("platform_integrations_public").select("kind,modo,planes")).data ?? []).map((r) => [r.kind!, r])) as Record<string, { modo: string; planes: string[] }>,
    staleTime: 5 * 60_000,
  })
}

export function useIntegrations() {
  const { household } = useApp()
  return useQuery({
    queryKey: ["h", household.id, "integrations"],
    queryFn: async () => {
      const { data } = await createClient().from("integrations_public").select("kind,enabled,config,meta").eq("household_id", household.id)
      return Object.fromEntries((data ?? []).map((r) => [r.kind!, r as unknown as Pub])) as Record<string, Pub>
    },
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

function ConfigDialog({ def, cur, onClose }: { def: IntegrationDef; cur?: Pub; onClose: () => void }) {
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
  const save = (enabled: boolean) => start(async () => {
    try { await saveIntegration(def.kind, hasModel ? { ...vals, model: modelVal } : vals, enabled); toast.success(`${def.n} guardado`); qc.invalidateQueries({ queryKey: ["h", household.id, "integrations"] }); onClose() }
    catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }) }
  })
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title={`Configurar ${def.n}`} description={def.d}>
      <FieldGroup className="pb-2">
        {def.url && <a href={def.url} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-sm text-link underline">Dónde obtener los datos <ExternalLink className="size-3.5" /></a>}
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
        <p className="text-xs text-muted-foreground">Las claves se guardan cifradas en el servidor; nunca quedan en tu navegador.</p>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={() => save(true)} disabled={pending}>{pending && <Spinner />} Guardar y activar</Button></div>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

export function IntegrationsTab({ only }: { only?: IntegrationCategory[] }) {
  const { household, plan } = useApp()
  const qc = useQueryClient()
  const isOwner = household.role === "owner"
  const { data: state, isPending } = useIntegrations()
  const { data: globals } = useGlobalIntegrations()
  const [editing, setEditing] = useState<IntegrationDef | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ["h", household.id, "integrations"] })
  if (isPending) return <div className="grid gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
  const cats = (only ?? (Object.keys(CATS) as IntegrationCategory[]))

  return (
    <div className="grid gap-6">
      {!isOwner && <p className="rounded-lg bg-muted p-3 text-sm">Solo el dueño del hogar puede cambiar las integraciones.</p>}
      {cats.map((c) => (
        <section key={c} className="grid gap-3">
          <div><h3 className="flex items-center gap-2 font-semibold"><Icon name={CATS[c].icon} className="size-5 text-brand" />{CATS[c].n}</h3><p className="text-sm text-muted-foreground">{CATS[c].d}</p></div>
          <div className="grid gap-3 xl:grid-cols-2">
            {INTEGRATIONS.filter((i) => i.cat === c && !i.adminOnly).map((def) => {
              const cur = state?.[def.kind]
              const meta = (cur?.meta ?? {}) as { lastOk?: boolean; lastMsg?: string }
              const g = globals?.[def.kind]
              const offered = !!g && g.modo !== "apagada" && (!g.planes?.length || g.planes.includes(plan.id))
              const locked = offered && g!.modo === "obligatoria"
              const usesMirai = offered && (locked || (g!.modo === "por_defecto" && !cur) || cur?.config?.usa_plataforma === true)
              const on = locked || (cur ? !!cur.enabled : offered && g!.modo === "por_defecto")
              return (
                <Card key={def.kind} className={cn("gap-3 p-4 shadow-card ring-0", on && "ring-1 ring-brand")}>
                  <div className="flex items-start gap-3">
                    {integrationBrand(def.kind, cur?.config) ? <BrandLogo k={integrationBrand(def.kind, cur?.config)!} size={40} className={cn(!on && "opacity-80 grayscale-[.35]")} /> : <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", on ? "bg-brand-soft text-brand" : "bg-muted text-muted-foreground")}><Icon name={def.icon} className="size-5" /></span>}
                    <div className="grid flex-1 gap-1">
                      <p className="flex flex-wrap items-center gap-1.5 font-semibold">{def.n}<StatusPill tone={FREE[def.free][0]}>{FREE[def.free][1]}</StatusPill>{def.scope === "platform" && <StatusPill tone="info">Del despliegue</StatusPill>}{offered && <StatusPill tone="pagado">{locked ? "Incluida por Mirai · obligatoria" : "Incluida por Mirai"}</StatusPill>}</p>
                      <p className="text-sm text-muted-foreground">{def.d}</p>
                      {usesMirai && on && <p className="text-xs font-medium text-success">Usas el servicio de Mirai: no tienes que configurar nada.</p>}
                      {offered && !usesMirai && g!.modo === "opcional" && !on && <p className="text-xs text-muted-foreground">Mirai la ofrece: actívala y listo, sin claves.</p>}
                    </div>
                    <Switch checked={on} disabled={!isOwner || locked} aria-label={`Activar ${def.n}`} onCheckedChange={async (v) => {
                      if (v && !offered && def.fields.some((f) => f.required) && !cur?.config) return setEditing(def)
                      try { await toggleIntegration(def.kind, v); toast(v ? `${def.n} activado` : `${def.n} apagado`); refresh() } catch (e) { toast.error((e as Error).message); setEditing(def) }
                    }} />
                  </div>
                  {meta.lastMsg && <p className={cn("flex items-start gap-1.5 text-xs", meta.lastOk ? "text-success" : "text-danger")}>{meta.lastOk ? <CircleCheck className="size-3.5 shrink-0" /> : <CircleX className="size-3.5 shrink-0" />}{meta.lastMsg}</p>}
                  {isOwner && (
                    <div className="flex flex-wrap gap-2">
                      {def.fields.length > 0 && !locked && <Button size="sm" variant="outline" onClick={() => setEditing(def)}><Settings2 /> {offered ? "Usar mi propia cuenta" : "Configurar"}</Button>}
                      {def.testable && on && <Button size="sm" variant="soft" disabled={testing === def.kind} onClick={async () => {
                        setTesting(def.kind); const r = await testIntegration(def.kind); setTesting(null); toast[r.ok ? "success" : "error"](r.ok ? "Conexión exitosa" : "La prueba falló", { description: r.msg }); refresh()
                      }}>{testing === def.kind ? <Spinner /> : <FlaskConical />} Probar</Button>}
                      {cur && def.fields.length > 0 && <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { await deleteIntegration(def.kind); toast("Datos borrados"); refresh() }}><Trash2 /> Borrar datos</Button>}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </section>
      ))}
      {editing && <ConfigDialog key={editing.kind} def={editing} cur={state?.[editing.kind]} onClose={() => setEditing(null)} />}
    </div>
  )
}
