// Campana de avisos in-app (F2-C-5, parte de `notifications` que es de F2-C). Archivo aparte de notifications.ts para
// no pisar a F2-E (reglas, pruebas, Telegram y push). Misma lectura y marcas de apps/web/components/app/notifications-sheet.tsx:
//   GET   /v1/notifications?bookId=     → las 50 más recientes de la persona (del libro o generales)
//   PATCH /v1/notifications/:id/read    → marcar una como leída
//   POST  /v1/notifications/read-all    → marcar todas como leídas
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import type { Row } from "@mirai/db/tables"
import { ApiError, ApiOk, COMMON_ERRORS, Uuid } from "../common"

export const NotificationRow = z.object({
  id: z.string(),
  user_id: z.string(),
  book_id: z.string().nullable(),
  kind: z.string(),
  titulo: z.string(),
  cuerpo: z.string(),
  href: z.string().nullable(),
  dedupe: z.string().nullable(),
  read_at: z.string().nullable(),
  created_at: z.string(),
}) satisfies z.ZodType<Row<"notifications">>
export type NotificationRow = z.infer<typeof NotificationRow>

export const BellQuery = z.object({
  /** Libro activo: trae sus avisos y los generales (sin libro), como la campana. Sin bookId: todos los tuyos. */
  bookId: Uuid.optional(),
  sinLeer: z.enum(["0", "1"]).optional(),
  limit: z.coerce.number({ error: "Número inválido" }).int().min(1).max(100).optional(),
})
export const IdParams = z.object({ id: Uuid })

const c = initContract()
export const bellContract = c.router(
  {
    list: {
      method: "GET",
      path: "/v1/notifications",
      query: BellQuery,
      responses: { ...COMMON_ERRORS, 200: z.array(NotificationRow) },
      summary: "Avisos de la campana (los 50 más recientes, del libro o generales)",
    },
    read: {
      method: "PATCH",
      path: "/v1/notifications/:id/read",
      pathParams: IdParams,
      body: c.noBody(),
      responses: { ...COMMON_ERRORS, 200: ApiOk(z.object({ id: z.string(), read_at: z.string() })), 404: ApiError },
      summary: "Marcar un aviso como leído",
    },
    readAll: {
      method: "POST",
      path: "/v1/notifications/read-all",
      body: c.noBody(),
      responses: { ...COMMON_ERRORS, 200: ApiOk(z.object({ marcadas: z.number() })) },
      summary: "Marcar todos tus avisos como leídos",
    },
  },
  { strictStatusCodes: true },
)
