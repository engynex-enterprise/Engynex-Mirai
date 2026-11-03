// Vistas de solo lectura (§2.6 fila 14, F2-C-4). El libro completo sale de book-tables (las mismas partes que
// useBookData) y los extras del flujo integral se arman con integralExtras de @mirai/domain, igual que el Balance, el
// Dashboard y el chat. Así la API devuelve exactamente las cifras que hoy calcula la web. No conoce Supabase.
import { Injectable } from "@nestjs/common"
import type { LoadedBook } from "@mirai/domain/book-data"
import { agenda, notifs } from "@mirai/domain/agenda"
import { proyeccionMeses } from "@mirai/domain/dashboard"
import { todayBogota } from "@mirai/domain/dates"
import { estadoIntegral, flujoIntegral, partesEstado, periodo, type ExtrasIntegral, type Periodo } from "@mirai/domain/flujo-integral"
import { healthScore, indicadores } from "@mirai/domain/indicators"
import { insights } from "@mirai/domain/insights"
import { integralExtras, necesitaRenta, rentaDataFrom } from "@mirai/domain/integral-extras"
import { reportData } from "@mirai/domain/report"
import { vistaBalance, vistaDashboard, vistaInicio, type PeriodoDashboard, type PestanaBalance } from "@mirai/domain/vistas"
import { RequestContextService } from "../../core/context/request-context.service"
import { DomainError } from "../../core/errors/domain-error"
import { BookTablesService } from "../book-tables/book-tables.service"
import { InsightsRepo } from "./insights.repository"

export type FlujoQ = { hoy?: string; tipo?: Periodo["tipo"]; mes?: string; a?: string; b?: string }

type Libro = { book: LoadedBook; today: string }

@Injectable()
export class InsightsService {
  constructor(
    private readonly repo: InsightsRepo,
    private readonly tables: BookTablesService,
    private readonly ctx: RequestContextService,
  ) {}

  /** Libro armado con `hoy` (saldos de las cuentas a esa fecha), como useBookData. */
  private async libro(hoy?: string): Promise<Libro> {
    const today = hoy ?? todayBogota()
    return { book: await this.tables.loadBook(today), today }
  }

  /** Libro + extras del flujo integral (useIntegralExtras / loadChatBook). La renta solo si el calendario la necesita. */
  private async integral(hoy?: string): Promise<Libro & { X: ExtrasIntegral }> {
    const { book, today } = await this.libro(hoy)
    const ref = { bookId: this.ctx.book.book.id, householdId: this.ctx.book.household.id }
    const [rows, renta] = await Promise.all([
      this.repo.extras(this.ctx.db, ref),
      // Como loadChatBook: si la Declaración no carga, el calendario de renta queda sin estimado (no rompe la vista).
      necesitaRenta(book) ? this.repo.renta(this.ctx.db, ref).then((r) => rentaDataFrom(book, { ...r, perfil: null, fechas: [], attachments: [], liabilities: [] })).catch(() => null) : Promise.resolve(null),
    ])
    return { book, today, X: integralExtras(book, today, { ...rows, renta }) }
  }

  async flujoIntegral(q: FlujoQ) {
    const { book, today, X } = await this.integral(q.hoy)
    return flujoIntegral(book, periodoDe(book, today, q), today, X)
  }

  async estadoIntegral(hoy?: string) {
    const { book, today, X } = await this.integral(hoy)
    const estado = estadoIntegral(book, today, X)
    return { estado, partes: { tengo: partesEstado(estado.tengo), debo: partesEstado(estado.debo) } }
  }

  async inicio(hoy?: string) {
    const { book, today, X } = await this.integral(hoy)
    return vistaInicio(book, today, X)
  }

  async balance(q: { hoy?: string; tab?: PestanaBalance; mes?: string }) {
    const { book, today, X } = await this.integral(q.hoy)
    return vistaBalance(book, today, X, q.tab ?? "general", q.mes ?? today.slice(0, 7))
  }

  async dashboard(q: { hoy?: string; periodo?: PeriodoDashboard }) {
    const [{ book, today, X }, snaps] = await Promise.all([this.integral(q.hoy), this.repo.snapshots(this.ctx.db, this.ctx.book.book.id)])
    return vistaDashboard(book, today, X, q.periodo ?? "mes", snaps)
  }

  /** Flujo de caja (CashflowView): empieza en el dinero disponible de hoy. */
  async proyeccion(q: { hoy?: string; meses?: number }) {
    const { book, today, X } = await this.integral(q.hoy)
    const liquidez = estadoIntegral(book, today, X).liquidez
    return { liquidez, meses: proyeccionMeses(book, today, X, q.meses ?? 12, liquidez) }
  }

  /** Salud financiera (HealthView). */
  async indicadores(hoy?: string) {
    const { book, today } = await this.libro(hoy)
    const I = indicadores(book, today)
    return { indicadores: I, salud: healthScore(I) }
  }

  /** Próximos pagos y cobros y avisos del libro (Inicio y Agenda). */
  async agenda(hoy?: string) {
    const { book, today } = await this.libro(hoy)
    return { agenda: agenda(book, today), avisos: notifs(book, today) }
  }

  /** Hallazgos de tus gastos (HallazgosCard). */
  async hallazgos(hoy?: string) {
    const { book, today } = await this.libro(hoy)
    const name = (id: string | null | undefined) => book.categories.find((c) => c.id === id)?.nombre ?? "Sin categoría"
    return insights(book.expenses, name, today)
  }

  /** Reporte del mes (ReportsView). */
  async report(mes: string, hoy?: string) {
    const { book, today } = await this.libro(hoy)
    return reportData(book, mes, today)
  }
}

/** Periodo de la consulta (exportado para las pruebas). Por defecto el mes de `hoy`. */
export function periodoDe(book: LoadedBook, today: string, q: FlujoQ): Periodo {
  const tipo = q.tipo ?? "mes"
  if (tipo === "rango") {
    if (!q.a || !q.b) throw DomainError.validation("Para un rango escribe la fecha inicial (a) y la final (b).", { fields: { a: !q.a ? "Falta la fecha inicial" : undefined, b: !q.b ? "Falta la fecha final" : undefined } })
    if (q.a > q.b) throw DomainError.validation("La fecha inicial debe ser antes de la final.", { fields: { a: "Debe ser antes de b" } })
    return { a: q.a, b: q.b, tipo: "rango" }
  }
  const [y, m] = (q.mes ?? today.slice(0, 7)).split("-").map(Number)
  return periodo(book, tipo, y, m - 1)
}
