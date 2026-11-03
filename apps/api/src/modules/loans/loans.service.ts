// Deudas y préstamos (F2-D-7) con las reglas de features/loans/loan-form.tsx y pay-loan-dialog.tsx:
// - crear por tipo, con QUIÉN presta como registro escogible sin duplicar (RegistrosService); si solo llega el nombre
//   (`acreedor`), la misma regla de la migración 20261103002000_deudas_acreedor_registro.sql;
// - pagar N cuotas (los valores del plan de loanEngine) o abonar (a plazo o a cuota; no más que el saldo).
import { randomUUID } from "node:crypto"
import { Injectable } from "@nestjs/common"
import type { z } from "zod"
import type { LoanInput, LoanPayment, NuevoRegistro } from "@mirai/contracts/modules/loans"
import { todayBogota } from "@mirai/domain/dates"
import { loanEngine } from "@mirai/domain/loans"
import { CASA_EMPENO } from "@mirai/domain/registros"
import { DomainError } from "../../core/errors/domain-error"
import { BookStore, type Rec } from "../book-tables/book-store"
import { BookWritesService } from "../book-tables/book-writes.service"
import { num } from "../book-tables/http"
import { RegistrosService, type Registro } from "../catalogs/registros.service"

type Input = z.output<typeof LoanInput>
type Pay = z.output<typeof LoanPayment>
export const LOAN_NOT_FOUND = "No encontramos esa deuda."
export const LOAN_DONE = "Esta deuda ya está saldada."

/** Concepto por defecto de cada tipo (como loan-form.tsx). */
const CONCEPTO: Partial<Record<string, string>> = { fiado: "Fiado", cuotas: "Compra a cuotas", vendi: "Venta fiada", gota: "Gota a gota" }

/** Qué registro corresponde a un acreedor escrito a mano (misma regla de la migración del acreedor). */
export function registroDeAcreedor(v: Pick<Input, "kind" | "tipo" | "prenda">, nombre: string): NuevoRegistro {
  const empeno = v.kind === "pagar" && (v.tipo === "empeno" || (!v.tipo && !!v.prenda))
  if (empeno) return { tabla: "entities", nombre, tipo: CASA_EMPENO }
  if (v.tipo === "cuotas") return { tabla: "providers", nombre }
  if (v.kind === "pagar" && v.tipo === "banco") return { tabla: "entities", nombre, tipo: "Banco" }
  return { tabla: "contacts", nombre, tipo: "persona" }
}

@Injectable()
export class LoansService {
  constructor(
    private readonly w: BookWritesService,
    private readonly store: BookStore,
    private readonly registros: RegistrosService,
  ) {}

  /** POST …/loans */
  async create(v: Input) {
    const { w, store } = this
    w.requireRole("editor", "planear")
    const id = v.id ?? randomUUID()
    if (v.id) {
      const prev = await store.find(w.scope, "loans", id)
      if (prev && prev.book_id !== w.bookId) throw DomainError.notFound(LOAN_NOT_FOUND)
      if (prev) return { loan: prev, registro: null, pagosPrevios: 0 } // ya se creó (reintento con el mismo id)
    }

    const q = v.quien
    let registro: Registro | null = null
    let acreedor: string | null = null
    const ids = { contact_id: null as string | null, entity_id: null as string | null, provider_id: null as string | null }
    if ("contact_id" in q) ids.contact_id = String((await w.rowOf("contacts", q.contact_id, { alive: true, msg: "No encontramos ese contacto." })).id)
    else if ("entity_id" in q) ids.entity_id = String((await w.rowOf("entities", q.entity_id, { alive: true, msg: "No encontramos esa entidad." })).id)
    else if ("provider_id" in q) ids.provider_id = String((await w.rowOf("providers", q.provider_id, { alive: true, msg: "No encontramos ese proveedor." })).id)
    else {
      const nuevo = "nuevo" in q ? q.nuevo : registroDeAcreedor(v, (acreedor = q.acreedor.replace(/\s+/g, " ").trim()))
      registro = await this.registros.resolve(nuevo, true)
      if (registro) ids[registro.tabla === "contacts" ? "contact_id" : registro.tabla === "entities" ? "entity_id" : "provider_id"] = registro.id
    }

    const unico = v.frec === "unico"
    const concepto = v.concepto?.trim() || (v.tipo === "empeno" ? v.prenda?.obj : CONCEPTO[v.tipo]) || ""
    const row: Rec = {
      id, book_id: w.bookId, created_by: w.userId, kind: v.kind, tipo: v.tipo, concepto, monto: v.monto, sistema: v.sistema, tasa: v.tasa, frec: v.frec,
      plazo: unico ? 1 : v.plazo, inicio: v.inicio, extra: v.extra, ...ids, prenda: v.prenda ?? null, cuota_fija: v.cuota_fija ?? null, tasa_ea: v.tasa_ea ?? null,
      vence: unico ? v.vence : null, fiado: v.tipo === "fiado", ...(v.primera && !unico ? { primera: v.primera } : {}),
      ...(v.nota?.trim() ? { nota: v.nota.trim() } : {}), ...(acreedor ? { acreedor } : {}), ...(v.currency ? { currency: v.currency } : {}),
    }
    const [loan] = await store.insert(w.scope, "loans", [row])
    const previos = v.pagosPrevios.map((p) => ({ id: randomUUID(), book_id: w.bookId, created_by: w.userId, loan_id: id, fecha: p.fecha, tipo: p.tipo, valor: p.valor, modo: p.modo ?? null, nota: "Pago anterior a Mirai" }))
    if (previos.length) await store.insert(w.scope, "loan_payments", previos)
    w.changed("loans", id, "INSERT", previos.length ? ["loan_payments"] : [])
    return { loan, registro, pagosPrevios: previos.length }
  }

  /** POST …/loans/:id/payments: N cuotas del plan o un abono. */
  async pay(loanId: string, b: Pay) {
    const { w, store } = this
    w.requireRole("editor", "planear")
    const L = await w.rowOf("loans", loanId, { alive: true, msg: LOAN_NOT_FOUND })
    await w.assertRefs("loan_payments", { payment_method_id: b.payment_method_id })
    const pays = (await store.rows(w.scope, "loan_payments", w.bookId, { eq: { loan_id: loanId } })).map((p) => ({ ...p, valor: num(p.valor) }))
    const loan = { ...L, monto: num(L.monto), tasa: num(L.tasa), plazo: num(L.plazo), extra: num(L.extra), payments: pays } as never
    const today = todayBogota()
    const e0 = loanEngine(loan, today)
    if (e0.done || e0.saldo <= 0 || !e0.plan.length) throw DomainError.conflict(LOAN_DONE)
    const base = { book_id: w.bookId, created_by: w.userId, loan_id: loanId, fecha: b.fecha, payment_method_id: b.payment_method_id ?? null, ...(b.nota?.trim() ? { nota: b.nota.trim() } : {}) }
    const rows: Rec[] = "cuotas" in b
      ? e0.plan.slice(0, b.cuotas).map((p) => ({ ...base, id: randomUUID(), tipo: "cuota", valor: p.valor }))
      : [{ ...base, id: randomUUID(), tipo: "abono", valor: Math.min(b.abono, e0.saldo), modo: b.modo ?? (L.sistema === "americano" ? "cuota" : "plazo") }]
    const pagos = await store.insert(w.scope, "loan_payments", rows)
    const e1 = loanEngine({ ...(loan as object), payments: [...pays, ...rows.map((r) => ({ ...r, valor: num(r.valor) }))] } as never, today)
    w.changed("loan_payments", String(rows[0].id), "INSERT")
    return { pagos, saldo: e1.saldo, saldado: e1.done }
  }
}
