// Módulo `ads` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-C (lectura).
// GET /v1/books/:bookId/ads/eligible → usePick/useAdsData de apps/web/features/ads/ad-slot.tsx: anuncios vigentes del
// espacio con la segmentación de la campaña (plan del hogar del libro, dispositivo y frecuencia diaria) y el mismo
// sorteo estable por persona y día (@mirai/domain/ads). Va por libro (no en /v1/ads/eligible) porque la segmentación usa
// el plan del hogar del libro activo, igual que la web.
// V7-G:
//   POST /v1/ads/events          → useTrack (RPC ad_track con la sesión: suma al día del anuncio y a tus vistas de hoy)
//   GET  /v1/public/adsense      → useAdsense + ads.txt: id de cliente y bloque de AdSense de la consola (sin secretos)
//   GET  /v1/public/ads.txt      → el ads.txt listo (texto plano), para que la web solo lo sirva
//   /v1/admin/ads/**             → consola › Anuncios (features/admin/admin-ads.tsx): campañas, anuncios, métricas,
//                                  alcance y ajustes; @PlatformAdmin y cada cambio en admin_audit.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import type { AdSlotId } from "@mirai/domain/ads"
import { ApiError, ApiOk, COMMON_ERRORS, IsoDate, Uuid } from "../common"

export const meta = { id: "ads", owner: "F2-C" } as const

export const AD_SLOT_IDS = ["inicio", "historia", "consejero", "lista", "reportes", "ticker", "modal", "accion"] as const satisfies readonly AdSlotId[]

export const BookParams = z.object({ bookId: Uuid })
export const EligibleQuery = z.object({
  slot: z.enum(AD_SLOT_IDS, { error: "Espacio de anuncio inválido" }),
  device: z.enum(["movil", "escritorio"], { error: "Usa movil o escritorio" }).optional(),
  /** Para varios espacios iguales en la misma pantalla (la web usa el mismo `salt`). */
  salt: z.string().max(40).optional(),
  hoy: IsoDate.optional(),
})

export const Ad = z.object({
  id: z.string(), titulo: z.string(), texto: z.string(), imagen: z.string().nullable(), url: z.string(), cta: z.string(), anunciante: z.string(),
  ubicaciones: z.array(z.string()), activo: z.boolean(), desde: z.string().nullable(), hasta: z.string().nullable(), prioridad: z.number(),
  campaign_id: z.string().nullable(), formato: z.string(), media: z.unknown(),
})
export type Ad = z.infer<typeof Ad>

export const AdsSettings = z.object({ anuncios_adsense_pct: z.number(), anuncios_accion_cada: z.number(), anuncios_modal_horas: z.number(), anuncios_ticker: z.boolean() })

export const Eligible = z.object({
  /** El plan del hogar muestra anuncios (`plans.anuncios`). Si es false, la web no muestra nada (salvo la vista previa de un admin). */
  planAds: z.boolean(),
  /** Anuncio elegido para el espacio (o null: la web muestra su anuncio propio de la casa). */
  ad: Ad.nullable(),
  /** Cuántos anuncios eran elegibles. */
  candidatos: z.number(),
  /** ¿Este espacio le toca a AdSense hoy? (porcentaje de ajustes; la web además exige consentimiento y AdSense configurado). */
  adsenseTurno: z.boolean(),
  settings: AdsSettings.nullable(),
  /** V7-H3: solo en `ticker` (la cinta muestra varios): los elegibles por prioridad, hasta 5. */
  lista: z.array(Ad).optional(),
})
export type Eligible = z.infer<typeof Eligible>

// ── V7-G: eventos, AdSense y consola de anuncios ──
export const AdKind = z.enum(["vista", "clic", "cierre"], { error: "Evento de anuncio inválido" })
export const AdEvent = z.object({ ad: Uuid, slot: z.enum(AD_SLOT_IDS, { error: "Espacio de anuncio inválido" }), kind: AdKind })
/** AdSense de la consola (Integraciones globales › Google AdSense). `client`/`slot` son públicos (van en la página). */
export const AdsensePublic = z.object({
  activo: z.boolean(), client: z.string().nullable(), slot: z.string().nullable(), planes: z.array(z.string()), adsTxt: z.string(),
})
export type AdsensePublic = z.infer<typeof AdsensePublic>

const Fecha = IsoDate.nullable().optional()
export const CampaignInput = z
  .object({
    nombre: z.string().trim().min(2, "Escribe el nombre de la campaña (al menos 2 letras)").max(80),
    anunciante: z.string().trim().max(80).default(""),
    objetivo: z.enum(["reconocimiento", "trafico", "conversion"]).default("trafico"),
    estado: z.enum(["borrador", "activa", "pausada", "terminada"]).default("borrador"),
    desde: Fecha, hasta: Fecha,
    modelo_cobro: z.enum(["cpm", "cpc", "fijo"]).default("cpm"),
    tarifa: z.number().min(0, "La tarifa no puede ser negativa").max(1e12).default(0),
    presupuesto: z.number().min(0).max(1e13).nullable().optional(),
    planes: z.array(z.string().max(40)).max(20).default([]),
    dispositivos: z.array(z.enum(["movil", "escritorio"])).min(1, "Elige al menos un dispositivo").default(["movil", "escritorio"]),
    frecuencia_max: z.number().int().min(1).max(50).default(3),
    prioridad: z.number().int().min(-1000).max(1000).default(0),
  })
  .refine((v) => !v.desde || !v.hasta || v.desde <= v.hasta, { message: "La fecha final debe ser después de la inicial", path: ["hasta"] })
export const CampaignPatch = z
  .object({
    nombre: z.string().trim().min(2).max(80), anunciante: z.string().trim().max(80), objetivo: z.enum(["reconocimiento", "trafico", "conversion"]),
    estado: z.enum(["borrador", "activa", "pausada", "terminada"]), desde: IsoDate.nullable(), hasta: IsoDate.nullable(), modelo_cobro: z.enum(["cpm", "cpc", "fijo"]),
    tarifa: z.number().min(0).max(1e12), presupuesto: z.number().min(0).max(1e13).nullable(), planes: z.array(z.string().max(40)).max(20),
    dispositivos: z.array(z.enum(["movil", "escritorio"])).min(1, "Elige al menos un dispositivo"), frecuencia_max: z.number().int().min(1).max(50), prioridad: z.number().int().min(-1000).max(1000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nada que cambiar")

const AdUrl = z.string().trim().max(500).regex(/^(https:\/\/|\/)/, "El enlace debe empezar por https:// o por /")
export const AdMedia = z.object({
  video: z.string().max(500).optional(), poster: z.string().max(500).optional(), color: z.string().max(40).optional(),
  items: z.array(z.object({ imagen: z.string().max(500).optional(), titulo: z.string().max(80), url: z.string().max(500).optional() })).max(10).optional(),
})
const AD_FORMATOS = ["imagen", "carrusel", "video", "historia", "texto", "modal"] as const
export const AdInput = z
  .object({
    titulo: z.string().trim().min(2, "Escribe el título del anuncio (al menos 2 letras)").max(80),
    texto: z.string().trim().max(220).default(""),
    imagen: z.string().max(500).nullable().optional(),
    url: AdUrl,
    cta: z.string().trim().max(30).default("Conocer más"),
    anunciante: z.string().trim().max(60).default(""),
    ubicaciones: z.array(z.enum(AD_SLOT_IDS)).min(1, "Elige al menos una ubicación"),
    desde: Fecha, hasta: Fecha,
    prioridad: z.number().int().min(-1000).max(1000).default(0),
    activo: z.boolean().default(true),
    campaign_id: Uuid.nullable().optional(),
    formato: z.enum(AD_FORMATOS).default("imagen"),
    media: AdMedia.default({}),
  })
  .refine((v) => !v.desde || !v.hasta || v.desde <= v.hasta, { message: "La fecha final debe ser después de la inicial", path: ["hasta"] })
export const AdPatch = z
  .object({
    titulo: z.string().trim().min(2).max(80), texto: z.string().trim().max(220), imagen: z.string().max(500).nullable(), url: AdUrl, cta: z.string().trim().max(30),
    anunciante: z.string().trim().max(60), ubicaciones: z.array(z.enum(AD_SLOT_IDS)).min(1, "Elige al menos una ubicación"), desde: IsoDate.nullable(), hasta: IsoDate.nullable(),
    prioridad: z.number().int().min(-1000).max(1000), activo: z.boolean(), campaign_id: Uuid.nullable(), formato: z.enum(AD_FORMATOS), media: AdMedia,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nada que cambiar")
export const AdsSettingsPatch = z
  .object({ anuncios_adsense_pct: z.number().int().min(0).max(100), anuncios_accion_cada: z.number().int().min(1).max(50), anuncios_modal_horas: z.number().int().min(1).max(720), anuncios_ticker: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nada que cambiar")

export const CampaignRow = z.object({
  id: z.string(), nombre: z.string(), anunciante: z.string(), objetivo: z.string(), estado: z.string(), desde: z.string().nullable(), hasta: z.string().nullable(),
  modelo_cobro: z.string(), tarifa: z.number(), presupuesto: z.number().nullable(), planes: z.array(z.string()), dispositivos: z.array(z.string()),
  frecuencia_max: z.number(), prioridad: z.number(), created_at: z.string(), updated_at: z.string(),
})
export const AdRow = Ad.extend({ created_at: z.string(), updated_at: z.string() })
export const AdEventRow = z.object({ ad_id: z.string(), dia: z.string(), slot: z.string(), vistas: z.number(), clics: z.number(), cierres: z.number() })
export const AdReachRow = z.object({ ad_id: z.string(), alcance: z.number(), vistas: z.number(), clics: z.number() })
export const AdsManager = z.object({ campaigns: z.array(CampaignRow), ads: z.array(AdRow), events: z.array(AdEventRow), reach: z.array(AdReachRow), settings: AdsSettings.nullable() })
export type AdsManager = z.infer<typeof AdsManager>
export const ManagerQuery = z.object({ desde: IsoDate, hasta: IsoDate }).refine((v) => v.desde <= v.hasta, { message: "La fecha final debe ser después de la inicial", path: ["hasta"] })

const IdParams = z.object({ id: Uuid })
const ADMIN_ERR = { ...COMMON_ERRORS, 409: ApiError } as const
const Saved = ApiOk(z.object({ id: z.string() }))
const AA = "/v1/admin/ads"

const c = initContract()
export const adsContract = c.router(
  {
    eligible: {
      method: "GET",
      path: "/v1/books/:bookId/ads/eligible",
      pathParams: BookParams,
      query: EligibleQuery,
      responses: { ...COMMON_ERRORS, 200: Eligible },
      summary: "Anuncio para un espacio (segmentación, frecuencia y prioridad)",
    },
    track: {
      method: "POST", path: "/v1/ads/events", body: AdEvent, responses: { ...COMMON_ERRORS, 200: ApiOk(z.object({})) },
      summary: "Vista, clic o cierre de un anuncio (ad_track; un anuncio pausado o un espacio desconocido no suman)",
    },
    adsense: {
      method: "GET", path: "/v1/public/adsense", responses: { ...COMMON_ERRORS, 200: AdsensePublic },
      summary: "AdSense de la consola: id de cliente, bloque y planes (público, sin secretos)",
    },
    adsTxt: {
      method: "GET", path: "/v1/public/ads.txt", responses: { ...COMMON_ERRORS, 200: c.otherResponse({ contentType: "text/plain", body: z.string() }) },
      summary: "ads.txt de Google AdSense (texto plano)",
    },
    manager: {
      method: "GET", path: AA, query: ManagerQuery, responses: { ...ADMIN_ERR, 200: AdsManager },
      summary: "Consola › Anuncios: campañas, anuncios, métricas por día, alcance y ajustes del rango",
    },
    createCampaign: { method: "POST", path: `${AA}/campaigns`, body: CampaignInput, responses: { ...ADMIN_ERR, 200: Saved }, summary: "Nueva campaña" },
    updateCampaign: { method: "PATCH", path: `${AA}/campaigns/:id`, pathParams: IdParams, body: CampaignPatch, responses: { ...ADMIN_ERR, 200: Saved }, summary: "Editar, activar o pausar una campaña" },
    deleteCampaign: { method: "DELETE", path: `${AA}/campaigns/:id`, pathParams: IdParams, body: c.noBody(), responses: { ...ADMIN_ERR, 200: Saved }, summary: "Borrar una campaña (y sus anuncios)" },
    createAd: { method: "POST", path: `${AA}/items`, body: AdInput, responses: { ...ADMIN_ERR, 200: Saved }, summary: "Nuevo anuncio" },
    updateAd: { method: "PATCH", path: `${AA}/items/:id`, pathParams: IdParams, body: AdPatch, responses: { ...ADMIN_ERR, 200: Saved }, summary: "Editar, activar o pausar un anuncio" },
    duplicateAd: { method: "POST", path: `${AA}/items/:id/duplicate`, pathParams: IdParams, body: c.noBody(), responses: { ...ADMIN_ERR, 200: Saved }, summary: "Duplicar un anuncio («(copia)» en el título)" },
    deleteAd: { method: "DELETE", path: `${AA}/items/:id`, pathParams: IdParams, body: c.noBody(), responses: { ...ADMIN_ERR, 200: Saved }, summary: "Borrar un anuncio (y sus métricas)" },
    saveSettings: { method: "PATCH", path: `${AA}/settings`, body: AdsSettingsPatch, responses: { ...ADMIN_ERR, 200: ApiOk(z.object({})) }, summary: "Ajustes de anuncios (porcentaje de AdSense, cada cuántas acciones, ventana y cinta)" },
  },
  { strictStatusCodes: true },
)
