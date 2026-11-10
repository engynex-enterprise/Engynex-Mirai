// Gastos por pagar o abonados (expenses.pagado / pagar_el, migración 0012). NULL en `pagado` = pagado completo: así
// quedan los gastos de siempre. Puro: lo usan el formulario de gasto, Del día a día, Todos, el Balance (flujoIntegral)
// y los saldos de las cuentas.

export type EstadoPago = "pagado" | "abonado" | "pendiente"
export type PagoGasto = { estado: EstadoPago; pagado: number; falta: number; /** Cuándo se paga lo que falta. */ vence: string }

type G = { valor: number | string; fecha: string; pagado?: number | string | null; pagar_el?: string | null }

const r2 = (v: number) => Math.round(v * 100) / 100

/** Cuánto se ha pagado de un gasto, cuánto falta y cuándo vence lo que falta. */
export function pagoDeGasto(g: G): PagoGasto {
  const v = Math.max(0, +g.valor || 0)
  if (g.pagado === null || g.pagado === undefined || g.pagado === "") return { estado: "pagado", pagado: v, falta: 0, vence: g.fecha }
  const p = Math.min(v, Math.max(0, +g.pagado || 0))
  const falta = r2(v - p)
  if (falta < 1) return { estado: "pagado", pagado: v, falta: 0, vence: g.fecha }
  return { estado: p > 0 ? "abonado" : "pendiente", pagado: p, falta, vence: g.pagar_el || g.fecha }
}

/** Cómo quedó pagado al guardarlo desde el formulario. */
export type ModoPago = "pagado" | "abonado" | "despues"

/**
 * Lo que se guarda en `pagado` al crear o editar: con fecha futura queda por pagar (0); si no, según lo que diga la
 * persona. Un abono igual o mayor al valor es el pago completo (NULL).
 */
export function pagadoAlGuardar(o: { valor: number; fecha: string; hoy: string; modo: ModoPago; abono?: number }): number | null {
  if (o.fecha > o.hoy) return 0
  if (o.modo === "despues") return 0
  if (o.modo === "abonado") { const a = Math.max(0, +(o.abono ?? 0) || 0); return a >= o.valor - 0.5 ? null : r2(a) }
  return null
}

/** Nuevo `pagado` tras abonar `monto` (o pagar todo lo que falta si no se dice cuánto). NULL = quedó pagado. */
export function abonarGasto(g: G, monto?: number): number | null {
  const e = pagoDeGasto(g)
  if (e.estado === "pagado") return null
  const nuevo = e.pagado + (monto === undefined ? e.falta : Math.max(0, +monto || 0))
  return nuevo >= (+g.valor || 0) - 0.5 ? null : r2(nuevo)
}
