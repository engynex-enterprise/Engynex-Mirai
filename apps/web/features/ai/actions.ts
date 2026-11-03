"use server"

import "@/lib/services"
import { requireCan, requireRole } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import {
  classifyExpensesWith, identifyEntityWith, imageOf, improveCobroWith, parseNLWith, primaPlanWith, readInvoiceWith, readLoanDocWith, readReceiptWith,
  reviewMonthHormigaWith, suggestCategoryWith,
  type CategorySuggestion, type ClassifyItem, type ClassifyOut, type EntitySuggestion, type InvoiceResult, type LoanDocData, type ParsedNL, type PrimaInput, type PrimaPlan, type ReceiptResult,
} from "@mirai/ai/server/ai-actions"

// IA de los formularios. Los casos de uso viven en packages/ai (@mirai/ai/server/ai-actions), los mismos de la API
// (POST /v1/books/:b/ai/*): aquí quedan la sesión, el rol y la lectura del archivo del FormData.

export type { ClassifyItem, ClassifyOut, LoanDocData }

/** Foto o PDF del FormData (`file`), validado como siempre (tamaño y tipo). */
async function image(fd: FormData) {
  const f = fd.get("file")
  const file = f instanceof File ? { size: f.size, type: f.type, data: "" } : null
  const img = imageOf(file)
  return { ...img, data: Buffer.from(await (f as File).arrayBuffer()).toString("base64") }
}

/** Foto de la factura (leerFactura de la v4): comercio, total, fecha y categoría. */
export async function readInvoice(fd: FormData): Promise<InvoiceResult> {
  let ctx
  try { ctx = await requireCan("registrarPropio") } catch (e) { return { ok: false, msg: (e as Error).message } }
  return readInvoiceWith(ctx, await supabaseServer(), () => image(fd))
}

/**
 * Categoría y gasto hormiga (aiClassify de la v4). Primero reglas (tus reglas, historial, palabras clave y los casos
 * claros de hormiga) y solo los dudosos van a la IA (features/ai/classify.ts, el mismo motor del chat). Devuelve null
 * si la IA está apagada o no está en el plan. "Solo mira" no gasta créditos: no registra gastos.
 */
export async function classifyExpenses(items: ClassifyItem[]): Promise<ClassifyOut[] | null> {
  let ctx
  try { ctx = await requireCan("registrarPropio") } catch { return null }
  return classifyExpensesWith(ctx, await supabaseServer(), items)
}

/** Revisa con IA los gastos del mes sin veredicto de hormiga (reviewMonth de la v4), en lotes de 40. */
export async function reviewMonthHormiga(k: string): Promise<{ ok: boolean; msg: string }> {
  if (typeof k !== "string" || !/^\d{4}-\d{2}$/.test(k)) return { ok: false, msg: "Mes inválido." }
  const ctx = await requireRole("editor")
  return reviewMonthHormigaWith(ctx, await supabaseServer(), k)
}

/** Propone nombre, ícono, tipo y tope de una categoría nueva (aiCat de la v4). */
export async function suggestCategory(desc: string, nombre: string, icons: string[]): Promise<CategorySuggestion> {
  const ctx = await requireRole("editor")
  return suggestCategoryWith(ctx, await supabaseServer(), desc, nombre, icons)
}

/** Identifica un banco o entidad por nombre, sigla o NIT (aiEnt de la v4). */
export async function identifyEntity(q: string): Promise<EntitySuggestion> {
  const ctx = await requireRole("editor")
  return identifyEntityWith(ctx, q)
}

export async function readLoanDoc(fd: FormData, kind: "cobrar" | "pagar"): Promise<{ ok: true; d: LoanDocData } | { ok: false; msg: string }> {
  const ctx = await requireRole("editor")
  return readLoanDocWith(ctx, () => image(fd), kind)
}

export async function readReceipt(fd: FormData): Promise<ReceiptResult> {
  const ctx = await requireRole("editor")
  return readReceiptWith(ctx, () => image(fd))
}

/** Reescribe el mensaje de cobro para WhatsApp (cobroIA de la v4). */
export async function improveCobro(msg: string, tono: "amable" | "directo" | "firme"): Promise<{ ok: boolean; text: string }> {
  let ctx
  try { ctx = await requireCan("registrarPropio") } catch (e) { return { ok: false, text: (e as Error).message } }
  return improveCobroWith(ctx, msg, tono)
}

/** Plan para la próxima prima (priIA de la v4). */
export async function primaPlan(data: PrimaInput): Promise<PrimaPlan> {
  let ctx
  try { ctx = await requireCan("registrarPropio") } catch (e) { return { ok: false, msg: (e as Error).message } }
  return primaPlanWith(ctx, data)
}

/** Frase libre en Inicio cuando las reglas no entienden (EXTRA_FORM.nl de la v4). */
export async function parseNL(text: string): Promise<ParsedNL> {
  let ctx
  try { ctx = await requireCan("registrarPropio") } catch { return { ok: false } }
  return parseNLWith(ctx, await supabaseServer(), text)
}
