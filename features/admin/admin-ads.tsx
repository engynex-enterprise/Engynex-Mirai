"use client"

import { useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ImagePlus, Pencil, Plus, Trash2 } from "lucide-react"
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
import { DatePicker } from "@/components/mirai/date-picker"
import { FormField } from "@/components/mirai/field"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill } from "@/components/mirai/status-pill"
import { createClient } from "@/utils/supabase/client"
import { AD_SLOTS, adVigente, ctr, type AdSlotId } from "@/lib/ads"
import { fmtDate } from "@/lib/format"
import { adsenseEnabled } from "@/features/ads/ad-slot"

type Ad = { id: string; titulo: string; texto: string; imagen: string | null; url: string; cta: string; anunciante: string; ubicaciones: string[]; desde: string | null; hasta: string | null; prioridad: number; activo: boolean }
const EMPTY: Omit<Ad, "id"> = { titulo: "", texto: "", imagen: null, url: "https://", cta: "Conocer más", anunciante: "", ubicaciones: ["inicio"], desde: null, hasta: null, prioridad: 0, activo: true }
const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())

function AdDialog({ ad, onClose }: { ad: Ad | Omit<Ad, "id">; onClose: () => void }) {
  const qc = useQueryClient()
  const [v, setV] = useState(ad)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const set = <K extends keyof Ad>(k: K, x: Ad[K]) => setV({ ...v, [k]: x })
  const upload = async (f?: File) => {
    if (!f) return
    if (!f.type.startsWith("image/") || f.size > 2 * 1024 * 1024) return toast.error("Usa una imagen de máximo 2 MB")
    const sb = createClient()
    const path = `${crypto.randomUUID()}.${(f.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "")}`
    const { error } = await sb.storage.from("ads").upload(path, f, { contentType: f.type })
    if (error) return toast.error("No se pudo subir la imagen", { description: error.message })
    set("imagen", sb.storage.from("ads").getPublicUrl(path).data.publicUrl)
  }
  const save = async () => {
    if (v.titulo.trim().length < 2) return toast.error("Escribe el título")
    if (!/^https:\/\/.+\..+/.test(v.url)) return toast.error("El enlace debe empezar por https://")
    if (!v.ubicaciones.length) return toast.error("Elige al menos una ubicación")
    setBusy(true)
    const sb = createClient()
    const row = { ...v, titulo: v.titulo.trim(), texto: v.texto.trim(), anunciante: v.anunciante.trim(), cta: v.cta.trim() || "Conocer más" }
    const { error } = "id" in v ? await sb.from("ads").update(row).eq("id", v.id) : await sb.from("ads").insert(row)
    setBusy(false)
    if (error) return toast.error("No se pudo guardar", { description: error.message })
    toast.success("Anuncio guardado"); qc.invalidateQueries({ queryKey: ["admin", "ads"] }); qc.invalidateQueries({ queryKey: ["ads"] }); onClose()
  }
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title={"id" in ad ? "Editar anuncio" : "Nuevo anuncio"} description="Se muestra solo a quienes están en el plan gratis, siempre con la etiqueta Publicidad." wide>
      <FieldGroup className="pb-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Título" htmlFor="ad-t" required tip={false}><Input id="ad-t" className="h-11" maxLength={80} value={v.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ej. Abre tu cuenta de ahorros sin cuota" /></FormField>
          <FormField label="Anunciante" htmlFor="ad-a" tip={false}><Input id="ad-a" className="h-11" maxLength={60} value={v.anunciante} onChange={(e) => set("anunciante", e.target.value)} placeholder="Ej. Banco aliado" /></FormField>
        </div>
        <FormField label="Texto" htmlFor="ad-x" tip={false}><Textarea id="ad-x" rows={2} maxLength={220} value={v.texto} onChange={(e) => set("texto", e.target.value)} /></FormField>
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <FormField label="Enlace" htmlFor="ad-u" required tip={false}><Input id="ad-u" className="h-11" inputMode="url" value={v.url} onChange={(e) => set("url", e.target.value)} /></FormField>
          <FormField label="Botón" htmlFor="ad-c" tip={false}><Input id="ad-c" className="h-11" maxLength={30} value={v.cta} onChange={(e) => set("cta", e.target.value)} /></FormField>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {v.imagen && <img src={v.imagen} alt="" className="size-20 rounded-lg object-cover" />}
          <input ref={file} type="file" accept="image/*" className="sr-only" aria-label="Imagen del anuncio" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = "" }} />
          <Button type="button" variant="outline" onClick={() => file.current?.click()}><ImagePlus /> {v.imagen ? "Cambiar imagen" : "Subir imagen"}</Button>
          {v.imagen && <Button type="button" variant="ghost" onClick={() => set("imagen", null)}>Quitar</Button>}
        </div>
        <FormField label="Dónde se muestra" tip={false}>
          <div className="grid gap-2 sm:grid-cols-3">
            {AD_SLOTS.map((s) => (
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
          <FormField label="Prioridad" htmlFor="ad-p" tip={false} hint="Mayor = se muestra primero"><Input id="ad-p" type="number" className="h-11" value={v.prioridad} onChange={(e) => set("prioridad", +e.target.value || 0)} /></FormField>
        </div>
        <label className="flex items-center gap-3 text-sm"><Switch checked={v.activo} onCheckedChange={(c) => set("activo", c)} aria-label="Anuncio activo" /> Activo</label>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={busy} onClick={save}>{busy && <Spinner />} Guardar</Button></div>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

/** Pestaña Anuncios del panel: anuncios propios con vistas, clics y CTR de 30 días; estado de AdSense. */
export function AnunciosAdmin() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Ad | Omit<Ad, "id"> | null>(null)
  const { data, isPending } = useQuery({
    queryKey: ["admin", "ads"],
    queryFn: async () => {
      const sb = createClient()
      const desde = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
      const [{ data: ads }, { data: ev }] = await Promise.all([
        sb.from("ads").select("*").order("created_at", { ascending: false }),
        sb.from("ad_events").select("ad_id,vistas,clics").gte("dia", desde),
      ])
      return (ads ?? []).map((a) => {
        const e = (ev ?? []).filter((x) => x.ad_id === a.id)
        return { ...(a as Ad), vistas: e.reduce((t, x) => t + x.vistas, 0), clics: e.reduce((t, x) => t + x.clics, 0) }
      })
    },
  })
  const del = async (a: Ad) => {
    if (!confirm(`¿Borrar el anuncio “${a.titulo}” y sus métricas?`)) return
    const { error } = await createClient().from("ads").delete().eq("id", a.id)
    if (error) return toast.error(error.message)
    toast("Anuncio borrado"); qc.invalidateQueries({ queryKey: ["admin", "ads"] })
  }
  const today = hoy()
  return (
    <div className="grid gap-5">
      <Card className="flex-row flex-wrap items-center gap-3 p-5 shadow-card ring-0">
        <div className="grid flex-1 gap-0.5"><h2 className="font-semibold">Google AdSense</h2><p className="text-sm text-muted-foreground">{adsenseEnabled ? "Configurado: llena los espacios sin anuncio propio cuando la persona acepta las cookies de publicidad." : "Sin configurar. Cuando Google apruebe el dominio, agrega NEXT_PUBLIC_ADSENSE_CLIENT y NEXT_PUBLIC_ADSENSE_SLOT en Vercel. Mientras tanto, los espacios vacíos invitan a Premium."}</p></div>
        <StatusPill tone={adsenseEnabled ? "pagado" : "gray"}>{adsenseEnabled ? "Activo" : "Sin configurar"}</StatusPill>
      </Card>
      <Card className="gap-4 p-5 shadow-card ring-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-semibold">Anuncios propios</h2><p className="text-sm text-muted-foreground">Aliados, promociones o tus propios mensajes. Métricas de los últimos 30 días.</p></div>
          <Button onClick={() => setEditing({ ...EMPTY })}><Plus /> Nuevo anuncio</Button>
        </div>
        {isPending ? <Skeleton className="h-40" /> : !data?.length ? <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay anuncios. Crea el primero: se verá en el plan gratis con la etiqueta Publicidad.</p> : (
          <ul className="grid gap-2">
            {data.map((a) => {
              const vivo = adVigente(a, today)
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-secondary/40 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {a.imagen ? <img src={a.imagen} alt="" className="size-12 rounded-md object-cover" /> : <span className="size-12 rounded-md bg-secondary" />}
                  <div className="grid min-w-0 flex-1">
                    <p className="truncate font-medium">{a.titulo}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.ubicaciones.map((u) => AD_SLOTS.find((s) => s.value === (u as AdSlotId))?.label ?? u).join(", ")}{a.hasta ? ` · hasta ${fmtDate(a.hasta)}` : ""}{a.anunciante ? ` · ${a.anunciante}` : ""}</p>
                  </div>
                  <StatusPill tone={vivo ? "pagado" : "gray"}>{vivo ? "Al aire" : a.activo ? "Programado o vencido" : "Pausado"}</StatusPill>
                  <span className="w-36 text-right text-xs tabular-nums text-muted-foreground">{a.vistas.toLocaleString("es-CO")} vistas · {a.clics} clics · {String(ctr(a.vistas, a.clics)).replace(".", ",")} %</span>
                  <Button size="icon-sm" variant="ghost" aria-label={`Editar ${a.titulo}`} onClick={() => setEditing(a)}><Pencil /></Button>
                  <Button size="icon-sm" variant="ghost" className="text-danger" aria-label={`Borrar ${a.titulo}`} onClick={() => del(a)}><Trash2 /></Button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      {editing && <AdDialog ad={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
