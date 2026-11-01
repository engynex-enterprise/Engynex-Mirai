"use server"

import { z } from "zod"
import { requireRole } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import { aiObject, aiText, AiUnavailable } from "@/lib/ai/run"
import { aiSettings } from "@/lib/ai/model"
import { todayBogota } from "@/lib/domain"

const GRP = { n: "necesidad", g: "gusto", a: "ahorro" } as Record<string, string>
const MAX_IMG = 6 * 1024 * 1024

async function catalog(bookId: string) {
  const sb = await supabaseServer()
  const { data } = await sb.from("categories").select("id,nombre,grupo").eq("book_id", bookId).is("deleted_at", null).order("sort")
  return data ?? []
}
const fail = (e: unknown) => ({ ok: false as const, msg: e instanceof AiUnavailable ? e.message : "No pude leer la imagen. Intenta con una foto más clara o escribe los datos." })

async function image(fd: FormData) {
  const f = fd.get("file")
  if (!(f instanceof File) || !f.size) throw new Error("Elige una foto")
  if (f.size > MAX_IMG) throw new Error("La foto pesa más de 6 MB")
  if (!/^image\/|application\/pdf/.test(f.type)) throw new Error("Usa una foto (JPG, PNG) o un PDF")
  return { data: Buffer.from(await f.arrayBuffer()).toString("base64"), mediaType: f.type }
}

/** Foto de la factura (leerFactura de la v4): comercio, total, fecha y categoría. */
export async function readInvoice(fd: FormData): Promise<{ ok: true; comercio: string; valor: number; fecha: string | null; category_id: string | null } | { ok: false; msg: string }> {
  const ctx = await requireRole("editor")
  const ia = await aiSettings(ctx.book.id)
  if (ia.on === false) return { ok: false, msg: "La inteligencia artificial está apagada. Actívala en Ajustes › Inteligencia artificial." }
  if (ia.ocr === false) return { ok: false, msg: "La lectura de fotos está desactivada en Ajustes › Inteligencia artificial." }
  try {
    const cats = await catalog(ctx.book.id)
    const { object: r } = await aiObject({
      householdId: ctx.household.id, bookId: ctx.book.id, images: [await image(fd)],
      schema: z.object({ comercio: z.string(), valor: z.number(), fecha: z.string().nullable(), categoria: z.string().nullable() }),
      prompt: `Lee esta factura o recibo colombiano. "comercio": nombre corto. "valor": el TOTAL pagado en pesos, sin puntos. "fecha": YYYY-MM-DD o null si no hay fecha visible. "categoria": una de: ${cats.map((c) => c.nombre).join(", ")}.`,
    })
    const cat = cats.find((c) => c.nombre.toLowerCase() === (r.categoria ?? "").toLowerCase())
    return { ok: true, comercio: r.comercio.slice(0, 80), valor: Math.round(r.valor), fecha: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha ?? "") ? r.fecha : null, category_id: cat?.id ?? null }
  } catch (e) { return fail(e) }
}

export type ClassifyItem = { i: number; descripcion: string; valor: number; veces_mes: number }
export type ClassifyOut = { i: number; category_id: string | null; hormiga: boolean | null; razon: string }

/** Clasificación de gastos con IA (aiClassify de la v4). Devuelve null si no hay IA. */
export async function classifyExpenses(items: ClassifyItem[]): Promise<ClassifyOut[] | null> {
  const ctx = await requireRole("viewer")
  const ia = await aiSettings(ctx.book.id)
  if (ia.on === false || (ia.autocat === false && ia.hormiga === false) || !items.length) return null
  const sb = await supabaseServer()
  const [cats, { data: cfg }] = await Promise.all([catalog(ctx.book.id), sb.from("book_settings").select("umbral").eq("book_id", ctx.book.id).single()])
  const umbral = +(cfg?.umbral ?? 25000)
  try {
    const { object } = await aiObject({
      householdId: ctx.household.id, bookId: ctx.book.id,
      schema: z.object({ items: z.array(z.object({ i: z.number(), categoria: z.string().nullable(), hormiga: z.boolean().nullable(), razon: z.string() })) }),
      prompt: `Clasificas gastos de una familia colombiana (valores en pesos COP). Categorías disponibles (usa el nombre EXACTO, sin el paréntesis): ${cats.map((c) => `${c.nombre} (${GRP[c.grupo] ?? "gusto"})`).join(", ")}.
"Gasto hormiga": gasto pequeño (normalmente de hasta unos ${umbral * 2} pesos), frecuente o impulsivo, no esencial y fácil de evitar: tinto, snacks, gaseosas, domicilios, propinas, taxis cortos, compras por antojo, retiros con comisión, apps. NO son hormiga: arriendo, servicios públicos, mercado grande, salud, educación, cuotas de créditos ni gastos grandes. Si se repite muchas veces en el mes (campo "veces_mes"), es más probable que sea hormiga.
Para cada gasto devuelve "categoria", "hormiga" y "razon" (máximo 8 palabras).
GASTOS: ${JSON.stringify(items.slice(0, 60))}`,
    })
    return object.items.map((x) => ({ i: x.i, category_id: cats.find((c) => c.nombre.toLowerCase() === (x.categoria ?? "").toLowerCase())?.id ?? null, hormiga: x.hormiga, razon: x.razon.slice(0, 80) }))
  } catch { return null }
}

/** Revisa con IA los gastos del mes sin veredicto de hormiga (reviewMonth de la v4), en lotes de 40. */
export async function reviewMonthHormiga(k: string): Promise<{ ok: boolean; msg: string }> {
  const ctx = await requireRole("editor")
  const sb = await supabaseServer()
  const { data: gs } = await sb.from("expenses").select("id,descripcion,valor,fecha").eq("book_id", ctx.book.id).is("deleted_at", null).is("fixed_expense_id", null).is("hormiga_src", null).like("fecha", `${k}%`)
  if (!gs?.length) return { ok: true, msg: "Todos los gastos de este mes ya están revisados." }
  const { data: hist } = await sb.from("expenses").select("descripcion,fecha").eq("book_id", ctx.book.id).is("deleted_at", null).gte("fecha", new Date(Date.parse(todayBogota()) - 30 * 864e5).toISOString().slice(0, 10))
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
  let n = 0
  for (let i = 0; i < gs.length; i += 40) {
    const lote = gs.slice(i, i + 40)
    const r = await classifyExpenses(lote.map((g, j) => ({ i: j, descripcion: g.descripcion, valor: Math.round(+g.valor), veces_mes: (hist ?? []).filter((h) => norm(h.descripcion) === norm(g.descripcion)).length })))
    if (!r) return { ok: false, msg: "No pude consultar la IA. Revisa el proveedor en Ajustes › Integraciones." }
    for (const x of r) {
      const g = lote[x.i]
      if (!g || x.hormiga === null) continue
      await sb.from("expenses").update({ hormiga: x.hormiga, hormiga_src: "ia", hormiga_razon: x.razon }).eq("id", g.id)
      if (x.hormiga) n++
    }
  }
  return { ok: true, msg: `Listo: la IA encontró ${n} gasto${n === 1 ? "" : "s"} hormiga.` }
}

// ── Asistentes (S.cfg.ia.asist): categoría y entidad ──
const ENT_T = ["Banco", "Cooperativa", "Fintech", "Billetera", "Fondo", "Otro"] as const
async function asist(bookId: string) { const ia = await aiSettings(bookId); return ia.on !== false && ia.asist !== false }

/** Propone nombre, ícono, tipo y tope de una categoría nueva (aiCat de la v4). */
export async function suggestCategory(desc: string, nombre: string, icons: string[]): Promise<{ ok: boolean; s?: { nombre: string; icon: string; grupo: "n" | "g" | "a"; tope: number; razon: string } }> {
  const ctx = await requireRole("editor")
  if (!(await asist(ctx.book.id))) return { ok: false }
  const cats = await catalog(ctx.book.id)
  try {
    const { object: r } = await aiObject({
      householdId: ctx.household.id, bookId: ctx.book.id,
      schema: z.object({ nombre: z.string(), icon: z.string(), grupo: z.enum(["n", "g", "a"]), tope: z.number(), razon: z.string() }),
      prompt: `Eres asistente de finanzas familiares en Colombia. El usuario necesita una NUEVA categoría de gasto.
Gasto o idea: "${desc || nombre}".${nombre ? ` Nombre sugerido por el usuario: "${nombre}".` : ""}
Categorías que YA existen (no repitas): ${cats.map((c) => c.nombre).join(", ")}.
Íconos permitidos (elige uno EXACTO): ${icons.join(", ")}.
"nombre": 2-3 palabras en español, con mayúscula inicial. "grupo": n=necesidad, g=gusto, a=ahorro. "tope": pesos mensual razonable o 0. "razon": máx 12 palabras.`,
    })
    return { ok: true, s: { nombre: r.nombre.slice(0, 40), icon: icons.includes(r.icon) ? r.icon : "tag", grupo: r.grupo, tope: Math.max(0, Math.round(r.tope)), razon: r.razon.slice(0, 90) } }
  } catch { return { ok: false } }
}

/** Identifica un banco o entidad por nombre, sigla o NIT (aiEnt de la v4). */
export async function identifyEntity(q: string): Promise<{ ok: boolean; s?: { nombre: string; razon: string; nit: string; tipo: string; confianza: string; nota: string } }> {
  const ctx = await requireRole("editor")
  if (!(await asist(ctx.book.id))) return { ok: false }
  try {
    const { object: r } = await aiObject({
      householdId: ctx.household.id, bookId: ctx.book.id,
      schema: z.object({ nombre: z.string(), razon_social: z.string(), nit: z.string(), tipo: z.string(), confianza: z.enum(["alta", "media", "baja"]), nota: z.string() }),
      prompt: `Identifica una entidad que presta dinero o vende a crédito en Colombia a partir de este dato del usuario: "${q.slice(0, 120)}" (puede ser un nombre comercial, una sigla, un NIT o un número de documento).
Tipos permitidos: ${ENT_T.join(", ")}.
"nit": NIT sin dígito de verificación, solo números, o vacío si no estás seguro. "nota": máx 15 palabras.
No inventes NIT: si no lo conoces con certeza déjalo vacío. Si el dato es un número de cédula de una persona, tipo="Otro" y nombre vacío.`,
    })
    return { ok: true, s: { nombre: r.nombre.slice(0, 60), razon: r.razon_social.slice(0, 80), nit: r.nit.replace(/\D/g, "").slice(0, 12), tipo: (ENT_T as readonly string[]).includes(r.tipo) ? r.tipo : "Banco", confianza: r.confianza, nota: r.nota.slice(0, 100) } }
  } catch { return { ok: false } }
}

// ── Lectura de documentos de préstamos (ocrLoan / ocrPago de la v4) ──
const LoanDoc = z.object({
  tipo_documento: z.string().nullable(), acreedor: z.string().nullable(), acreedor_nit: z.string().nullable(), acreedor_es_persona: z.boolean().nullable(),
  deudor: z.string().nullable(), deudor_documento: z.string().nullable(), concepto: z.string().nullable(), monto: z.number().nullable(), fecha_inicio: z.string().nullable(),
  frecuencia: z.string().nullable(), plazo_cuotas: z.number().nullable(), valor_cuota: z.number().nullable(), tasa_mensual: z.number().nullable(), tasa_ea: z.number().nullable(),
  seguros_por_cuota: z.number().nullable(), cuotas_pagadas: z.number().nullable(), saldo_actual: z.number().nullable(), fecha_ultimo_pago: z.string().nullable(),
})
export type LoanDocData = z.infer<typeof LoanDoc>

export async function readLoanDoc(fd: FormData, kind: "cobrar" | "pagar"): Promise<{ ok: true; d: LoanDocData } | { ok: false; msg: string }> {
  const ctx = await requireRole("editor")
  const ia = await aiSettings(ctx.book.id)
  if (ia.on === false || ia.ocr === false) return { ok: false, msg: "La lectura de fotos está desactivada en Ajustes › Inteligencia artificial." }
  try {
    const { object } = await aiObject({
      householdId: ctx.household.id, bookId: ctx.book.id, images: [await image(fd)], schema: LoanDoc,
      prompt: `Lee este documento colombiano de un crédito o préstamo (extracto bancario, pagaré, contrato, factura a cuotas, recibo o tabla de amortización). ${kind === "cobrar" ? "El usuario es quien PRESTÓ el dinero." : "El usuario es quien DEBE el dinero."}
Usa null si un dato no aparece; valores en pesos sin puntos. "tipo_documento": extracto|pagare|contrato|factura|recibo_pago|tabla|otro. "frecuencia": mensual|quincenal|semanal|diario. Fechas YYYY-MM-DD.
"tasa_mensual" es el % mes vencido (ej. 1.85). "tasa_ea" el % efectivo anual. "saldo_actual" es el saldo de capital que falta pagar.`,
    })
    return { ok: true, d: object }
  } catch (e) { return fail(e) }
}

export async function readReceipt(fd: FormData): Promise<{ ok: true; valor: number | null; fecha: string | null; referencia: string } | { ok: false; msg: string }> {
  const ctx = await requireRole("editor")
  const ia = await aiSettings(ctx.book.id)
  if (ia.on === false || ia.ocr === false) return { ok: false, msg: "La lectura de fotos está desactivada en Ajustes › Inteligencia artificial." }
  try {
    const { object: r } = await aiObject({
      householdId: ctx.household.id, bookId: ctx.book.id, images: [await image(fd)],
      schema: z.object({ valor: z.number().nullable(), fecha: z.string().nullable(), referencia: z.string().nullable(), pagador: z.string().nullable(), beneficiario: z.string().nullable() }),
      prompt: `Lee este comprobante de pago colombiano (transferencia, consignación, recibo de caja, pago PSE o Nequi/Daviplata). "valor" en pesos sin puntos; null si no aparece. "fecha" YYYY-MM-DD.`,
    })
    return { ok: true, valor: r.valor ? Math.round(r.valor) : null, fecha: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha ?? "") ? r.fecha : null, referencia: r.referencia ?? "" }
  } catch (e) { return { ok: false, msg: fail(e).msg.replace("la imagen", "el comprobante") } }
}

// ── Textos con IA ──
/** Reescribe el mensaje de cobro para WhatsApp (cobroIA de la v4). */
export async function improveCobro(msg: string, tono: "amable" | "directo" | "firme"): Promise<{ ok: boolean; text: string }> {
  const ctx = await requireRole("viewer")
  try {
    const { text } = await aiText({ householdId: ctx.household.id, bookId: ctx.book.id, maxOutputTokens: 300, prompt: `Reescribe este mensaje de cobro para WhatsApp en español colombiano, tono ${tono}, respetuoso, breve (máximo 70 palabras), conservando TODAS las cifras y fechas exactas. Devuelve solo el mensaje.\n\n${msg.slice(0, 1500)}` })
    return { ok: true, text: text.trim() }
  } catch (e) { return { ok: false, text: e instanceof AiUnavailable ? e.message : "No se pudo mejorar el mensaje" } }
}

/** Plan para la próxima prima (priIA de la v4). */
export async function primaPlan(data: { prima: number; deudas: { nombre: string; saldo: number; interes_mensual: number }[]; tarjetas: number; metas: { nombre: string; falta: number }[]; disponible: number; basicos: number }): Promise<{ ok: boolean; msg?: string; plan?: { resumen: string; pasos: string[]; porcentajes: { deudas: number; ahorro: number; metas: number; gusto: number } } }> {
  const ctx = await requireRole("viewer")
  try {
    const { object } = await aiObject({
      householdId: ctx.household.id, bookId: ctx.book.id,
      schema: z.object({ resumen: z.string(), pasos: z.array(z.string()), porcentajes: z.object({ deudas: z.number(), ahorro: z.number(), metas: z.number(), gusto: z.number() }) }),
      prompt: `Eres un asesor financiero para una familia colombiana. Sugiere cómo usar la próxima prima (${Math.round(data.prima)} COP). Datos: deudas ${JSON.stringify(data.deudas)}, tarjetas deuda ${Math.round(data.tarjetas)}, metas ${JSON.stringify(data.metas)}, disponible hoy ${Math.round(data.disponible)}, gastos básicos mes ${Math.round(data.basicos)}. Español sencillo. "resumen": 2 frases. "pasos": 3 a 5 pasos con cifras $. "porcentajes" deben sumar 100.`,
    })
    return { ok: true, plan: object }
  } catch (e) { return { ok: false, msg: e instanceof AiUnavailable ? e.message : "No se pudo obtener la sugerencia" } }
}

/** Frase libre en Inicio cuando las reglas no entienden (EXTRA_FORM.nl de la v4). */
export async function parseNL(text: string): Promise<{ ok: boolean; tipo?: "gasto" | "ingreso"; valor?: number; descripcion?: string; fecha?: string; category_id?: string | null }> {
  const ctx = await requireRole("editor")
  const ia = await aiSettings(ctx.book.id)
  if (ia.on === false) return { ok: false }
  const cats = await catalog(ctx.book.id)
  try {
    const { object: r } = await aiObject({
      householdId: ctx.household.id, bookId: ctx.book.id,
      schema: z.object({ tipo: z.enum(["gasto", "ingreso"]), valor: z.number(), descripcion: z.string(), fecha: z.string(), categoria: z.string().nullable() }),
      prompt: `Interpreta lo que escribió una persona colombiana para registrar un movimiento de dinero. Hoy es ${todayBogota()}. Texto: "${text.slice(0, 300)}". Categorías de gasto: ${cats.map((c) => c.nombre).join(", ")}. "descripcion" corta. "fecha" YYYY-MM-DD. "categoria": una de la lista o null. "mil"=x1000, "lucas"=x1000, "palos"=millones.`,
    })
    if (!(r.valor > 0)) return { ok: false }
    return { ok: true, tipo: r.tipo, valor: Math.round(r.valor), descripcion: r.descripcion.slice(0, 80), fecha: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) ? r.fecha : todayBogota(), category_id: cats.find((c) => c.nombre.toLowerCase() === (r.categoria ?? "").toLowerCase())?.id ?? null }
  } catch { return { ok: false } }
}
