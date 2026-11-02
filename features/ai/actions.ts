"use server"

import { z } from "zod"
import { requireRole } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import { aiAllowed, aiObject, aiText, AiUnavailable, logAlgorithm, tokensFor } from "@/lib/ai/run"
import { aiSettings } from "@/lib/ai/model"
import { routeClassify, type ClassifyItem, type ClassifyOut } from "@/lib/ai/router"
import { clip, toLines } from "@/lib/ai/compact"
import { todayBogota } from "@/lib/domain"

const GRP = { n: "necesidad", g: "gusto", a: "ahorro" } as Record<string, string>
const MAX_IMG = 6 * 1024 * 1024

async function catalog(bookId: string) {
  const sb = await supabaseServer()
  const { data } = await sb.from("categories").select("id,nombre,grupo,icon,tope").eq("book_id", bookId).is("deleted_at", null).order("sort")
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
      householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id, feature: "factura", images: [await image(fd)],
      schema: z.object({ comercio: z.string(), valor: z.number(), fecha: z.string().nullable(), categoria: z.string().nullable() }),
      prompt: `Categorías: ${cats.map((c) => c.nombre).join(", ")}`,
    })
    const cat = cats.find((c) => c.nombre.toLowerCase() === (r.categoria ?? "").toLowerCase())
    return { ok: true, comercio: r.comercio.slice(0, 80), valor: Math.round(r.valor), fecha: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha ?? "") ? r.fecha : null, category_id: cat?.id ?? null }
  } catch (e) { return fail(e) }
}

export type { ClassifyItem, ClassifyOut } from "@/lib/ai/router"

/**
 * Categoría y gasto hormiga (aiClassify de la v4). Primero reglas (tus reglas, historial, palabras clave y los casos
 * claros de hormiga) y solo los dudosos van a la IA. Devuelve null si la IA está apagada o no está en el plan.
 */
export async function classifyExpenses(items: ClassifyItem[]): Promise<ClassifyOut[] | null> {
  const ctx = await requireRole("viewer")
  const ia = await aiSettings(ctx.book.id)
  if (ia.on === false || (ia.autocat === false && ia.hormiga === false) || !items.length) return null
  if (!(await aiAllowed(ctx.household.id, ctx.book.id))) return null
  const sb = await supabaseServer()
  const [cats, { data: cfg }, { data: rules }, { data: hist }] = await Promise.all([
    catalog(ctx.book.id),
    sb.from("book_settings").select("umbral").eq("book_id", ctx.book.id).single(),
    sb.from("keyword_rules").select("keyword,category_id").eq("book_id", ctx.book.id).is("deleted_at", null),
    sb.from("expenses").select("descripcion,category_id").eq("book_id", ctx.book.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
  ])
  const umbral = +(cfg?.umbral ?? 25000)
  const { done, pending } = routeClassify(items.slice(0, 60), { rules: rules ?? [], expenses: (hist ?? []).reverse(), categories: cats, umbral, needCat: ia.autocat !== false, needH: ia.hormiga !== false, siempreIA: true })
  const catsTxt = `Categorías (nombre: tipo): ${cats.map((c) => `${c.nombre}: ${GRP[c.grupo] ?? "gusto"}`).join(", ")}\nHormiga suele ser de hasta $ ${(umbral * 2).toLocaleString("es-CO")}.`
  const line = (p: ClassifyItem, cat?: string, que = "") => `${p.i} | ${clip(p.descripcion, 60)} | ${Math.round(p.valor)} | ${p.veces_mes} | ${cat ?? "-"} | ${que}`
  // Lo resuelto con reglas no gasta tokens: se registra con el estimado de lo que habría costado preguntarlo.
  if (done.length) await logAlgorithm({ householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id, feature: "categorizar", evitados: tokensFor("categorizar", `${catsTxt}\n${items.filter((x) => done.some((d) => d.i === x.i)).map((x) => line(x)).join("\n")}`) })
  if (!pending.length) return done
  try {
    const { object } = await aiObject({
      householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id, feature: "categorizar",
      schema: z.object({ items: z.array(z.object({ i: z.number(), categoria: z.string().nullable(), hormiga: z.boolean().nullable(), razon: z.string() })) }),
      prompt: `${catsTxt}\nGASTOS (i | descripción | valor | veces en el mes | categoría probable según las reglas de la persona, úsala si encaja | qué decidir):\n${pending.map((p) => line(p, p.cat, [p.askCat && "categoria", p.askH && "hormiga"].filter(Boolean).join("+"))).join("\n")}`,
    })
    const ai = object.items.flatMap((x): ClassifyOut[] => {
      const p = pending.find((y) => y.i === x.i)
      if (!p) return []
      const aiCat = cats.find((c) => c.nombre.toLowerCase() === (x.categoria ?? "").toLowerCase())?.id ?? null
      return [{ i: x.i, category_id: p.askCat ? aiCat : p.category_id, hormiga: p.askH ? x.hormiga : null, razon: x.razon.slice(0, 80), src: "ia" }]
    })
    return [...done, ...ai]
  } catch { return done.length ? done : null }
}

/** Revisa con IA los gastos del mes sin veredicto de hormiga (reviewMonth de la v4), en lotes de 40. */
export async function reviewMonthHormiga(k: string): Promise<{ ok: boolean; msg: string }> {
  if (typeof k !== "string" || !/^\d{4}-\d{2}$/.test(k)) return { ok: false, msg: "Mes inválido." }
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

/** Propone nombre, ícono, tipo y tope de una categoría nueva (aiCat de la v4). */
export async function suggestCategory(desc: string, nombre: string, icons: string[]): Promise<{ ok: boolean; s?: { nombre: string; icon: string; grupo: "n" | "g" | "a"; tope: number; razon: string } }> {
  const ctx = await requireRole("editor")
  if (!(await asist(ctx.book.id))) return { ok: false }
  icons = (Array.isArray(icons) ? icons : []).filter((x) => typeof x === "string" && /^[a-z0-9-]{1,40}$/.test(x)).slice(0, 300)
  desc = String(desc ?? ""); nombre = String(nombre ?? "")
  const cats = await catalog(ctx.book.id)
  try {
    const { object: r } = await aiObject({
      householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id, feature: "categoria_nueva",
      schema: z.object({ nombre: z.string(), icon: z.string(), grupo: z.enum(["n", "g", "a"]), tope: z.number(), razon: z.string() }),
      prompt: `Gasto o idea: "${clip(desc || nombre, 120)}".${nombre ? ` Nombre que sugiere la persona: "${clip(nombre, 40)}".` : ""}
Ya existen: ${cats.map((c) => c.nombre).join(", ")}.
Íconos: ${icons.join(", ")}.`,
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
      householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id, feature: "entidad",
      schema: z.object({ nombre: z.string(), razon_social: z.string(), nit: z.string(), tipo: z.string(), confianza: z.enum(["alta", "media", "baja"]), nota: z.string() }),
      prompt: `Dato: "${q.trim().slice(0, 120)}"\nTipos: ${ENT_T.join(", ")}`,
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
      householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id, feature: "documento_prestamo", images: [await image(fd)], schema: LoanDoc,
      prompt: kind === "cobrar" ? "La persona es quien PRESTÓ el dinero." : "La persona es quien DEBE el dinero.",
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
      householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id, feature: "comprobante", images: [await image(fd)],
      schema: z.object({ valor: z.number().nullable(), fecha: z.string().nullable(), referencia: z.string().nullable(), pagador: z.string().nullable(), beneficiario: z.string().nullable() }),
      prompt: "Lee el comprobante.",
    })
    return { ok: true, valor: r.valor ? Math.round(r.valor) : null, fecha: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha ?? "") ? r.fecha : null, referencia: r.referencia ?? "" }
  } catch (e) { return { ok: false, msg: fail(e).msg.replace("la imagen", "el comprobante") } }
}

// ── Textos con IA ──
/** Reescribe el mensaje de cobro para WhatsApp (cobroIA de la v4). */
export async function improveCobro(msg: string, tono: "amable" | "directo" | "firme"): Promise<{ ok: boolean; text: string }> {
  const ctx = await requireRole("viewer")
  if (!["amable", "directo", "firme"].includes(tono)) tono = "amable"
  msg = String(msg ?? "")
  try {
    const { text } = await aiText({ householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id, feature: "cobro", prompt: `Tono: ${tono}.\nMENSAJE:\n${msg.slice(0, 1500)}` })
    return { ok: true, text: text.trim() }
  } catch (e) { return { ok: false, text: e instanceof AiUnavailable ? e.message : "No se pudo mejorar el mensaje" } }
}

/** Plan para la próxima prima (priIA de la v4). */
export async function primaPlan(data: { prima: number; deudas: { nombre: string; saldo: number; interes_mensual: number }[]; tarjetas: number; metas: { nombre: string; falta: number }[]; disponible: number; basicos: number }): Promise<{ ok: boolean; msg?: string; plan?: { resumen: string; pasos: string[]; porcentajes: { deudas: number; ahorro: number; metas: number; gusto: number } } }> {
  const ctx = await requireRole("viewer")
  try {
    const { object } = await aiObject({
      householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id, feature: "prima",
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

/** Frase libre en Inicio cuando las reglas no entienden (EXTRA_FORM.nl de la v4). */
export async function parseNL(text: string): Promise<{ ok: boolean; tipo?: "gasto" | "ingreso"; valor?: number; descripcion?: string; fecha?: string; category_id?: string | null }> {
  const ctx = await requireRole("editor")
  const ia = await aiSettings(ctx.book.id)
  if (ia.on === false) return { ok: false }
  const cats = await catalog(ctx.book.id)
  try {
    const { object: r } = await aiObject({
      householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id, feature: "frase_libre",
      schema: z.object({ tipo: z.enum(["gasto", "ingreso"]), valor: z.number(), descripcion: z.string(), fecha: z.string(), categoria: z.string().nullable() }),
      prompt: `HOY: ${todayBogota()}\nCategorías: ${cats.map((c) => c.nombre).join(", ")}\nFRASE: "${text.slice(0, 300)}"`,
    })
    if (!(r.valor > 0)) return { ok: false }
    return { ok: true, tipo: r.tipo, valor: Math.round(r.valor), descripcion: r.descripcion.slice(0, 80), fecha: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) ? r.fecha : todayBogota(), category_id: cats.find((c) => c.nombre.toLowerCase() === (r.categoria ?? "").toLowerCase())?.id ?? null }
  } catch { return { ok: false } }
}
