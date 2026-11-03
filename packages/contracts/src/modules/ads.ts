// Módulo `ads` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-C (lectura).
// GET /v1/books/:bookId/ads/eligible → usePick/useAdsData de apps/web/features/ads/ad-slot.tsx: anuncios vigentes del
// espacio con la segmentación de la campaña (plan del hogar del libro, dispositivo y frecuencia diaria) y el mismo
// sorteo estable por persona y día (@mirai/domain/ads). Va por libro (no en /v1/ads/eligible) porque la segmentación usa
// el plan del hogar del libro activo, igual que la web. Los eventos (`ad_track`) y AdSense quedan para el siguiente paso.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import type { AdSlotId } from "@mirai/domain/ads"
import { COMMON_ERRORS, IsoDate, Uuid } from "../common"

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
})
export type Eligible = z.infer<typeof Eligible>

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
  },
  { strictStatusCodes: true },
)
