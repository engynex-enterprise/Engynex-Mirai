"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ImagePlus, Plus, Trash2 } from "lucide-react"
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
import { Combobox } from "@/components/mirai/combobox"
import { DataTable, DTPrimary, DTTwoLine } from "@/components/mirai/data-table"
import { DatePicker } from "@/components/mirai/date-picker"
import { FormField } from "@/components/mirai/field"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { MoneyInput } from "@/components/mirai/money-input"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { Segmented } from "@/components/mirai/choice-cards"
import { StatusPill } from "@/components/mirai/status-pill"
import { createClient } from "@/utils/supabase/client"
import { AD_FORMATS, AD_SLOTS, campaignCost, ctr, type AdSlotId } from "@/lib/ads"
import { fmtDate } from "@/lib/format"
import { precio } from "@/lib/plans"
import { AdCreative, setAdsPreview, useAdsPreview, useAdsense, type Ad } from "@/features/ads/ad-slot"
import { usePlanOptions } from "./console-negocio"

type Campaign = { id: string; nombre: string; anunciante: string; objetivo: string; estado: string; desde: string | null; hasta: string | null; modelo_cobro: string; tarifa: number; presupuesto: number | null; planes: string[]; dispositivos: string[]; frecuencia_max: number; prioridad: number; created_at: string }
const ESTADO: Record<string, [Parameters<typeof StatusPill>[0]["tone"], string]> = { activa: ["pagado", "Activa"], pausada: ["porVencer", "Pausada"], borrador: ["gray", "Borrador"], terminada: ["gray", "Terminada"] }
const OBJ = { reconocimiento: "Reconocimiento", trafico: "Tráfico", conversion: "Conversiones" } as const
const COBRO = { cpm: "Por mil impresiones (CPM)", cpc: "Por clic (CPC)", fijo: "Tarifa fija" } as const
const n = (x: number) => x.toLocaleString("es-CO")
const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10)
const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())

/** Datos del administrador de anuncios: campañas, anuncios y métricas del rango elegido. */
function useAdsAdmin(dias: number) {
  return useQuery({
    queryKey: ["admin", "ads-manager", dias],
    queryFn: async () => {
      const sb = createClient()
      const desde = ago(dias - 1), hasta = hoy()
      const [{ data: camps }, { data: ads }, { data: ev }, { data: reach }] = await Promise.all([
        sb.from("ad_campaigns").select("*").order("created_at", { ascending: false }),
        sb.from("ads").select("*").order("created_at", { ascending: false }),
        sb.from("ad_events").select("ad_id,dia,slot,vistas,clics,cierres").gte("dia", desde).lte("dia", hasta),
        sb.rpc("ad_reach", { p_desde: desde, p_hasta: hasta }),
      ])
      const e = ev ?? []
      const byAd = (id: string) => { const l = e.filter((x) => x.ad_id === id); const r = (reach ?? []).find((x) => x.ad_id === id); return { vistas: l.reduce((t, x) => t + x.vistas, 0), clics: l.reduce((t, x) => t + x.clics, 0), cierres: l.reduce((t, x) => t + x.cierres, 0), alcance: Number(r?.alcance ?? 0) } }
      const adsM = ((ads ?? []) as unknown as (Ad & { created_at: string })[]).map((a) => ({ ...a, m: byAd(a.id) }))
      const campsM = ((camps ?? []) as unknown as Campaign[]).map((c) => {
        const mine = adsM.filter((a) => a.campaign_id === c.id)
        const m = mine.reduce((t, a) => ({ vistas: t.vistas + a.m.vistas, clics: t.clics + a.m.clics, cierres: t.cierres + a.m.cierres, alcance: t.alcance + a.m.alcance }), { vistas: 0, clics: 0, cierres: 0, alcance: 0 })
        return { ...c, anuncios: mine.length, m, gasto: campaignCost({ modelo_cobro: c.modelo_cobro, tarifa: +c.tarifa }, m.vistas, m.clics) }
      })
      const days = Array.from({ length: dias }, (_, i) => ago(dias - 1 - i))
      const serie = days.map((d) => ({ d, vistas: e.filter((x) => x.dia === d).reduce((t, x) => t + x.vistas, 0), clics: e.filter((x) => x.dia === d).reduce((t, x) => t + x.clics, 0) }))
      const porSlot = AD_SLOTS.map((s) => { const l = e.filter((x) => x.slot === s.value); return { slot: s.value, label: s.label, vistas: l.reduce((t, x) => t + x.vistas, 0), clics: l.reduce((t, x) => t + x.clics, 0) } }).filter((x) => x.vistas || x.clics)
      const tot = { vistas: e.reduce((t, x) => t + x.vistas, 0), clics: e.reduce((t, x) => t + x.clics, 0), cierres: e.reduce((t, x) => t + x.cierres, 0), alcance: (reach ?? []).reduce((t, x) => t + Number(x.alcance ?? 0), 0) }
      return { camps: campsM, ads: adsM, serie, porSlot, tot }
    },
  })
}

// ── Campañas ────────────────────────────────────────────────────────────────────────────────────────────────────

const NEW_CAMP: Omit<Campaign, "id" | "created_at"> = { nombre: "", anunciante: "", objetivo: "trafico", estado: "borrador", desde: null, hasta: null, modelo_cobro: "cpm", tarifa: 0, presupuesto: null, planes: [], dispositivos: ["movil", "escritorio"], frecuencia_max: 3, prioridad: 0 }

function CampaignDialog({ c, onClose }: { c: Campaign | Omit<Campaign, "id" | "created_at">; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: plans = [] } = usePlanOptions()
  const [v, setV] = useState(c)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV({ ...v, [k]: x })
  const save = async () => {
    if (v.nombre.trim().length < 2) return toast.error("Escribe el nombre de la campaña")
    setBusy(true)
    const sb = createClient()
    const row = { nombre: v.nombre.trim(), anunciante: v.anunciante.trim(), objetivo: v.objetivo, estado: v.estado, desde: v.desde, hasta: v.hasta, modelo_cobro: v.modelo_cobro, tarifa: v.tarifa, presupuesto: v.presupuesto, planes: v.planes, dispositivos: v.dispositivos, frecuencia_max: v.frecuencia_max, prioridad: v.prioridad }
    const { error } = "id" in v ? await sb.from("ad_campaigns").update(row).eq("id", v.id) : await sb.from("ad_campaigns").insert(row)
    setBusy(false)
    if (error) return toast.error("No se pudo guardar", { description: error.message })
    toast.success("Campaña guardada"); qc.invalidateQueries({ queryKey: ["admin", "ads-manager"] }); qc.invalidateQueries({ queryKey: ["ad-campaigns"] }); onClose()
  }
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title={"id" in c ? "Editar campaña" : "Nueva campaña"} description="La campaña agrupa anuncios: a quién se muestran, cuándo, cuántas veces y cuánto se cobra al anunciante." wide>
      <FieldGroup className="pb-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nombre de la campaña" htmlFor="cp-n" required tip={false}><Input id="cp-n" className="h-11" value={v.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Lanzamiento cuenta de ahorros" /></FormField>
          <FormField label="Anunciante" htmlFor="cp-a" tip={false}><Input id="cp-a" className="h-11" value={v.anunciante} onChange={(e) => set("anunciante", e.target.value)} placeholder="Ej. Banco aliado" /></FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Objetivo" tip={false}><Segmented value={v.objetivo} onChange={(x) => set("objetivo", x)} items={Object.entries(OBJ).map(([value, label]) => ({ value, label }))} /></FormField>
          <FormField label="Estado" tip={false}><Segmented value={v.estado} onChange={(x) => set("estado", x)} items={[{ value: "borrador", label: "Borrador" }, { value: "activa", label: "Activa" }, { value: "pausada", label: "Pausada" }]} /></FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Desde" htmlFor="cp-de" tip={false}><DatePicker id="cp-de" quick="futuro" clearable value={v.desde} onChange={(x) => set("desde", x)} placeholder="Desde ya" /></FormField>
          <FormField label="Hasta" htmlFor="cp-ha" tip={false}><DatePicker id="cp-ha" quick="futuro" clearable value={v.hasta} onChange={(x) => set("hasta", x)} placeholder="Sin fin" /></FormField>
        </div>
        <FormField label="Público: planes (ninguno marcado = todos los que ven anuncios)" tip={false}>
          <div className="flex flex-wrap gap-3">{plans.map((p) => <label key={p.value} className="flex items-center gap-2 text-sm"><Checkbox checked={v.planes.includes(p.value)} onCheckedChange={(x) => set("planes", x ? [...v.planes, p.value] : v.planes.filter((y) => y !== p.value))} />{p.label}</label>)}</div>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Dispositivos" tip={false}><div className="flex gap-3 pt-2">{(["movil", "escritorio"] as const).map((d) => <label key={d} className="flex items-center gap-2 text-sm"><Checkbox checked={v.dispositivos.includes(d)} onCheckedChange={(x) => set("dispositivos", x ? [...v.dispositivos, d] : v.dispositivos.filter((y) => y !== d))} />{d === "movil" ? "Celular" : "Computador"}</label>)}</div></FormField>
          <FormField label="Máximo por persona al día" htmlFor="cp-f" tip={false}><Input id="cp-f" type="number" min={1} max={50} className="h-11" value={v.frecuencia_max} onChange={(e) => set("frecuencia_max", Math.max(1, +e.target.value || 1))} /></FormField>
          <FormField label="Prioridad" htmlFor="cp-p" tip={false} hint="Mayor = gana el espacio"><Input id="cp-p" type="number" className="h-11" value={v.prioridad} onChange={(e) => set("prioridad", +e.target.value || 0)} /></FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Cobro al anunciante" tip={false}><Combobox value={v.modelo_cobro} onChange={(x) => set("modelo_cobro", x)} options={Object.entries(COBRO).map(([value, label]) => ({ value, label }))} /></FormField>
          <FormField label={v.modelo_cobro === "cpm" ? "Tarifa por mil impresiones" : v.modelo_cobro === "cpc" ? "Tarifa por clic" : "Tarifa total"} htmlFor="cp-t" tip={false}><MoneyInput id="cp-t" value={v.tarifa} onChange={(x) => set("tarifa", x ?? 0)} /></FormField>
          <FormField label="Presupuesto (opcional)" htmlFor="cp-b" tip={false}><MoneyInput id="cp-b" value={v.presupuesto ?? 0} onChange={(x) => set("presupuesto", x || null)} /></FormField>
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={busy} onClick={save}>{busy && <Spinner />} Guardar campaña</Button></div>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

// ── Anuncios ────────────────────────────────────────────────────────────────────────────────────────────────────

const EMPTY: Omit<Ad, "id"> = { titulo: "", texto: "", imagen: null, url: "https://", cta: "Conocer más", anunciante: "", ubicaciones: ["inicio"], desde: null, hasta: null, prioridad: 0, activo: true, campaign_id: null, formato: "imagen", media: {} }

function AdEditor({ ad, campaigns, onClose }: { ad: Ad | Omit<Ad, "id">; campaigns: Campaign[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [v, setV] = useState(ad)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const set = <K extends keyof Ad>(k: K, x: Ad[K]) => setV({ ...v, [k]: x })
  const fmt = AD_FORMATS.find((f) => f.value === v.formato) ?? AD_FORMATS[0]
  const upload = async (f?: File, cb?: (url: string) => void) => {
    if (!f) return
    if (!f.type.startsWith("image/") || f.size > 2 * 1024 * 1024) return toast.error("Usa una imagen de máximo 2 MB")
    const sb = createClient()
    const path = `${crypto.randomUUID()}.${(f.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "")}`
    const { error } = await sb.storage.from("ads").upload(path, f, { contentType: f.type })
    if (error) return toast.error("No se pudo subir la imagen", { description: error.message })
    const url = sb.storage.from("ads").getPublicUrl(path).data.publicUrl
    if (cb) cb(url); else set("imagen", url)
  }
  const save = async () => {
    if (v.titulo.trim().length < 2) return toast.error("Escribe el título")
    if (!/^(https:\/\/.+\..+|\/.*)$/.test(v.url)) return toast.error("El enlace debe empezar por https:// o ser una sección de Mirai (por ejemplo /planes)")
    if (!v.ubicaciones.length) return toast.error("Elige al menos una ubicación")
    setBusy(true)
    const sb = createClient()
    const row = { titulo: v.titulo.trim(), texto: v.texto.trim(), imagen: v.imagen, url: v.url.trim(), cta: v.cta.trim() || "Conocer más", anunciante: v.anunciante.trim(), ubicaciones: v.ubicaciones, desde: v.desde, hasta: v.hasta, prioridad: v.prioridad, activo: v.activo, campaign_id: v.campaign_id, formato: v.formato, media: v.media as never }
    const { error } = "id" in v ? await sb.from("ads").update(row).eq("id", v.id) : await sb.from("ads").insert(row)
    setBusy(false)
    if (error) return toast.error("No se pudo guardar", { description: error.message })
    toast.success("Anuncio guardado"); qc.invalidateQueries({ queryKey: ["admin", "ads-manager"] }); qc.invalidateQueries({ queryKey: ["ads"] }); onClose()
  }
  const items = v.media.items ?? []
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title={"id" in ad ? "Editar anuncio" : "Nuevo anuncio"} description="Elige el formato y dónde aparece. Solo lo ven quienes tienen un plan con anuncios, siempre con la etiqueta Publicidad." wide>
      <div className="grid gap-5 pb-2 lg:grid-cols-[minmax(0,1fr)_320px]">
        <FieldGroup>
          <FormField label="Formato" tip={false}><Segmented value={v.formato} onChange={(x) => { const f = AD_FORMATS.find((y) => y.value === x)!; setV({ ...v, formato: x, ubicaciones: v.ubicaciones.filter((u) => f.slots.includes(u as AdSlotId)).length ? v.ubicaciones.filter((u) => f.slots.includes(u as AdSlotId)) : [f.slots[0]] }) }} items={AD_FORMATS.map((f) => ({ value: f.value, label: f.label }))} /></FormField>
          <p className="-mt-2 text-xs text-muted-foreground">{fmt.desc}</p>
          <FormField label="Campaña" tip={false}><Combobox value={v.campaign_id ?? ""} onChange={(x) => set("campaign_id", x || null)} options={[{ value: "", label: "Sin campaña (siempre activo)" }, ...campaigns.map((c) => ({ value: c.id, label: c.nombre, hint: ESTADO[c.estado]?.[1] }))]} /></FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Título" htmlFor="ad-t" required tip={false}><Input id="ad-t" className="h-11" maxLength={80} value={v.titulo} onChange={(e) => set("titulo", e.target.value)} /></FormField>
            <FormField label="Anunciante" htmlFor="ad-a" tip={false}><Input id="ad-a" className="h-11" maxLength={60} value={v.anunciante} onChange={(e) => set("anunciante", e.target.value)} /></FormField>
          </div>
          <FormField label="Texto" htmlFor="ad-x" tip={false}><Textarea id="ad-x" rows={2} maxLength={220} value={v.texto} onChange={(e) => set("texto", e.target.value)} /></FormField>
          <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <FormField label="Enlace" htmlFor="ad-u" required tip={false} hint="https://… o una sección de Mirai, como /planes"><Input id="ad-u" className="h-11" value={v.url} onChange={(e) => set("url", e.target.value)} /></FormField>
            <FormField label="Botón" htmlFor="ad-c" tip={false}><Input id="ad-c" className="h-11" maxLength={30} value={v.cta} onChange={(e) => set("cta", e.target.value)} /></FormField>
          </div>
          {v.formato !== "texto" && v.formato !== "carrusel" && (
            <div className="flex flex-wrap items-center gap-3">
              <input ref={file} type="file" accept="image/*" className="sr-only" aria-label="Imagen del anuncio" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = "" }} />
              <Button type="button" variant="outline" onClick={() => file.current?.click()}><ImagePlus /> {v.imagen ? "Cambiar imagen" : v.formato === "video" ? "Subir portada" : "Subir imagen"}</Button>
              {v.imagen && <Button type="button" variant="ghost" onClick={() => set("imagen", null)}>Quitar</Button>}
              {(v.formato === "historia") && <label className="flex items-center gap-2 text-sm">Color de fondo <input type="color" value={v.media.color ?? "#1F2B4B"} onChange={(e) => set("media", { ...v.media, color: e.target.value })} aria-label="Color de fondo" /></label>}
            </div>
          )}
          {v.formato === "video" && <FormField label="Enlace del video (mp4)" htmlFor="ad-v" tip={false}><Input id="ad-v" className="h-11" value={v.media.video ?? ""} onChange={(e) => set("media", { ...v.media, video: e.target.value, poster: v.imagen ?? undefined })} placeholder="https://…/video.mp4" /></FormField>}
          {v.formato === "carrusel" && (
            <FormField label="Tarjetas del carrusel" tip={false}>
              <div className="grid gap-2">
                {items.map((it, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input className="h-10" value={it.titulo} placeholder={`Tarjeta ${i + 1}`} onChange={(e) => set("media", { ...v.media, items: items.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)) })} aria-label={`Título de la tarjeta ${i + 1}`} />
                    <label className="cursor-pointer rounded-md border px-2 py-2 text-xs">{it.imagen ? "Cambiar" : "Imagen"}<input type="file" accept="image/*" className="sr-only" onChange={(e) => { void upload(e.target.files?.[0], (url) => set("media", { ...v.media, items: items.map((x, j) => (j === i ? { ...x, imagen: url } : x)) })); e.target.value = "" }} /></label>
                    <Button size="icon-sm" variant="ghost" aria-label="Quitar tarjeta" onClick={() => set("media", { ...v.media, items: items.filter((_, j) => j !== i) })}><Trash2 /></Button>
                  </div>
                ))}
                {items.length < 6 && <Button size="sm" variant="outline" className="w-fit" onClick={() => set("media", { ...v.media, items: [...items, { titulo: "" }] })}><Plus /> Agregar tarjeta</Button>}
              </div>
            </FormField>
          )}
          <FormField label="Ubicaciones" tip={false}>
            <div className="grid gap-2 sm:grid-cols-2">
              {AD_SLOTS.filter((s) => fmt.slots.includes(s.value)).map((s) => (
                <label key={s.value} className="flex cursor-pointer items-start gap-2 rounded-lg bg-secondary/60 p-3 text-sm">
                  <Checkbox checked={v.ubicaciones.includes(s.value)} onCheckedChange={(c) => set("ubicaciones", c ? [...v.ubicaciones, s.value] : v.ubicaciones.filter((x) => x !== s.value))} aria-label={s.label} />
                  <span><b>{s.label}</b><span className="block text-muted-foreground">{s.desc}</span></span>
                </label>
              ))}
            </div>
          </FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Desde" htmlFor="ad-d" tip={false}><DatePicker id="ad-d" quick="futuro" clearable value={v.desde} onChange={(x) => set("desde", x)} placeholder="Desde hoy" /></FormField>
            <FormField label="Hasta" htmlFor="ad-h" tip={false}><DatePicker id="ad-h" quick="futuro" clearable value={v.hasta} onChange={(x) => set("hasta", x)} placeholder="Sin fecha final" /></FormField>
            <FormField label="Prioridad" htmlFor="ad-p" tip={false}><Input id="ad-p" type="number" className="h-11" value={v.prioridad} onChange={(e) => set("prioridad", +e.target.value || 0)} /></FormField>
          </div>
          <label className="flex items-center gap-3 text-sm"><Switch checked={v.activo} onCheckedChange={(c) => set("activo", c)} aria-label="Anuncio activo" /> Activo</label>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={busy} onClick={save}>{busy && <Spinner />} Guardar anuncio</Button></div>
        </FieldGroup>
        <div className="grid content-start gap-2">
          <p className="text-sm font-semibold">Vista previa</p>
          {v.formato === "historia" ? (
            <div className="relative flex h-60 w-44 flex-col justify-between overflow-hidden rounded-xl p-3 text-white shadow-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {v.imagen ? <img src={v.imagen} alt="" className="absolute inset-0 size-full object-cover" /> : <span className="absolute inset-0" style={{ background: v.media.color ?? "#1F2B4B" }} />}
              <span className="relative w-fit rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-black uppercase">Publicidad</span>
              <span className="relative grid gap-1"><span className="font-extrabold">{v.titulo || "Título"}</span><span className="w-fit rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-black">{v.cta}</span></span>
            </div>
          ) : v.formato === "texto" ? (
            <div className="flex items-center gap-2 overflow-hidden rounded-md bg-navy px-3 py-1.5 text-[13px] text-white"><span className="rounded bg-lime px-1.5 text-[10px] font-bold text-navy uppercase">Publicidad</span><span className="truncate"><b>{v.titulo || "Título"}</b>{v.texto ? ` · ${v.texto}` : ""} <span className="text-lime">{v.cta} →</span></span></div>
          ) : (
            <Card className="pointer-events-none gap-3 p-4 shadow-card ring-0"><span className="text-[11px] font-semibold text-muted-foreground uppercase">Publicidad</span><AdCreative ad={{ ...(v as Ad), id: "preview" }} slot="inicio" large={v.formato === "modal"} /></Card>
          )}
        </div>
      </div>
    </ResponsiveDialog>
  )
}

/** Administrador de anuncios (estilo Meta): campañas, anuncios, métricas y ajustes de mezcla con AdSense. */
export function AnunciosAdmin() {
  const qc = useQueryClient()
  const [tab, setTab] = useState("campanas")
  const [dias, setDias] = useState(30)
  const { data, isPending } = useAdsAdmin(dias)
  const [editCamp, setEditCamp] = useState<Campaign | Omit<Campaign, "id" | "created_at"> | null>(null)
  const [editAd, setEditAd] = useState<Ad | Omit<Ad, "id"> | null>(null)
  const adsense = useAdsense()
  const preview = useAdsPreview()
  const camps = useMemo(() => data?.camps ?? [], [data])
  const campName = useMemo(() => new Map(camps.map((c) => [c.id, c.nombre])), [camps])
  const sb = createClient()
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin", "ads-manager"] }); qc.invalidateQueries({ queryKey: ["ads"] }); qc.invalidateQueries({ queryKey: ["ad-campaigns"] }) }
  const { data: cfg } = useQuery({ queryKey: ["platform-settings-ads"], queryFn: async () => (await sb.from("platform_settings").select("anuncios_adsense_pct,anuncios_accion_cada,anuncios_modal_horas,anuncios_ticker").maybeSingle()).data })
  const saveCfg = async (p: { anuncios_adsense_pct?: number; anuncios_accion_cada?: number; anuncios_modal_horas?: number; anuncios_ticker?: boolean }) => { const { error } = await sb.from("platform_settings").update(p).eq("id", true); if (error) toast.error(error.message); else { toast.success("Guardado"); qc.invalidateQueries({ queryKey: ["platform-settings-ads"] }) } }
  type C = (typeof camps)[number]
  type A = NonNullable<typeof data>["ads"][number]
  const max = Math.max(1, ...(data?.serie.map((s) => s.vistas) ?? [1]))
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={tab} onChange={setTab} items={[{ value: "campanas", label: "Campañas", icon: "megaphone" }, { value: "anuncios", label: "Anuncios", icon: "image" }, { value: "metricas", label: "Métricas", icon: "chart-column" }, { value: "ajustes", label: "Ajustes", icon: "settings" }]} />
        <div className="flex items-center gap-3"><label className="flex items-center gap-2 text-sm"><Switch checked={preview} onCheckedChange={setAdsPreview} aria-label="Vista previa de anuncios" />Ver anuncios en mi cuenta</label>{tab !== "ajustes" && <div className="w-40"><Combobox value={String(dias)} onChange={(x) => setDias(+x)} options={[{ value: "7", label: "Últimos 7 días" }, { value: "30", label: "Últimos 30 días" }, { value: "90", label: "Últimos 90 días" }]} /></div>}</div>
      </div>
      <KpiGrid>
        <Kpi icon="eye" tone="blue" label="Impresiones" value={data ? n(data.tot.vistas) : ""} sub={data && `Alcance: ${n(data.tot.alcance)} personas`} loading={isPending} />
        <Kpi icon="mouse-pointer-click" tone="green" label="Clics" value={data ? n(data.tot.clics) : ""} sub={data && `CTR ${String(ctr(data.tot.vistas, data.tot.clics)).replace(".", ",")} %`} loading={isPending} />
        <Kpi icon="repeat" tone="violet" label="Frecuencia" value={data ? (data.tot.alcance ? (data.tot.vistas / data.tot.alcance).toFixed(1).replace(".", ",") : "—") : ""} sub="Veces que cada persona lo vio" loading={isPending} />
        <Kpi icon="banknote" tone="amber" label="Ingresos estimados" value={data ? precio(camps.reduce((t, c) => t + c.gasto, 0)) : ""} sub={data && `${data.tot.cierres} cierres`} loading={isPending} />
      </KpiGrid>

      {tab === "campanas" && (
        <DataTable<C>
          title="Campañas" info="Cada campaña agrupa anuncios con su público, fechas, frecuencia y tarifa." data={data?.camps} loading={isPending} rowKey={(c) => c.id}
          search={{ placeholder: "Buscar campaña o anunciante", text: (c) => `${c.nombre} ${c.anunciante}` }}
          filters={[{ id: "estado", label: "Estado", options: Object.entries(ESTADO).map(([k, v]) => ({ value: k, label: v[1] })), match: (c, x) => c.estado === x }]}
          create={{ label: "Nueva campaña", onClick: () => setEditCamp({ ...NEW_CAMP }) }} exportName="mirai-campanas" initialSort={{ id: "vistas", dir: "desc" }}
          actions={[
            { label: "Editar", onSelect: (c) => setEditCamp(c) },
            { label: "Activar", hidden: (c) => c.estado === "activa", onSelect: async (c) => { await sb.from("ad_campaigns").update({ estado: "activa" }).eq("id", c.id); toast.success("Campaña activa"); refresh() } },
            { label: "Pausar", hidden: (c) => c.estado !== "activa", onSelect: async (c) => { await sb.from("ad_campaigns").update({ estado: "pausada" }).eq("id", c.id); toast("Campaña pausada"); refresh() } },
            { label: "Nuevo anuncio en esta campaña", onSelect: (c) => setEditAd({ ...EMPTY, campaign_id: c.id, anunciante: c.anunciante }) },
            { label: "Borrar", destructive: true, onSelect: async (c) => { if (!confirm(`¿Borrar la campaña ${c.nombre} y sus anuncios?`)) return; await sb.from("ad_campaigns").delete().eq("id", c.id); toast("Campaña borrada"); refresh() } },
          ]}
          columns={[
            { id: "nombre", header: "Campaña", sort: (c) => c.nombre.toLowerCase(), csv: (c) => c.nombre, cell: (c) => <DTPrimary title={c.nombre} sub={`${c.anunciante || "Sin anunciante"} · ${OBJ[c.objetivo as keyof typeof OBJ] ?? c.objetivo}`} /> },
            { id: "estado", header: "Estado", sort: (c) => c.estado, csv: (c) => c.estado, cell: (c) => <DTTwoLine top={<StatusPill tone={ESTADO[c.estado]?.[0] ?? "gray"}>{ESTADO[c.estado]?.[1] ?? c.estado}</StatusPill>} bottom={c.hasta ? `hasta ${fmtDate(c.hasta)}` : "Sin fecha final"} /> },
            { id: "anuncios", header: "Anuncios", align: "right", sort: (c) => c.anuncios, csv: (c) => c.anuncios, cell: (c) => c.anuncios },
            { id: "vistas", header: "Impresiones", align: "right", sort: (c) => c.m.vistas, csv: (c) => c.m.vistas, cell: (c) => <DTTwoLine top={n(c.m.vistas)} bottom={`${n(c.m.alcance)} personas`} /> },
            { id: "clics", header: "Clics", align: "right", sort: (c) => c.m.clics, csv: (c) => c.m.clics, cell: (c) => <DTTwoLine top={n(c.m.clics)} bottom={`CTR ${String(ctr(c.m.vistas, c.m.clics)).replace(".", ",")} %`} /> },
            { id: "gasto", header: "Ingreso estimado", info: "Según el modelo de cobro y la tarifa de la campaña.", align: "right", sort: (c) => c.gasto, csv: (c) => c.gasto, cell: (c) => <DTTwoLine top={<span className="font-semibold">{precio(c.gasto)}</span>} bottom={COBRO[c.modelo_cobro as keyof typeof COBRO]} /> },
          ]}
        />
      )}

      {tab === "anuncios" && (
        <DataTable<A>
          title="Anuncios" info="Los creativos: formato, dónde aparecen y cómo les va." data={data?.ads} loading={isPending} rowKey={(a) => a.id}
          search={{ placeholder: "Buscar anuncio, anunciante o campaña", text: (a) => `${a.titulo} ${a.anunciante} ${campName.get(a.campaign_id ?? "") ?? ""}` }}
          filters={[{ id: "formato", label: "Formato", options: AD_FORMATS.map((f) => ({ value: f.value, label: f.label })), match: (a, x) => a.formato === x }, { id: "slot", label: "Ubicación", options: AD_SLOTS.map((s) => ({ value: s.value, label: s.label })), match: (a, x) => a.ubicaciones.includes(x) }]}
          create={{ label: "Nuevo anuncio", onClick: () => setEditAd({ ...EMPTY }) }} exportName="mirai-anuncios" initialSort={{ id: "vistas", dir: "desc" }}
          actions={[
            { label: "Editar", onSelect: (a) => setEditAd(a) },
            { label: "Duplicar", onSelect: async (a) => { const { id: _id, m: _m, created_at: _c, ...rest } = a; void _id; void _m; void _c; await sb.from("ads").insert({ ...rest, titulo: `${a.titulo} (copia)`, media: rest.media as never }); toast.success("Anuncio duplicado"); refresh() } },
            { label: "Pausar", hidden: (a) => !a.activo, onSelect: async (a) => { await sb.from("ads").update({ activo: false }).eq("id", a.id); refresh() } },
            { label: "Activar", hidden: (a) => a.activo, onSelect: async (a) => { await sb.from("ads").update({ activo: true }).eq("id", a.id); refresh() } },
            { label: "Borrar", destructive: true, onSelect: async (a) => { if (!confirm(`¿Borrar el anuncio “${a.titulo}” y sus métricas?`)) return; await sb.from("ads").delete().eq("id", a.id); refresh() } },
          ]}
          columns={[
            // eslint-disable-next-line @next/next/no-img-element
            { id: "anuncio", header: "Anuncio", sort: (a) => a.titulo.toLowerCase(), csv: (a) => a.titulo, cell: (a) => <DTPrimary media={a.imagen ? <img src={a.imagen} alt="" className="size-10 rounded-md object-cover" /> : <span className="grid size-10 place-items-center rounded-md bg-secondary text-xs font-bold">{a.formato.slice(0, 3).toUpperCase()}</span>} title={a.titulo} sub={`${AD_FORMATS.find((f) => f.value === a.formato)?.label ?? a.formato} · ${campName.get(a.campaign_id ?? "") ?? "Sin campaña"}`} /> },
            { id: "ubic", header: "Ubicaciones", csv: (a) => a.ubicaciones.join(" | "), cell: (a) => <span className="text-sm">{a.ubicaciones.map((u) => AD_SLOTS.find((s) => s.value === u)?.label ?? u).join(", ")}</span> },
            { id: "estado", header: "Estado", sort: (a) => (a.activo ? 1 : 0), csv: (a) => (a.activo ? "activo" : "pausado"), cell: (a) => <StatusPill tone={a.activo ? "pagado" : "gray"}>{a.activo ? "Activo" : "Pausado"}</StatusPill> },
            { id: "vistas", header: "Impresiones", align: "right", sort: (a) => a.m.vistas, csv: (a) => a.m.vistas, cell: (a) => <DTTwoLine top={n(a.m.vistas)} bottom={`${n(a.m.alcance)} personas`} /> },
            { id: "clics", header: "Clics", align: "right", sort: (a) => a.m.clics, csv: (a) => a.m.clics, cell: (a) => <DTTwoLine top={n(a.m.clics)} bottom={`CTR ${String(ctr(a.m.vistas, a.m.clics)).replace(".", ",")} %`} /> },
            { id: "cierres", header: "Cierres", align: "right", hidden: true, sort: (a) => a.m.cierres, csv: (a) => a.m.cierres, cell: (a) => n(a.m.cierres) },
          ]}
        />
      )}

      {tab === "metricas" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="gap-3 p-5 shadow-card ring-0">
            <h2 className="font-semibold">Impresiones y clics por día</h2>
            {isPending ? <Skeleton className="h-48" /> : (
              <div className="flex h-48 items-end gap-1" role="img" aria-label="Impresiones por día">
                {data!.serie.map((s) => <div key={s.d} className="relative flex h-full flex-1 items-end" title={`${fmtDate(s.d)}: ${s.vistas} impresiones, ${s.clics} clics`}><span className="w-full rounded-t bg-info/70" style={{ height: `${Math.max(2, (s.vistas / max) * 100)}%` }} />{s.clics > 0 && <span className="absolute bottom-0 w-full rounded-t bg-brand" style={{ height: `${Math.max(2, (s.clics / max) * 100)}%` }} />}</div>)}
              </div>
            )}
            <p className="flex gap-4 text-xs text-muted-foreground"><span><span className="mr-1 inline-block size-2 rounded-full bg-info/70" />Impresiones</span><span><span className="mr-1 inline-block size-2 rounded-full bg-brand" />Clics</span></p>
          </Card>
          <Card className="gap-3 p-5 shadow-card ring-0">
            <h2 className="font-semibold">Por ubicación</h2>
            {!data?.porSlot.length ? <p className="text-sm text-muted-foreground">Aún no hay impresiones en este rango.</p> : <ul className="grid gap-2">{data.porSlot.map((s) => <li key={s.slot} className="grid gap-1"><div className="flex justify-between text-sm"><span>{s.label}</span><span className="tabular-nums">{n(s.vistas)} · {n(s.clics)} clics · {String(ctr(s.vistas, s.clics)).replace(".", ",")} %</span></div><span className="h-1.5 rounded-full bg-secondary"><span className="block h-full rounded-full bg-brand" style={{ width: `${(s.vistas / Math.max(1, ...data.porSlot.map((x) => x.vistas))) * 100}%` }} /></span></li>)}</ul>}
          </Card>
        </div>
      )}

      {tab === "ajustes" && cfg && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="gap-4 p-5 shadow-card ring-0">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Google AdSense</h2><StatusPill tone={adsense ? "pagado" : "gray"}>{adsense ? "Activo" : "Sin configurar"}</StatusPill></div>
            <p className="text-sm text-muted-foreground">{adsense ? `Activo (${adsense.client}). Se mezcla con tus anuncios en el feed, junto al consejero, listas y reportes, y llena la ventana después de una acción si no hay anuncio propio.` : "Sin configurar. Cuando Google apruebe el dominio, pon tu id de cliente y el bloque de anuncios en Integraciones globales › Google AdSense. Mientras tanto, los espacios vacíos invitan a Premium."}</p>
            <Button variant="outline" className="w-fit" asChild><Link href="/admin/integraciones">Configurar AdSense</Link></Button>
            <FormField label={`Espacios que van para AdSense: ${cfg.anuncios_adsense_pct} %`} htmlFor="ad-pct" tip={false} hint="El resto muestra tus anuncios propios (si no hay propio, AdSense llena el espacio).">
              <input id="ad-pct" type="range" min={0} max={100} step={5} defaultValue={cfg.anuncios_adsense_pct} onMouseUp={(e) => saveCfg({ anuncios_adsense_pct: +(e.target as HTMLInputElement).value })} onTouchEnd={(e) => saveCfg({ anuncios_adsense_pct: +(e.target as HTMLInputElement).value })} onKeyUp={(e) => saveCfg({ anuncios_adsense_pct: +(e.target as HTMLInputElement).value })} className="w-full accent-[var(--primary)]" />
            </FormField>
          </Card>
          <Card className="gap-4 p-5 shadow-card ring-0">
            <h2 className="font-semibold">Frecuencia de los formatos que interrumpen</h2>
            <FormField label="Anuncio después de una acción: cada cuántas acciones" htmlFor="ad-acc" tip={false} hint="Por ejemplo 3 = después de cada tercer gasto o ingreso registrado."><Input id="ad-acc" type="number" min={1} max={50} className="h-11" defaultValue={cfg.anuncios_accion_cada} onBlur={(e) => +e.target.value !== cfg.anuncios_accion_cada && saveCfg({ anuncios_accion_cada: Math.max(1, +e.target.value || 1) })} /></FormField>
            <FormField label="Ventana al entrar: como máximo una vez cada (horas)" htmlFor="ad-mod" tip={false}><Input id="ad-mod" type="number" min={1} max={720} className="h-11" defaultValue={cfg.anuncios_modal_horas} onBlur={(e) => +e.target.value !== cfg.anuncios_modal_horas && saveCfg({ anuncios_modal_horas: Math.max(1, +e.target.value || 1) })} /></FormField>
            <label className="flex items-center justify-between gap-4 text-sm"><span><b>Texto en movimiento arriba</b><span className="block text-muted-foreground">La barra delgada con anuncios de texto.</span></span><Switch checked={cfg.anuncios_ticker} onCheckedChange={(x) => saveCfg({ anuncios_ticker: x })} aria-label="Texto en movimiento" /></label>
          </Card>
        </div>
      )}
      {editCamp && <CampaignDialog c={editCamp} onClose={() => setEditCamp(null)} />}
      {editAd && <AdEditor ad={editAd} campaigns={camps} onClose={() => setEditAd(null)} />}
    </div>
  )
}

