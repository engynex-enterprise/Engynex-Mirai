// Consola › Anuncios por la API (V7-H3, interruptor `admin`): /v1/admin/ads/** (@PlatformAdmin y admin_audit en la
// API). La imagen sube por `files` (bucket público `ads`). Con el interruptor apagado es lo de siempre: ad_campaigns,
// ads, ad_events, ad_reach, platform_settings y Storage directo con la sesión del administrador (modo heredado: las
// únicas ramas con `.from`/`.rpc`/`.storage` de la consola de anuncios). Todas lanzan Error con el mensaje para la persona.
import type { Ad } from "@/features/ads/ad-slot"
import { apiOn } from "@/lib/api/session"
import { filesViaApi, uploadFile } from "@/lib/files/upload"
import { createClient } from "@/utils/supabase/client"

export type AdsSettings = { anuncios_adsense_pct: number; anuncios_accion_cada: number; anuncios_modal_horas: number; anuncios_ticker: boolean }
export type AdEventRow = { ad_id: string; dia: string; slot: string; vistas: number; clics: number; cierres: number }
export type AdReachRow = { ad_id: string; alcance: number | string | null }
type Rec = Record<string, unknown>

const on = () => apiOn("admin")
const api = async () => {
  const { browserApi, unwrap, unwrapData } = await import("@/lib/api/client")
  return { a: browserApi().ads, unwrap, unwrapData }
}
const check = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message) }

/** Campañas, anuncios, métricas por día y alcance del rango (desde/hasta en AAAA-MM-DD). */
export async function loadAdsManager(desde: string, hasta: string): Promise<{ camps: Rec[]; ads: Rec[]; ev: AdEventRow[]; reach: AdReachRow[] }> {
  if (on()) {
    const { a, unwrap } = await api()
    const m = unwrap(await a.manager({ query: { desde, hasta } }))
    return { camps: m.campaigns, ads: m.ads, ev: m.events, reach: m.reach }
  }
  const sb = createClient()
  const [{ data: camps }, { data: ads }, { data: ev }, { data: reach }] = await Promise.all([
    sb.from("ad_campaigns").select("*").order("created_at", { ascending: false }),
    sb.from("ads").select("*").order("created_at", { ascending: false }),
    sb.from("ad_events").select("ad_id,dia,slot,vistas,clics,cierres").gte("dia", desde).lte("dia", hasta),
    sb.rpc("ad_reach", { p_desde: desde, p_hasta: hasta }),
  ])
  return { camps: (camps ?? []) as Rec[], ads: (ads ?? []) as Rec[], ev: ev ?? [], reach: (reach ?? []) as AdReachRow[] }
}

/** Ajustes de anuncios (porcentaje de AdSense, cada cuántas acciones, ventana y cinta). */
export async function loadAdsSettings(): Promise<AdsSettings | null> {
  if (on()) {
    const { a, unwrap } = await api()
    const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
    return unwrap(await a.manager({ query: { desde: d, hasta: d } })).settings
  }
  return (await createClient().from("platform_settings").select("anuncios_adsense_pct,anuncios_accion_cada,anuncios_modal_horas,anuncios_ticker").maybeSingle()).data
}

export async function saveAdsSettings(p: Partial<AdsSettings>): Promise<void> {
  if (on()) {
    const { a, unwrapData } = await api()
    unwrapData(await a.saveSettings({ body: p }))
    return
  }
  check(await createClient().from("platform_settings").update(p).eq("id", true))
}

// ── Campañas ────────────────────────────────────────────────────────────────────────────────────────────────────

export type CampaignInput = { nombre: string; anunciante: string; objetivo: string; estado: string; desde: string | null; hasta: string | null; modelo_cobro: string; tarifa: number; presupuesto: number | null; planes: string[]; dispositivos: string[]; frecuencia_max: number; prioridad: number }

/** Crea (sin `id`) o edita una campaña. */
export async function saveCampaign(id: string | undefined, row: CampaignInput): Promise<void> {
  if (on()) {
    const { a, unwrapData } = await api()
    const body = row as never
    unwrapData(id ? await a.updateCampaign({ params: { id }, body }) : await a.createCampaign({ body }))
    return
  }
  const sb = createClient()
  check(id ? await sb.from("ad_campaigns").update(row).eq("id", id) : await sb.from("ad_campaigns").insert(row))
}

export async function setCampaignEstado(id: string, estado: "activa" | "pausada"): Promise<void> {
  if (on()) {
    const { a, unwrapData } = await api()
    unwrapData(await a.updateCampaign({ params: { id }, body: { estado } }))
    return
  }
  check(await createClient().from("ad_campaigns").update({ estado }).eq("id", id))
}

export async function deleteCampaign(id: string): Promise<void> {
  if (on()) {
    const { a, unwrapData } = await api()
    unwrapData(await a.deleteCampaign({ params: { id } }))
    return
  }
  check(await createClient().from("ad_campaigns").delete().eq("id", id))
}

// ── Anuncios ────────────────────────────────────────────────────────────────────────────────────────────────────

export type AdInput = Omit<Ad, "id">

/** Crea (sin `id`) o edita un anuncio. */
export async function saveAd(id: string | undefined, row: AdInput): Promise<void> {
  if (on()) {
    const { a, unwrapData } = await api()
    const body = row as never
    unwrapData(id ? await a.updateAd({ params: { id }, body }) : await a.createAd({ body }))
    return
  }
  const sb = createClient()
  const r = { ...row, media: row.media as never }
  check(id ? await sb.from("ads").update(r).eq("id", id) : await sb.from("ads").insert(r))
}

/** Duplica un anuncio con «(copia)» en el título. */
export async function duplicateAd(ad: Ad & Rec): Promise<void> {
  if (on()) {
    const { a, unwrapData } = await api()
    unwrapData(await a.duplicateAd({ params: { id: ad.id } }))
    return
  }
  const { id: _id, m: _m, created_at: _c, ...rest } = ad
  void _id; void _m; void _c
  check(await createClient().from("ads").insert({ ...(rest as unknown as AdInput), titulo: `${ad.titulo} (copia)`, media: rest.media as never }))
}

export async function setAdActivo(id: string, activo: boolean): Promise<void> {
  if (on()) {
    const { a, unwrapData } = await api()
    unwrapData(await a.updateAd({ params: { id }, body: { activo } }))
    return
  }
  check(await createClient().from("ads").update({ activo }).eq("id", id))
}

export async function deleteAd(id: string): Promise<void> {
  if (on()) {
    const { a, unwrapData } = await api()
    unwrapData(await a.deleteAd({ params: { id } }))
    return
  }
  check(await createClient().from("ads").delete().eq("id", id))
}

/** Sube la imagen de un anuncio al bucket público `ads` y devuelve su dirección. */
export async function uploadAdImage(f: File): Promise<string> {
  if (filesViaApi()) {
    const r = await uploadFile({ bucket: "ads", body: f, name: f.name })
    if (!r.publicUrl) throw new Error("No recibimos la dirección de la imagen. Intenta de nuevo.")
    return r.publicUrl
  }
  const sb = createClient()
  const path = `${crypto.randomUUID()}.${(f.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "")}`
  const { error } = await sb.storage.from("ads").upload(path, f, { contentType: f.type })
  if (error) throw new Error(error.message)
  return sb.storage.from("ads").getPublicUrl(path).data.publicUrl
}
