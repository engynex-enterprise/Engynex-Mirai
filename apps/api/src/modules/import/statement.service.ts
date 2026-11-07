// Importar extractos (F2-D-9) con las reglas de features/import/import-view.tsx, ahora en el servidor:
// parseCSV + ids estables `csv:` (csvExternalIds), repetidos por id o por fecha + descripción + valor, categoría local
// (regla → historial → palabras) y, en la vista previa, la IA por el puerto ExpenseClassifier si el plan la incluye.
// Al importar se vuelve a leer el MISMO texto (los ids salen del archivo completo, no de lo que mande el cliente).
import { Injectable } from "@nestjs/common"
import type { z } from "zod"
import type { CommitInput, StatementRow } from "@mirai/contracts/modules/import"
import { csvExternalIds, parseCSV, type CsvRow } from "@mirai/domain/csv"
import { localCat, localHormiga } from "@mirai/domain/hormiga"
import { DomainError } from "../../core/errors/domain-error"
import { aliveIds, BookStore, type Rec } from "../book-tables/book-store"
import { BookWritesService } from "../book-tables/book-writes.service"
import { num } from "../book-tables/http"
import { ExpenseClassifier } from "../expenses/expense-classifier"

type Commit = z.output<typeof CommitInput>
type Ctx = { cats: { id: string; nombre: string; grupo?: string | null }[]; rules: Rec[]; history: Rec[]; ya: Set<string>; umbral: number; settings: Rec | null }

const key = (f: string, d: string, v: number) => `${f}|${d.toLowerCase().trim()}|${Math.round(v)}`

@Injectable()
export class StatementService {
  constructor(
    private readonly w: BookWritesService,
    private readonly store: BookStore,
    private readonly classifier: ExpenseClassifier,
  ) {}

  private async ctx(): Promise<Ctx> {
    const { w, store } = this
    const [settings, cats, rules, history, extras] = await Promise.all([
      store.single(w.scope, "book_settings", w.bookId),
      store.rows(w.scope, "categories", w.bookId, { select: ["id", "nombre", "grupo"], order: { column: "sort", ascending: true } }),
      store.rows(w.scope, "keyword_rules", w.bookId, { select: ["keyword", "category_id"] }),
      store.rows(w.scope, "expenses", w.bookId, { select: ["fecha", "descripcion", "valor", "category_id", "external_id"], order: { column: "created_at", ascending: true } }),
      store.rows(w.scope, "extra_incomes", w.bookId, { select: ["external_id"] }),
    ])
    const ya = new Set([...history, ...extras].map((g) => g.external_id).filter(Boolean).map(String))
    return { settings, cats: cats as Ctx["cats"], rules, history, ya, umbral: num(settings?.umbral) || 25000 }
  }

  /** Filas del extracto con id estable, repetidos y propuesta local (sin IA). */
  private read(csv: string, c: Ctx): { rows: StatementRow[]; skipped: number } {
    const r = parseCSV(csv, c.rules as never)
    if (r.err !== undefined || !r.rows) throw DomainError.validation(r.err ?? "No se pudo leer el archivo.", { csv: r.err ?? "No se pudo leer el archivo" })
    const seen = new Set(c.history.map((g) => key(String(g.fecha), String(g.descripcion ?? ""), num(g.valor))))
    const ids = csvExternalIds(r.rows)
    const rows = r.rows.map((x: CsvRow, i): StatementRow => {
      const local = x.abono || x.category_id ? null : localCat(x.descripcion, { rules: c.rules as never, expenses: c.history as never, categories: c.cats as never })
      const cat = x.abono ? null : (x.category_id ?? local?.category_id ?? null)
      const dup = c.ya.has(ids[i]) || (!x.abono && seen.has(key(x.fecha, x.descripcion, x.valor)))
      return {
        i, fecha: x.fecha, descripcion: x.descripcion, valor: x.valor, abono: !!x.abono, ext: ids[i], dup, incl: x.incl && !dup,
        category_id: cat, src: x.abono ? null : x.category_id ? "regla" : (local?.src ?? null),
        hormiga: !x.abono && localHormiga({ descripcion: x.descripcion, valor: x.valor, category_id: cat, fixed_expense_id: null } as never, c.cats as never, c.umbral),
      }
    })
    return { rows, skipped: r.skipped ?? 0 }
  }

  /** POST …/import/statement/preview */
  async preview(csv: string) {
    this.w.requireRole("editor", "editarTodo")
    const c = await this.ctx()
    const { rows, skipped } = this.read(csv, c)
    // La IA decide la categoría (lo local queda como "probable") y si es hormiga, como en la web. Sin IA: lo local.
    const ia = (c.settings?.ia ?? {}) as { on?: boolean }
    let usada = false
    const todo = rows.filter((x) => !x.dup && !x.abono)
    if (todo.length && this.w.hasFeature("ia") && ia.on !== false) {
      const out = await this.classifier.classify(todo.map((x, k) => ({ i: k, descripcion: x.descripcion, valor: x.valor, veces_mes: 0 })), { bookId: this.w.bookId, categories: c.cats }).catch(() => null)
      if (out) {
        usada = true
        const valid = new Set(c.cats.map((x) => x.id))
        for (const a of out) {
          const x = todo[a.i]
          if (!x) continue
          if (a.category_id && valid.has(a.category_id)) Object.assign(x, { category_id: a.category_id, src: "ia" })
          if (a.hormiga !== null) x.hormiga = a.hormiga
        }
      }
    }
    return { rows, skipped, ia: usada }
  }

  /** POST …/import/statement */
  async commit(b: Commit) {
    const { w, store } = this
    w.requireRole("editor", "editarTodo")
    // Sin medio de pago (solo con `medio`): los movimientos quedan sin payment_method_id, como en la web de siempre.
    const fuente = b.fuente.id === null ? { id: null } : await w.rowOf(b.fuente.tipo === "tarjeta" ? "credit_cards" : "payment_methods", b.fuente.id, { alive: true, msg: b.fuente.tipo === "tarjeta" ? "No encontramos esa tarjeta." : "No encontramos ese medio de pago." })
    const medioId = fuente.id === null ? null : String(fuente.id)
    const c = await this.ctx()
    const { rows } = this.read(b.csv, c)
    const okCats = await aliveIds(store, w.scope, "categories", w.bookId, b.filas.map((f) => f.category_id).filter((x): x is string => !!x))
    const otros = c.cats.find((x) => x.nombre === "Otros")?.id ?? null
    const member_id = b.member_id ?? null
    let repetidos = 0
    const pick: (StatementRow & { hManual: boolean })[] = []
    const vistos = new Set<number>()
    for (const f of b.filas) {
      const x = rows[f.i]
      if (!x) throw DomainError.validation("Una fila escogida no está en el extracto. Vuelve a leer el archivo.", { filas: `Fila ${f.i} inexistente` })
      if (vistos.has(f.i)) continue
      vistos.add(f.i)
      if (c.ya.has(x.ext)) { repetidos++; continue }
      if (f.category_id && !okCats.has(f.category_id)) throw DomainError.validation("Una categoría no es de este libro.", { filas: `Fila ${f.i}: categoría inválida` })
      pick.push({ ...x, category_id: f.category_id !== undefined ? f.category_id : x.category_id, hormiga: f.hormiga ?? x.hormiga, hManual: f.hormiga !== undefined })
    }
    const gastos = pick.filter((r) => !r.abono)
    const entradas = pick.filter((r) => r.abono)
    const errores: string[] = []
    const err = (e: unknown) => errores.push(e instanceof DomainError ? e.msg : "No se pudo guardar un movimiento.")
    if (b.fuente.tipo === "tarjeta") {
      // Extracto de la tarjeta: cada débito es una compra con tarjeta (y su gasto); cada abono, un pago a la tarjeta.
      for (const r of gastos) await store.rpc(w.scope, "add_card_purchase", { p_card: String(fuente.id), p_fecha: r.fecha, p_descripcion: r.descripcion, p_valor: r.valor, p_cuotas: 1, p_category: (r.category_id ?? otros) ?? undefined, p_como_gasto: true, p_external_id: r.ext, p_member: member_id ?? undefined }).catch(err)
      for (const r of entradas) await store.rpc(w.scope, "pay_credit_card", { p_card: String(fuente.id), p_valor: r.valor, p_fecha: r.fecha, p_tipo: "otro", p_nota: `Importado: ${r.descripcion}` }).catch(err)
      w.changed("card_purchases", undefined, "INSERT", ["expenses", "card_payments", "credit_cards"])
    } else {
      const hsrc = (r: (typeof pick)[number]) => (r.hManual ? "manual" : r.src === "ia" ? "ia" : "regla")
      if (gastos.length) await store.insert(w.scope, "expenses", gastos.map((r) => ({
        book_id: w.bookId, created_by: w.userId, fecha: r.fecha, descripcion: r.descripcion, valor: r.valor, category_id: r.category_id ?? otros, member_id,
        payment_method_id: medioId, hormiga: r.hormiga, hormiga_src: hsrc(r), origen: "importar", external_id: r.ext,
      }))).catch(err)
      if (entradas.length) await store.insert(w.scope, "extra_incomes", entradas.map((r) => ({ book_id: w.bookId, created_by: w.userId, fecha: r.fecha, descripcion: r.descripcion, valor: r.valor, member_id, payment_method_id: medioId, external_id: r.ext }))).catch(err)
      w.changed("expenses", undefined, "INSERT", ["extra_incomes"])
    }
    return { gastos: gastos.length, entradas: entradas.length, repetidos, errores }
  }
}
