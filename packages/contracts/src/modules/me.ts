// Módulo `auth` / `me` (docs/arquitectura/v6-separacion-front-back.md §2.6, F2-B-8). Dueño: F2-B.
// GET /v1/me: contexto de la persona (usuario, hogares, libros, plan y admin). Reemplaza getAppContext (apps/web/lib/dal.ts)
// con la misma forma (AppContext de @mirai/domain/app-context). El libro activo va en `?bookId=` (la cookie mirai-book
// queda solo para el front).
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import type { AppContext as AppContextT } from "@mirai/domain/app-context"
import { ACCESS_ROLES } from "@mirai/domain/household/roles"
import { FEATURE_LIST, type PremiumFeature } from "@mirai/domain/plans"
import { ApiError, ApiOk, COMMON_ERRORS, IsoDate, Uuid } from "../common"

export const meta = { id: "me", owner: "F2-B" } as const

export const AccessRole = z.enum(ACCESS_ROLES)
export const LegacyRole = z.enum(["owner", "editor", "viewer"])
export const PlanInfo = z.object({
  id: z.string(),
  nombre: z.string(),
  features: z.array(z.enum(FEATURE_LIST as [PremiumFeature, ...PremiumFeature[]])),
  ads: z.boolean(),
  limites: z.object({ libros: z.number().optional(), personas: z.number().optional(), automatizaciones: z.number().optional() }),
  pago: z.boolean(),
})
const Household = z.object({ id: z.string(), nombre: z.string(), role: LegacyRole, access: AccessRole })
const Book = z.object({ id: z.string(), nombre: z.string(), tipo: z.string(), icon: z.string() })

export const AppContext = z.object({
  user: z.object({ id: z.string(), email: z.string(), nombre: z.string(), avatar: z.string().nullable(), apodo: z.string(), nacimiento: z.string().nullable() }),
  household: Household,
  households: z.array(Household),
  book: Book,
  books: z.array(Book.extend({ household_id: z.string() })),
  isAdmin: z.boolean(),
  plan: PlanInfo,
}) satisfies z.ZodType<AppContextT>
export type AppContext = z.infer<typeof AppContext>

export const MeQuery = z.object({ bookId: Uuid.optional() })

// ── V7-G: perfil, preferencias, libro activo y lo público de la plataforma ─────────────────────────
// Reemplazan las lecturas y escrituras directas de la web a `profiles` (features/profile/profile-view.tsx,
// agenda/fiscal-calendar.tsx), `user_preferences` (features/settings/prefs.ts), `profiles.last_book_id`
// (components/app/actions.ts › switchBook) y `platform_settings` / `platform_integrations_public`
// (components/app/platform-notice.tsx, settings/tabs/integrations.tsx). Los consentimientos van en el contrato `auth`.
const Txt = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`)
const Json = z.record(z.string(), z.unknown())

export const DOC_TIPOS = ["CC", "CE", "PA", "PPT", "TI", "NIT", "PEP"] as const
export const Direccion = z.object({ dir: Txt(200).optional(), ciudad: Txt(80).optional(), barrio: Txt(80).optional(), depto: Txt(80).optional() }).catchall(Txt(200))

export const Profile = z.object({
  id: z.string(), email: z.string().nullable(), nombre: z.string(), apodo: z.string(), avatar_url: z.string().nullable(), nacimiento: z.string().nullable(),
  doc: z.string(), doc_tipo: z.string(), digitos: z.string(), telefono: z.string(), ciudad: z.string(), direccion: z.unknown(), ocupacion: z.string(),
  trabajo: z.string(), portada: z.string(), riesgo: z.string(), cobro: z.unknown(), last_book_id: z.string().nullable(), created_at: z.string(),
  updated_at: z.string(), deletion_requested_at: z.string().nullable(),
})
export type Profile = z.infer<typeof Profile>

/** Lo que la persona cambia de su perfil (todo opcional). Con cédula (CC) los dígitos DIAN salen del documento. */
export const ProfilePatch = z.object({
  nombre: Txt(80).min(1, "Escribe tu nombre"),
  apodo: Txt(40),
  /** URL https (Google o el bucket avatars) o `mirai:<clave>` de los avatares propios. */
  avatar_url: z.union([z.url({ protocol: /^https$/, error: "La foto debe ser un enlace https" }).max(1000), z.string().regex(/^mirai:[a-z0-9-]{1,60}$/, "Avatar inválido")]).nullable(),
  nacimiento: IsoDate.nullable(),
  doc: Txt(20).regex(/^[0-9A-Za-z.\- ]*$/, "El documento solo lleva números, letras, puntos o guiones"),
  doc_tipo: z.enum(DOC_TIPOS, { error: "Tipo de documento inválido" }),
  digitos: z.string().regex(/^(\d{2})?$/, "Escribe los 2 últimos dígitos"),
  telefono: Txt(30),
  ciudad: Txt(80),
  direccion: Direccion,
  ocupacion: Txt(80),
  trabajo: Txt(80),
  portada: Txt(30).regex(/^[a-z0-9-]*$/, "Portada inválida"),
  riesgo: z.enum(["conservador", "moderado", "arriesgado"], { error: "Perfil de riesgo inválido" }),
  /** Datos para cobrar (lista de @mirai/domain/cobros). */
  cobro: z.array(Json).max(30, "Máximo 30 formas de cobro"),
}).partial().refine((p) => Object.keys(p).length > 0, "No hay nada para guardar")
export type ProfilePatch = z.infer<typeof ProfilePatch>

export const Preferences = z.object({
  user_id: z.string(), theme: z.string(), font_scale: z.string(), dense: z.boolean(), reduce_motion: z.boolean(), sidebar_collapsed: z.boolean(),
  home_view: z.string(), privacy_mode: z.boolean(), privacy_blur_on_leave: z.boolean(), lock_minutes: z.number(), nav_open: z.unknown(),
  chat_pos: z.unknown(), calendar_prefs: z.unknown(), tour_done: z.boolean(), seen_release: z.string().nullable(), extra: z.unknown(), updated_at: z.string().nullable(),
})
export type Preferences = z.infer<typeof Preferences>

export const PreferencesPatch = z.object({
  theme: z.enum(["light", "dark", "system"], { error: "Tema inválido" }),
  font_scale: z.enum(["m", "l", "xl"], { error: "Tamaño de letra inválido" }),
  dense: z.boolean(), reduce_motion: z.boolean(), sidebar_collapsed: z.boolean(),
  home_view: Txt(40).regex(/^[a-z0-9-]+$/, "Vista inválida"),
  privacy_mode: z.boolean(), privacy_blur_on_leave: z.boolean(),
  lock_minutes: z.number().int().min(0, "Mínimo 0").max(240, "Máximo 240 minutos"),
  nav_open: z.record(z.string().max(60), z.boolean()),
  chat_pos: Json.nullable(),
  calendar_prefs: Json,
  tour_done: z.boolean(),
  seen_release: Txt(40).nullable(),
  /** Reemplaza `extra` completo. */
  extra: Json,
  /** Mezcla estas llaves en `extra` (academia, fb_prompt_at…) sin pisar las demás. Gana sobre `extra`. */
  extraPatch: Json,
}).partial().refine((p) => Object.keys(p).length > 0, "No hay nada para guardar")
export type PreferencesPatch = z.infer<typeof PreferencesPatch>

export const ActiveBook = z.object({ bookId: Uuid })

export const PlatformNotice = z.object({ aviso: z.string(), tono: z.enum(["info", "warn", "ok"]) })
/** V7: cliente de AdSense para /ads.txt (público: el mismo id ya sale en el HTML de los anuncios). null = sin anuncios. */
export const PlatformAdsense = z.object({ client: z.string().nullable() })
export const PlatformIntegration = z.object({ kind: z.string(), modo: z.string(), planes: z.array(z.string()) })
/** V7-H2: ¿tu chat de Telegram está vinculado? (telegram_links propio; sin el id del chat). */
export const TelegramStatus = z.object({ linked: z.boolean(), linked_at: z.string().nullable() })


const c = initContract()
export const meContract = c.router(
  {
    get: {
      method: "GET",
      path: "/v1/me",
      query: MeQuery,
      responses: { ...COMMON_ERRORS, 200: AppContext, 404: ApiError },
      summary: "Contexto de la persona: hogares, libros, libro activo, rol, plan y si es admin (antes getAppContext)",
      description: "404 NOT_FOUND con details.redirect = '/bienvenida' si todavía no tiene hogar o libro.",
    },
    setActiveBook: { method: "PUT", path: "/v1/me/active-book", body: ActiveBook, responses: { ...COMMON_ERRORS, 200: ApiOk(ActiveBook) }, summary: "Recuerda el libro activo para tus otros dispositivos (profiles.last_book_id)", description: "La web sigue guardando su cookie mirai-book; esto solo recuerda la elección. 404 si el libro no es tuyo." },
    profile: { method: "GET", path: "/v1/me/profile", responses: { ...COMMON_ERRORS, 200: Profile }, summary: "Tu perfil completo" },
    updateProfile: { method: "PATCH", path: "/v1/me/profile", body: ProfilePatch, responses: { ...COMMON_ERRORS, 200: Profile }, summary: "Cambia campos de tu perfil (con CC los dígitos DIAN salen del documento)" },
    preferences: { method: "GET", path: "/v1/me/preferences", responses: { ...COMMON_ERRORS, 200: Preferences }, summary: "Tus preferencias (o las de por defecto si aún no hay)" },
    updatePreferences: { method: "PATCH", path: "/v1/me/preferences", body: PreferencesPatch, responses: { ...COMMON_ERRORS, 200: Preferences }, summary: "Guarda preferencias (se sincronizan entre dispositivos); `extraPatch` mezcla llaves en `extra`" },
    platformNotice: { method: "GET", path: "/v1/platform/notice", responses: { ...COMMON_ERRORS, 200: PlatformNotice }, summary: "Aviso para todos de la consola (público; vacío = sin aviso)" },
    platformAdsense: { method: "GET", path: "/v1/platform/adsense", responses: { ...COMMON_ERRORS, 200: PlatformAdsense }, summary: "Cliente de AdSense de la consola para /ads.txt (público; null si está apagada o vacía)" },
    platformIntegrations: { method: "GET", path: "/v1/platform/integrations", responses: { ...COMMON_ERRORS, 200: z.array(PlatformIntegration) }, summary: "Integraciones de la plataforma que no están apagadas (modo y planes, sin configuración ni secretos)" },
    telegram: { method: "GET", path: "/v1/me/telegram", responses: { ...COMMON_ERRORS, 200: TelegramStatus }, summary: "Si tu chat de Telegram está vinculado (Ajustes › Alertas)" },
  },
  { strictStatusCodes: true },
)
