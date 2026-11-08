// Consola › Anuncios por la API: /v1/admin/ads/** (@PlatformAdmin y admin_audit en la API). La imagen sube por
// `files` (bucket público `ads`). Todas lanzan Error con el mensaje para la persona.
import type { Ad } from "@/features/ads/ad-slot"
import { uploadFile } from "@/lib/files/upload"

export type AdsSettings = { anuncios_adsense_pct: number; anuncios_accion_cada: number; anuncios_modal_horas: number; anuncios_ticker: boolean }
export type AdEventRow = { ad_id: string; dia: string; slot: string; vistas: number; clics: number; cierres: number }
export type AdReachRow = { ad_id: string; alcance: number | string | null }
type Rec = Record<string, unknown>

const api = async () => {
  const { browserApi, unwrap, unwrapData } = await import("@/lib/api/client")
  return { a: browserApi().ads, unwrap, unwrapData }
}

/** Campañas, anuncios, métricas por día y alcance del rango (desde/hasta en AAAA-MM-DD). */
export async function loadAdsManager(desde: string, hasta: string): Promise<{ camps: Rec[]; ads: Rec[]; ev: AdEventRow[]; reach: AdReachRow[] }> {
  const { a, unwrap } = await api()
  const m = unwrap(await a.manager({ query: { desde, hasta } }))
  return { camps: m.campaigns, ads: m.ads, ev: m.events, reach: m.reach }
}

/** Ajustes de anuncios (porcentaje de AdSense, cada cuántas acciones, ventana y cinta). */
export async function loadAdsSettings(): Promise<AdsSettings | null> {
  const { a, unwrap } = await api()
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
  return unwrap(await a.manager({ query: { desde: d, hasta: d } })).settings
}

export async function saveAdsSettings(p: Partial<AdsSettings>): Promise<void> {
  const { a, unwrapData } = await api()
  unwrapData(await a.saveSettings({ body: p }))
}

// ── Campañas ────────────────────────────────────────────────────────────────────────────────────────────────────

export type CampaignInput = { nombre: string; anunciante: string; objetivo: string; estado: string; desde: string | null; hasta: string | null; modelo_cobro: string; tarifa: number; presupuesto: number | null; planes: string[]; dispositivos: string[]; frecuencia_max: number; prioridad: number }

/** Crea (sin `id`) o edita una campaña. */
export async function saveCampaign(id: string | undefined, row: CampaignInput): Promise<void> {
  const { a, unwrapData } = await api()
  const body = row as never
  unwrapData(id ? await a.updateCampaign({ params: { id }, body }) : await a.createCampaign({ body }))
}

export async function setCampaignEstado(id: string, estado: "activa" | "pausada"): Promise<void> {
  const { a, unwrapData } = await api()
  unwrapData(await a.updateCampaign({ params: { id }, body: { estado } }))
}

export async function deleteCampaign(id: string): Promise<void> {
  const { a, unwrapData } = await api()
  unwrapData(await a.deleteCampaign({ params: { id } }))
}

// ── Anuncios ────────────────────────────────────────────────────────────────────────────────────────────────────

export type AdInput = Omit<Ad, "id">

/** Crea (sin `id`) o edita un anuncio. */
export async function saveAd(id: string | undefined, row: AdInput): Promise<void> {
  const { a, unwrapData } = await api()
  const body = row as never
  unwrapData(id ? await a.updateAd({ params: { id }, body }) : await a.createAd({ body }))
}

/** Duplica un anuncio con «(copia)» en el título. */
export async function duplicateAd(ad: Ad & Rec): Promise<void> {
  const { a, unwrapData } = await api()
  unwrapData(await a.duplicateAd({ params: { id: ad.id } }))
}

export async function setAdActivo(id: string, activo: boolean): Promise<void> {
  const { a, unwrapData } = await api()
  unwrapData(await a.updateAd({ params: { id }, body: { activo } }))
}

export async function deleteAd(id: string): Promise<void> {
  const { a, unwrapData } = await api()
  unwrapData(await a.deleteAd({ params: { id } }))
}

/** Sube la imagen de un anuncio al bucket público `ads` y devuelve su dirección. */
export async function uploadAdImage(f: File): Promise<string> {
  const r = await uploadFile({ bucket: "ads", body: f, name: f.name })
  if (!r.publicUrl) throw new Error("No recibimos la dirección de la imagen. Intenta de nuevo.")
  return r.publicUrl
}
