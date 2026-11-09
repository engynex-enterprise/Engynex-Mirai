// Presupuesto por categoría: cuánto llevas gastado en el mes en cada categoría contra su tope. Lo usan la sección
// Presupuesto y la bandeja "Todos los gastos" (una sola cifra en las dos pantallas).
//
// "Llevas" = los gastos registrados del mes en esa categoría, incluidas las compras con tarjeta y los gastos que salen
// al pagar un fijo (el presupuesto mira en qué gastaste, no cuándo salió la plata). Los gastos en USD o EUR se
// convierten con la TRM del libro.
import { conv } from "./money"
import type { BookData } from "./types"

export type EstadoPresupuesto = "sin" | "pasado" | "cerca" | "bien" | "otra"

export interface FilaPresupuesto {
  id: string
  nombre: string
  icon: string
  grupo: string | null
  tope: number
  llevas: number
  /** Porcentaje usado del tope (0 sin tope). */
  u: number
  /** Lo que queda antes de llegar al tope (negativo si te pasaste; 0 sin tope). */
  queda: number
  st: EstadoPresupuesto
  /** Gastos con una categoría que ya no existe. */
  unknown?: boolean
}

type Gasto = BookData["expenses"][number] & { currency?: string | null }

/**
 * Filas del presupuesto del mes `mes` ('YYYY-MM'). `alerta` es el % de Ajustes desde el que avisamos (80 por defecto):
 * "cerca del tope" empieza en el 80 % de ese porcentaje, como en la v4.
 */
export function presupuestoCategorias(b: Pick<BookData, "expenses" | "categories" | "settings">, mes: string): FilaPresupuesto[] {
  const trm = b.settings.trm
  const alerta = +b.settings.alerta_pres || 80
  const byCat = new Map<string, number>()
  for (const g of b.expenses as Gasto[]) {
    if (!g.fecha.startsWith(mes)) continue
    const k = g.category_id ?? ""
    byCat.set(k, (byCat.get(k) ?? 0) + conv(+g.valor, g.currency, trm))
  }
  const filas: FilaPresupuesto[] = b.categories.map((c) => {
    const llevas = byCat.get(c.id) ?? 0
    const tope = +c.tope || 0
    const u = tope ? (llevas / tope) * 100 : 0
    const st: EstadoPresupuesto = !tope ? "sin" : u >= 100 ? "pasado" : u >= alerta * 0.8 ? "cerca" : "bien"
    return { id: c.id, nombre: c.nombre, icon: c.icon ?? "tag", grupo: c.grupo ?? null, tope, llevas, u, queda: tope ? tope - llevas : 0, st }
  })
  for (const [id, v] of byCat) {
    if (b.categories.some((c) => c.id === id)) continue
    filas.push({ id: id || "none", nombre: "No está en tus categorías", icon: "circle-help", grupo: null, tope: 0, llevas: v, u: 0, queda: 0, st: "otra", unknown: true })
  }
  return filas
}

/** Lo gastado en el mes (todas las categorías). */
export const gastadoMes = (filas: FilaPresupuesto[]): number => filas.reduce((a, f) => a + f.llevas, 0)

/** Las categorías con tope, de la más usada a la menos: lo que conviene mirar primero. */
export const conTope = (filas: FilaPresupuesto[]): FilaPresupuesto[] => filas.filter((f) => f.tope > 0).sort((p, q) => q.u - p.u)
