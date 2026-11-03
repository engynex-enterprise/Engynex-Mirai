// Módulo `feedback` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D → V7-G.
// Opiniones y casos de soporte de la persona (apps/web/features/opiniones/{feedback-dialog,opiniones-view,rating-prompt}.tsx
// y features/ayuda/extras.tsx «Contactar soporte»). La consola (leer, cambiar el estado y responder) ya está en `admin`.
//   POST   /v1/feedback              → enviar una opinión o un caso de soporte (devuelve el id: número de caso)
//   POST   /v1/feedback/rating       → calificar Mirai de 1 a 5 (la tarjeta de Inicio), comentario opcional
//   GET    /v1/me/feedback           → mis opiniones con las respuestas, la más reciente primero
//   DELETE /v1/me/feedback/:feedbackId → borrar una opinión que aún no se revisa (estado «nuevo»)
// La captura la sube antes la web con la URL firmada del módulo `files` (bucket `feedback`, carpeta `<tu id>/`); aquí
// solo llega su ruta, y la API exige que esté en tu carpeta.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import type { Row } from "@mirai/db/tables"
import { ApiError, ApiOk, COMMON_ERRORS, Uuid } from "../common"

export const meta = { id: "feedback", owner: "F2-D" } as const

export const FEEDBACK_TIPOS = ["calificacion", "error", "funcion", "sugerencia", "elogio", "pregunta", "soporte", "otro"] as const
export const FEEDBACK_ESTADOS = ["nuevo", "revisando", "planeado", "hecho", "descartado"] as const

/** Ruta de la captura en el bucket `feedback`: `<id de la persona>/<archivo>.<ext>` (la carpeta la revisa la API). */
export const CapturaPath = z.string().max(200).regex(/^[0-9a-f-]{36}\/[\w-]{1,80}\.[a-z0-9]{1,8}$/, "La captura no es válida. Vuelve a adjuntarla.")
/** Datos técnicos (versión, pantalla, tema, navegador…). Nunca montos: hasta 4.000 caracteres. */
export const Contexto = z.record(z.string(), z.unknown()).refine((v) => JSON.stringify(v).length <= 4000, "Los datos técnicos son demasiado largos")
const Pagina = z.string().max(300).nullable().optional()
const Rating = z.number({ error: "Elige de 1 a 5 estrellas" }).int().min(1, "Elige de 1 a 5 estrellas").max(5, "Elige de 1 a 5 estrellas")

export const NewFeedback = z
  .object({
    tipo: z.enum(FEEDBACK_TIPOS, { error: "Elige de qué se trata tu opinión" }),
    rating: Rating.nullable().optional(),
    mensaje: z.string().max(4000, "Máximo 4.000 caracteres").default(""),
    captura: CapturaPath.nullable().optional(),
    /** Hogar desde el que escribes (la persona debe pertenecer a él). */
    householdId: Uuid.nullable().optional(),
    pagina: Pagina,
    contexto: Contexto.optional(),
  })
  .refine((f) => f.tipo !== "calificacion" || !!f.rating, { message: "Elige de 1 a 5 estrellas", path: ["rating"] })
  .refine((f) => f.tipo === "calificacion" || f.mensaje.trim().length >= 3, { message: "Cuéntanos un poco más (al menos 3 letras)", path: ["mensaje"] })
export type NewFeedback = z.input<typeof NewFeedback>

export const NewRating = z.object({ rating: Rating, mensaje: z.string().max(4000, "Máximo 4.000 caracteres").default(""), householdId: Uuid.nullable().optional(), pagina: Pagina, contexto: Contexto.optional() })

export const FeedbackRow = z.object({
  id: z.string(), user_id: z.string(), household_id: z.string().nullable(), tipo: z.string(), rating: z.number().nullable(), mensaje: z.string(), pagina: z.string().nullable(),
  contexto: z.unknown(), captura: z.string().nullable(), estado: z.string(), respuesta: z.string().nullable(), respondido_at: z.string().nullable(),
  respondido_por: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
}) satisfies z.ZodType<Omit<Row<"feedback">, "contexto"> & { contexto: unknown }>
export type FeedbackRow = z.infer<typeof FeedbackRow>

export const FeedbackParams = z.object({ feedbackId: Uuid })
const ERR = { ...COMMON_ERRORS, 409: ApiError } as const

const c = initContract()
export const feedbackContract = c.router(
  {
    send: {
      method: "POST", path: "/v1/feedback", body: NewFeedback, responses: { ...ERR, 200: ApiOk(z.object({ id: z.string() })) },
      summary: "Enviar una opinión o un caso de soporte (acepta Idempotency-Key)",
      description: "Calificar pide las estrellas; los demás tipos, un mensaje de al menos 3 letras. El `id` es el número de caso (`#` + 6 primeras letras).",
    },
    rating: {
      method: "POST", path: "/v1/feedback/rating", body: NewRating, responses: { ...ERR, 200: ApiOk(z.object({ id: z.string() })) },
      summary: "Calificar Mirai de 1 a 5 estrellas (comentario opcional)",
    },
    mine: { method: "GET", path: "/v1/me/feedback", responses: { ...COMMON_ERRORS, 200: z.array(FeedbackRow) }, summary: "Mis opiniones y casos con sus respuestas (la más reciente primero)" },
    remove: {
      method: "DELETE", path: "/v1/me/feedback/:feedbackId", pathParams: FeedbackParams, body: c.noBody(), responses: { ...ERR, 200: ApiOk(z.object({ id: z.string() })) },
      summary: "Borrar una opinión que aún no revisamos (409 si ya la revisamos)",
    },
  },
  { strictStatusCodes: true },
)
