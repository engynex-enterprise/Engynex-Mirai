// Puerto de insights (§2.1): lo que las vistas necesitan además de las partes del libro (que carga book-tables).
// Mismas consultas que apps/web: extras del flujo integral (features/chat/server.ts → loadChatBook, igual que
// useIntegralExtras), la Declaración de renta (features/renta/data.ts → loadRentaData) y las fotos del patrimonio.
import type { ExtrasRows, RentaRows } from "@mirai/domain/integral-extras"
import type { SnapshotIn } from "@mirai/domain/vistas"
import type { DbScope } from "../../core/db/scope"

export type BookRef = { bookId: string; householdId: string }

/** Filas de la Declaración que usa el cálculo de renta (sin adjuntos, fechas DIAN ni perfil: no cambian la cifra). */
export type RentaCalcRows = Pick<RentaRows, "members" | "incomeCategories" | "bienes" | "years" | "ref">

export abstract class InsightsRepo {
  /** Bienes para impuestos, categorías de ingreso, mesadas y sus movimientos, fondo e integrantes del hogar. */
  abstract extras(scope: DbScope, q: BookRef): Promise<Omit<ExtrasRows, "renta">>
  /** Lo que necesita calcRenta para estimar la renta del calendario (solo se pide si hace falta: es costoso). */
  abstract renta(scope: DbScope, q: BookRef): Promise<RentaCalcRows>
  /** Fotos del patrimonio mes a mes (net_worth_snapshots vivas). */
  abstract snapshots(scope: DbScope, bookId: string): Promise<SnapshotIn[]>
}
