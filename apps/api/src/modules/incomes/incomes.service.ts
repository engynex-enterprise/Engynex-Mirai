// Casos de uso de ingresos (F2-D-8) con las reglas de features/incomes/income-form.tsx: plan del ingreso
// (planIngreso: descuentos del mes y lo que llega en cada pago), categoría del tipo de ingreso y reparto por quincena.
// `valor` y `bruto` guardan el PROMEDIO por pago, para que el total del mes (valor × pagosMes) no cambie en la web.
import { randomUUID } from "node:crypto"
import { Injectable } from "@nestjs/common"
import type { z } from "zod"
import type { IncomeInput, PlanInput, PlanOut } from "@mirai/contracts/modules/incomes"
import type { Deducciones, NominaCfg } from "@mirai/domain/payroll"
import { smmlvFor, uvtFor } from "@mirai/domain/payroll"
import { planIngreso, TIPOS_INGRESO, type IncomeReparto } from "@mirai/domain/reparto"
import { atLeast } from "@mirai/domain/household/roles"
import { todayBogota } from "@mirai/domain/dates"
import { DomainError } from "../../core/errors/domain-error"
import { BookStore, type Rec } from "../book-tables/book-store"
import { BookWritesService, ROW_IN_TRASH } from "../book-tables/book-writes.service"

type Plan = z.output<typeof PlanInput>
type Input = z.output<typeof IncomeInput>
export const INCOME_NOT_FOUND = "No encontramos ese ingreso."

const tipoDef = (t: string) => TIPOS_INGRESO.find((x) => x.value === t) ?? TIPOS_INGRESO[TIPOS_INGRESO.length - 1]

@Injectable()
export class IncomesService {
  constructor(
    private readonly w: BookWritesService,
    private readonly store: BookStore,
  ) {}

  /** POST …/incomes/plan: el plan sin guardar (mismo cálculo que la vista previa del formulario). */
  async plan(v: Plan): Promise<z.output<typeof PlanOut>> {
    const settings = await this.store.single(this.w.scope, "book_settings", this.w.bookId)
    return this.calc(v, settings, !!v.deducciones)
  }

  private calc(v: Plan, settings: Rec | null, conD: boolean) {
    const year = v.year ?? Number(todayBogota().slice(0, 4))
    const nomina = (settings?.nomina ?? {}) as NominaCfg
    const ref = { smmlv: smmlvFor(year, settings?.smmlv as Record<string, number>), uvt: uvtFor(year, settings?.uvt as Record<string, number>), fsp: nomina.fsp }
    const p = planIngreso({ frec: v.frec, mensual: v.mensual, b1: v.b1, b2: v.b2, dias: v.dias, D: conD ? (v.deducciones as Deducciones) : null, ref, ded: v.ded, x1: v.ded === "pers" ? v.x1 : undefined })
    return { ...p, ref: { smmlv: ref.smmlv, uvt: ref.uvt } }
  }

  /** POST …/incomes: crear o editar con el reparto por quincena. */
  async save(v: Input) {
    const { w, store } = this
    w.requireRole("registra", "registrarPropio")
    const id = v.id ?? randomUUID()
    const prev = v.id ? await store.find(w.scope, "incomes", id) : null
    if (prev && prev.book_id !== w.bookId) throw DomainError.notFound(INCOME_NOT_FOUND)
    if (prev?.deleted_at) throw DomainError.conflict(ROW_IN_TRASH)
    if (prev) w.requireOwnRow(prev)
    await w.assertRefs("incomes", { category_id: v.category_id, payment_method_id: v.payment_method_id })

    const settings = await store.single(w.scope, "book_settings", w.bookId)
    const conD = !!v.deducciones && v.currency === "COP"
    const p = this.calc(v, settings, conD)
    if (!(p.mensual > 0)) throw DomainError.validation("Escribe cuánto recibes.", { mensual: "Escribe cuánto recibes" })

    // Categoría: la escogida, la que ya tenía (si no cambió el tipo) o la del tipo de ingreso (se crea si falta).
    const t = tipoDef(v.tipo)
    let category_id: string | null = v.category_id ?? null
    let categoriaCreada = false
    const tipo0 = (prev?.reparto as IncomeReparto | null)?.tipo
    if (v.category_id === undefined) {
      category_id = prev && prev.category_id && v.tipo === tipo0 ? String(prev.category_id) : null
      if (!category_id) {
        const cats = await store.rows(w.scope, "income_categories", w.bookId, { select: ["id", "nombre"] })
        const found = cats.find((c) => t.cat.some((n) => n.toLowerCase() === String(c.nombre).toLowerCase())) ?? (v.tipo !== "otro" ? cats.find((c) => t.re.test(String(c.nombre))) : undefined)
        if (found) category_id = String(found.id)
        else if (atLeast(w.access, "editor")) {
          const [nueva] = await store.insert(w.scope, "income_categories", [{ id: randomUUID(), book_id: w.bookId, nombre: t.cat[0], icon: t.icon, sort: cats.length + 1, created_by: w.userId }])
          category_id = String(nueva.id)
          categoriaCreada = true
          w.changed("income_categories", category_id, "INSERT")
        }
      }
    }

    const quinc = v.frec === "quincenal"
    const reparto: IncomeReparto = {
      tipo: v.tipo, mensual: Math.round(p.mensual),
      ...(quinc ? {
        modo: Math.abs((v.b1 ?? p.pagos[0].bruto) - (v.b2 ?? p.pagos[1].bruto)) <= 1 ? ("igual" as const) : ("distinto" as const),
        b1: p.pagos[0].bruto, b2: p.pagos[1].bruto, n1: p.pagos[0].neto, n2: p.pagos[1].neto,
        ...(conD ? { ded: v.ded ?? "mitad", ...(v.ded === "pers" ? { x1: p.pagos[0].desc } : {}) } : {}),
        d1: Math.round(v.d1 || 15), d2: Math.round(v.d2 || 30),
      } : {}),
      ...(v.frec === "semanal" ? { dow: v.dow ?? 5 } : {}),
      ...(v.frec === "diario" ? { dias: v.dias ?? 30 } : {}),
      ...(v.frec === "anual" ? { mes: v.mes ?? 12 } : {}),
    }
    const row: Rec = {
      concepto: v.concepto.trim(), category_id, frec: v.frec, dia: Math.round(v.dia || 30), currency: v.currency, member_id: v.member_id ?? null,
      ...(v.payment_method_id !== undefined ? { payment_method_id: v.payment_method_id } : {}),
      valor: p.valor, bruto: conD ? p.bruto : null, deducciones: conD ? { ...(v.deducciones as Deducciones), mes: true } : null, reparto,
    }
    const income = prev
      ? await store.update(w.scope, "incomes", w.bookId, id, row)
      : (await store.insert(w.scope, "incomes", [{ ...row, id, book_id: w.bookId, created_by: w.userId }]))[0]
    if (!income) throw DomainError.role("Tu rol solo te deja cambiar lo que registraste tú.")
    w.changed("incomes", id, prev ? "UPDATE" : "INSERT")
    return { income, creado: !prev, plan: p, categoriaCreada }
  }
}
