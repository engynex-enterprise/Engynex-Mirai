// V7-G: consola › Planes, Cupones, Integraciones globales y WhatsApp (SOLO administradores; cada comando queda en
// admin_audit). Equivalen a PlanesPanel (features/admin/console-plataforma.tsx), CuponesPanel (console-negocio.tsx),
// adminGlobalIntegrations / adminSaveGlobalIntegration / adminTestGlobal / adminSendTest (features/admin/server.ts) y
// adminWaState / adminWaSaveSettings / adminWaPreview / adminWaSendTest (features/admin/whatsapp.ts) de apps/web.
// V7-H3: historial de comunicados (ComunicadosPanel) y adminWaSaveTemplate / adminWaDeleteTemplate (plantillas en Meta).
// admin.ts mezcla estas rutas en `adminContract` (así el cliente tipado las ve en `apiContract.admin`).
//
// SECRETOS: ninguna respuesta lleva claves. `meta` trae las máscaras (••••1234) que guarda el servidor.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiError, ApiOk, COMMON_ERRORS, IsoDate } from "../common"
import { Msg } from "./households"

const ERRORS = { ...COMMON_ERRORS, 409: ApiError, 502: ApiError } as const
const A = "/v1/admin"
const PlanId = z.string().regex(/^[a-z0-9-]{2,30}$/, "Plan inválido")

// ── Planes ──────────────────────────────────────────────────────────────────────────────────────────────────────

export const PlanLimites = z.object({ libros: z.number().int().min(1).optional(), personas: z.number().int().min(1).optional(), automatizaciones: z.number().int().min(1).optional() })
/** Fila de `plans` (lo que edita la consola). */
export const AdminPlan = z.object({
  id: z.string(), nombre: z.string(), descripcion: z.string(), precio_mes: z.number(), precio_anio: z.number(), funciones: z.array(z.string()), anuncios: z.boolean(),
  limites: z.record(z.string(), z.unknown()), activo: z.boolean(), publico: z.boolean(), destacado: z.boolean(), orden: z.number(), ia_creditos: z.number().nullable().optional(), updated_at: z.string().optional(),
})
export type AdminPlan = z.infer<typeof AdminPlan>
export const PlanInput = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre del plan").max(30),
  descripcion: z.string().trim().max(120).default(""),
  precio_mes: z.number().int().min(0).max(100_000_000),
  precio_anio: z.number().int().min(0).max(1_000_000_000),
  funciones: z.array(z.enum(["ia", "banco", "impuestos", "familia"], { error: "Función inválida" })).max(10).default([]),
  anuncios: z.boolean().default(false),
  limites: PlanLimites.default({}),
  activo: z.boolean().default(true),
  publico: z.boolean().default(true),
  destacado: z.boolean().default(false),
  orden: z.number().int().min(-1000).max(1000).default(0),
})
export type PlanInput = z.infer<typeof PlanInput>

// ── Cupones ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const CouponCode = z.string().trim().transform((s) => s.toUpperCase()).pipe(z.string().regex(/^[A-Z0-9_-]{3,30}$/, "Usa de 3 a 30 letras, números, - o _"))
export const AdminCoupon = z.object({
  codigo: z.string(), descripcion: z.string(), tipo: z.string(), valor: z.number(), planes: z.array(z.string()), periodos: z.array(z.string()),
  desde: z.string().nullable(), hasta: z.string().nullable(), max_usos: z.number().nullable(), usos: z.number(), activo: z.boolean(), created_at: z.string(),
})
export type AdminCoupon = z.infer<typeof AdminCoupon>
export const CouponInput = z.object({
  descripcion: z.string().trim().max(200).default(""),
  tipo: z.enum(["porcentaje", "valor"], { error: "Tipo inválido (porcentaje o valor)" }),
  valor: z.number().positive("El descuento debe ser mayor que cero").max(100_000_000),
  planes: z.array(PlanId).max(20).default([]),
  periodos: z.array(z.enum(["mes", "anio"])).min(1, "Elige al menos un periodo").max(2),
  desde: IsoDate.nullable().default(null),
  hasta: IsoDate.nullable().default(null),
  max_usos: z.number().int().min(1).nullable().default(null),
  activo: z.boolean().default(true),
})
export type CouponInput = z.infer<typeof CouponInput>

// ── Integraciones globales ──────────────────────────────────────────────────────────────────────────────────────

export const GlobalMode = z.enum(["apagada", "opcional", "por_defecto", "obligatoria"], { error: "Modo inválido" })
export const GlobalIntegration = z.object({
  kind: z.string(), modo: z.string(), planes: z.array(z.string()), config: z.record(z.string(), z.unknown()),
  /** Máscaras de los secretos (••••1234) y el resultado de la última prueba. Nunca el secreto. */
  meta: z.record(z.string(), z.unknown()),
  updated_at: z.string().nullable(), hogaresPropios: z.number(), hogaresApagada: z.number(),
  /** La variable de entorno del registro existe en el despliegue. */
  env: z.boolean(), adminOnly: z.boolean(), existe: z.boolean(), guardada: z.boolean(),
})
export type GlobalIntegration = z.infer<typeof GlobalIntegration>
export const KindParams = z.object({ kind: z.string().regex(/^[a-z0-9_]{2,40}$/, "Integración desconocida") })
export const SaveGlobal = z.object({
  modo: GlobalMode,
  planes: z.array(PlanId).max(20).default([]),
  /** Valores de los campos del registro. Un secreto vacío conserva el que ya está guardado. */
  values: z.record(z.string().max(40), z.union([z.string().max(4000), z.number(), z.boolean()])).default({}),
})
export const Saved = Msg.extend({ warn: z.string().optional() })
/** Resultado de probar: es dato (como «probar conexión» de la IA del hogar), no un error de la API. */
export const TestResult = z.object({ ok: z.boolean(), msg: z.string() })
export const SendTest = z.object({ to: z.string().trim().min(3, "Escribe el destino").max(320) })

// ── WhatsApp ────────────────────────────────────────────────────────────────────────────────────────────────────

const WaMap = z.record(z.string().max(40), z.union([z.object({ src: z.literal("fijo"), text: z.string().max(500) }), z.object({ src: z.string().max(40) })]))
const HttpsUrl = z.union([z.literal(""), z.url().max(1000).refine((u) => u.startsWith("https://"), "La dirección debe empezar por https://")])
const TplName = z.union([z.literal(""), z.string().regex(/^[a-z0-9_]{1,512}$/, "Nombre de plantilla inválido")])
const Lang = z.string().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, "Idioma inválido")
export const WaCaseCfg = z.object({ template: TplName.optional(), lang: z.union([z.literal(""), Lang]).optional(), map: WaMap.optional(), headerImage: HttpsUrl.optional() })
export const WaSettingsIn = z.object({
  template: TplName, lang: Lang, map: WaMap, headerImage: HttpsUrl, enlaceBase: HttpsUrl,
  casos: z.record(z.string().max(40), WaCaseCfg),
})
export const WaState = z.object({
  ok: z.boolean(), msg: z.string().optional(), activa: z.boolean(), configurada: z.boolean(), tieneWaba: z.boolean(), numero: z.string().optional(),
  settings: z.record(z.string(), z.unknown()), templates: z.array(z.record(z.string(), z.unknown())), defaultImage: z.string(), base: z.string(),
})
export const WaStateQuery = z.object({ fresh: z.enum(["1", "0"]).optional() })
export const WaCaseBody = z.object({ caso: z.string().max(40), override: WaCaseCfg.optional() })
export const WaPreview = z.object({ preview: z.array(z.object({ key: z.string(), label: z.string(), value: z.string(), src: z.string() })), template: z.string() })
export const WaSendTest = WaCaseBody.extend({ to: z.string().trim().min(7, "Escribe el celular").max(30) })
export const WaSent = Msg.extend({ preview: WaPreview.shape.preview.optional() })

// ── V7-H3: historial de comunicados y plantillas de WhatsApp (crear, editar, eliminar en Meta) ─────────────────────

/** Fila de `broadcasts` (Consola › Comunicados › Enviados). */
export const BroadcastRow = z.object({
  id: z.string(), titulo: z.string(), cuerpo: z.string(), href: z.string().nullable(), segmento: z.string(), enviados: z.number(), created_by: z.string().nullable(), created_at: z.string(),
})
export type BroadcastRow = z.infer<typeof BroadcastRow>

const Txt = (max: number) => z.string().max(max)
const DraftButton = z.discriminatedUnion("type", [
  z.object({ type: z.literal("url"), text: Txt(60), url: Txt(2000), example: Txt(2000).optional() }),
  z.object({ type: z.literal("quick_reply"), text: Txt(60) }),
  z.object({ type: z.literal("phone"), text: Txt(60), phone: Txt(30) }),
])
/** Borrador de plantilla (TemplateDraft de @mirai/services/notify/wa-templates). Las reglas de Meta las revisa `validateDraft` en la API. */
export const WaTemplateDraft = z.object({
  name: z.string().regex(/^[a-z0-9_]{1,512}$/, "El nombre solo lleva minúsculas, números y guion bajo"),
  language: Lang,
  category: z.enum(["UTILITY", "MARKETING"], { error: "Categoría inválida" }),
  header: z.discriminatedUnion("type", [
    z.object({ type: z.literal("none") }),
    z.object({ type: z.literal("text"), text: Txt(60), example: Txt(200).optional() }),
    z.object({ type: z.literal("image"), url: Txt(1000) }),
  ]),
  body: Txt(1024),
  examples: z.array(Txt(500)).max(20),
  footer: Txt(60),
  buttons: z.array(DraftButton).max(10),
})
export const WaSaveTemplate = z.object({
  draft: WaTemplateDraft,
  /** Editar una plantilla que ya está en Meta (su id y su estado: en revisión no se puede editar). */
  edit: z.object({ id: z.string().regex(/^\d{5,30}$/, "Plantilla inválida"), status: z.string().max(40).optional() }).optional(),
})
export const WaTemplateName = z.object({ name: z.string().regex(/^[a-z0-9_]{1,512}$/, "Nombre de plantilla inválido") })
/** `id` = solo esa traducción (hsm_id); sin él (o si no es un id de Meta), todas las del nombre. */
export const WaDeleteTemplateQuery = z.object({ id: z.string().max(40).optional() })

const c = initContract()
export const adminPlatformContract = c.router(
  {
    plans: { method: "GET", path: `${A}/plans`, responses: { ...ERRORS, 200: z.array(AdminPlan) }, summary: "Todos los planes (también los ocultos o que no se venden)" },
    savePlan: { method: "PUT", path: `${A}/plans/:planId`, pathParams: z.object({ planId: PlanId }), body: PlanInput, responses: { ...ERRORS, 200: ApiOk(Msg.extend({ creado: z.boolean() })) }, summary: "Crea o edita un plan (Gratis no cobra y siempre se puede usar)" },
    deletePlan: { method: "DELETE", path: `${A}/plans/:planId`, pathParams: z.object({ planId: PlanId }), body: c.noBody(), responses: { ...ERRORS, 200: ApiOk(Msg) }, summary: "Borra un plan (Gratis y Premium no; con suscripciones o pagos, mejor ocultarlo)" },
    coupons: { method: "GET", path: `${A}/coupons`, responses: { ...ERRORS, 200: z.array(AdminCoupon) }, summary: "Cupones (los más nuevos primero)" },
    saveCoupon: { method: "PUT", path: `${A}/coupons/:codigo`, pathParams: z.object({ codigo: CouponCode }), body: CouponInput, responses: { ...ERRORS, 200: ApiOk(Msg.extend({ creado: z.boolean() })) }, summary: "Crea o edita un cupón (el código no cambia)" },
    deleteCoupon: { method: "DELETE", path: `${A}/coupons/:codigo`, pathParams: z.object({ codigo: CouponCode }), body: c.noBody(), responses: { ...ERRORS, 200: ApiOk(Msg) }, summary: "Borra un cupón (si ya se usó, mejor pausarlo)" },

    integrations: { method: "GET", path: `${A}/integrations`, responses: { ...ERRORS, 200: z.array(GlobalIntegration) }, summary: "Integraciones globales del registro con su modo, planes y máscaras (sin secretos)" },
    integration: { method: "GET", path: `${A}/integrations/:kind`, pathParams: KindParams, responses: { ...ERRORS, 200: GlobalIntegration }, summary: "Una integración global (sin secretos)" },
    saveIntegration: { method: "PUT", path: `${A}/integrations/:kind`, pathParams: KindParams, body: SaveGlobal, responses: { ...ERRORS, 200: ApiOk(Saved) }, summary: "Guarda modo, planes y campos (secretos cifrados; vacío = conserva el guardado)" },
    testIntegration: { method: "POST", path: `${A}/integrations/:kind/test`, pathParams: KindParams, body: c.noBody(), responses: { ...ERRORS, 200: ApiOk(TestResult) }, summary: "Prueba la conexión (IA, correo a tu cuenta, Telegram, WhatsApp, datos)" },
    sendTest: { method: "POST", path: `${A}/integrations/:kind/send-test`, pathParams: KindParams, body: SendTest, responses: { ...ERRORS, 200: ApiOk(TestResult) }, summary: "Envío de prueba real por correo o WhatsApp al destino que escribas (queda en el registro de envíos)" },

    waState: { method: "GET", path: `${A}/whatsapp/templates`, query: WaStateQuery, responses: { ...ERRORS, 200: WaState }, summary: "Ajustes de WhatsApp y plantillas de la cuenta de Meta (en vivo; `fresh=1` sin caché)" },
    waSaveSettings: { method: "PUT", path: `${A}/whatsapp/templates`, body: WaSettingsIn, responses: { ...ERRORS, 200: ApiOk(Msg) }, summary: "Plantilla por defecto, asignación por caso, imagen y dirección de los enlaces" },
    waPreview: { method: "POST", path: `${A}/whatsapp/preview`, body: WaCaseBody, responses: { ...ERRORS, 200: ApiOk(WaPreview) }, summary: "Valores que se enviarían para un caso (misma lógica que el envío real)" },
    waSendTest: { method: "POST", path: `${A}/whatsapp/test`, body: WaSendTest, responses: { ...ERRORS, 200: ApiOk(WaSent) }, summary: "Envía un caso con valores de ejemplo a un celular (aunque no esté guardado)" },

    // V7-H3
    broadcasts: { method: "GET", path: `${A}/broadcasts`, responses: { ...ERRORS, 200: z.array(BroadcastRow) }, summary: "Comunicados enviados (los 100 más recientes)" },
    waSaveTemplate: { method: "POST", path: `${A}/whatsapp/templates/items`, body: WaSaveTemplate, responses: { ...ERRORS, 200: ApiOk(Msg) }, summary: "Crea una plantilla en Meta (queda en revisión) o edita una existente si su estado lo permite" },
    waDeleteTemplate: { method: "DELETE", path: `${A}/whatsapp/templates/items/:name`, pathParams: WaTemplateName, query: WaDeleteTemplateQuery, body: c.noBody(), responses: { ...ERRORS, 200: ApiOk(Msg) }, summary: "Elimina una plantilla de la cuenta de Meta (la traducción `id` o todas)" },
  },
  { strictStatusCodes: true },
)
