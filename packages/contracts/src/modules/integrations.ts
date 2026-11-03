// Módulo `integrations` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-E.
// Integraciones del hogar (hoy solo la IA: Ajustes › Inteligencia artificial). El resto (correo, WhatsApp, Telegram,
// push, datos, Google) lo administra Mirai en consola › Integraciones globales (F2-I). Nunca se devuelven secretos:
// solo `integrations_public` (máscaras ••••1234) y el registro único (@mirai/services/integrations/registry).
//
// Rutas bajo el libro (BookGuard da el hogar, el rol fino y el plan), en vez de /v1/households/:h: hoy no hay una
// guarda de hogar y la web siempre opera sobre el hogar del libro activo. Probar la conexión y listar modelos quedan
// para F2-F (usan el AI SDK de lib/ai).
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiError, ApiOk, COMMON_ERRORS, Uuid } from "../common"

export const meta = { id: "integrations", owner: "F2-E" } as const

const Kind = z.string().regex(/^[a-z0-9_]{2,40}$/, "Integración desconocida")

/** Fila pública (sin secretos) de una integración del hogar. */
export const IntegrationPublic = z.object({
  kind: z.string(),
  enabled: z.boolean(),
  /** Campos que no son secretos (modelo, proveedor…). */
  config: z.record(z.string(), z.unknown()),
  /** Máscaras de los secretos (••••1234) y el resultado de la última prueba. */
  meta: z.record(z.string(), z.unknown()),
  updated_at: z.string().nullable(),
})
export type IntegrationPublic = z.infer<typeof IntegrationPublic>

export const IntegrationList = z.object({
  /** Integraciones que el hogar puede configurar (CLIENT_INTEGRATIONS del registro). */
  kinds: z.array(z.string()),
  items: z.array(IntegrationPublic),
})

export const IntegrationSave = z.object({
  /** Valores por campo del registro. Un secreto vacío conserva el guardado. */
  values: z.record(z.string().max(60), z.union([z.string().max(4000), z.number(), z.boolean()])),
  enabled: z.boolean().optional(),
})
export const IntegrationToggle = z.object({ enabled: z.boolean() })

/** Errores de estas rutas: los comunes + 409 (no se puede apagar) y 502 (proveedor). */
const ERR = { ...COMMON_ERRORS, 409: ApiError, 502: ApiError } as const

const c = initContract()
const params = z.object({ bookId: Uuid, kind: Kind })

export const integrationsContract = c.router(
  {
    list: {
      method: "GET",
      path: "/v1/books/:bookId/integrations",
      pathParams: z.object({ bookId: Uuid }),
      responses: { ...ERR, 200: IntegrationList },
      summary: "Integraciones del hogar (con máscara, sin secretos)",
    },
    save: {
      method: "PUT",
      path: "/v1/books/:bookId/integrations/:kind",
      pathParams: params,
      body: IntegrationSave,
      responses: { ...ERR, 200: ApiOk(z.object({ kind: z.string() })) },
      summary: "Guardar (y activar) una integración del hogar",
    },
    toggle: {
      method: "PATCH",
      path: "/v1/books/:bookId/integrations/:kind",
      pathParams: params,
      body: IntegrationToggle,
      responses: { ...ERR, 200: ApiOk(z.object({ kind: z.string(), enabled: z.boolean() })) },
      summary: "Prender o apagar una integración del hogar",
    },
    remove: {
      method: "DELETE",
      path: "/v1/books/:bookId/integrations/:kind",
      pathParams: params,
      body: c.noBody(),
      responses: { ...ERR, 200: ApiOk(z.object({ kind: z.string() })) },
      summary: "Quitar una integración del hogar",
    },
  },
  { strictStatusCodes: true },
)
