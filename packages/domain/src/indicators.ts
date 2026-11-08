// Indicadores de salud financiera (equivalente a `indicadores()` de b_core.js y al puntaje de c2_views.js de la v4).
import { addMonths, MESL, mkey, toDay } from "./dates"
import { formatCOP as $, pct } from "./money"
import { subsMes } from "./subscriptions"
import { cuotasMes, fijosMes, gastosBasicos, gastosMesK, hormigas, ingresoMensual, liquidez, totales } from "./totals"
import type { BookData, DateInput } from "./types"

export interface Indicador {
  /** Pregunta que responde. */
  k: string
  /** Valor ya formateado. */
  v: string
  /** Valor numérico (para la barra). */
  r: number
  st: "ok" | "warn" | "bad"
  meta: string
  d: string
  max: number
  icon: string
  /** ¿Hay datos suficientes? */
  ok: boolean
  /** Qué datos faltan. */
  falta: string[]
  /** Vista a donde ir para completar el primer dato que falta. */
  go?: string
}

/** Seis indicadores: deudas/ingreso, ahorro, meses de respaldo, deuda/activos, hormiga y dinero libre. */
export function indicadores(b: BookData, today: DateInput): Indicador[] {
  const t = toDay(today)
  const s = b.settings
  const ing = ingresoMensual(b.incomes, s.trm)
  const T = totales(b, t)
  const H = hormigas(b, t)
  const cuo = cuotasMes(b.loans, "pagar", t)
  const kPrev = mkey(addMonths(new Date(t.getFullYear(), t.getMonth(), 1), -1))
  const gPrev = gastosMesK(b.expenses, kPrev)
  const gCur = gastosMesK(b.expenses, mkey(t))
  const hayIng = ing > 0
  const hayGastosPrev = gPrev.length >= 5 || (b.fixedExpenses.length > 0 && gPrev.length > 0)
  const hayLiq = b.assets.some((a) => /^11/.test(a.cod)) || b.investments.some((x) => x.tipo === "ahorro")
  const hayAct = b.assets.length > 0 || b.investments.length > 0
  const hayGastosCur = gCur.length > 0
  const gReal = gPrev.filter((g) => !g.fixed_expense_id).reduce((a, g) => a + +g.valor, 0) + fijosMes(b.fixedExpenses) + cuo + subsMes(b.subscriptions, s.trm)
  const bas = gastosBasicos(b, t)
  const liq = liquidez(b.assets, b.investments, s.trm, t)
  const mesPrev = MESL[addMonths(t, -1).getMonth()]
  const L: Indicador[] = []
  const add = (o: Omit<Indicador, "ok" | "falta" | "go">, need: [boolean, string, string][]) => {
    const miss = need.filter((n) => !n[0])
    L.push({ ...o, ok: !miss.length, falta: miss.map((n) => n[1]), go: miss[0]?.[2] })
  }
  const r1 = ing ? cuo / ing : 0
  add({ k: "¿Cuánto de tu sueldo se va en deudas?", v: pct(r1), r: r1, st: r1 <= 0.3 ? "ok" : r1 <= 0.4 ? "warn" : "bad", meta: "Lo sano es menos del 30%", d: b.loans.some((x) => x.kind === "pagar") ? `Pagas ${$(cuo)} en cuotas al mes de un ingreso de ${$(ing)}.` : "No tienes deudas registradas en Le debo.", max: 0.6, icon: "landmark" }, [[hayIng, "tus ingresos", "ingresos"]])
  const r2 = ing ? (ing - gReal) / ing : 0
  add({ k: "¿Cuánto logras ahorrar?", v: pct(r2), r: Math.max(r2, 0), st: r2 >= 0.2 ? "ok" : r2 >= 0.1 ? "warn" : "bad", meta: "Lo ideal es guardar 20% o más", d: `El mes pasado gastaste ${$(gReal)} contando gastos, fijos, cuotas y suscripciones.`, max: 0.4, icon: "piggy-bank" }, [[hayIng, "tus ingresos", "ingresos"], [hayGastosPrev, `los gastos de ${mesPrev} (al menos 5)`, "gastos"]])
  const r3 = bas ? liq / bas : 0
  add({ k: "Si dejaras de recibir ingresos, ¿cuánto aguantas?", v: r3.toFixed(1) + " meses", r: r3, st: r3 >= s.emerg_meta ? "ok" : r3 >= 3 ? "warn" : "bad", meta: `La meta es ${s.emerg_meta} meses`, d: `Tienes ${$(liq)} disponibles y tus gastos básicos son ${$(bas)} al mes.`, max: Math.max(s.emerg_meta * 1.5, 1), icon: "umbrella" }, [[hayLiq, "tus cuentas bancarias o efectivo", "balance"], [bas > 0, "tus gastos fijos o el presupuesto de necesidades", "fijos"]])
  const r4 = T.A ? T.P / T.A : 0
  add({ k: "¿Qué parte de lo que tienes es deuda?", v: pct(r4), r: r4, st: r4 < 0.4 ? "ok" : r4 < 0.6 ? "warn" : "bad", meta: "Lo sano es menos del 40%", d: `Debes ${$(T.P)} y tienes bienes por ${$(T.A)}.`, max: 1, icon: "scale" }, [[hayAct, "tus bienes y cuentas (lo que tienes)", "balance"]])
  const r5 = ing ? H.proy / ing : 0
  add({ k: "Gastos hormiga", v: pct(r5), r: r5, st: r5 < 0.03 ? "ok" : r5 < 0.06 ? "warn" : "bad", meta: "Menos del 3% del ingreso", d: H.base === "pronto" ? `Llevas ${$(H.totalMes)} este mes. Aún es pronto para proyectar el mes.` : `Llevas ${$(H.totalMes)}; ${H.base === "historial" ? "por lo que sueles gastar" : "a este ritmo"} el mes cerraría en unos ${$(H.proy)}.`, max: 0.1, icon: "coffee" }, [[hayIng, "tus ingresos", "ingresos"], [hayGastosCur, "los gastos de este mes", "gastos"]])
  const r6 = ing - gReal
  add({ k: "Dinero libre cada mes", v: $(r6), r: Math.max(r6, 0), st: r6 > ing * 0.15 ? "ok" : r6 > 0 ? "warn" : "bad", meta: "Lo que sobra después de todos tus gastos", d: "Es la plata con la que puedes ahorrar, invertir o asumir algo nuevo.", max: Math.max(ing * 0.4, 1), icon: "wallet" }, [[hayIng, "tus ingresos", "ingresos"], [hayGastosPrev, `los gastos de ${mesPrev} (al menos 5)`, "gastos"]])
  return L
}

export interface HealthScore {
  /** Puntaje 0..100 (promedio: ok 100, warn 60, bad 20) de los indicadores con datos. */
  sc: number
  /** Fracción de indicadores con datos. */
  comp: number
  /** ¿Hay al menos 4 de 6 indicadores con datos? (si no, la v4 no muestra el puntaje). */
  visible: boolean
  lvl: [cls: "ok" | "warn" | "bad", texto: string, icon: string]
}

/** Puntaje de salud financiera a partir de los indicadores. */
export function healthScore(I: Indicador[]): HealthScore {
  const A = I.filter((i) => i.ok)
  const sc = A.length ? Math.round(A.reduce((a, i) => a + (i.st === "ok" ? 100 : i.st === "warn" ? 60 : 20), 0) / A.length) : 0
  const lvl: HealthScore["lvl"] = sc >= 80 ? ["ok", "Muy sana", "thumbs-up"] : sc >= 55 ? ["warn", "Hay cosas por mejorar", "triangle-alert"] : ["bad", "Necesita atención", "circle-alert"]
  return { sc, comp: I.length ? A.length / I.length : 0, visible: A.length >= 4, lvl }
}
