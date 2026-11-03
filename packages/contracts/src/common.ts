// Esquemas base de la API (docs/arquitectura/v6-separacion-front-back.md §2.4 y §2.7.2), con mensajes en español.
import { z } from "zod"

/** UUID que genera el navegador (crypto.randomUUID) o la base. */
export const Uuid = z.uuid({ error: "Identificador inválido" })

/** Fecha sin hora, AAAA-MM-DD (como `date` de Postgres). */
export const IsoDate = z.iso.date({ error: "Fecha inválida (usa AAAA-MM-DD)" })

/** Mes, AAAA-MM (periodos de gastos fijos, reportes, fotos del patrimonio). */
export const IsoMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes inválido (usa AAAA-MM)")

/** Valor en pesos (u otra moneda del libro). Número finito; los límites de cada campo van en su esquema. */
export const Money = z.number({ error: "Escribe un valor en números" }).finite("El valor no es un número válido").max(1e15, "El valor es demasiado grande")

/** Códigos de error de la API y su código HTTP (§2.7.2). */
export const API_ERROR_STATUS = {
  ROLE_DENIED: 403,
  PLAN_REQUIRED: 402,
  VALIDATION: 400,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UPSTREAM: 502,
  INTERNAL: 500,
} as const
export type ApiErrorCode = keyof typeof API_ERROR_STATUS
export const ApiErrorCode = z.enum(Object.keys(API_ERROR_STATUS) as [ApiErrorCode, ...ApiErrorCode[]])

/**
 * Error de la API: `msg` siempre es un texto en español para la persona (nunca el error interno).
 * `INTERNAL` lleva el `requestId` para buscarlo en los logs; `details` trae, p. ej., los campos inválidos.
 */
export const ApiError = z.object({
  ok: z.literal(false),
  msg: z.string(),
  code: ApiErrorCode,
  requestId: z.string().optional(),
  details: z.unknown().optional(),
})
export type ApiError = z.infer<typeof ApiError>

/** Respuesta de un comando que salió bien: `{ ok: true, data }`. */
export const ApiOk = <T extends z.ZodType>(data: T) => z.object({ ok: z.literal(true), data })

/** Arma un ApiError (lo usan los filtros de la API y las pruebas). */
export const apiError = (code: ApiErrorCode, msg: string, extra: Pick<ApiError, "requestId" | "details"> = {}): ApiError => ({ ok: false, msg, code, ...extra })
