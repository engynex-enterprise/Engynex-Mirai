// Plata que puede estar contada dos veces. El flujo integral ya evita el doble conteo cuando los registros están
// ENLAZADOS (un gasto con su gasto fijo, una compra con su tarjeta, una cuota con su préstamo: ver las reglas de
// flujo-integral.ts). Lo que no puede evitar solo es lo que la persona registró dos veces sin enlazar: el arriendo
// como gasto fijo y además como gasto del día a día. Aquí se detecta para avisarlo (Mirai nunca lo descuenta solo:
// sería adivinar); la persona enlaza con un toque y la cifra queda bien.
import { parseDate } from "./dates"
import { sugerirPagoFijo } from "./fixed"
import { conv } from "./money"
import type { BookData, DateInput, FixedExpenseIn } from "./types"

export interface PosibleDoble {
  /** Id del gasto suelto (el que se puede enlazar). */
  id: string
  descripcion: string
  fecha: string
  /** Valor del gasto en COP. */
  v: number
  fixed: FixedExpenseIn
  /** Periodo del fijo con el que se parece ('YYYY-MM', 'YYYY-MM-Q1'…) y su fecha de pago. */
  per: string
  due: string
  /** El periodo del fijo ya está pagado: el gasto suelto estaría de más. */
  yaPagado: boolean
}

type RawExp = BookData["expenses"][number] & { origen?: string | null; provider_id?: string | null; currency?: string | null }

/**
 * Gastos sueltos entre `a` y `b` que parecen el pago de un gasto fijo que el flujo ya cuenta por su lado (pagado o
 * pendiente): cada uno suma dos veces en "Sale". Usa las mismas reglas que la sugerencia al guardar un gasto
 * (`sugerirPagoFijo`: mismo proveedor o una palabra del nombre, valor parecido y un periodo a 40 días o menos).
 * Un gasto ya enlazado, una compra con tarjeta o una cuota de préstamo nunca entran.
 */
export function posiblesDobles(b: Pick<BookData, "expenses" | "fixedExpenses" | "settings">, a: string, bFin: string, today: DateInput): PosibleDoble[] {
  const trm = b.settings.trm
  const out: PosibleDoble[] = []
  for (const g of b.expenses as RawExp[]) {
    if (g.fecha < a || g.fecha > bFin) continue
    const s = sugerirPagoFijo({ ...g, valor: +g.valor }, b.fixedExpenses as never, today, { incluirPagados: true, trm })
    if (!s) continue
    // Solo cuenta dos veces si el periodo del fijo cae dentro del rango que se está mirando.
    if (s.due < a || s.due > bFin) continue
    out.push({ id: g.id, descripcion: g.descripcion, fecha: g.fecha, v: conv(+g.valor, g.currency, trm), fixed: s.fixed, per: s.per, due: s.due, yaPagado: s.yaPagado })
  }
  // Un mismo periodo de un fijo solo se avisa una vez (con el gasto más cercano a su fecha de pago).
  const best = new Map<string, PosibleDoble>()
  for (const d of out) {
    const k = `${d.fixed.id}:${d.per}`
    const dist = (x: PosibleDoble) => Math.abs(parseDate(x.fecha).getTime() - parseDate(x.due).getTime())
    const prev = best.get(k)
    if (!prev || dist(d) < dist(prev)) best.set(k, d)
  }
  return [...best.values()].sort((p, q) => q.v - p.v)
}

/** Lo que suman los posibles dobles (lo que sobraría en "Sale" si de verdad son el mismo pago). */
export const totalDobles = (l: PosibleDoble[]): number => l.reduce((a, x) => a + x.v, 0)
