// Reporte del mes (reportData de la v4) y datos para el resumen del mes con IA (resumenIA).
import { addMonths, mkey } from "./dates"
import { tarjetasDeuda } from "./cards"
import { isHormiga } from "./hormiga"
import { subsMes } from "./subscriptions"
import { cuotasMes, gastosMesK, ingresoMensual, totales, type Totales } from "./totals"
import type { BookData, DateInput } from "./types"

export interface ReportData {
  T: Totales
  ing: number; cuo: number; sub: number; gas: number
  /** Gasto del mes por grupo: necesidades, gustos, ahorro y sin categoría. */
  grp: { n: number; g: number; a: number; x: number }
  /** Te sobró (positivo) o te faltó (negativo). */
  res: number
  /** [category_id | "", total] de mayor a menor. */
  cats: [string, number][]
}

export function reportData(b: BookData, k: string, today: DateInput): ReportData {
  const T = totales(b, today)
  const G = gastosMesK(b.expenses, k)
  const grp = { n: 0, g: 0, a: 0, x: 0 }
  const byId = new Map(b.categories.map((c) => [c.id, c]))
  G.forEach((g) => { grp[(byId.get(g.category_id ?? "")?.grupo as "n" | "g" | "a") || "x"] += +g.valor })
  const ing = ingresoMensual(b.incomes, b.settings.trm), cuo = cuotasMes(b.loans, "pagar", today), sub = subsMes(b.subscriptions, b.settings.trm)
  const gas = G.reduce((a, g) => a + +g.valor, 0)
  const cats: Record<string, number> = {}
  G.forEach((g) => { const c = g.category_id ?? ""; cats[c] = (cats[c] || 0) + +g.valor })
  return { T, ing, cuo, sub, gas, grp, res: ing - cuo - sub - gas, cats: Object.entries(cats).sort((a, c) => c[1] - a[1]) }
}

/** Datos que se envían a la IA para el resumen del mes (por nombre de categoría). */
export function monthSummaryData(b: BookData, k: string, today: DateInput) {
  const [yy, mm] = k.split("-").map(Number)
  const prevK = mkey(addMonths(new Date(yy, mm - 1, 1), -1))
  const name = new Map(b.categories.map((c) => [c.id, c.nombre]))
  const by = (kk: string) => { const o: Record<string, number> = {}; gastosMesK(b.expenses, kk).forEach((g) => { const n = name.get(g.category_id ?? "") ?? "Sin categoría"; o[n] = (o[n] || 0) + +g.valor }); return o }
  const a = by(k), p = by(prevK)
  const sum = (o: Record<string, number>) => Object.values(o).reduce((x, y) => x + y, 0)
  return {
    ingreso_mensual: Math.round(ingresoMensual(b.incomes, b.settings.trm)),
    gastos_por_categoria: a, mes_anterior: p, total: Math.round(sum(a)), total_anterior: Math.round(sum(p)),
    hormiga: Math.round(gastosMesK(b.expenses, k).filter((g) => isHormiga(g, b.categories, b.settings.umbral)).reduce((x, g) => x + +g.valor, 0)),
    topes_excedidos: b.categories.filter((c) => c.tope && (a[c.nombre] || 0) > c.tope).map((c) => c.nombre),
    deudas_saldo: Math.round(totales(b, today).xp + tarjetasDeuda(b.creditCards, today)),
    metas: b.goals.map((m) => ({ nombre: m.nombre, avance: Math.round((m.ahorrado / m.objetivo) * 100) })),
  }
}
