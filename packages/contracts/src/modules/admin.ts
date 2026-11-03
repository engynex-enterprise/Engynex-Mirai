// Módulo `admin console` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-I.
// Consola de la plataforma: SOLO administradores (@PlatformAdmin en la API) y cada comando queda en `admin_audit`.
// Equivale a features/admin/server.ts y features/admin/actions.ts de apps/web.
//
// PRIVACIDAD: ningún DTO de este archivo lleva montos ni movimientos de los hogares (gastos, ingresos, saldos,
// cupos…). Lo único con plata es lo que los hogares le pagan a Mirai (plan, MRR, `monto` de plan_payments), que es
// información de la plataforma. Lo revisa la prueba `admin-privacy` de apps/api.
//
// Pendientes (dependen de módulos de otros frentes): integraciones globales (F2-E-1: registro y store), uso de IA
// (F2-F-1: lib/ai/credits y pricing) y WhatsApp (F2-E-2: lib/notify/*).
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiError, ApiOk, COMMON_ERRORS, IsoDate, Uuid } from "../common"
import { Msg } from "./households"

export const meta = { id: "admin", owner: "F2-I" } as const

export const ADMIN_ERRORS = { ...COMMON_ERRORS, 409: ApiError, 502: ApiError } as const

const PlanId = z.string().regex(/^[a-z0-9-]{2,30}$/, "Plan inválido")
export const UserParams = z.object({ userId: Uuid })
export const HouseholdParams = z.object({ householdId: Uuid })
const Done = ApiOk(Msg)

// ── Lecturas ──────────────────────────────────────────────────────────────────────────────────────────────────

export const RatingStats = z.object({ avg: z.number(), count: z.number(), dist: z.array(z.number()) })
export const Overview = z.object({
  personas: z.number(), nuevos7: z.number(), nuevos30: z.number(), activos7: z.number(), activos30: z.number(),
  hogares: z.number(), libros: z.number(), acciones30: z.number(),
  byDay: z.array(z.object({ d: z.string(), acciones: z.number(), personas: z.number() })),
  porSeccion: z.array(z.object({ tabla: z.string(), n: z.number() })),
  rating: RatingStats, opinionesNuevas: z.number(), erroresAbiertos: z.number(),
})
export type Overview = z.infer<typeof Overview>

export const Client = z.object({
  id: z.string(), email: z.string(), nombre: z.string(), avatar: z.string().nullable(), telefono: z.string(),
  creado: z.string(), ultimoIngreso: z.string().nullable(), acceso: z.string(), hogares: z.array(z.string()),
  plan: z.enum(["Premium", "Gratis"]), premiumHasta: z.string().nullable(), hogarPropio: z.string().nullable(), acciones30: z.number(),
})

/** Pago de un hogar a Mirai (ingreso de la plataforma, no finanzas del hogar). */
export const PlanPayment = z.object({
  id: z.string(), household_id: z.string().nullable(), plan: z.string().nullable(), proveedor: z.string(), referencia: z.string(), periodo: z.string().nullable(),
  monto: z.number(), estado: z.string(), metodo: z.string().nullable(), paid_at: z.string().nullable(), created_at: z.string(), factura_ref: z.string().nullable().optional(), cupon: z.string().nullable().optional(),
  pagador: z.string().nullable().optional(),
})
export const PlanSubscription = z.object({
  id: z.string(), household_id: z.string(), plan: z.string(), periodo: z.string(), estado: z.string(), proveedor: z.string(), vence_at: z.string().nullable(), nota: z.string().nullable(), created_at: z.string(),
  proveedor_ref: z.string().nullable().optional(), created_by: z.string().nullable().optional(), updated_at: z.string().optional(),
})
export const FeedbackRow = z.object({ id: z.string(), tipo: z.string(), rating: z.number().nullable(), mensaje: z.string(), estado: z.string(), created_at: z.string() })
export const AdminNote = z.object({ id: z.string(), texto: z.string(), autor: z.string().nullable(), created_at: z.string() })

export const UserDetail = z.object({
  id: z.string(), email: z.string(), creado: z.string(), ultimoIngreso: z.string().nullable(), confirmado: z.boolean(), acceso: z.string(),
  suspendido: z.boolean(), mfa: z.boolean(), terminos: z.string(), isAdmin: z.boolean(),
  perfil: z.object({
    nombre: z.string().nullable(), apodo: z.string().nullable(), email: z.string().nullable(), telefono: z.string().nullable(), ciudad: z.string().nullable(), doc_tipo: z.string().nullable(),
    /** Solo los 4 últimos dígitos. */
    doc: z.string(), trabajo: z.string().nullable(), ocupacion: z.string().nullable(), avatar_url: z.string().nullable(), created_at: z.string().nullable(), deletion_requested_at: z.string().nullable(),
  }).nullable(),
  hogares: z.array(z.object({ id: z.string(), nombre: z.string(), rol: z.string(), creado: z.string().nullable(), plan: z.string(), integrantes: z.number(), libros: z.array(z.string()) })),
  suscripciones: z.array(PlanSubscription),
  pagos: z.array(PlanPayment),
  actividad: z.object({ total30: z.number(), porTabla: z.array(z.tuple([z.string(), z.number()])), ultimas: z.array(z.object({ tabla: z.string(), accion: z.string(), created_at: z.string() })) }),
  opiniones: z.array(FeedbackRow),
  notas: z.array(AdminNote),
})
export type UserDetail = z.infer<typeof UserDetail>

export const AdminHousehold = z.object({
  id: z.string(), nombre: z.string(), creado: z.string(), integrantes: z.number(), libros: z.number(),
  dueno: z.object({ id: z.string(), nombre: z.string(), email: z.string() }).nullable(),
  plan: z.string(), vence: z.string().nullable(), proveedor: z.string().nullable(), acciones30: z.number(),
})
export const AdminSubscription = PlanSubscription.extend({ hogar: z.string(), vigente: z.boolean() })
export const Revenue = z.object({
  mrr: z.number(), pagando: z.number(), cortesia: z.number(),
  porProveedor: z.array(z.object({ p: z.enum(["mercadopago", "wompi"]), n: z.number() })),
  ingresosMes: z.number(), pagosMes: z.number(), ingresosTotal: z.number(), rechazadosMes: z.number(), canceladasMes: z.number(),
  pagos: z.array(PlanPayment.extend({ hogar: z.string() })),
})
export const PlatformAdminRow = z.object({ user_id: z.string(), created_at: z.string(), perfil: z.object({ id: z.string(), nombre: z.string().nullable(), email: z.string().nullable(), avatar_url: z.string().nullable() }).nullable() })
export const AuditRow = z.object({ id: z.number(), actor: z.string().nullable(), accion: z.string(), objetivo: z.string().nullable(), detalle: z.unknown(), created_at: z.string(), quien: z.string() })
export const SystemInfo = z.object({
  settings: z.record(z.string(), z.unknown()).nullable(),
  migraciones: z.array(z.object({ name: z.string(), applied_at: z.string() })),
  huerfanos: z.number(), referidos: z.number(), premiados: z.number(),
  estado: z.array(z.object({ k: z.string(), ok: z.boolean() })),
  ambiente: z.string(), rama: z.string(), commit: z.string(),
})
export const AdminFeedback = z.object({
  id: z.string(), user_id: z.string(), household_id: z.string().nullable(), tipo: z.string(), rating: z.number().nullable(), mensaje: z.string(), estado: z.string(), pagina: z.string().nullable(),
  captura: z.string().nullable(), contexto: z.unknown(), respuesta: z.string().nullable(), respondido_at: z.string().nullable(), respondido_por: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
  autor: z.object({ id: z.string(), nombre: z.string().nullable(), email: z.string().nullable(), avatar_url: z.string().nullable() }).nullable(),
  capturaUrl: z.string().nullable(),
})
export const NotifyLogRow = z.object({
  id: z.number(), user_id: z.string().nullable(), household_id: z.string().nullable(), book_id: z.string().nullable(), channel: z.string(), kind: z.string(), provider: z.string().nullable(), source: z.string().nullable(),
  status: z.string(), destino: z.string().nullable(), error: z.string().nullable(), ref: z.string().nullable(), dedupe: z.string().nullable(), created_at: z.string(), quien: z.string(),
})

// ── Comandos ──────────────────────────────────────────────────────────────────────────────────────────────────

export const SetSuspended = z.object({ suspend: z.boolean() })
export const RecoveryLink = z.object({ sent: z.boolean(), link: z.string().optional(), msg: z.string() })
export const SetPlatformAdmin = z.object({ on: z.boolean() })
export const DeleteUser = z.object({ confirmEmail: z.string().max(320) })
export const AddNote = z.object({ texto: z.string().trim().min(1, "Escribe la nota").max(2000) })
export const InviteUser = z.object({ email: z.email("Correo inválido"), nombre: z.string().trim().max(80) })
export const AssignPlan = z.object({ plan: PlanId, hasta: IsoDate, nota: z.string().trim().max(200) })
export const GrantPremium = z.object({ hasta: IsoDate, nota: z.string().trim().max(200) })
export const UpdateSubscription = z.object({
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("extender"), dias: z.number().int().min(1).max(3650) }),
    z.object({ kind: z.literal("plan"), plan: PlanId }),
    z.object({ kind: z.literal("cancelar") }),
    z.object({ kind: z.literal("terminar") }),
  ]),
})
export const ManualPayment = z.object({ householdId: Uuid, plan: PlanId, periodo: z.enum(["mes", "anio"]), monto: z.number().int().min(0).max(100_000_000), nota: z.string().trim().max(300) })
export const UpdatePayment = z.object({ estado: z.enum(["reembolsado", "anulado"]).optional(), factura_ref: z.string().trim().max(80).optional(), nota: z.string().trim().max(300).optional() })
export const Broadcast = z.object({
  titulo: z.string().trim().min(2).max(120), cuerpo: z.string().trim().max(1000), href: z.string().trim().max(200),
  segmento: z.string().regex(/^(todos|admins|plan:[a-z0-9-]{2,30})$/, "Segmento inválido"), correo: z.boolean(),
})
export const BroadcastSent = z.object({ personas: z.number(), correos: z.number(), msg: z.string() })
export const AddAdmin = z.object({ email: z.email("Correo inválido") })
export const SaveSettings = z.object({
  aviso_global: z.string().trim().max(300).optional(), aviso_tono: z.enum(["info", "warn", "ok"]).optional(), registro_abierto: z.boolean().optional(), limites_db: z.boolean().optional(), premium_db: z.boolean().optional(),
  referidos_activo: z.boolean().optional(), referidos_plan: PlanId.optional(), referidos_dias: z.number().int().min(1).max(365).optional(),
})
export const UpdateFeedback = z.object({ estado: z.enum(["nuevo", "revisando", "planeado", "hecho", "descartado"]).optional(), respuesta: z.string().trim().max(4000).optional() })
export const TestDefaults = z.object({ email: z.string(), whatsapp: z.string() })

const A = "/v1/admin"
const c = initContract()
export const adminContract = c.router(
  {
    overview: { method: "GET", path: `${A}/overview`, responses: { ...ADMIN_ERRORS, 200: Overview }, summary: "Resumen: personas, actividad de 30 días y calificación promedio" },
    clients: { method: "GET", path: `${A}/clients`, responses: { ...ADMIN_ERRORS, 200: z.array(Client) }, summary: "Cada cuenta con su hogar, plan, último ingreso y actividad del mes" },
    user: { method: "GET", path: `${A}/users/:userId`, pathParams: UserParams, responses: { ...ADMIN_ERRORS, 200: UserDetail }, summary: "Ficha de una persona (sin sus finanzas)" },
    setSuspended: { method: "POST", path: `${A}/users/:userId/suspend`, pathParams: UserParams, body: SetSuspended, responses: { ...ADMIN_ERRORS, 200: Done }, summary: "Suspende o reactiva una cuenta" },
    recoveryLink: { method: "POST", path: `${A}/users/:userId/recovery-link`, pathParams: UserParams, body: c.noBody(), responses: { ...ADMIN_ERRORS, 200: ApiOk(RecoveryLink) }, summary: "Enlace para crear una contraseña nueva (se envía o se devuelve para copiarlo)" },
    setPlatformAdmin: { method: "PUT", path: `${A}/users/:userId/platform-admin`, pathParams: UserParams, body: SetPlatformAdmin, responses: { ...ADMIN_ERRORS, 200: Done }, summary: "Da o quita la administración de la plataforma" },
    deleteUser: { method: "DELETE", path: `${A}/users/:userId`, pathParams: UserParams, body: DeleteUser, responses: { ...ADMIN_ERRORS, 200: Done }, summary: "Elimina la cuenta y los hogares donde era la única persona (escribiendo su correo)" },
    addNote: { method: "POST", path: `${A}/users/:userId/notes`, pathParams: UserParams, body: AddNote, responses: { ...ADMIN_ERRORS, 200: ApiOk(Msg.extend({ id: z.string() })) }, summary: "Nota interna sobre una persona" },
    deleteNote: { method: "DELETE", path: `${A}/notes/:noteId`, pathParams: z.object({ noteId: Uuid }), body: c.noBody(), responses: { ...ADMIN_ERRORS, 200: Done }, summary: "Borra una nota interna" },
    inviteUser: { method: "POST", path: `${A}/invitations`, body: InviteUser, responses: { ...ADMIN_ERRORS, 200: Done }, summary: "Invita a una persona a crear su cuenta" },

    households: { method: "GET", path: `${A}/households`, responses: { ...ADMIN_ERRORS, 200: z.array(AdminHousehold) }, summary: "Hogares con personas, libros, dueño y plan" },
    assignPlan: { method: "POST", path: `${A}/households/:householdId/plan`, pathParams: HouseholdParams, body: AssignPlan, responses: { ...ADMIN_ERRORS, 200: Done }, summary: "Asigna un plan hasta una fecha (cortesía, convenio o pago por fuera)" },
    grantPremium: { method: "POST", path: `${A}/households/:householdId/courtesy`, pathParams: HouseholdParams, body: GrantPremium, responses: { ...ADMIN_ERRORS, 200: Done }, summary: "Regala Premium (cortesía) hasta una fecha" },
    revokeCourtesy: { method: "DELETE", path: `${A}/households/:householdId/courtesy`, pathParams: HouseholdParams, body: c.noBody(), responses: { ...ADMIN_ERRORS, 200: Done }, summary: "Quita la cortesía vigente" },

    subscriptions: { method: "GET", path: `${A}/subscriptions`, responses: { ...ADMIN_ERRORS, 200: z.array(AdminSubscription) }, summary: "Suscripciones del plan (últimas 2.000)" },
    updateSubscription: { method: "PATCH", path: `${A}/subscriptions/:subscriptionId`, pathParams: z.object({ subscriptionId: Uuid }), body: UpdateSubscription, responses: { ...ADMIN_ERRORS, 200: Done }, summary: "Extender, cambiar de plan, cancelar la renovación o terminar" },

    revenue: { method: "GET", path: `${A}/revenue`, responses: { ...ADMIN_ERRORS, 200: Revenue }, summary: "Ingresos de Mirai: MRR, suscriptores y pagos del plan" },
    manualPayment: { method: "POST", path: `${A}/payments`, body: ManualPayment, responses: { ...ADMIN_ERRORS, 200: Done }, summary: "Registra un pago hecho por fuera y extiende el plan (applyPayment)" },
    updatePayment: { method: "PATCH", path: `${A}/payments/:paymentId`, pathParams: z.object({ paymentId: Uuid }), body: UpdatePayment, responses: { ...ADMIN_ERRORS, 200: Done }, summary: "Marca un pago como reembolsado o anulado, o anota la factura" },

    broadcast: { method: "POST", path: `${A}/broadcasts`, body: Broadcast, responses: { ...ADMIN_ERRORS, 200: ApiOk(BroadcastSent) }, summary: "Aviso en la app (y por correo) a un segmento" },
    admins: { method: "GET", path: `${A}/admins`, responses: { ...ADMIN_ERRORS, 200: z.array(PlatformAdminRow) }, summary: "Administradores de la plataforma" },
    addAdmin: { method: "POST", path: `${A}/admins`, body: AddAdmin, responses: { ...ADMIN_ERRORS, 200: Done }, summary: "Da administración a una cuenta existente por su correo" },
    audit: { method: "GET", path: `${A}/audit`, responses: { ...ADMIN_ERRORS, 200: z.array(AuditRow) }, summary: "Auditoría de la consola (últimos 500)" },
    system: { method: "GET", path: `${A}/system`, responses: { ...ADMIN_ERRORS, 200: SystemInfo }, summary: "Ajustes, migraciones, hogares vacíos, referidos y estado de la configuración" },
    saveSettings: { method: "PATCH", path: `${A}/settings`, body: SaveSettings, responses: { ...ADMIN_ERRORS, 200: Done }, summary: "Ajustes de la plataforma (aviso global, registro, límites, referidos)" },
    cleanOrphans: { method: "POST", path: `${A}/system/clean-orphans`, body: c.noBody(), responses: { ...ADMIN_ERRORS, 200: ApiOk(Msg.extend({ borrados: z.number() })) }, summary: "Borra los hogares sin personas" },
    feedback: { method: "GET", path: `${A}/feedback`, responses: { ...ADMIN_ERRORS, 200: z.array(AdminFeedback) }, summary: "Opiniones con su autor y la captura (enlace de 1 hora)" },
    updateFeedback: { method: "PATCH", path: `${A}/feedback/:feedbackId`, pathParams: z.object({ feedbackId: Uuid }), body: UpdateFeedback, responses: { ...ADMIN_ERRORS, 200: Done }, summary: "Cambia el estado o responde (con la sesión del administrador: avisa a la persona)" },
    notifyLog: { method: "GET", path: `${A}/notify-log`, responses: { ...ADMIN_ERRORS, 200: z.array(NotifyLogRow) }, summary: "Registro de envíos (últimos 500, destino enmascarado, sin contenido)" },
    testDefaults: { method: "GET", path: `${A}/test-defaults`, responses: { ...ADMIN_ERRORS, 200: TestDefaults }, summary: "Destinos sugeridos para «Enviar prueba»" },
  },
  { strictStatusCodes: true },
)
