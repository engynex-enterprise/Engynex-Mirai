import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { AppContext } from "@/lib/dal"
import type { Database } from "@/lib/supabase/database.types"
import { loadBookData, type LoadedBook } from "@/lib/book-data"
import { aiSettings } from "@/lib/ai/model"
import { aiPlatformSettings, householdQuota } from "@/lib/ai/usage"
import { chatFacts, type ChatFacts } from "@/lib/ai/router"
import { clip } from "@/lib/ai/compact"
import { can } from "@/lib/plans"
import { registraAlgo } from "@/lib/chat/permisos"
import { contextoChat } from "@/lib/chat/contexto"
import { integralExtras, necesitaRenta } from "@/lib/chat/extras"
import type { ExtrasIntegral } from "@/lib/domain/flujo-integral"
import { loadRentaData } from "@/features/renta/data"
import { todayBogota } from "@/lib/domain"
import type { ChatFlags, ChatHints } from "@/lib/chat/types"

// Datos del libro que usa el chat (servidor): hechos ya calculados, banderas para las sugerencias y estado de la IA.

export type ChatBook = { book: LoadedBook; facts: ChatFacts; flags: ChatFlags; datos: string; today: string; X: ExtrasIntegral }

/**
 * Libro + lo que el flujo integral necesita y no viaja en él (estimados de impuestos, mesadas y fondo), armado igual
 * que en el Balance (lib/chat/extras.ts). Así las cifras del chat son las del Balance y el Dashboard.
 */
export async function loadChatBook(sb: SupabaseClient<Database>, bookId: string, householdId?: string): Promise<ChatBook> {
  const today = todayBogota()
  const [book, fondo, taxAssets, incCats, allowances, movs, members] = await Promise.all([
    loadBookData(sb, bookId),
    sb.from("fund_movements").select("fecha,valor,tipo,expense_id").eq("book_id", bookId).is("deleted_at", null),
    sb.from("tax_assets").select("tipo,avaluo,predial,imp_veh,soat,pct").eq("book_id", bookId).is("deleted_at", null),
    sb.from("income_categories").select("id,nombre").eq("book_id", bookId).is("deleted_at", null),
    sb.from("allowances").select("id,member_id,mesada,frec").eq("book_id", bookId).is("deleted_at", null),
    sb.from("allowance_movements").select("allowance_id,fecha,valor").eq("book_id", bookId).is("deleted_at", null),
    householdId ? sb.from("family_members").select("id,nombre").eq("household_id", householdId).is("deleted_at", null) : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ])
  // La renta del calendario sin valor se estima con el borrador de la Declaración (solo si hace falta: es costoso).
  const renta = necesitaRenta(book) ? await loadRentaData(sb, bookId).catch(() => null) : null
  const X = integralExtras(book, today, {
    taxAssets: taxAssets.data ?? [], incCats: incCats.data ?? [], allowances: allowances.data ?? [], movs: movs.data ?? [],
    fondo: fondo.data ?? [], members: members.data ?? [], renta,
  })
  // El fondo de emergencia ya viene en el libro (book.fund, F1): las mismas cifras de Metas y el Dashboard.
  const facts = chatFacts(book, today, X)
  const top = Object.entries(facts.por_categoria).sort((a, b) => b[1] - a[1])[0]
  const meta = [...book.goals].filter((g) => +g.objetivo > 0).sort((a, b) => +a.ahorrado / +a.objetivo - +b.ahorrado / +b.objetivo)[0]
  const flags: ChatFlags = {
    tarjetas: book.creditCards.length, deudas: book.loans.filter((l) => l.kind === "pagar").length, metas: book.goals.length,
    suscripciones: book.subscriptions.length, ingresos: book.incomes.length, gastos: book.expenses.length,
    topCategoria: top && top[0] !== "Sin categoría" ? top[0] : null, meta: meta?.nombre ? clip(meta.nombre, 32) : null,
  }
  return { book, facts, flags, datos: contextoChat(book, today, facts, X), today, X }
}

/** Banderas del libro para las sugerencias (sin montos ni el flujo integral: más liviano que loadChatBook). */
async function loadChatFlags(sb: SupabaseClient<Database>, bookId: string): Promise<{ flags: ChatFlags }> {
  const today = todayBogota()
  const book = await loadBookData(sb, bookId)
  const k = today.slice(0, 7)
  const name = new Map(book.categories.map((c) => [c.id, c.nombre]))
  const by = new Map<string, number>()
  for (const g of book.expenses) if (g.fecha.startsWith(k)) { const nm = name.get(g.category_id ?? "") ?? ""; by.set(nm, (by.get(nm) ?? 0) + +g.valor) }
  const top = [...by.entries()].filter(([n]) => n).sort((a, b) => b[1] - a[1])[0]
  const meta = [...book.goals].filter((g) => +g.objetivo > 0).sort((a, b) => +a.ahorrado / +a.objetivo - +b.ahorrado / +b.objetivo)[0]
  return {
    flags: {
      tarjetas: book.creditCards.length, deudas: book.loans.filter((l) => l.kind === "pagar").length, metas: book.goals.length,
      suscripciones: book.subscriptions.length, ingresos: book.incomes.length, gastos: book.expenses.length,
      topCategoria: top?.[0] ?? null, meta: meta?.nombre ? clip(meta.nombre, 32) : null,
    },
  }
}

/** ¿Puede usar IA el chat? Plan Premium + IA encendida. */
export async function chatAi(ctx: AppContext) {
  const premium = can(ctx.plan, "ia")
  const ia = await aiSettings(ctx.book.id)
  return { premium, off: ia.on === false, allowed: premium && ia.on !== false }
}

/** Datos para la pantalla del chat: nombre, rol, banderas para sugerencias y créditos de IA. */
export async function chatHintsFor(ctx: AppContext, sb: SupabaseClient<Database>): Promise<ChatHints> {
  const [{ flags }, ai, s] = await Promise.all([loadChatFlags(sb, ctx.book.id), chatAi(ctx), aiPlatformSettings()])
  let quota: ChatHints["ia"]["quota"] = null
  if (ai.allowed && s.cuposActivo) {
    try { const q = await householdQuota(ctx.household.id, ctx.plan.id); quota = { nivel: q.nivel, quedan: q.quedan, cupo: q.cupo } } catch { /* sin cupo visible */ }
  }
  return { nombre: (ctx.user.apodo || ctx.user.nombre || "").split(" ")[0] || "", canEdit: registraAlgo(ctx.household.access), flags, ia: { ...ai, quota } }
}
