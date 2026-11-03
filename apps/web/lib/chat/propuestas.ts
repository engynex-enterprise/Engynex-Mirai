// Cómo se ve y a dónde lleva cada tipo de propuesta del chat (tarjeta para confirmar). Puro: lo comparten la tarjeta
// (features/chat/cards.tsx) y la confirmación en el servidor (features/chat/actions.ts).
import type { PropuestaTipo } from "./types"

export type TipoInfo = {
  icon: string
  /** Pregunta de la tarjeta ("¿Registro este gasto?"). */
  q: string
  tone: "gasto" | "ingreso" | "meta" | "aviso" | "deuda"
  /** Sección donde queda y su nombre para "Ver en …". */
  href: string
  donde: string
  /** Aviso al guardar. */
  ok: string
  /** Tablas que cambian (para refrescar las pantallas abiertas). */
  tablas: string[]
}

export const TIPO_INFO: Record<PropuestaTipo, TipoInfo> = {
  gasto: { icon: "receipt", q: "¿Registro este gasto?", tone: "gasto", href: "/gastos", donde: "Gastos", ok: "Gasto registrado", tablas: ["expenses"] },
  ingreso: { icon: "banknote", q: "¿Registro este ingreso?", tone: "ingreso", href: "/ingresos", donde: "Ingresos", ok: "Ingreso registrado", tablas: ["extra_incomes"] },
  ingreso_fijo: { icon: "briefcase", q: "¿Agrego este ingreso fijo?", tone: "ingreso", href: "/ingresos", donde: "Ingresos", ok: "Ingreso fijo agregado", tablas: ["incomes"] },
  fijo: { icon: "house", q: "¿Agrego este gasto fijo?", tone: "gasto", href: "/fijos", donde: "Gastos fijos", ok: "Gasto fijo agregado", tablas: ["fixed_expenses"] },
  pago_fijo: { icon: "calendar-check", q: "¿Registro este pago?", tone: "gasto", href: "/fijos", donde: "Gastos fijos", ok: "Pago registrado", tablas: ["fixed_expenses", "fixed_expense_payments", "expenses", "goals"] },
  suscripcion: { icon: "repeat", q: "¿Agrego esta suscripción?", tone: "gasto", href: "/suscripciones", donde: "Suscripciones", ok: "Suscripción agregada", tablas: ["subscriptions"] },
  cobro_suscripcion: { icon: "repeat", q: "¿Registro este cobro?", tone: "gasto", href: "/suscripciones", donde: "Suscripciones", ok: "Cobro registrado", tablas: ["subscriptions", "expenses"] },
  compra_tarjeta: { icon: "credit-card", q: "¿Registro esta compra con tarjeta?", tone: "deuda", href: "/tarjetas", donde: "Tarjetas", ok: "Compra registrada", tablas: ["credit_cards", "card_purchases", "expenses"] },
  pago_tarjeta: { icon: "credit-card", q: "¿Registro este pago de la tarjeta?", tone: "deuda", href: "/tarjetas", donde: "Tarjetas", ok: "Pago de la tarjeta registrado", tablas: ["credit_cards", "card_payments", "card_purchases"] },
  prestamo: { icon: "handshake", q: "¿Registro este préstamo?", tone: "deuda", href: "/le-debo", donde: "Le debo", ok: "Préstamo registrado", tablas: ["loans", "contacts", "entities"] },
  pago_cuota: { icon: "calendar-check", q: "¿Registro este pago?", tone: "deuda", href: "/le-debo", donde: "Le debo", ok: "Pago registrado", tablas: ["loans", "loan_payments"] },
  meta: { icon: "target", q: "¿Creo esta meta?", tone: "meta", href: "/metas", donde: "Metas", ok: "Meta creada", tablas: ["goals"] },
  abono_meta: { icon: "piggy-bank", q: "¿Registro este abono?", tone: "meta", href: "/metas", donde: "Metas", ok: "Abono registrado", tablas: ["goals", "goal_movements"] },
  recordatorio: { icon: "bell", q: "¿Creo este recordatorio?", tone: "aviso", href: "/recordatorios", donde: "Próximos pagos", ok: "Recordatorio creado", tablas: ["calendar_events"] },
}

/** Sección de una propuesta: los préstamos y sus pagos van a Le debo o a Me deben según la dirección. */
export function destino(tipo: PropuestaTipo, kind?: string | null): { href: string; donde: string } {
  const T = TIPO_INFO[tipo]
  if ((tipo === "prestamo" || tipo === "pago_cuota") && kind === "cobrar") return { href: "/me-deben", donde: "Me deben" }
  return { href: T.href, donde: T.donde }
}

export const FREC_LABEL: Record<string, string> = {
  mensual: "Cada mes", quincenal: "Cada quincena", semanal: "Cada semana", diario: "Cada día", diariohab: "Cada día hábil",
  bimestral: "Cada dos meses", trimestral: "Cada tres meses", semestral: "Cada seis meses", anual: "Una vez al año",
}
