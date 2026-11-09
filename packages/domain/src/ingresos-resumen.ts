// Tarjetas de resumen de la pantalla Ingresos. No son fijas: se arman con las frecuencias que de verdad tiene la
// persona. Quien cobra quincenal ve sus dos quincenas; quien cobra mensual ve su próximo pago; quien cobra por días o
// por semana ve lo de cada día o semana, y quien tiene un pago al año ve cuándo le llega. Puro (sin red ni base).

import { lastDay, toDay } from "./dates"
import { conv } from "./money"
import { incomePagos, incomeReparto, pagosMes } from "./reparto"
import { ingresoBrutoMensual, ingresoMensual } from "./totals"
import type { BookData, DateInput } from "./types"

export type TarjetaIngreso = {
  id: "mes" | "q1" | "q2" | "proximo" | "semana" | "dia" | "anual" | "anio" | "descuentos"
  label: string
  valor: number
  /** Línea de abajo, ya en palabras simples. */
  sub?: string
  icon: string
  tone: "income" | "blue" | "violet" | "amber"
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
const fecha = (s: string) => { const [, m, d] = s.split("-").map(Number); return `${d} de ${MESES[m - 1]}` }

/**
 * Tarjetas que se muestran arriba de la lista de ingresos (entre 1 y 4), según las frecuencias que tenga el libro.
 * La primera siempre es lo que te llega al mes; las demás dependen de cómo te paguen.
 */
export function resumenIngresos(b: Pick<BookData, "incomes" | "settings">, today: DateInput, corteQ?: number): TarjetaIngreso[] {
  const t = toDay(today)
  const y = t.getFullYear(), m = t.getMonth()
  const hoy = iso(t)
  const trm = b.settings.trm
  const corte = Math.max(1, Math.min(27, Math.round(corteQ ?? b.settings.corte_q ?? 15) || 15))
  const ing = b.incomes
  const mes = ingresoMensual(ing, trm)
  const bruto = ingresoBrutoMensual(ing, trm)
  const desc = Math.max(0, bruto - mes)
  const tiene = (f: string) => ing.some((x) => x.frec === f)

  const out: TarjetaIngreso[] = [{
    id: "mes", label: "Te llega al mes", valor: mes, icon: "wallet", tone: "income",
    sub: desc >= 1 ? `De ${Math.round(bruto).toLocaleString("es-CO")} antes de descuentos` : `${ing.length} ${ing.length === 1 ? "fuente" : "fuentes"} de ingreso`,
  }]

  // Quincenal: las dos quincenas del mes, con lo que cae en cada una.
  if (tiene("quincenal")) {
    const q = { q1: 0, q2: 0 }
    for (const x of ing) {
      if (x.frec !== "quincenal") continue
      const R = incomeReparto(x)
      const v = conv(+x.valor || 0, (x as { currency?: string }).currency, trm)
      q.q1 += conv(R.n1 ?? +x.valor, (x as { currency?: string }).currency, trm) || v
      q.q2 += conv(R.n2 ?? +x.valor, (x as { currency?: string }).currency, trm) || v
    }
    out.push({ id: "q1", label: `1ª quincena (1–${corte})`, valor: q.q1, icon: "calendar", tone: "blue" })
    out.push({ id: "q2", label: `2ª quincena (${corte + 1}–fin)`, valor: q.q2, icon: "calendar", tone: "blue" })
  }

  // Mensual, semanal o diario: lo que corresponde a cada forma de pago.
  if (tiene("semanal")) {
    const v = ing.filter((x) => x.frec === "semanal").reduce((a, x) => a + conv(+x.valor || 0, (x as { currency?: string }).currency, trm), 0)
    out.push({ id: "semana", label: "Cada semana", valor: v, icon: "calendar-days", tone: "violet", sub: "Un mes tiene 4,33 semanas en promedio" })
  }
  if (tiene("diario")) {
    const list = ing.filter((x) => x.frec === "diario")
    const v = list.reduce((a, x) => a + conv(+x.valor || 0, (x as { currency?: string }).currency, trm), 0)
    const dias = Math.max(...list.map((x) => pagosMes(x)))
    out.push({ id: "dia", label: "Cada día", valor: v, icon: "sun", tone: "violet", sub: `${Math.round(dias)} días al mes` })
  }
  if (!tiene("quincenal") && tiene("mensual")) {
    // El próximo pago del mes (o el del mes entrante si ya pasaron todos).
    const pagos = ing.filter((x) => x.frec === "mensual").flatMap((x) => incomePagos(x, y, m).map((p) => ({ ...p, v: conv(p.v, (x as { currency?: string }).currency, trm) })))
    const prox = pagos.filter((p) => p.fecha >= hoy).sort((a, c) => a.fecha.localeCompare(c.fecha))[0]
      ?? ing.filter((x) => x.frec === "mensual").flatMap((x) => incomePagos(x, m === 11 ? y + 1 : y, (m + 1) % 12).map((p) => ({ ...p, v: conv(p.v, (x as { currency?: string }).currency, trm) }))).sort((a, c) => a.fecha.localeCompare(c.fecha))[0]
    if (prox) {
      const mismo = pagos.filter((p) => p.fecha === prox.fecha).reduce((a, p) => a + p.v, 0)
      const dias = Math.round((toDay(prox.fecha).getTime() - toDay(hoy).getTime()) / 86400000)
      out.push({ id: "proximo", label: "Tu próximo pago", valor: mismo || prox.v, icon: "calendar-clock", tone: "blue", sub: dias <= 0 ? "Hoy" : dias === 1 ? "Mañana" : `En ${dias} días · ${fecha(prox.fecha)}` })
    }
  }

  // Pagos de una vez al año (prima, bonificación anual): cuándo llega el siguiente.
  if (tiene("anual")) {
    const list = ing.filter((x) => x.frec === "anual")
    const total = list.reduce((a, x) => a + conv(+x.valor || 0, (x as { currency?: string }).currency, trm), 0)
    const prox = list
      .map((x) => { const R = incomeReparto(x); const mm = Math.max(1, Math.min(12, Math.round(+(R.mes ?? 12)))) - 1; const d = Math.min(+x.dia || 1, lastDay(y, mm)); const f = iso(new Date(y, mm, d)); return f >= hoy ? f : iso(new Date(y + 1, mm, d)) })
      .sort()[0]
    out.push({ id: "anual", label: "Pago de una vez al año", valor: total, icon: "party-popper", tone: "amber", sub: prox ? `El siguiente, el ${fecha(prox)}` : undefined })
  }

  // Si queda espacio, lo que suma en todo el año (ayuda a dimensionar).
  if (out.length < 4) out.push({ id: "anio", label: "En todo el año", valor: mes * 12, icon: "trending-up", tone: "violet", sub: "Si todo sigue igual" })

  return out.slice(0, 4)
}
