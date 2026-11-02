import "server-only"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import { aiAllowed, aiObject, logAlgorithm, tokensFor } from "@/lib/ai/run"
import { aiSettings } from "@/lib/ai/model"
import { routeClassify, type ClassifyItem, type ClassifyOut } from "@/lib/ai/router"
import { clip } from "@/lib/ai/compact"

// Categoría y gasto hormiga con reglas primero y la IA para decidir (aiClassify de la v4). Un solo motor para el
// formulario de gastos (classifyExpenses), la entrada rápida y el chat: así un gasto cae en la misma categoría sin
// importar por dónde se registró. Solo servidor: recibe quién llama (ya validado) y su cliente de Supabase.

const GRP = { n: "necesidad", g: "gusto", a: "ahorro" } as Record<string, string>

export type Who = { householdId: string; bookId: string; userId: string }

/** null si la IA está apagada, sin plan o sin las funciones de categoría y hormiga. */
export async function classifyWith(sb: SupabaseClient<Database>, who: Who, items: ClassifyItem[]): Promise<{ out: ClassifyOut[]; creditos: number } | null> {
  const ia = await aiSettings(who.bookId)
  if (ia.on === false || (ia.autocat === false && ia.hormiga === false) || !items.length) return null
  if (!(await aiAllowed(who.householdId, who.bookId))) return null
  const [{ data: cats }, { data: cfg }, { data: rules }, { data: hist }] = await Promise.all([
    sb.from("categories").select("id,nombre,grupo,icon,tope").eq("book_id", who.bookId).is("deleted_at", null).order("sort"),
    sb.from("book_settings").select("umbral").eq("book_id", who.bookId).single(),
    sb.from("keyword_rules").select("keyword,category_id").eq("book_id", who.bookId).is("deleted_at", null),
    sb.from("expenses").select("descripcion,category_id").eq("book_id", who.bookId).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
  ])
  const categories = cats ?? []
  const umbral = +(cfg?.umbral ?? 25000)
  const { done, pending } = routeClassify(items.slice(0, 60), { rules: rules ?? [], expenses: (hist ?? []).reverse(), categories, umbral, needCat: ia.autocat !== false, needH: ia.hormiga !== false, siempreIA: true })
  const catsTxt = `Categorías (nombre: tipo): ${categories.map((c) => `${c.nombre}: ${GRP[c.grupo] ?? "gusto"}`).join(", ")}\nHormiga suele ser de hasta $ ${(umbral * 2).toLocaleString("es-CO")}.`
  const line = (p: ClassifyItem, cat?: string, que = "") => `${p.i} | ${clip(p.descripcion, 60)} | ${Math.round(p.valor)} | ${p.veces_mes} | ${cat ?? "-"} | ${que}`
  // Lo resuelto con reglas no gasta tokens: se registra con el estimado de lo que habría costado preguntarlo.
  if (done.length) await logAlgorithm({ ...who, feature: "categorizar", evitados: tokensFor("categorizar", `${catsTxt}\n${items.filter((x) => done.some((d) => d.i === x.i)).map((x) => line(x)).join("\n")}`) })
  if (!pending.length) return { out: done, creditos: 0 }
  try {
    const { object, creditos } = await aiObject({
      ...who, feature: "categorizar",
      schema: z.object({ items: z.array(z.object({ i: z.number(), categoria: z.string().nullable(), hormiga: z.boolean().nullable(), razon: z.string() })) }),
      prompt: `${catsTxt}\nGASTOS (i | descripción | valor | veces en el mes | categoría probable según las reglas de la persona, úsala si encaja | qué decidir):\n${pending.map((p) => line(p, p.cat, [p.askCat && "categoria", p.askH && "hormiga"].filter(Boolean).join("+"))).join("\n")}`,
    })
    const ai = object.items.flatMap((x): ClassifyOut[] => {
      const p = pending.find((y) => y.i === x.i)
      if (!p) return []
      const aiCat = categories.find((c) => c.nombre.toLowerCase() === (x.categoria ?? "").toLowerCase())?.id ?? null
      return [{ i: x.i, category_id: p.askCat ? aiCat ?? p.category_id : p.category_id, hormiga: p.askH ? x.hormiga : null, razon: x.razon.slice(0, 80), src: "ia" }]
    })
    return { out: [...done, ...ai], creditos }
  } catch { return done.length ? { out: done, creditos: 0 } : null }
}
