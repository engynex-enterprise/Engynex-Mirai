// Casos de uso de la IA de los formularios (antes el cuerpo de apps/web/features/ai/actions.ts, F2-F): leer facturas,
// comprobantes y documentos de préstamos (foto o PDF), categoría y gasto hormiga, asistentes de categoría y entidad,
// mensaje de cobro, plan de la prima y frase libre. La web (Server Actions) y la API (POST /v1/books/:b/ai/*) revisan el
// rol antes de llamar y responden lo mismo: `{ ok: false, msg }` es un resultado esperado (IA apagada, foto ilegible),
// no un error. El plan lo bloquea lib/ai/run.ts (AiUnavailable). Solo servidor.
import { z } from "zod"
import { todayBogota } from "@mirai/domain"
import { aiObject, aiText, AiUnavailable } from "../run"
import { aiSettings } from "../model"
import type { ClassifyItem, ClassifyOut } from "../router"
import { clip, toLines } from "../compact"
import { classifyWith } from "./classify"
import { whoOf, type AiCtx, type Sb } from "./ctx"

export type { ClassifyItem, ClassifyOut } from "../router"

/** Tope de una foto o PDF para la IA (también lo revisa la API antes de descargarla de Storage). */
export const MAX_IMG = 6 * 1024 * 1024
/** Foto o PDF ya leído (base64). La web lo arma desde FormData; la API desde Storage (fileId) o el cuerpo. */
export type AiImage = { data: string; mediaType: string }
/** Archivo recibido, antes de validarlo. */
export type AiFile = { size: number; type: string; data: string }

/** Valida el archivo como lo hacía `image()` de features/ai/actions.ts (lanza con el mensaje para la persona). */
export function imageOf(f: AiFile | null | undefined): AiImage {
  if (!f || !f.size) throw new Error("Elige una foto")
  if (f.size > MAX_IMG) throw new Error("La foto pesa más de 6 MB")
  if (!/^image\/|application\/pdf/.test(f.type)) throw new Error("Usa una foto (JPG, PNG) o un PDF")
  return { data: f.data, mediaType: f.type }
}

async function catalog(sb: Sb, bookId: string) {
  const { data } = await sb.from("categories").select("id,nombre,grupo,icon,tope").eq("book_id", bookId).is("deleted_at", null).order("sort")
  return data ?? []
}
const fail = (e: unknown) => ({ ok: false as const, msg: e instanceof AiUnavailable ? e.message : "No pude leer la imagen. Intenta con una foto más clara o escribe los datos." })

export type InvoiceResult = { ok: true; comercio: string; valor: number; fecha: string | null; category_id: string | null } | { ok: false; msg: string }

/** Foto de la factura (leerFactura de la v4): comercio, total, fecha y categoría. Rol: registrarPropio. */
export async function readInvoiceWith(ctx: AiCtx, sb: Sb, file: () => AiImage | Promise<AiImage>): Promise<InvoiceResult> {
  const ia = await aiSettings(ctx.book.id)
  if (ia.on === false) return { ok: false, msg: "La inteligencia artificial está apagada. Actívala en Ajustes › Inteligencia artificial." }
  if (ia.ocr === false) return { ok: false, msg: "La lectura de fotos está desactivada en Ajustes › Inteligencia artificial." }
  try {
    const cats = await catalog(sb, ctx.book.id)
    const { object: r } = await aiObject({
      ...whoOf(ctx), feature: "factura", images: [await file()],
      schema: z.object({ comercio: z.string(), valor: z.number(), fecha: z.string().nullable(), categoria: z.string().nullable() }),
      prompt: `Categorías: ${cats.map((c) => c.nombre).join(", ")}`,
    })
    const cat = cats.find((c) => c.nombre.toLowerCase() === (r.categoria ?? "").toLowerCase())
    return { ok: true, comercio: r.comercio.slice(0, 80), valor: Math.round(r.valor), fecha: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha ?? "") ? r.fecha : null, category_id: cat?.id ?? null }
  } catch (e) { return fail(e) }
}

/** Normaliza la entrada de classifyExpenses (máx. 60 gastos). */
export const cleanItems = (items: unknown): ClassifyItem[] | null =>
  Array.isArray(items)
    ? (items as Partial<Record<keyof ClassifyItem, unknown>>[]).slice(0, 60).map((x, j) => ({ i: Number.isFinite(+(x?.i as number)) ? +(x.i as number) : j, descripcion: String(x?.descripcion ?? "").slice(0, 200), valor: Math.max(0, +(x?.valor as number) || 0), veces_mes: Math.max(0, Math.round(+(x?.veces_mes as number) || 0)) }))
    : null

/**
 * Categoría y gasto hormiga (aiClassify de la v4). Primero reglas y solo los dudosos van a la IA (el mismo motor del
 * chat). null si la IA está apagada o no está en el plan. Rol: registrarPropio.
 */
export async function classifyExpensesWith(ctx: AiCtx, sb: Sb, items: unknown): Promise<ClassifyOut[] | null> {
  const clean = cleanItems(items)
  if (!clean) return null
  const r = await classifyWith(sb, whoOf(ctx), clean)
  return r?.out ?? null
}

/** Revisa con IA los gastos del mes sin veredicto de hormiga (reviewMonth de la v4), en lotes de 40. Rol: editor. */
export async function reviewMonthHormigaWith(ctx: AiCtx, sb: Sb, k: string): Promise<{ ok: boolean; msg: string }> {
  if (typeof k !== "string" || !/^\d{4}-\d{2}$/.test(k)) return { ok: false, msg: "Mes inválido." }
  const { data: gs } = await sb.from("expenses").select("id,descripcion,valor,fecha").eq("book_id", ctx.book.id).is("deleted_at", null).is("fixed_expense_id", null).is("hormiga_src", null).like("fecha", `${k}%`)
  if (!gs?.length) return { ok: true, msg: "Todos los gastos de este mes ya están revisados." }
  const { data: hist } = await sb.from("expenses").select("descripcion,fecha").eq("book_id", ctx.book.id).is("deleted_at", null).gte("fecha", new Date(Date.parse(todayBogota()) - 30 * 864e5).toISOString().slice(0, 10))
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
  let n = 0
  for (let i = 0; i < gs.length; i += 40) {
    const lote = gs.slice(i, i + 40)
    const r = await classifyExpensesWith(ctx, sb, lote.map((g, j) => ({ i: j, descripcion: g.descripcion, valor: Math.round(+g.valor), veces_mes: (hist ?? []).filter((h) => norm(h.descripcion) === norm(g.descripcion)).length })))
    if (!r) return { ok: false, msg: "No pude consultar la IA. Revisa el proveedor en Ajustes › Inteligencia artificial." }
    for (const x of r) {
      const g = lote[x.i]
      if (!g || x.hormiga === null) continue
      await sb.from("expenses").update({ hormiga: x.hormiga, hormiga_src: x.src === "regla" ? "regla" : "ia", hormiga_razon: x.razon }).eq("id", g.id)
      if (x.hormiga) n++
    }
  }
  return { ok: true, msg: `Listo: la IA encontró ${n} gasto${n === 1 ? "" : "s"} hormiga.` }
}

// ── Asistentes (S.cfg.ia.asist): categoría y entidad ──
const ENT_T = ["Banco", "Cooperativa", "Fintech", "Billetera", "Fondo", "Otro"] as const
async function asist(bookId: string) { const ia = await aiSettings(bookId); return ia.on !== false && ia.asist !== false }

export type CategorySuggestion = { ok: boolean; s?: { nombre: string; icon: string; grupo: "n" | "g" | "a"; tope: number; razon: string } }

/** Propone nombre, ícono, tipo y tope de una categoría nueva (aiCat de la v4). Rol: editor. */
export async function suggestCategoryWith(ctx: AiCtx, sb: Sb, desc: string, nombre: string, icons: string[]): Promise<CategorySuggestion> {
  if (!(await asist(ctx.book.id))) return { ok: false }
  icons = (Array.isArray(icons) ? icons : []).filter((x) => typeof x === "string" && /^[a-z0-9-]{1,40}$/.test(x)).slice(0, 300)
  desc = String(desc ?? ""); nombre = String(nombre ?? "")
  const cats = await catalog(sb, ctx.book.id)
  try {
    const { object: r } = await aiObject({
      ...whoOf(ctx), feature: "categoria_nueva",
      schema: z.object({ nombre: z.string(), icon: z.string(), grupo: z.enum(["n", "g", "a"]), tope: z.number(), razon: z.string() }),
      prompt: `Gasto o idea: "${clip(desc || nombre, 120)}".${nombre ? ` Nombre que sugiere la persona: "${clip(nombre, 40)}".` : ""}
Ya existen: ${cats.map((c) => c.nombre).join(", ")}.
Íconos: ${icons.join(", ")}.`,
    })
    return { ok: true, s: { nombre: r.nombre.slice(0, 40), icon: icons.includes(r.icon) ? r.icon : "tag", grupo: r.grupo, tope: Math.max(0, Math.round(r.tope)), razon: r.razon.slice(0, 90) } }
  } catch { return { ok: false } }
}

export type EntitySuggestion = { ok: boolean; s?: { nombre: string; razon: string; nit: string; tipo: string; confianza: string; nota: string } }

/** Identifica un banco o entidad por nombre, sigla o NIT (aiEnt de la v4). Rol: editor. */
export async function identifyEntityWith(ctx: AiCtx, q: string): Promise<EntitySuggestion> {
  if (!(await asist(ctx.book.id))) return { ok: false }
  try {
    const { object: r } = await aiObject({
      ...whoOf(ctx), feature: "entidad",
      schema: z.object({ nombre: z.string(), razon_social: z.string(), nit: z.string(), tipo: z.string(), confianza: z.enum(["alta", "media", "baja"]), nota: z.string() }),
      prompt: `Dato: "${q.trim().slice(0, 120)}"\nTipos: ${ENT_T.join(", ")}`,
    })
    return { ok: true, s: { nombre: r.nombre.slice(0, 60), razon: r.razon_social.slice(0, 80), nit: r.nit.replace(/\D/g, "").slice(0, 12), tipo: (ENT_T as readonly string[]).includes(r.tipo) ? r.tipo : "Banco", confianza: r.confianza, nota: r.nota.slice(0, 100) } }
  } catch { return { ok: false } }
}

// ── Lectura de documentos de préstamos (ocrLoan / ocrPago de la v4) ──
export const LoanDoc = z.object({
  tipo_documento: z.string().nullable(), acreedor: z.string().nullable(), acreedor_nit: z.string().nullable(), acreedor_es_persona: z.boolean().nullable(),
  deudor: z.string().nullable(), deudor_documento: z.string().nullable(), concepto: z.string().nullable(), monto: z.number().nullable(), fecha_inicio: z.string().nullable(),
  frecuencia: z.string().nullable(), plazo_cuotas: z.number().nullable(), valor_cuota: z.number().nullable(), tasa_mensual: z.number().nullable(), tasa_ea: z.number().nullable(),
  seguros_por_cuota: z.number().nullable(), cuotas_pagadas: z.number().nullable(), saldo_actual: z.number().nullable(), fecha_ultimo_pago: z.string().nullable(),
})
export type LoanDocData = z.infer<typeof LoanDoc>

/** Documento de un préstamo (extracto, pagaré, tabla de amortización). Rol: editor. */
export async function readLoanDocWith(ctx: AiCtx, file: () => AiImage | Promise<AiImage>, kind: "cobrar" | "pagar"): Promise<{ ok: true; d: LoanDocData } | { ok: false; msg: string }> {
  const ia = await aiSettings(ctx.book.id)
  if (ia.on === false || ia.ocr === false) return { ok: false, msg: "La lectura de fotos está desactivada en Ajustes › Inteligencia artificial." }
  try {
    const { object } = await aiObject({
      ...whoOf(ctx), feature: "documento_prestamo", images: [await file()], schema: LoanDoc,
      prompt: kind === "cobrar" ? "La persona es quien PRESTÓ el dinero." : "La persona es quien DEBE el dinero.",
    })
    return { ok: true, d: object }
  } catch (e) { return fail(e) }
}

export type ReceiptResult = { ok: true; valor: number | null; fecha: string | null; referencia: string } | { ok: false; msg: string }

/** Comprobante de pago (transferencia, consignación, Nequi…). Rol: editor. */
export async function readReceiptWith(ctx: AiCtx, file: () => AiImage | Promise<AiImage>): Promise<ReceiptResult> {
  const ia = await aiSettings(ctx.book.id)
  if (ia.on === false || ia.ocr === false) return { ok: false, msg: "La lectura de fotos está desactivada en Ajustes › Inteligencia artificial." }
  try {
    const { object: r } = await aiObject({
      ...whoOf(ctx), feature: "comprobante", images: [await file()],
      schema: z.object({ valor: z.number().nullable(), fecha: z.string().nullable(), referencia: z.string().nullable(), pagador: z.string().nullable(), beneficiario: z.string().nullable() }),
      prompt: "Lee el comprobante.",
    })
    return { ok: true, valor: r.valor ? Math.round(r.valor) : null, fecha: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha ?? "") ? r.fecha : null, referencia: r.referencia ?? "" }
  } catch (e) { return { ok: false, msg: fail(e).msg.replace("la imagen", "el comprobante") } }
}

// ── Textos con IA ──
export type Tono = "amable" | "directo" | "firme"

/** Reescribe el mensaje de cobro para WhatsApp (cobroIA de la v4). Rol: registrarPropio. */
export async function improveCobroWith(ctx: AiCtx, msg: string, tono: Tono): Promise<{ ok: boolean; text: string }> {
  if (!["amable", "directo", "firme"].includes(tono)) tono = "amable"
  msg = String(msg ?? "")
  try {
    const { text } = await aiText({ ...whoOf(ctx), feature: "cobro", prompt: `Tono: ${tono}.\nMENSAJE:\n${msg.slice(0, 1500)}` })
    return { ok: true, text: text.trim() }
  } catch (e) { return { ok: false, text: e instanceof AiUnavailable ? e.message : "No se pudo mejorar el mensaje" } }
}

export type PrimaInput = { prima: number; deudas: { nombre: string; saldo: number; interes_mensual: number }[]; tarjetas: number; metas: { nombre: string; falta: number }[]; disponible: number; basicos: number }
export type PrimaPlan = { ok: boolean; msg?: string; plan?: { resumen: string; pasos: string[]; porcentajes: { deudas: number; ahorro: number; metas: number; gusto: number } } }

/** Plan para la próxima prima (priIA de la v4). Rol: registrarPropio. */
export async function primaPlanWith(ctx: AiCtx, data: PrimaInput): Promise<PrimaPlan> {
  try {
    const { object } = await aiObject({
      ...whoOf(ctx), feature: "prima",
      schema: z.object({ resumen: z.string(), pasos: z.array(z.string()), porcentajes: z.object({ deudas: z.number(), ahorro: z.number(), metas: z.number(), gusto: z.number() }) }),
      prompt: `DATOS:\n${toLines({
        prima: data.prima, deuda_tarjetas: data.tarjetas, disponible_hoy: data.disponible, gastos_basicos_mes: data.basicos,
        deudas: [...data.deudas].sort((a, b) => b.interes_mensual - a.interes_mensual).slice(0, 6).map((d) => ({ nombre: clip(d.nombre, 30), saldo: d.saldo, interes_mes_pct: d.interes_mensual })),
        metas: data.metas.slice(0, 5).map((m) => ({ nombre: clip(m.nombre, 30), falta: m.falta })),
      })}`,
    })
    return { ok: true, plan: object }
  } catch (e) { return { ok: false, msg: e instanceof AiUnavailable ? e.message : "No se pudo obtener la sugerencia" } }
}

export type ParsedNL = { ok: boolean; tipo?: "gasto" | "ingreso"; valor?: number; descripcion?: string; fecha?: string; category_id?: string | null }

/** Frase libre en Inicio cuando las reglas no entienden (EXTRA_FORM.nl de la v4). Rol: registrarPropio. */
export async function parseNLWith(ctx: AiCtx, sb: Sb, text: string): Promise<ParsedNL> {
  text = String(text ?? "")
  const ia = await aiSettings(ctx.book.id)
  if (ia.on === false) return { ok: false }
  const cats = await catalog(sb, ctx.book.id)
  try {
    const { object: r } = await aiObject({
      ...whoOf(ctx), feature: "frase_libre",
      schema: z.object({ tipo: z.enum(["gasto", "ingreso"]), valor: z.number(), descripcion: z.string(), fecha: z.string(), categoria: z.string().nullable() }),
      prompt: `HOY: ${todayBogota()}\nCategorías: ${cats.map((c) => c.nombre).join(", ")}\nFRASE: "${text.slice(0, 300)}"`,
    })
    if (!(r.valor > 0)) return { ok: false }
    return { ok: true, tipo: r.tipo, valor: Math.round(r.valor), descripcion: r.descripcion.slice(0, 80), fecha: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) ? r.fecha : todayBogota(), category_id: cats.find((c) => c.nombre.toLowerCase() === (r.categoria ?? "").toLowerCase())?.id ?? null }
  } catch { return { ok: false } }
}
