// Casos de uso de gastos (F2-D-3) con las reglas de features/expenses/expense-form.tsx, ahora en el servidor:
// categoría (manual → regla → historial → palabras → IA), hormiga, medio de pago por defecto, fondo de emergencia para
// "Imprevistos" y la sugerencia "¿es el pago de un gasto fijo?". Los enlaces van por las RPC de la base.
import { randomUUID } from "node:crypto"
import { Injectable } from "@nestjs/common"
import type { ExpenseInput, ExpenseSaved, LinkFixed } from "@mirai/contracts/modules/expenses"
import type { z } from "zod"
import { todayBogota } from "@mirai/domain/dates"
import { pagoPeriodo, sugerirPagoFijo } from "@mirai/domain/fixed"
import { atLeast } from "@mirai/domain/household/roles"
import { isHormiga, localCat, vecesMes, type LocalCatSource } from "@mirai/domain/hormiga"
import { DomainError } from "../../core/errors/domain-error"
import { BookStore, type Rec } from "../book-tables/book-store"
import { BookTablesRepo } from "../book-tables/book-tables.repository"
import { BookWritesService, ROW_IN_TRASH } from "../book-tables/book-writes.service"
import { num } from "../book-tables/http"
import { ExpenseClassifier } from "./expense-classifier"

type Input = z.output<typeof ExpenseInput>
type Cat = { id: string; nombre: string; grupo?: string | null }
export const EXPENSE_NOT_FOUND = "No encontramos ese gasto."
export const IMPREVISTOS = "Imprevistos"

@Injectable()
export class ExpensesService {
  constructor(
    private readonly w: BookWritesService,
    private readonly store: BookStore,
    private readonly tables: BookTablesRepo,
    private readonly classifier: ExpenseClassifier,
  ) {}

  /** POST /v1/books/:bookId/expenses */
  async save(v: Input): Promise<ExpenseSaved> {
    const { w, store } = this
    w.requireRole("registra", "registrarPropio")
    const id = v.id ?? randomUUID()
    const prev = v.id ? await store.find(w.scope, "expenses", id) : null
    if (prev && prev.book_id !== w.bookId) throw DomainError.notFound(EXPENSE_NOT_FOUND)
    if (prev?.deleted_at) throw DomainError.conflict(ROW_IN_TRASH)
    if (prev) w.requireOwnRow(prev)
    await w.assertRefs("expenses", { category_id: v.category_id, payment_method_id: v.payment_method_id, provider_id: v.provider_id })

    const [settings, cats, rules, methods] = await Promise.all([
      store.single(w.scope, "book_settings", w.bookId),
      store.rows(w.scope, "categories", w.bookId, { select: ["id", "nombre", "grupo"], order: { column: "sort", ascending: true } }) as Promise<Cat[]>,
      store.rows(w.scope, "keyword_rules", w.bookId, { select: ["keyword", "category_id"] }),
      store.rows(w.scope, "payment_methods", w.bookId, { select: ["id"], order: { column: "sort", ascending: true } }),
    ])
    const cfg = (settings ?? {}) as { umbral?: unknown; ia?: { on?: boolean; autocat?: boolean; hormiga?: boolean }; defaults?: { medio?: string }; trm?: Record<string, number> }
    const today = todayBogota()
    const descripcion = v.descripcion.trim()

    // Categoría: la escogida a mano o la de las reglas locales (y la IA decide si está prendida, como la web).
    let cat: { id: string; src: LocalCatSource | "manual" | "ia" } | null = v.category_id ? { id: v.category_id, src: "manual" } : null
    let history: Rec[] | null = null
    if (!cat) {
      history = await store.rows(w.scope, "expenses", w.bookId, { select: ["descripcion", "category_id", "fecha"], order: { column: "created_at", ascending: true } })
      const local = localCat(descripcion, { rules: rules as never, expenses: history as never, categories: cats as never })
      cat = local ? { id: local.category_id, src: local.src } : null
    }
    const ia = cfg.ia ?? {}
    const iaOn = w.hasFeature("ia") && ia.on !== false
    const needCat = iaOn && ia.autocat !== false && cat?.src !== "manual"
    const needH = iaOn && ia.hormiga !== false && v.hormiga === "auto"
    let ai: { category_id: string | null; hormiga: boolean | null; razon: string } | null = null
    if (needCat || needH) {
      history ??= await store.rows(w.scope, "expenses", w.bookId, { select: ["descripcion", "fecha"] })
      const out = await this.classifier.classify([{ i: 0, descripcion, valor: Math.round(v.valor), veces_mes: vecesMes(descripcion, history as never, today) }], { bookId: w.bookId, categories: cats }).catch(() => null)
      ai = out?.find((x) => x.i === 0) ?? null
    }
    if (needCat && ai?.category_id && cats.some((c) => c.id === ai!.category_id)) cat = { id: ai.category_id, src: "ia" }

    const h = v.hormiga === "auto" ? (needH && ai?.hormiga != null ? { hormiga: ai.hormiga, src: "ia", razon: ai.razon } : { hormiga: false, src: null, razon: null }) : { hormiga: v.hormiga === "si", src: "manual", razon: null }
    const medios = new Set(methods.map((m) => String(m.id)))
    const medio = v.payment_method_id || (cfg.defaults?.medio && medios.has(cfg.defaults.medio) ? cfg.defaults.medio : null) || (methods[0]?.id as string | undefined) || null
    const row: Rec = {
      descripcion, valor: v.valor, category_id: cat?.id ?? null, fecha: v.fecha ?? today, member_id: v.member_id ?? null, payment_method_id: medio,
      hormiga: h.hormiga, hormiga_src: h.src, hormiga_razon: h.razon, cat_src: cat ? cat.src : null, provider_id: v.provider_id ?? null, deducible: v.deducible ?? null,
      ...(v.nota !== undefined ? { nota: v.nota } : {}), ...(v.currency ? { currency: v.currency } : {}), ...(prev ? {} : { origen: v.origen }),
    }
    const expense = prev
      ? await store.update(w.scope, "expenses", w.bookId, id, row)
      : (await store.insert(w.scope, "expenses", [{ ...row, id, book_id: w.bookId, created_by: w.userId }]))[0]
    if (!expense) throw DomainError.role("Tu rol solo te deja cambiar lo que registraste tú.")

    const avisos: string[] = []
    let fondo: ExpenseSaved["fondo"] = null
    let sugerenciaFijo: ExpenseSaved["sugerenciaFijo"] = null
    const editor = atLeast(w.access, "editor")
    const imprevisto = cats.find((c) => c.id === cat?.id)?.nombre === IMPREVISTOS
    if (!prev && imprevisto && v.usarFondo) {
      if (!editor) avisos.push("Tu rol no permite usar el fondo de emergencia: el gasto quedó registrado sin descontarlo.")
      else {
        const f = await store.single(w.scope, "emergency_funds", w.bookId)
        if (f?.activo && num(f.saldo) > 0) {
          try {
            fondo = { saldo: num(await store.rpc(w.scope, "use_emergency_fund", { p_expense: id, p_valor: v.valor })) }
          } catch (e) {
            avisos.push(`El gasto se guardó, pero no se pudo descontar del fondo: ${e instanceof DomainError ? e.msg : "intenta de nuevo."}`)
          }
        }
      }
    } else if (!prev && editor) {
      const fijos = (await this.tables.part(w.scope, w.bookId, "fixed_expenses")).map((f: Rec) => ({ ...f, payments: ((f.fixed_expense_payments as Rec[] | undefined) ?? []).filter((p) => !p.deleted_at) }))
      const sug = sugerirPagoFijo({ descripcion, valor: v.valor, fecha: String(expense.fecha), provider_id: v.provider_id ?? null, fixed_expense_id: null, origen: v.origen }, fijos as never, today, { trm: cfg.trm })
      if (sug) sugerenciaFijo = { fixed_id: String(sug.fixed.id), nombre: sug.fixed.nombre, periodo: sug.per, due: sug.due, valor: sug.valor, abonado: sug.abonado, completo: sug.completo }
    }

    w.changed("expenses", id, prev ? "UPDATE" : "INSERT", fondo ? ["fund_movements", "emergency_funds"] : [])
    return {
      expense, creado: !prev, categoria: cat ? { id: cat.id, src: cat.src } : null,
      hormiga: isHormiga({ ...(expense as Rec), fixed_expense_id: null } as never, cats as never, num(cfg.umbral) || 25000),
      fondo, sugerenciaFijo, avisos,
    }
  }

  /**
   * POST …/expenses/:id/link-fixed (link_expense_fixed). Si el periodo ya tiene abonos, este gasto se suma como uno
   * más: queda pagado solo si cubre lo que falta (la misma regla de `pay_fixed_expense`).
   */
  async linkFixed(expenseId: string, b: z.output<typeof LinkFixed>): Promise<unknown> {
    this.w.requireRole("editor", "editarTodo")
    const g = await this.w.rowOf("expenses", expenseId, { alive: true, msg: EXPENSE_NOT_FOUND })
    const f = await this.w.rowOf("fixed_expenses", b.fixedId, { alive: true, msg: "No encontramos ese gasto fijo." })
    const currency = String(f.currency ?? "COP") || "COP"
    const fij = { frec: String(f.frec), valor: num(f.valor), reparto: f.reparto, variable: !!f.variable, currency }
    // El gasto que se enlaza está en pesos: lo esperado del periodo también (si el fijo está en USD o EUR y el libro
    // tiene la tasa). Sin tasa se compara como antes.
    const trm = await this.trmLibro(currency)
    const previos = (await this.store.rows(this.w.scope, "fixed_expense_payments", this.w.bookId, { eq: { fixed_expense_id: b.fixedId, periodo: b.periodo } }))
      .map((x) => ({ id: String(x.id), periodo: String(x.periodo), fecha: String(x.fecha), valor: num(x.valor), cierra: x.cierra as boolean | null }))
    const P = pagoPeriodo(fij, b.periodo, previos, trm)
    if (P.completo) throw DomainError.conflict("Ese periodo ya está pagado.")
    // Pagos de antes sin marcar que quedaron cortos: pasan a ser abonos (si no, la base no deja enlazar el resto).
    for (const x of previos.filter((x) => x.cierra == null)) await this.store.update(this.w.scope, "fixed_expense_payments", this.w.bookId, x.id, { cierra: false })
    // Sin abonos antes, enlazar deja el periodo pagado (como siempre: "esta vez costó menos"). Con abonos, solo si
    // este gasto cubre lo que falta.
    const cierra = b.completo ?? (!P.pagos.length || P.pagado + num(g.valor) >= P.esperado - 1)
    const r = await this.store.rpc(this.w.scope, "link_expense_fixed", { p_expense: expenseId, p_fixed: b.fixedId, p_periodo: b.periodo, p_cierra: cierra })
    this.w.changed("expenses", expenseId, "UPDATE", ["fixed_expense_payments", "fixed_expenses"])
    return { ...((r ?? {}) as Record<string, unknown>), completo: cierra, falta: cierra ? 0 : Math.max(0, P.esperado - P.pagado - num(g.valor)) }
  }

  /** La TRM del libro para la moneda de un gasto fijo (null en pesos o si no hay tasa guardada). */
  private async trmLibro(currency: string): Promise<Record<string, number> | null> {
    if (currency === "COP") return null
    const s = (await this.store.single(this.w.scope, "book_settings", this.w.bookId)) as { trm?: Record<string, number> } | null
    const tasa = Number(s?.trm?.[currency] ?? 0) || 0
    return tasa > 0 ? { [currency]: tasa } : null
  }

  /** POST …/expenses/:id/unlink-fixed (unlink_expense_fixed). */
  async unlinkFixed(expenseId: string): Promise<{ id: string }> {
    this.w.requireRole("editor", "editarTodo")
    await this.w.rowOf("expenses", expenseId, { msg: EXPENSE_NOT_FOUND })
    await this.store.rpc(this.w.scope, "unlink_expense_fixed", { p_expense: expenseId })
    this.w.changed("expenses", expenseId, "UPDATE", ["fixed_expense_payments", "fixed_expenses"])
    return { id: expenseId }
  }

  /** POST …/expenses/:id/use-fund (use_emergency_fund): devuelve lo que queda en el fondo. */
  async useFund(expenseId: string, valor?: number): Promise<{ saldo: number }> {
    this.w.requireRole("editor", "editarTodo")
    const g = await this.w.rowOf("expenses", expenseId, { alive: true, msg: EXPENSE_NOT_FOUND })
    const saldo = num(await this.store.rpc(this.w.scope, "use_emergency_fund", { p_expense: expenseId, p_valor: valor ?? num(g.valor) }))
    this.w.changed("expenses", expenseId, "UPDATE", ["fund_movements", "emergency_funds"])
    return { saldo }
  }
}
