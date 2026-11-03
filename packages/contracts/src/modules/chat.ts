// Módulo `chat` (docs/arquitectura/v6-separacion-front-back.md §2.6, §2.7.11 y F2-F). Dueño: F2-F.
// Chat de Mirai (burbuja y /consejero): mensajes en streaming NDJSON, hilos, propuestas (confirmar/cancelar), adjuntos,
// título, duplicar, detalles y sugerencias. El motor vive en @mirai/ai (server/chat-turn y server/chat-actions), el mismo
// que usa la web (app/api/chat y features/chat/actions.ts).
//
// Streaming (`send`): `content-type: application/x-ndjson`, un ChatEvent por línea (thread → user → tool* → card* →
// delta* → done | error), como features/chat/store.ts ya lo consume. La API agrega `{"t":"ping"}` cada 15 s (latido para
// Cloud Run; el cliente lo ignora) y corta la respuesta si la persona cierra la conexión (se guarda lo que alcanzó a
// llegar con `detenido`). No es SSE: EventSource no permite POST ni Authorization.
//
// Hilos: la web los lee y cambia directo con RLS ("chat propio"); aquí están las mismas operaciones para F2-H.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import type { ChatEvent as ChatEventT, ChatHints, ChatMsg, ChatThread, Consulta, Propuesta } from "../chat-types"
import { ApiError, ApiOk, COMMON_ERRORS, Uuid } from "../common"

export const meta = { id: "chat", owner: "F2-F" } as const

/** Cuerpo de un mensaje (mismo de app/api/chat/route.ts). */
export const ChatBody = z.object({
  threadId: z.string().uuid().nullable().optional(),
  text: z.string().max(4000).default(""),
  tono: z.enum(["simple", "fin"]).default("simple"),
  /** Id de la respuesta a regenerar (se borra y se responde de nuevo el último mensaje de la persona). */
  regenerate: z.string().uuid().optional(),
  /** Id del mensaje de la persona que se editó (se borra desde ahí y se envía el texto nuevo). */
  editId: z.string().uuid().optional(),
})
export type ChatBody = z.input<typeof ChatBody>

export const ChatMsgSchema = z.custom<ChatMsg>().describe("ChatMsg de @mirai/contracts/chat-types")
export const PropuestaSchema = z.custom<Propuesta>().describe("Propuesta de @mirai/contracts/chat-types")
export const ConsultaSchema = z.custom<Consulta>().describe("Consulta del consejero (@mirai/contracts/chat-types)")
export const ChatThreadSchema = z.custom<ChatThread>().describe("ChatThread de @mirai/contracts/chat-types")

/** Una línea del streaming. Mismo tipo que @mirai/contracts/chat-types › ChatEvent, más el latido de la API. */
export const ChatEvent = z.discriminatedUnion("t", [
  z.object({ t: z.literal("thread"), id: z.string(), titulo: z.string(), nuevo: z.boolean() }),
  z.object({ t: z.literal("user"), msg: ChatMsgSchema }),
  z.object({ t: z.literal("tool"), label: z.string() }),
  z.object({ t: z.literal("delta"), text: z.string() }),
  z.object({ t: z.literal("card"), propuesta: PropuestaSchema.optional(), decision: ConsultaSchema.optional() }),
  z.object({ t: z.literal("done"), msg: ChatMsgSchema }),
  z.object({ t: z.literal("error"), msg: z.string() }),
  z.object({ t: z.literal("ping") }),
])
export type ChatStreamEvent = ChatEventT | { t: "ping" }
export const NDJSON = "application/x-ndjson; charset=utf-8"
/** Latido del streaming (ms). */
export const CHAT_PING_MS = 15_000

export const ChatHintsSchema = z.custom<ChatHints>().describe("ChatHints: nombre, rol, banderas del libro y estado de la IA")
export const ThreadInfo = z.object({ mensajes: z.number().int(), preguntas: z.number().int(), creditos: z.number(), algoritmo: z.number().int() })
export const ConfirmData = z.object({ msg: z.string(), href: z.string(), tablas: z.array(z.string()), propuesta: PropuestaSchema })
export const ThreadPatch = z
  .object({
    titulo: z.string().trim().min(1, "Escribe un nombre").max(80, "Máximo 80 caracteres").optional(),
    fijado: z.boolean().optional(),
    archivado: z.boolean().optional(),
  })
  .refine((p) => p.titulo !== undefined || p.fijado !== undefined || p.archivado !== undefined, "Nada que cambiar")

/**
 * Adjunto (foto o PDF, hasta 6 MB): `fileId` = ruta en el bucket `attachments` (`<bookId>/…`, subido con la URL firmada
 * de `files`, F2-D-2) o, como camino de compatibilidad, el archivo en base64 en el cuerpo (bodyLimit de 8 MB).
 */
export const FileRef = z.union([
  z.object({ fileId: z.string().min(3).max(500), name: z.string().max(200).optional() }),
  z.object({ name: z.string().min(1).max(200), type: z.string().min(3).max(100), data: z.string().min(1).max(8_400_000, "El archivo pesa más de 6 MB.") }),
])
export type FileRef = z.infer<typeof FileRef>
export const AttachBody = z.object({ file: FileRef, text: z.string().max(1000).optional(), threadId: Uuid.nullable().optional() })
export const AttachData = z.object({ threadId: z.string(), titulo: z.string(), nuevo: z.boolean(), user: ChatMsgSchema, answer: ChatMsgSchema })

// V7-G (E15): calificar una respuesta, buscar en las conversaciones y contar los hilos (lo que hooks.ts hacía directo).
export const MessageRating = z.object({ feedback: z.union([z.literal(1), z.literal(-1), z.null()], { error: "Califica con 1 (buena) o -1 (mala), o null para quitarla" }) })
export const ChatSearchQuery = z.object({ q: z.string().trim().min(3, "Escribe al menos 3 letras para buscar").max(100, "Máximo 100 caracteres") })

const ERR = { ...COMMON_ERRORS, 402: ApiError, 409: ApiError, 502: ApiError } as const
const book = z.object({ bookId: Uuid })
const thread = z.object({ bookId: Uuid, threadId: Uuid })
const prop = z.object({ bookId: Uuid, messageId: Uuid, propId: Uuid })
const msg = z.object({ bookId: Uuid, messageId: Uuid })
const c = initContract()

export const chatContract = c.router(
  {
    send: {
      method: "POST",
      path: "/v1/books/:bookId/chat/messages",
      pathParams: book,
      body: ChatBody,
      responses: { ...ERR, 200: c.otherResponse({ contentType: "application/x-ndjson", body: z.string().describe("Un ChatEvent (JSON) por línea") }) },
      summary: "Enviar un mensaje y recibir la respuesta en streaming NDJSON (límite `chat`)",
    },
    hints: {
      method: "GET",
      path: "/v1/books/:bookId/chat/hints",
      pathParams: book,
      responses: { ...ERR, 200: ChatHintsSchema },
      summary: "Nombre, rol, banderas del libro y estado de la IA (créditos) para la pantalla del chat",
    },
    threads: {
      method: "GET",
      path: "/v1/books/:bookId/chat/threads",
      pathParams: book,
      query: z.object({ archivados: z.enum(["0", "1"]).optional(), limit: z.coerce.number().int().min(1).max(500).optional() }),
      responses: { ...ERR, 200: z.object({ items: z.array(ChatThreadSchema) }) },
      summary: "Conversaciones propias del libro (la más reciente primero)",
    },
    messages: {
      method: "GET",
      path: "/v1/books/:bookId/chat/threads/:threadId/messages",
      pathParams: thread,
      responses: { ...ERR, 200: z.object({ items: z.array(ChatMsgSchema) }) },
      summary: "Mensajes de una conversación",
    },
    patchThread: {
      method: "PATCH",
      path: "/v1/books/:bookId/chat/threads/:threadId",
      pathParams: thread,
      body: ThreadPatch,
      responses: { ...ERR, 200: ApiOk(z.object({ id: z.string() })) },
      summary: "Renombrar, fijar o archivar una conversación",
    },
    deleteThread: {
      method: "DELETE",
      path: "/v1/books/:bookId/chat/threads/:threadId",
      pathParams: thread,
      body: c.noBody(),
      responses: { ...ERR, 200: ApiOk(z.object({ id: z.string() })) },
      summary: "Borrar una conversación (borrado lógico; se puede deshacer con restore)",
    },
    restoreThread: {
      method: "POST",
      path: "/v1/books/:bookId/chat/threads/:threadId/restore",
      pathParams: thread,
      body: c.noBody(),
      responses: { ...ERR, 200: ApiOk(z.object({ id: z.string() })) },
      summary: "Deshacer el borrado de una conversación",
    },
    duplicate: {
      method: "POST",
      path: "/v1/books/:bookId/chat/threads/:threadId/duplicate",
      pathParams: thread,
      body: c.noBody(),
      responses: { ...ERR, 200: ApiOk(z.object({ id: z.string(), titulo: z.string() })) },
      summary: "Copiar una conversación con sus mensajes",
    },
    title: {
      method: "POST",
      path: "/v1/books/:bookId/chat/threads/:threadId/title",
      pathParams: thread,
      body: c.noBody(),
      responses: { ...ERR, 200: ApiOk(z.object({ titulo: z.string(), fuente: z.enum(["ia", "algoritmo"]) })) },
      summary: "Título nuevo (IA con el modelo barato si se puede; si no, algoritmo)",
    },
    info: {
      method: "GET",
      path: "/v1/books/:bookId/chat/threads/:threadId/info",
      pathParams: thread,
      responses: { ...ERR, 200: ThreadInfo },
      summary: "Mensajes, preguntas y créditos de IA de una conversación",
    },
    confirm: {
      method: "POST",
      path: "/v1/books/:bookId/chat/messages/:messageId/proposals/:propId/confirm",
      pathParams: prop,
      body: c.noBody(),
      responses: { ...ERR, 200: ApiOk(ConfirmData) },
      summary: "Confirmar una propuesta: recién aquí se escribe en el libro (permiso según el tipo)",
    },
    cancel: {
      method: "POST",
      path: "/v1/books/:bookId/chat/messages/:messageId/proposals/:propId/cancel",
      pathParams: prop,
      body: c.noBody(),
      responses: { ...ERR, 200: ApiOk(z.object({ propuesta: PropuestaSchema })) },
      summary: "Cancelar una propuesta (no escribe nada)",
    },
    attach: {
      method: "POST",
      path: "/v1/books/:bookId/chat/attachments",
      pathParams: book,
      body: AttachBody,
      responses: { ...ERR, 200: ApiOk(AttachData) },
      summary: "Leer una foto o PDF en el chat (factura → propuesta de gasto; comprobante o préstamo → resumen). Límite `chatAdjunto`",
    },
    rateMessage: {
      method: "POST",
      path: "/v1/books/:bookId/chat/messages/:messageId/rating",
      pathParams: msg,
      body: MessageRating,
      responses: { ...ERR, 200: ApiOk(z.object({ id: z.string(), feedback: z.number().nullable() })) },
      summary: "Calificar una respuesta de Mirai (👍 1, 👎 -1 o null para quitarla). Solo en tus conversaciones",
    },
    search: {
      method: "GET",
      path: "/v1/books/:bookId/chat/search",
      pathParams: book,
      query: ChatSearchQuery,
      responses: { ...ERR, 200: z.object({ threadIds: z.array(z.string()) }) },
      summary: "Conversaciones propias cuyo texto contiene la búsqueda (hasta 80 mensajes)",
    },
    threadsCount: {
      method: "GET",
      path: "/v1/books/:bookId/chat/threads/count",
      pathParams: book,
      responses: { ...ERR, 200: z.object({ total: z.number() }) },
      summary: "Cuántas conversaciones tienes en el libro (incluye archivadas y borradas, como el conteo de logros)",
    },
  },
  { strictStatusCodes: true },
)
