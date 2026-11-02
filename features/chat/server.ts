import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { AppContext } from "@/lib/dal"
import type { Database } from "@/lib/supabase/database.types"
import { loadBookData, type LoadedBook } from "@/lib/book-data"
import { aiSettings } from "@/lib/ai/model"
import { aiPlatformSettings, householdQuota } from "@/lib/ai/usage"
import { chatFacts, type ChatFacts } from "@/lib/ai/router"
import { clip, toLines, topN } from "@/lib/ai/compact"
import { can } from "@/lib/plans"
import { todayBogota } from "@/lib/domain"
import type { ChatFlags, ChatHints } from "@/lib/chat/types"

// Datos del libro que usa el chat (servidor): hechos ya calculados, banderas para las sugerencias y estado de la IA.

export type ChatBook = { book: LoadedBook; facts: ChatFacts; flags: ChatFlags; datos: string; today: string }

export async function loadChatBook(sb: SupabaseClient<Database>, bookId: string): Promise<ChatBook> {
  const today = todayBogota()
  const [book, { data: fund }] = await Promise.all([loadBookData(sb, bookId), sb.from("emergency_funds").select("activo,saldo").eq("book_id", bookId).maybeSingle()])
  const facts = chatFacts({ ...book, fund: fund ? { on: fund.activo, saldo: +fund.saldo } : null }, today)
  const top = Object.entries(facts.por_categoria).sort((a, b) => b[1] - a[1])[0]
  const meta = [...book.goals].filter((g) => +g.objetivo > 0).sort((a, b) => +a.ahorrado / +a.objetivo - +b.ahorrado / +b.objetivo)[0]
  const flags: ChatFlags = {
    tarjetas: book.creditCards.length, deudas: book.loans.filter((l) => l.kind === "pagar").length, metas: book.goals.length,
    suscripciones: book.subscriptions.length, ingresos: book.incomes.length, gastos: book.expenses.length,
    topCategoria: top && top[0] !== "Sin categoría" ? top[0] : null, meta: meta?.nombre ? clip(meta.nombre, 32) : null,
  }
  // Contexto compacto para la IA: hechos ya calculados, solo las 8 categorías con más gasto y cifras redondeadas.
  const f = facts
  const datos = toLines({
    hoy: today, mes: f.mes, ingreso_mensual: f.ingreso_mensual, gasto_mes_hasta_hoy: f.gasto_mes, gasto_mes_anterior: f.gasto_mes_anterior,
    gasto_por_categoria_mes: topN(f.por_categoria, 8), gastos_fijos_mes: f.gastos_fijos_mes, cuotas_deudas_mes: f.cuotas_deudas_mes,
    suscripciones_mes: f.suscripciones_mes, hormiga_mes: f.hormiga_mes, disponible: f.disponible, fondo_emergencia: f.fondo_emergencia,
    tarjetas: book.creditCards.length, deudas: f.deudas.slice(0, 6).map((d) => ({ nombre: clip(d.nombre, 30), saldo: d.saldo })), te_deben: f.te_deben,
    metas: f.metas.slice(0, 5).map((m) => ({ nombre: clip(m.nombre, 30), objetivo: m.objetivo, ahorrado: m.ahorrado })),
    categorias: book.categories.map((c) => c.nombre).join(", "),
  })
  return { book, facts, flags, datos, today }
}

/** ¿Puede usar IA el chat? Plan Premium + IA encendida. */
export async function chatAi(ctx: AppContext) {
  const premium = can(ctx.plan, "ia")
  const ia = await aiSettings(ctx.book.id)
  return { premium, off: ia.on === false, allowed: premium && ia.on !== false }
}

/** Datos para la pantalla del chat: nombre, rol, banderas para sugerencias y créditos de IA. */
export async function chatHintsFor(ctx: AppContext, sb: SupabaseClient<Database>): Promise<ChatHints> {
  const [{ flags }, ai, s] = await Promise.all([loadChatBook(sb, ctx.book.id), chatAi(ctx), aiPlatformSettings()])
  let quota: ChatHints["ia"]["quota"] = null
  if (ai.allowed && s.cuposActivo) {
    try { const q = await householdQuota(ctx.household.id, ctx.plan.id); quota = { nivel: q.nivel, quedan: q.quedan, cupo: q.cupo } } catch { /* sin cupo visible */ }
  }
  return { nombre: (ctx.user.apodo || ctx.user.nombre || "").split(" ")[0] || "", canEdit: ctx.household.role !== "viewer", flags, ia: { ...ai, quota } }
}
