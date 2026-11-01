"use server"

import { z } from "zod"
import { requireRole } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import { aiObject, AiUnavailable } from "@/lib/ai/run"
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
