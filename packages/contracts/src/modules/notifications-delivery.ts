// Parte de F2-E del módulo `notifications` (docs/arquitectura/v6-separacion-front-back.md §2.6): reglas de aviso de la
// persona, canales que Mirai ofrece, pruebas, "resumen ahora", ventanas al abrir la app, Telegram, push y el
// recordatorio de cobro por WhatsApp. La campana (GET /v1/notifications, PATCH …/read) es de F2-C
// (notifications-bell.ts). Reemplaza apps/web/features/notify/actions.ts y las escrituras del navegador en
// notification_rules y push_subscriptions. El código de los envíos vive en @mirai/services/notify (igual que en la web).
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiError, ApiOk, COMMON_ERRORS, Uuid } from "../common"

/** Canales externos (la campana "app" no se prueba ni se envía a pedido). */
export const Canal = z.enum(["email", "telegram", "push", "whatsapp"], { error: "Canal desconocido." })
export type Canal = z.infer<typeof Canal>

const Hora = z.number().int().min(0).max(23)
const Bools = z.record(z.string().max(30), z.boolean())

/** Regla de avisos de la persona en el libro (notification_rules), como la guarda la base. `last_sent` lo escribe solo el servidor. */
export const NotificationRule = z.object({
  user_id: Uuid,
  book_id: Uuid,
  /** Aviso × canal (Ajustes › Alertas). */
  matriz: z.record(z.string(), z.record(z.string(), z.boolean())),
  /** Interruptor general de cada canal (+ popup y gcal). */
  canales: z.record(z.string(), z.boolean()),
  hora: z.number(),
  frecuencia: z.string(),
  silencio: z.object({ on: z.boolean().optional(), desde: z.number().optional(), hasta: z.number().optional() }),
  ocultar_montos: z.boolean(),
  email_to: z.string().nullable(),
  whatsapp_to: z.string().nullable(),
  last_sent: z.record(z.string(), z.string()),
  /** Interruptores de cada tipo de aviso de esta persona (sobre los del libro). */
  notif: z.record(z.string(), z.boolean()).nullable().optional(),
})
export type NotificationRule = z.infer<typeof NotificationRule>

/** Lo que la persona cambia (todo opcional). */
export const NotificationRuleUpsert = z.object({
  matriz: z.record(z.string().max(30), Bools),
  canales: Bools,
  hora: Hora,
  frecuencia: z.enum(["diario", "semanal", "nunca"], { error: "Frecuencia inválida" }),
  silencio: z.object({ on: z.boolean().optional(), desde: Hora.optional(), hasta: Hora.optional() }),
  ocultar_montos: z.boolean(),
  /** Vacío = el correo de la cuenta. */
  email_to: z.union([z.email({ error: "Escribe un correo válido" }).max(200), z.literal("")]).nullable(),
  whatsapp_to: z.string().max(30).nullable(),
  notif: Bools.nullable(),
}).partial()
export type NotificationRuleUpsert = z.infer<typeof NotificationRuleUpsert>

export const ChannelStatus = z.object({ email: z.boolean(), telegram: z.boolean(), whatsapp: z.boolean(), push: z.boolean() })
export const SendResult = z.object({ msg: z.string() })
export const Popup = z.object({ id: z.string(), t: z.string(), b: z.string(), go: z.string(), lvl: z.string() })
export const CobroWaStatus = z.object({ disponible: z.boolean(), verificado: z.boolean(), motivo: z.string().optional() })
export const CobroWaInput = z.object({
  loanId: Uuid,
  consentimiento: z.literal(true, { error: "Confirma que la persona aceptó recibir el recordatorio por WhatsApp." }),
})
export const PushSubscriptionInput = z.object({
  endpoint: z.url({ error: "Suscripción inválida" }).max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(8).max(100) }),
  userAgent: z.string().max(200).optional(),
})
export const PushUnsubscribeInput = z.object({ endpoint: z.url().max(1000) })

/** Errores de estas rutas: los comunes + 409 (ya se envió hoy) y 502 (el proveedor rechazó el envío). */
const ERR = { ...COMMON_ERRORS, 409: ApiError, 502: ApiError } as const
const book = z.object({ bookId: Uuid })
const c = initContract()

export const notifyDeliveryContract = c.router(
  {
    getMyRule: { method: "GET", path: "/v1/books/:bookId/notification-rules/me", pathParams: book, responses: { ...ERR, 200: NotificationRule }, summary: "Mi regla de avisos en el libro (o la de por defecto)" },
    putMyRule: { method: "PUT", path: "/v1/books/:bookId/notification-rules/me", pathParams: book, body: NotificationRuleUpsert, responses: { ...ERR, 200: NotificationRule }, summary: "Guardar mi regla de avisos" },
    channels: { method: "GET", path: "/v1/books/:bookId/notifications/channels", pathParams: book, responses: { ...ERR, 200: ChannelStatus }, summary: "Canales que Mirai ofrece al hogar" },
    test: { method: "POST", path: "/v1/books/:bookId/notifications/test", pathParams: book, body: z.object({ canal: Canal }), responses: { ...ERR, 200: ApiOk(SendResult) }, summary: "Enviarme una prueba (límite pruebaAviso)" },
    digestNow: { method: "POST", path: "/v1/books/:bookId/notifications/digest-now", pathParams: book, body: z.object({ canal: Canal }), responses: { ...ERR, 200: ApiOk(SendResult) }, summary: "Enviar el resumen ahora (límite pruebaAviso)" },
    open: { method: "POST", path: "/v1/books/:bookId/notifications/open", pathParams: book, body: c.noBody(), responses: { ...ERR, 200: z.array(Popup) }, summary: "Al abrir la app: llena la campana y devuelve los avisos urgentes" },
    telegramLink: { method: "POST", path: "/v1/books/:bookId/telegram/link", pathParams: book, body: c.noBody(), responses: { ...ERR, 200: ApiOk(z.object({ url: z.url() })) }, summary: "Enlace t.me/<bot>?start=<código>" },
    telegramConfirm: { method: "POST", path: "/v1/books/:bookId/telegram/confirm", pathParams: book, body: c.noBody(), responses: { ...ERR, 200: ApiOk(SendResult) }, summary: "Busca el /start y guarda el chat" },
    telegramUnlink: { method: "DELETE", path: "/v1/books/:bookId/telegram", pathParams: book, body: c.noBody(), responses: { ...ERR, 200: ApiOk(z.object({})) }, summary: "Desvincular Telegram" },
    cobroWaStatus: { method: "GET", path: "/v1/books/:bookId/notifications/cobro-whatsapp", pathParams: book, responses: { ...ERR, 200: CobroWaStatus }, summary: "¿Se puede enviar el recordatorio de cobro desde el número de Mirai?" },
    cobroWaSend: { method: "POST", path: "/v1/books/:bookId/notifications/cobro-whatsapp", pathParams: book, body: CobroWaInput, responses: { ...ERR, 200: ApiOk(SendResult) }, summary: "Recordatorio de cobro por WhatsApp (plantilla propia aprobada; límite cobroWa)" },
    pushSubscribe: { method: "PUT", path: "/v1/push/subscriptions", body: PushSubscriptionInput, responses: { ...ERR, 200: ApiOk(z.object({})) }, summary: "Guardar la suscripción push de este dispositivo" },
    pushUnsubscribe: { method: "DELETE", path: "/v1/push/subscriptions", body: PushUnsubscribeInput, responses: { ...ERR, 200: ApiOk(z.object({})) }, summary: "Quitar la suscripción push de este dispositivo" },
  },
  { strictStatusCodes: true },
)
