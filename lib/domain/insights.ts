// Hallazgos automáticos sobre los gastos (al estilo de los "insights" de Copilot o Monarch), en palabras simples.

export type InsightExpense = { fecha: string; descripcion: string; valor: number | string; category_id?: string | null }
export type Insight = { id: string; tipo: "sube" | "baja" | "inusual" | "dia" | "racha"; titulo: string; detalle: string; href?: string }

const DIAS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"]
const ym = (f: string) => f.slice(0, 7)
const prevYm = (k: string) => { const [y, m] = k.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}` }
const money = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`

/**
 * Hallazgos del mes en curso frente al anterior (hasta 4, de mayor a menor relevancia):
 * - la categoría que más subió y la que más bajó (comparando el mismo número de días),
 * - un gasto inusual (más de 3 veces el promedio de su categoría en los últimos 90 días y al menos $50.000),
 * - el día de la semana en que más gastas.
 */
export function insights(expenses: InsightExpense[], catName: (id: string | null | undefined) => string, hoy: string): Insight[] {
  const k = ym(hoy), kp = prevYm(k)
  const dia = +hoy.slice(8, 10)
  const v = (e: InsightExpense) => +e.valor || 0
  const out: Insight[] = []
  const mes = expenses.filter((e) => ym(e.fecha) === k && e.fecha <= hoy)
  const antes = expenses.filter((e) => ym(e.fecha) === kp && +e.fecha.slice(8, 10) <= dia)
  const byCat = (l: InsightExpense[]) => l.reduce<Record<string, number>>((t, e) => ((t[e.category_id ?? ""] = (t[e.category_id ?? ""] ?? 0) + v(e)), t), {})
  const a = byCat(mes), b = byCat(antes)
  const deltas = [...new Set([...Object.keys(a), ...Object.keys(b)])].map((c) => ({ c, d: (a[c] ?? 0) - (b[c] ?? 0), ahora: a[c] ?? 0, antes: b[c] ?? 0 }))
  const sube = deltas.filter((x) => x.d >= 50_000 && x.antes > 0).sort((x, y) => y.d - x.d)[0]
  if (sube) out.push({ id: `sube-${sube.c}`, tipo: "sube", titulo: `${catName(sube.c)} subió ${Math.round((sube.d / sube.antes) * 100)} %`, detalle: `Llevas ${money(sube.ahora)} este mes; a esta altura del mes pasado ibas en ${money(sube.antes)}.`, href: "/gastos" })
  const baja = deltas.filter((x) => x.d <= -50_000).sort((x, y) => x.d - y.d)[0]
  if (baja) out.push({ id: `baja-${baja.c}`, tipo: "baja", titulo: `Gastas menos en ${catName(baja.c)}`, detalle: `Vas ${money(-baja.d)} por debajo del mes pasado. ¡Bien!`, href: "/gastos" })

  const desde = new Date(new Date(`${hoy}T12:00:00`).getTime() - 90 * 86_400_000).toISOString().slice(0, 10)
  const hist = expenses.filter((e) => e.fecha >= desde && e.fecha < `${k}-01`)
  const prom = (c: string | null | undefined) => { const l = hist.filter((e) => (e.category_id ?? "") === (c ?? "")); return l.length >= 3 ? l.reduce((t, e) => t + v(e), 0) / l.length : 0 }
  const raro = mes.map((e) => ({ e, p: prom(e.category_id) })).filter((x) => x.p > 0 && v(x.e) >= 50_000 && v(x.e) > 3 * x.p).sort((x, y) => v(y.e) / y.p - v(x.e) / x.p)[0]
  if (raro) out.push({ id: `raro-${raro.e.fecha}-${raro.e.descripcion}`, tipo: "inusual", titulo: `Gasto fuera de lo normal: ${raro.e.descripcion}`, detalle: `${money(v(raro.e))} el ${raro.e.fecha.slice(8, 10)}/${raro.e.fecha.slice(5, 7)}: unas ${Math.round(v(raro.e) / raro.p)} veces lo que sueles gastar en ${catName(raro.e.category_id)}.`, href: "/gastos" })

  const ult = expenses.filter((e) => e.fecha >= desde && e.fecha <= hoy)
  if (ult.length >= 15) {
    const porDia = Array(7).fill(0) as number[]
    for (const e of ult) porDia[new Date(`${e.fecha}T12:00:00`).getDay()] += v(e)
    const total = porDia.reduce((t, x) => t + x, 0)
    const max = porDia.indexOf(Math.max(...porDia))
    const share = total ? porDia[max] / total : 0
    if (share >= 0.22) out.push({ id: `dia-${max}`, tipo: "dia", titulo: `Los ${DIAS[max]} son tu día de más gasto`, detalle: `Ahí se va el ${Math.round(share * 100)} % de lo que gastas. Planear ese día con tiempo ayuda a gastar menos.` })
  }
  return out.slice(0, 4)
}
