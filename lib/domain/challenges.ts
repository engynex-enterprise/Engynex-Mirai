// Retos de ahorro (equivalente a RETOS_T y `retoEstado()` de f_extra.js de la v4).
import { days, fdate, parseDate, toDay } from "./dates"
import { isHormiga } from "./hormiga"
import { formatCOP as $ } from "./money"
import type { CategoryIn, DateInput, ExpenseIn } from "./types"

export type RetoTipo = "sin_cat" | "sin_hormiga" | "semanas" | "diario"

export interface RetoTemplate {
  k: string
  tipo: RetoTipo
  /** Nombre de la categoría (solo `sin_cat`): al crear el reto se busca su id. */
  cat?: string
  dias: number
  base?: number
  n: string
  icon: string
  d: string
}

export const RETOS_T: RetoTemplate[] = [
  { k: "domis", tipo: "sin_cat", cat: "Domicilios", dias: 30, n: "30 días sin domicilios", icon: "bike", d: "Cocina en casa o recoge tú mismo. Ahorro típico: $ 150.000 al mes." },
  { k: "hormiga", tipo: "sin_hormiga", dias: 7, n: "Una semana sin gastos hormiga", icon: "coffee", d: "Nada de tintos, snacks ni antojos durante 7 días." },
  { k: "rest", tipo: "sin_cat", cat: "Restaurantes", dias: 30, n: "Un mes sin restaurantes", icon: "utensils", d: "Lleva almuerzo y prepara comidas especiales en casa." },
  { k: "52", tipo: "semanas", dias: 364, base: 5000, n: "Reto de las 52 semanas", icon: "piggy-bank", d: "Semana 1 ahorras $ 5.000, semana 2 $ 10.000… Al final tendrás $ 6.890.000." },
  { k: "diario", tipo: "diario", dias: 30, base: 10000, n: "Ahorra $ 10.000 diarios por un mes", icon: "coins", d: "Al final del mes tendrás $ 300.000." },
]

/** Reto guardado (`savings_challenges`). */
export interface ChallengeIn {
  tipo: RetoTipo | string
  category_id?: string | null
  dias: number
  base?: number | null
  inicio: string
  /** Semanas o días marcados como cumplidos. */
  marcas?: number[] | null
}

export interface RetoEstado {
  /** Avance 0..1. */
  prog: number
  ok?: boolean
  /** Primer gasto que rompió el reto. */
  fallo?: ExpenseIn
  txt: string
  ahorro?: number
}

/**
 * Estado de un reto. "Sin categoría"/"sin hormiga": se rompe con el primer gasto desde el inicio que
 * sea de esa categoría u hormiga. "Semanas"/"diario": avance según las marcas y lo ahorrado.
 */
export function retoEstado(r: ChallengeIn, ctx: { expenses: ExpenseIn[]; categories: CategoryIn[]; umbral: number }, today: DateInput): RetoEstado {
  const t = toDay(today)
  const ini = parseDate(r.inicio)
  const dd = Math.min(days(ini, t) + 1, r.dias)
  if (r.tipo === "sin_cat" || r.tipo === "sin_hormiga") {
    const f = ctx.expenses
      .filter((g) => g.fecha >= r.inicio && (r.tipo === "sin_hormiga" ? isHormiga(g, ctx.categories, ctx.umbral) : !!r.category_id && g.category_id === r.category_id))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))[0]
    if (f) return { prog: days(ini, parseDate(f.fecha)) / r.dias, fallo: f, txt: `Se rompió el ${fdate(parseDate(f.fecha))} (${f.descripcion})` }
    return { prog: dd / r.dias, ok: dd >= r.dias, txt: dd >= r.dias ? "¡Reto cumplido!" : `Llevas ${dd} de ${r.dias} días` }
  }
  const marcas = r.marcas || []
  const base = +(r.base ?? 0)
  const hechos = marcas.length
  const total = r.tipo === "semanas" ? 52 : r.dias
  const ahorro = r.tipo === "semanas" ? marcas.reduce((a, w) => a + w * base, 0) : hechos * base
  return { prog: hechos / total, ok: hechos >= total, txt: `${hechos} de ${total} ${r.tipo === "semanas" ? "semanas" : "días"} · ahorrado ${$(ahorro)}`, ahorro }
}
