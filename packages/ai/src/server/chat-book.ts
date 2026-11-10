import type { LoadedBook } from "@mirai/domain/book-data"
import { rentaDataFrom } from "@mirai/domain/integral-extras"
import { refPorAnio } from "@mirai/domain/payroll"
import { rt } from "@mirai/services/runtime"
import { aiSettings } from "../model"
import { aiPlatformSettings, householdQuota } from "../usage"
import { chatFacts, type ChatFacts } from "../router"
import { clip } from "../compact"
import { can } from "@mirai/domain/plans"
import { registraAlgo } from "../chat/permisos"
import { contextoChat } from "../chat/contexto"
import { integralExtras, necesitaRenta } from "../chat/extras"
import type { ExtrasIntegral } from "@mirai/domain/flujo-integral"
import { todayBogota } from "@mirai/domain"
import type { ChatFlags, ChatHints } from "../chat/types"
import { whoOf, type AiCtx, type Sb } from "./ctx"
import type { KeywordRuleIn } from "@mirai/domain"
import { resolveCategory, type Categoria, type Categorize } from "../chat/tools"
import { classifyWith } from "./classify"

// Datos del libro que usa el chat (servidor: web y API): hechos ya calculados, banderas para las sugerencias y estado
// de la IA. Movido de apps/web/features/chat/server.ts (F2-F). El libro se carga con rt().loadBook (el cargador de la web
// o el de @mirai/services en la API: las mismas consultas) y el cliente de la persona (RLS).

const loadBookData = (sb: Sb, bookId: string) => rt().loadBook(sb, bookId)

/**
 * Lo que el borrador de la Declaración necesita para estimar la renta del calendario (como loadRentaData de
 * apps/web/features/renta/data.ts, sin perfil, fechas ni documentos, que el cálculo no usa). Mismas consultas que el
 * módulo insights de la API. Si las tablas de referencia fallan, los cálculos usan las constantes del código.
 */
async function loadRentaCalc(sb: Sb, book: LoadedBook, bookId: string, householdId: string) {
  const [mem, cats, bienes, years, u, s] = await Promise.all([
    sb.from("family_members").select("*").eq("household_id", householdId).is("deleted_at", null).order("sort").order("created_at"),
    sb.from("income_categories").select("id,nombre").eq("book_id", bookId),
    sb.from("tax_assets").select("*").eq("book_id", bookId).is("deleted_at", null).order("created_at"),
    sb.from("tax_years").select("*").eq("book_id", bookId).is("deleted_at", null),
    sb.from("ref_uvt").select("year,valor"),
    sb.from("ref_smmlv").select("year,valor"),
  ])
  const ref = { uvt: refPorAnio(u.data), smmlv: refPorAnio(s.data) }
  return rentaDataFrom(book, { members: mem.data ?? [], incomeCategories: cats.data ?? [], bienes: bienes.data ?? [], years: years.data ?? [], perfil: null, fechas: [], attachments: [], liabilities: [], ref })
}

export type ChatBook = { book: LoadedBook; facts: ChatFacts; flags: ChatFlags; datos: string; today: string; X: ExtrasIntegral }

/**
 * Libro + lo que el flujo integral necesita y no viaja en él (estimados de impuestos, mesadas y fondo), armado igual
 * que en el Balance (lib/chat/extras.ts). Así las cifras del chat son las del Balance y el Dashboard.
 */
export async function loadChatBook(sb: Sb, bookId: string, householdId: string): Promise<ChatBook> {
  const today = todayBogota()
  const [book, fondo, taxAssets, incCats, allowances, movs, members] = await Promise.all([
    loadBookData(sb, bookId),
    sb.from("fund_movements").select("fecha,valor,tipo,expense_id").eq("book_id", bookId).is("deleted_at", null),
    sb.from("tax_assets").select("tipo,avaluo,predial,imp_veh,soat,pct").eq("book_id", bookId).is("deleted_at", null),
    sb.from("income_categories").select("id,nombre").eq("book_id", bookId).is("deleted_at", null),
    sb.from("allowances").select("id,member_id,mesada,frec").eq("book_id", bookId).is("deleted_at", null),
    sb.from("allowance_movements").select("allowance_id,fecha,valor").eq("book_id", bookId).is("deleted_at", null),
    sb.from("family_members").select("id,nombre").eq("household_id", householdId).is("deleted_at", null),
  ])
  // La renta del calendario sin valor se estima con el borrador de la Declaración (solo si hace falta: es costoso).
  const renta = necesitaRenta(book) ? await loadRentaCalc(sb, book, bookId, householdId).catch(() => null) : null
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
async function loadChatFlags(sb: Sb, bookId: string): Promise<{ flags: ChatFlags }> {
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
export async function chatAi(ctx: Pick<AiCtx, "plan" | "book">) {
  const premium = can(ctx.plan, "ia")
  const ia = await aiSettings(ctx.book.id)
  return { premium, off: ia.on === false, allowed: premium && ia.on !== false }
}

/** Datos para la pantalla del chat: nombre, rol, banderas para sugerencias y créditos de IA. */
export async function chatHintsFor(ctx: AiCtx, sb: Sb): Promise<ChatHints> {
  const [{ flags }, ai, s] = await Promise.all([loadChatFlags(sb, ctx.book.id), chatAi(ctx), aiPlatformSettings()])
  let quota: ChatHints["ia"]["quota"] = null
  if (ai.allowed && s.cuposActivo) {
    try { const q = await householdQuota(ctx.household.id, ctx.plan.id); quota = { nivel: q.nivel, quedan: q.quedan, cupo: q.cupo } } catch { /* sin cupo visible */ }
  }
  return { nombre: (ctx.user.apodo || ctx.user.nombre || "").split(" ")[0] || "", canEdit: registraAlgo(ctx.household.access), flags, ia: { ...ai, quota } }
}

/**
 * Categoría de los gastos que propone el chat (texto o documento): la que nombró el modelo (si existe) o reglas + IA,
 * como el formulario. `creditos()` suma lo que costó clasificar con IA.
 */
export function categorizer(ctx: AiCtx, sb: Sb, book: LoadedBook, aiAllowed: boolean) {
  let memo: KeywordRuleIn[] | null = null
  let creditos = 0
  const rules = async () => (memo ??= ((await sb.from("keyword_rules").select("keyword,category_id").eq("book_id", ctx.book.id).is("deleted_at", null)).data ?? []) as KeywordRuleIn[])
  const categorize: Categorize = async (descripcion, valor, nombre) => {
    const local = resolveCategory(book, await rules(), descripcion, nombre)
    if (local.src === "ia" || !aiAllowed) return local
    const r = await classifyWith(sb, whoOf(ctx), [{ i: 0, descripcion, valor, veces_mes: book.expenses.filter((g) => g.descripcion.trim().toLowerCase() === descripcion.trim().toLowerCase()).length }]).catch(() => null)
    const hit = r?.out[0]
    creditos += r?.creditos ?? 0
    const cat = hit?.category_id ? book.categories.find((c) => c.id === hit.category_id) : undefined
    return cat ? ({ id: cat.id, nombre: cat.nombre, src: hit!.src === "ia" ? "ia" : local.src ?? "regla" } satisfies Categoria) : local
  }
  return { rules, categorize, creditos: () => creditos }
}
