// Balance v5: los gastos registrados dentro de las quincenas, la composición de lo que tienes y lo que debes,
// y hallazgos en palabras simples. Se apoya en `quincena()` y `totales()` (paridad con la v4) sin cambiarlos.
import { conv, formatCOP as $ } from "./money"
import { fondoEstado, type FondoRef } from "./savings"
import { catIcon, quincena, type FlowItem, type Quincena, type QuincenaWhich } from "./quincena"
import { fixedCategoryIds, liquidez, totales, variableMes, type Totales } from "./totals"
import type { BookData, CategoryIn, DateInput, ExpenseIn, FixedExpenseIn } from "./types"

/** Gasto con los campos que trae la fila de la base (origen: manual, tarjeta, prestamo…). */
type ExpenseRow = ExpenseIn & { origen?: string | null }

/** Ítem de flujo con enlace opcional a su sección. */
export type BalanceFlowItem = FlowItem & { href?: string }

/**
 * ¿El gasto ya sale por otro lado en la quincena? Los pagos de gastos fijos salen como "Gasto fijo" (su pago),
 * las compras con tarjeta salen en el pago de la tarjeta y las cuotas de préstamos en "Crédito".
 */
export const gastoYaContado = (g: ExpenseRow): boolean => !!g.fixed_expense_id || g.origen === "tarjeta" || g.origen === "prestamo"

/** Gastos registrados en Gastos entre `a` y `b` ('YYYY-MM-DD', incluidos) que no salen ya por otro lado. */
export const gastosDelRango = (expenses: ExpenseIn[], a: string, b: string): ExpenseRow[] =>
  (expenses as ExpenseRow[]).filter((g) => g.fecha >= a && g.fecha <= b && !gastoYaContado(g))

/** ¿El gasto cuenta contra el presupuesto variable (mismas categorías que `variableMes`)? Sin categoría también cuenta. */
export function cuentaEnVariable(g: ExpenseIn, categories: CategoryIn[], fixed: FixedExpenseIn[], fc = fixedCategoryIds(fixed)): boolean {
  if (!g.category_id) return true
  const c = categories.find((x) => x.id === g.category_id)
  if (!c) return true
  return c.grupo !== "a" && !fc.has(c.id) && c.nombre !== "Suscripciones"
}

export interface QuincenaBalance extends Quincena {
  ent: BalanceFlowItem[]
  sal: BalanceFlowItem[]
  /** Suma de los gastos registrados del periodo (los que no salen ya por otro lado). */
  gastado: number
  /** Cuántos gastos registrados hay en el periodo. */
  nGastos: number
  /** Presupuesto variable del periodo (mes completo o la mitad en una quincena). */
  presupuesto: number
  /** Lo que queda por gastar del presupuesto variable (0 si el periodo ya terminó). */
  porGastar: number
  /** 'pasado' | 'actual' | 'futuro' según hoy. */
  momento: "pasado" | "actual" | "futuro"
}

/**
 * Lo que entra y sale en la quincena (o el mes) CON los gastos que registraste en Gastos.
 * La v4 (y `quincena()`) solo restaba un "Gasto variable estimado" según el presupuesto y nunca miraba los gastos
 * reales: un gasto registrado no se veía en el Balance. Aquí:
 * - cada gasto registrado del periodo sale como una salida ya hecha (sin repetir pagos de fijos, tarjetas ni cuotas);
 * - el estimado se cambia por "Por gastar": el presupuesto del periodo menos lo que ya gastaste en esas categorías;
 * - en un periodo que ya terminó no se estima nada: cuenta lo que de verdad registraste.
 */
export function quincenaBalance(b: BookData, y: number, m: number, which: QuincenaWhich, today: DateInput): QuincenaBalance {
  const q = quincena(b, y, m, which, today)
  const hoy = typeof today === "string" ? today.slice(0, 10) : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const momento = q.b < hoy ? "pasado" : q.a > hoy ? "futuro" : "actual"
  const vm = variableMes(b.categories, b.fixedExpenses)
  const presupuesto = vm ? (which === "mes" ? vm : vm / 2) : 0
  const gastos = gastosDelRango(b.expenses, q.a, q.b)
  const fc = fixedCategoryIds(b.fixedExpenses)
  const catName = (id: string | null | undefined) => (id && b.categories.find((c) => c.id === id)?.nombre) || "Sin categoría"
  const trm = b.settings.trm
  const valor = (g: ExpenseRow) => conv(+g.valor, (g as { currency?: string | null }).currency, trm)
  const gastado = gastos.reduce((a, g) => a + valor(g), 0)
  const enVariable = gastos.filter((g) => cuentaEnVariable(g, b.categories, b.fixedExpenses, fc)).reduce((a, g) => a + valor(g), 0)
  const porGastar = momento === "pasado" ? 0 : Math.max(0, presupuesto - enVariable)
  // Fuera el estimado de la v4 (siempre es el último que agrega `quincena()`); entran los gastos reales y lo que falta.
  const sal: BalanceFlowItem[] = q.sal.filter((x) => !(x.icon === "shopping-cart" && x.n === "Gasto variable estimado"))
  for (const g of gastos)
    sal.push({ icon: catIcon(b.categories, g.category_id), n: g.descripcion, s: `Gasto · ${catName(g.category_id)}`, v: valor(g), fecha: g.fecha, paid: true, href: "/gastos" })
  if (porGastar > 0)
    sal.push({
      icon: "shopping-cart", n: "Por gastar según tu presupuesto",
      s: enVariable > 0 ? `Presupuesto ${$(presupuesto)} − ya gastaste ${$(enVariable)}` : "Mercado, transporte, gustos… según tu presupuesto",
      v: porGastar, fecha: q.b, href: "/presupuesto",
    })
  sal.sort((p, r) => (p.fecha < r.fecha ? -1 : p.fecha > r.fecha ? 1 : 0))
  const Sa = sal.reduce((s, x) => s + x.v, 0)
  return { ...q, sal, Sa, disp: q.E - Sa, gastado, nGastos: gastos.length, presupuesto, porGastar, momento }
}

export interface ParteBalance {
  /** Clave estable para colores y pruebas. */
  k: string
  label: string
  icon: string
  v: number
  /** Parte del total (0..1). */
  pct: number
  href?: string
}

/** Agrupa partes, quita las vacías, calcula su porcentaje y ordena de mayor a menor. */
const partes = (ls: Omit<ParteBalance, "pct">[]): ParteBalance[] => {
  const tot = ls.reduce((a, x) => a + Math.max(0, x.v), 0)
  return ls.filter((x) => x.v > 0).map((x) => ({ ...x, pct: tot ? x.v / tot : 0 })).sort((a, b) => b.v - a.v)
}

export interface Composicion {
  T: Totales
  /** Dinero disponible hoy: cuentas, efectivo e inversiones de ahorro (lo mismo que usa "meses que aguantas"). */
  liquidez: number
  tengo: ParteBalance[]
  debo: ParteBalance[]
}

/** En qué está lo que tienes (dinero, bienes, inversiones, me deben) y lo que debes (créditos, tarjetas, otras). */
export function composicion(b: BookData, today: DateInput): Composicion {
  const T = totales(b, today)
  const trm = b.settings.trm
  const cod = (x: { cod?: string }) => String(x.cod ?? "")
  const sumA = (re: RegExp) => b.assets.filter((a) => re.test(cod(a))).reduce((s, a) => s + conv(a.valor, a.currency, trm), 0)
  const liab = b.liabilities as (BookData["liabilities"][number] & { cod?: string })[]
  const sumP = (f: (c: string) => boolean) => liab.filter((p) => f(cod(p))).reduce((s, p) => s + conv(p.valor, p.currency, trm), 0)
  const dinero = sumA(/^11/)
  const bienes = sumA(/^(?!11)/)
  const tengo = partes([
    { k: "dinero", label: "Dinero en cuentas y efectivo", icon: "landmark", v: dinero },
    { k: "bienes", label: "Casa, carro y otros bienes", icon: "house", v: bienes },
    { k: "inversiones", label: "Inversiones", icon: "trending-up", v: T.xi, href: "/inversiones" },
    { k: "me-deben", label: "Lo que te deben", icon: "hand-coins", v: T.xc, href: "/me-deben" },
  ])
  const debo = partes([
    { k: "creditos", label: "Créditos y préstamos", icon: "landmark", v: T.xp, href: "/le-debo" },
    { k: "tarjetas", label: "Tarjetas de crédito", icon: "credit-card", v: T.xt + sumP((c) => c === "2380"), href: "/tarjetas" },
    { k: "impuestos", label: "Impuestos por pagar", icon: "receipt", v: sumP((c) => c === "2408") },
    { k: "otras", label: "Otras deudas", icon: "hand-coins", v: sumP((c) => c !== "2380" && c !== "2408") },
  ])
  return { T, liquidez: liquidez(b.assets, b.investments, trm, today), tengo, debo }
}

/** Lo que miran los hallazgos del mes (lo tienen `QuincenaBalance` y `FlujoIntegral`). */
export type MesResumen = Pick<QuincenaBalance, "E" | "Sa" | "disp" | "presupuesto" | "porGastar" | "gastado" | "nGastos"> & { gastadoPres?: number; conTarjetaPer?: number }

export interface HallazgoBalance {
  id: string
  tono: "ok" | "warn" | "bad" | "info"
  icon: string
  titulo: string
  detalle: string
  href?: string
  accion?: string
}

/**
 * Hallazgos del balance en palabras simples (distintos de los de Inicio, que miran los gastos por categoría):
 * patrimonio negativo, cuánto de lo que tienes es deuda, cuántos meses aguanta tu dinero disponible y cómo va el mes.
 * `mes` es el mes actual: `quincenaBalance(..., "mes", hoy)` o el flujo integral del mes (lib/domain/flujo-integral.ts).
 */
export function hallazgosBalance(b: BookData, today: DateInput, mes: MesResumen, C = composicion(b, today)): HallazgoBalance[] {
  const out: HallazgoBalance[] = []
  const { T } = C
  if (T.A === 0 && T.P === 0) {
    out.push({ id: "vacio", tono: "info", icon: "wallet", titulo: "Empieza por tus cuentas", detalle: "Agrega cuánta plata tienes hoy en tus cuentas y en efectivo. Así Mirai calcula tu patrimonio y cuánto aguantas sin ingresos.", accion: "Agregar cuenta" })
    return out
  }
  if (T.pat < 0) out.push({ id: "pat-neg", tono: "bad", icon: "triangle-alert", titulo: "Debes más de lo que tienes", detalle: `Te faltan ${$(-T.pat)} para cubrir todas tus deudas con lo que tienes. Empieza por la deuda más cara.`, href: "/estrategia", accion: "Ver cómo salir de deudas" })
  else if (T.A > 0 && T.P / T.A >= 0.4) out.push({ id: "deuda-alta", tono: "warn", icon: "scale", titulo: `El ${Math.round((T.P / T.A) * 100)} % de lo que tienes es deuda`, detalle: "Lo sano es menos del 40 %. Abonar a capital baja ese número más rápido que solo pagar la cuota.", href: "/le-debo", accion: "Ver mis deudas" })
  else if (T.P > 0) out.push({ id: "deuda-ok", tono: "ok", icon: "scale", titulo: `Solo el ${Math.max(1, Math.round((T.P / Math.max(1, T.A)) * 100))} % de lo que tienes es deuda`, detalle: "Está por debajo del 40 %, que es lo sano. Sigue así." })
  // La misma cuenta del Dashboard y Metas (fondoEstado): con el fondo activo, su saldo; si no, tu dinero disponible.
  const FE = fondoEstado(b, today, C.liquidez, (b as { fund?: FondoRef }).fund)
  const bas = FE.basicos
  if (bas > 0) {
    const meses = FE.meses
    const meta = FE.metaMeses
    if (FE.tiene <= 0) out.push({ id: "sin-liquidez", tono: "warn", icon: "umbrella", titulo: FE.enFondo ? "Tu fondo de emergencia está en cero" : "No registras dinero disponible", detalle: FE.enFondo ? "Aparta algo cada quincena en tu fondo de emergencia para los imprevistos." : "Agrega tus cuentas bancarias y tu efectivo para saber cuántos meses aguantarías si dejaras de recibir ingresos.", accion: FE.enFondo ? undefined : "Agregar cuenta" })
    else out.push({
      id: "respaldo", tono: meses >= meta ? "ok" : meses >= 3 ? "warn" : "bad", icon: "umbrella",
      titulo: `${FE.enFondo ? "Tu fondo de emergencia" : "Tu dinero disponible"} alcanza para ${meses >= 10 ? Math.round(meses) : meses.toFixed(1).replace(".", ",")} ${meses >= 0.95 && meses < 1.05 ? "mes" : "meses"}`,
      detalle: `Tienes ${$(FE.tiene)} ${FE.enFondo ? "en tu fondo" : "en cuentas y ahorros"}, y tus gastos básicos son ${$(bas)} al mes. La meta es ${meta} meses.`,
      href: meses < meta ? "/metas" : undefined, accion: meses < meta ? "Armar mi fondo de emergencia" : undefined,
    })
  }
  if (mes.E > 0 || mes.Sa > 0) {
    if (mes.disp < 0) out.push({ id: "mes-falta", tono: "bad", icon: "wallet", titulo: "Este mes sale más de lo que entra", detalle: `Te faltan ${$(-mes.disp)} para cubrir todo lo del mes. Revisa qué gasto puedes mover o recortar.`, href: "/gastos", accion: "Ver mis gastos" })
    // Contra el presupuesto cuenta también lo comprado con tarjeta (la misma base de "por gastar").
    else if (mes.presupuesto > 0 && mes.porGastar === 0 && (mes.gastadoPres ?? mes.gastado) > mes.presupuesto) out.push({ id: "presu", tono: "warn", icon: "shopping-cart", titulo: "Ya pasaste tu presupuesto del mes", detalle: `Llevas ${$(mes.gastadoPres ?? mes.gastado)} en gastos${mes.conTarjetaPer ? ` (incluye ${$(mes.conTarjetaPer)} con tarjeta)` : ""} y tu presupuesto variable es ${$(mes.presupuesto)}.`, href: "/presupuesto", accion: "Ver mi presupuesto" })
    else out.push({ id: "mes-ok", tono: "ok", icon: "wallet", titulo: `Este mes te sobran ${$(mes.disp)}`, detalle: (mes.conTarjetaPer ? `Ojo: compraste ${$(mes.conTarjetaPer)} con tarjeta que te cobrarán en la próxima factura. ` : "") + (mes.nGastos ? `Ya cuenta tus ${mes.nGastos} gasto${mes.nGastos === 1 ? "" : "s"} registrado${mes.nGastos === 1 ? "" : "s"} (${$(mes.gastado)}). Llévalo a una meta antes de que se gaste.` : "Llévalo a una meta o a tu fondo de emergencia antes de que se gaste."), href: "/metas", accion: "Ir a mis metas" })
  }
  return out
}
