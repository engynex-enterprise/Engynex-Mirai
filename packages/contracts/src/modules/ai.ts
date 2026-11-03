// Módulo `ai` (docs/arquitectura/v6-separacion-front-back.md §2.6 y F2-F). Dueño: F2-F.
// IA de los formularios (features/ai/actions.ts), consejero, resumen del mes, correo del banco, probar conexión y listar
// modelos de la IA del hogar, uso de IA del hogar y consola › Uso de IA. El código vive en @mirai/ai (el mismo de la web).
//
// Respuestas: lo que salió bien → `{ ok: true, data }`; lo que la web devolvía como `{ ok: false, msg }` (IA apagada,
// foto ilegible, sin créditos) → ApiError con el MISMO texto y un código: 402 PLAN_REQUIRED (plan sin IA o sin banco),
// 429 RATE_LIMITED (créditos del mes o límite por hora), 400 VALIDATION (IA apagada, falta la clave, mes inválido) y
// 502 UPSTREAM (el proveedor falló o no pudo leer el documento). "Sin sugerencia" (asistentes, frase libre) es `data: null`.
//
// Fotos y PDF (§2.7.10): `fileId` = ruta en el bucket `attachments` (`<bookId>/…`; la subida con URL firmada es de
// `files`, F2-D-2) o el archivo en base64 en el cuerpo (compatibilidad mientras el front migra; bodyLimit 8 MB).
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import type { Consulta } from "../chat-types"
import { ApiError, ApiOk, COMMON_ERRORS, IsoMonth, Uuid } from "../common"
import { FileRef } from "./chat"

export const meta = { id: "ai", owner: "F2-F" } as const

const ERR = { ...COMMON_ERRORS, 402: ApiError, 409: ApiError, 502: ApiError } as const
const book = z.object({ bookId: Uuid })
const c = initContract()

// ── Entradas ──
export const FileBody = z.object({ file: FileRef })
export const LoanDocBody = FileBody.extend({ kind: z.enum(["cobrar", "pagar"], { error: "Usa cobrar o pagar" }) })
export const ClassifyItemIn = z.object({ i: z.number(), descripcion: z.string().max(200), valor: z.number(), veces_mes: z.number() })
export const ClassifyBody = z.object({ items: z.array(ClassifyItemIn).max(60, "Máximo 60 gastos por vez") })
export const HormigaBody = z.object({ mes: IsoMonth })
export const CategoryBody = z.object({ desc: z.string().max(200).default(""), nombre: z.string().max(80).default(""), icons: z.array(z.string().max(40)).max(300).default([]) })
export const EntityBody = z.object({ q: z.string().trim().min(1, "Escribe el nombre, la sigla o el NIT").max(120) })
export const CobroBody = z.object({ msg: z.string().min(1, "Escribe el mensaje").max(1500), tono: z.enum(["amable", "directo", "firme"]).default("amable") })
export const PrimaBody = z.object({
  prima: z.number().min(0), tarjetas: z.number().min(0), disponible: z.number(), basicos: z.number().min(0),
  deudas: z.array(z.object({ nombre: z.string().max(80), saldo: z.number(), interes_mensual: z.number() })).max(30),
  metas: z.array(z.object({ nombre: z.string().max(80), falta: z.number() })).max(30),
})
export const ParseBody = z.object({ text: z.string().trim().min(1, "Escribe la frase").max(300) })
export const AdvisorBody = z.object({ text: z.string().trim().min(3, "Cuéntame qué quieres decidir").max(600) })
export const MailScanBody = z.object({ query: z.string().max(1000).optional() })
export const ModelsBody = z.object({ apiKey: z.string().max(400).optional() })

// ── Salidas ──
export const Invoice = z.object({ comercio: z.string(), valor: z.number(), fecha: z.string().nullable(), category_id: z.string().nullable() })
export const Receipt = z.object({ valor: z.number().nullable(), fecha: z.string().nullable(), referencia: z.string() })
const n = z.number().nullable()
const s = z.string().nullable()
export const LoanDocOut = z.object({
  tipo_documento: s, acreedor: s, acreedor_nit: s, acreedor_es_persona: z.boolean().nullable(), deudor: s, deudor_documento: s, concepto: s, monto: n, fecha_inicio: s,
  frecuencia: s, plazo_cuotas: n, valor_cuota: n, tasa_mensual: n, tasa_ea: n, seguros_por_cuota: n, cuotas_pagadas: n, saldo_actual: n, fecha_ultimo_pago: s,
})
export const ClassifyOut = z.object({ i: z.number(), category_id: z.string().nullable(), hormiga: z.boolean().nullable(), razon: z.string(), src: z.enum(["regla", "ia"]).optional() })
export const CategorySuggestion = z.object({ nombre: z.string(), icon: z.string(), grupo: z.enum(["n", "g", "a"]), tope: z.number(), razon: z.string() })
export const EntitySuggestion = z.object({ nombre: z.string(), razon: z.string(), nit: z.string(), tipo: z.string(), confianza: z.string(), nota: z.string() })
export const PrimaPlanOut = z.object({ resumen: z.string(), pasos: z.array(z.string()), porcentajes: z.object({ deudas: z.number(), ahorro: z.number(), metas: z.number(), gusto: z.number() }) })
export const ParsedNL = z.object({ tipo: z.enum(["gasto", "ingreso"]), valor: z.number(), descripcion: z.string(), fecha: z.string(), category_id: z.string().nullable() })
export const AdvisorOut = z.object({
  consulta: z.custom<Consulta>().nullable().describe("Consulta del consejero (null si falta el valor)"),
  faltan: z.array(z.string()),
  preguntas: z.array(z.string()),
})
export const MonthSummary = z.object({
  titular: z.string(), resumen: z.string(), gastaste_mas: z.array(z.string()), mejoro: z.array(z.string()), alertas: z.array(z.string()), recomendacion: z.string(),
  fecha: z.string(), local: z.boolean().optional(), provider: z.string().optional(),
})
export const MailRow = z.object({ id: z.string(), fecha: z.string(), comercio: z.string(), valor: z.number(), asunto: z.string(), remitente: z.string() })
export const ModelOption = z.object({ value: z.string(), label: z.string(), hint: z.string().optional(), group: z.string().optional() })
export const TestResult = z.object({ ok: z.boolean(), msg: z.string() })
/** Ajustes › Uso de IA (MyAiUsage de @mirai/ai/server/usage-report): cupo, totales, ahorro, por día y por función. */
export const MyAiUsage = z.custom<Record<string, unknown>>().describe("MyAiUsage de @mirai/ai/server/usage-report")
/** Consola › Uso de IA (AdminAiUsage de @mirai/ai/server/usage-report). Sin montos ni movimientos de los hogares. */
export const AdminAiUsage = z.custom<Record<string, unknown>>().describe("AdminAiUsage de @mirai/ai/server/usage-report")

const post = <B extends z.ZodType, R extends z.ZodType>(path: string, body: B, data: R, summary: string) =>
  ({ method: "POST", path, pathParams: book, body, responses: { ...ERR, 200: ApiOk(data) }, summary }) as const

export const aiContract = c.router(
  {
    invoice: post("/v1/books/:bookId/ai/invoice", FileBody, Invoice, "Leer la foto o PDF de una factura: comercio, total, fecha y categoría (registra sus gastos)"),
    receipt: post("/v1/books/:bookId/ai/receipt", FileBody, Receipt, "Leer un comprobante de pago (editor)"),
    loanDoc: post("/v1/books/:bookId/ai/loan-doc", LoanDocBody, LoanDocOut, "Leer el documento de un préstamo (editor)"),
    classify: post("/v1/books/:bookId/ai/classify", ClassifyBody, z.object({ items: z.array(ClassifyOut).nullable() }), "Categoría y gasto hormiga: reglas primero y la IA para los dudosos (null = IA apagada o fuera del plan)"),
    hormiga: post("/v1/books/:bookId/ai/hormiga", HormigaBody, z.object({ msg: z.string() }), "Revisar con IA los gastos hormiga del mes (editor)"),
    category: post("/v1/books/:bookId/ai/category", CategoryBody, CategorySuggestion.nullable(), "Sugerir una categoría nueva (editor; null = sin sugerencia)"),
    entity: post("/v1/books/:bookId/ai/entity", EntityBody, EntitySuggestion.nullable(), "Identificar un banco o entidad por nombre, sigla o NIT (editor)"),
    cobro: post("/v1/books/:bookId/ai/cobro", CobroBody, z.object({ text: z.string() }), "Mejorar el mensaje de cobro para WhatsApp"),
    prima: post("/v1/books/:bookId/ai/prima", PrimaBody, PrimaPlanOut, "Plan para la próxima prima"),
    parse: post("/v1/books/:bookId/ai/parse", ParseBody, ParsedNL.nullable(), "Frase libre → gasto o ingreso (null = no se entendió)"),
    advisor: post("/v1/books/:bookId/ai/advisor", AdvisorBody, AdvisorOut, "Consejero: ¿me conviene…? con tus números (+ concepto de la IA si se puede)"),
    usage: {
      method: "GET",
      path: "/v1/books/:bookId/ai/usage",
      pathParams: book,
      responses: { ...ERR, 200: MyAiUsage },
      summary: "Uso de IA del hogar: cupo del mes, costo, ahorro, serie por día y últimas solicitudes",
    },
    monthSummary: {
      method: "POST",
      path: "/v1/books/:bookId/reports/:mes/summary",
      pathParams: z.object({ bookId: Uuid, mes: IsoMonth }),
      body: c.noBody(),
      responses: { ...ERR, 200: ApiOk(MonthSummary) },
      summary: "Resumen del mes con IA (con respaldo sin IA); se guarda en monthly_summaries (editor)",
    },
    mailScan: post("/v1/books/:bookId/mail/scan", MailScanBody, z.object({ rows: z.array(MailRow), ia: z.boolean().optional() }), "Compras del correo del banco en Gmail (editor + Premium banco)"),
    integrationTest: {
      method: "POST",
      path: "/v1/books/:bookId/integrations/:kind/test",
      pathParams: z.object({ bookId: Uuid, kind: z.string().regex(/^[a-z0-9_]{2,40}$/, "Integración desconocida") }),
      body: c.noBody(),
      responses: { ...ERR, 200: ApiOk(TestResult) },
      summary: "Probar la conexión de un proveedor de IA del hogar (editor). El resultado de la prueba va en `data.ok`",
    },
    integrationModels: {
      method: "POST",
      path: "/v1/books/:bookId/integrations/:kind/models",
      pathParams: z.object({ bookId: Uuid, kind: z.string().regex(/^[a-z0-9_]{2,40}$/, "Integración desconocida") }),
      body: ModelsBody,
      responses: { ...ERR, 200: ApiOk(z.object({ models: z.array(ModelOption), rec: z.string().optional() })) },
      summary: "Modelos de chat de la cuenta (clave escrita o la propia del hogar; nunca la de Mirai) (admin)",
    },
  },
  { strictStatusCodes: true },
)

// ── Consola › Uso de IA (solo administradores de la plataforma; todo queda en admin_audit) ──
export const AiSettingsBody = z.object({
  creditUsd: z.number().positive().max(1).optional(), cuposActivo: z.boolean().optional(),
  avisoPct: z.number().int().min(1).max(100).optional(), cacheHoras: z.number().int().min(0).max(720).optional(),
})
export const PlanCupoBody = z.object({ cupo: z.number().int().min(0).max(10_000_000).nullable() })
export const ModelPriceBody = z.object({
  model: z.string().trim().min(2).max(120),
  /** US$ por millón de tokens; null quita el precio propio y vuelve al de la tabla. */
  price: z.object({ in: z.number().min(0).max(1000), out: z.number().min(0).max(1000), cached: z.number().min(0).max(1000).optional() }).nullable(),
})

export const aiAdminContract = c.router(
  {
    usage: {
      method: "GET",
      path: "/v1/admin/ai/usage",
      query: z.object({ dias: z.coerce.number().int().min(1).max(365).optional() }),
      responses: { ...ERR, 200: AdminAiUsage },
      summary: "Uso de IA de la plataforma (7 a 180 días): llamadas, tokens, costo, caché y top de hogares sin montos",
    },
    saveSettings: {
      method: "PATCH",
      path: "/v1/admin/ai/settings",
      body: AiSettingsBody,
      responses: { ...ERR, 200: ApiOk(z.object({})) },
      summary: "Créditos, cupos, aviso y caché de la IA",
    },
    setPlanCupo: {
      method: "PUT",
      path: "/v1/admin/ai/plans/:planId/cupo",
      pathParams: z.object({ planId: z.string().regex(/^[a-z0-9-]{2,30}$/, "Plan inválido") }),
      body: PlanCupoBody,
      responses: { ...ERR, 200: ApiOk(z.object({})) },
      summary: "Créditos de IA al mes de un plan (null = sin límite)",
    },
    setModelPrice: {
      method: "PUT",
      path: "/v1/admin/ai/prices",
      body: ModelPriceBody,
      responses: { ...ERR, 200: ApiOk(z.object({})) },
      summary: "Precio propio de un modelo (o quitarlo con price: null). El modelo va en el cuerpo: los ids llevan «/»",
    },
    clearCache: {
      method: "DELETE",
      path: "/v1/admin/ai/cache",
      body: c.noBody(),
      responses: { ...ERR, 200: ApiOk(z.object({ borradas: z.number().int() })) },
      summary: "Vaciar la caché de respuestas de la IA",
    },
  },
  { strictStatusCodes: true },
)
