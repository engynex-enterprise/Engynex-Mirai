// Módulo `google` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-E.
// Conectar Gmail (solo lectura) o Google Calendar, desconectar y llevar los pagos a Calendar. Reemplaza
// apps/web/app/api/google/{connect,callback} y features/correo/actions.ts (googleDisconnect, syncCalendar, calendarStatus).
//
// OAuth sin cookie: `connect-url` firma el `state` con HMAC-SHA256 (GOOGLE_OAUTH_STATE_KEY) con la persona, a dónde
// volver y el vencimiento (10 min); el callback (`GET /v1/google/callback`, público, nueva URI de redirección en Google
// Cloud: <API_PUBLIC_URL>/v1/google/callback) lo verifica, guarda los tokens cifrados y redirige a la web con
// `?google=ok|cancelado|error`. Leer el correo del banco (mail/scan) usa la IA: queda para F2-F.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiError, ApiOk, COMMON_ERRORS, Uuid } from "../common"

export const meta = { id: "google", owner: "F2-E" } as const

export const GoogleService = z.enum(["gmail", "calendar"])
export const ConnectQuery = z.object({
  s: GoogleService.default("gmail"),
  /** Ruta de la web a la que se vuelve (se limpia: solo rutas internas). */
  back: z.string().max(300).optional(),
})
export const ConnectUrl = z.object({ url: z.url() })
export const CalendarStatus = z.object({ conectado: z.boolean(), plan: z.boolean(), eventos: z.number().int().min(0) })
export const CalendarSyncResult = z.object({ msg: z.string(), creados: z.number().int(), actualizados: z.number().int(), borrados: z.number().int(), total: z.number().int() })

const ERR = { ...COMMON_ERRORS, 402: ApiError, 502: ApiError } as const
const book = z.object({ bookId: Uuid })
const c = initContract()

export const googleContract = c.router(
  {
    connectUrl: {
      method: "GET",
      path: "/v1/books/:bookId/google/connect-url",
      pathParams: book,
      query: ConnectQuery,
      responses: { ...ERR, 200: ConnectUrl },
      summary: "URL de consentimiento de Google con state firmado (Premium banco)",
    },
    callback: {
      method: "GET",
      path: "/v1/google/callback",
      query: z.object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() }),
      responses: { 302: c.noBody() },
      summary: "Callback de OAuth (público): guarda los tokens y redirige a la web",
    },
    disconnect: {
      method: "DELETE",
      path: "/v1/google",
      body: c.noBody(),
      responses: { ...ERR, 200: ApiOk(z.object({})) },
      summary: "Desconectar Google (borra los tokens de la persona)",
    },
    calendarSync: {
      method: "POST",
      path: "/v1/books/:bookId/calendar/sync",
      pathParams: book,
      body: c.noBody(),
      responses: { ...ERR, 200: ApiOk(CalendarSyncResult) },
      summary: "Llevar los pagos y cobros de 45 días a Google Calendar (Premium banco)",
    },
    calendarStatus: {
      method: "GET",
      path: "/v1/books/:bookId/calendar/status",
      pathParams: book,
      responses: { ...ERR, 200: CalendarStatus },
      summary: "¿Conectó Calendar? ¿El plan lo incluye? ¿Cuántos eventos lleva Mirai?",
    },
  },
  { strictStatusCodes: true },
)
