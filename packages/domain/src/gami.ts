// Logros y nivel (r_gamif.js de Mirai 4.0). Los puntos se recalculan siempre desde los datos del libro;
// solo se guardan visitas, insignias desbloqueadas, misiones cumplidas y el nivel máximo.
import { addDays, days, iso, parseDate, toDay } from "./dates"
import { agenda } from "./agenda"
import { isHormiga } from "./hormiga"
import { loanEngine } from "./loans"
import { retoEstado, type ChallengeIn } from "./challenges"
import { hormigas } from "./totals"
import type { BookData, DateInput } from "./types"

export const GLV: [number, string, string][] = [[0, "Semilla", "sprout"], [150, "Brote", "leaf"], [400, "Planta", "flower-2"], [800, "Arbusto", "shrub"], [1500, "Árbol", "tree-deciduous"], [2500, "Roble", "tree-pine"], [4000, "Bosque", "trees"], [6500, "Mirai", "sparkles"]]
export const GTIER = { b: ["Bronce", "#B87333"], s: ["Plata", "#8A97A8"], g: ["Oro", "#E0A500"] } as const
export type Tier = keyof typeof GTIER

export interface GamiInput {
  book: BookData
  perfilNombre: string
  fondo: { on: boolean; saldo: number } | null
  retos: ChallengeIn[]
  consejos: number
  chats: number
  visitas: string[]
  unl: Record<string, string>
  mis: Record<string, string[]>
}

const wkStart = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }

export function racha(visitas: string[], today: DateInput) {
  const v = new Set(visitas)
  let n = 0, d = toDay(today)
  if (!v.has(iso(d))) d = addDays(d, -1)
  while (v.has(iso(d))) { n++; d = addDays(d, -1) }
  return n
}
export function rachaMax(visitas: string[]) {
  const v = [...new Set(visitas)].sort()
  let best = 0, cur = 0, prev: Date | null = null
  for (const s of v) { const d = parseDate(s); cur = prev && days(prev, d) === 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = d }
  return best
}

/** Cuotas pagadas y cuántas a tiempo (hasta 2 días después de la fecha). */
export function puntuales(b: BookData, today: DateInput) {
  let a = 0, t = 0
  for (const L of b.loans.filter((x) => x.kind === "pagar")) {
    try {
      for (const h of loanEngine(L, today).hist) if (h.tipo === "cuota") { t++; if (h.fecha <= iso(addDays(parseDate(h.prog), 2))) a++ }
    } catch { /* motor sin datos */ }
  }
  return { a, t }
}

const ctxOf = (g: GamiInput) => ({ expenses: g.book.expenses, categories: g.book.categories, umbral: g.book.settings.umbral })
const retoOk = (g: GamiInput, today: DateInput) => g.retos.filter((r) => { try { return !!retoEstado(r, ctxOf(g), today).ok } catch { return false } }).length

export type Badge = { id: string; n: string; d: string; icon: string; tier: Tier; ok: (g: GamiInput, today: DateInput) => boolean }
export const GBADGES: Badge[] = [
  { id: "perfil", n: "Me presento", d: "Completa tu nombre en el perfil.", icon: "user-check", tier: "b", ok: (g) => !!g.perfilNombre },
  { id: "gasto1", n: "Primer registro", d: "Registra tu primer gasto.", icon: "receipt", tier: "b", ok: (g) => g.book.expenses.length >= 1 },
  { id: "gasto50", n: "Contador experto", d: "Llega a 50 gastos registrados.", icon: "list-checks", tier: "s", ok: (g) => g.book.expenses.length >= 50 },
  { id: "gasto200", n: "Ojo de halcón", d: "Llega a 200 gastos registrados.", icon: "scan-eye", tier: "g", ok: (g) => g.book.expenses.length >= 200 },
  { id: "ingreso", n: "Sé lo que gano", d: "Registra al menos un ingreso.", icon: "arrow-down-to-line", tier: "b", ok: (g) => g.book.incomes.length >= 1 },
  { id: "fijos", n: "Sin sorpresas", d: "Registra 3 o más gastos fijos.", icon: "house", tier: "b", ok: (g) => g.book.fixedExpenses.length >= 3 },
  { id: "presu", n: "Con presupuesto", d: "Ponle un tope a 3 categorías.", icon: "chart-pie", tier: "s", ok: (g) => g.book.categories.filter((c) => +c.tope > 0).length >= 3 },
  { id: "meta", n: "Soñar con fecha", d: "Crea tu primera meta de ahorro.", icon: "target", tier: "b", ok: (g) => g.book.goals.length >= 1 },
  { id: "metaok", n: "Meta cumplida", d: "Completa el 100% de una meta.", icon: "party-popper", tier: "g", ok: (g) => g.book.goals.some((m) => +m.objetivo > 0 && +m.ahorrado >= +m.objetivo) },
  { id: "fondo", n: "Colchón listo", d: "Abre tu bolsillo de emergencias con saldo.", icon: "shield-check", tier: "s", ok: (g) => !!(g.fondo?.on && +g.fondo.saldo > 0) },
  { id: "puntual", n: "Puntual", d: "Paga 5 cuotas a tiempo.", icon: "calendar-check", tier: "s", ok: (g, t) => puntuales(g.book, t).a >= 5 },
  { id: "libre", n: "¡Deuda saldada!", d: "Termina de pagar una deuda.", icon: "badge-check", tier: "g", ok: (g, t) => g.book.loans.filter((L) => L.kind === "pagar").some((L) => { try { return loanEngine(L, t).done } catch { return false } }) },
  { id: "hormiga", n: "Domador de hormigas", d: "Pasa la quincena del mes sin superar tu límite de gastos hormiga.", icon: "bug-off", tier: "s", ok: (g, t) => { if (toDay(t).getDate() < 15) return false; const H = hormigas(g.book, t); return H.mes.length > 0 && !H.over } },
  { id: "reto", n: "Retador", d: "Cumple un reto de ahorro.", icon: "trophy", tier: "s", ok: (g, t) => retoOk(g, t) > 0 },
  { id: "racha7", n: "Constante", d: "Usa Mirai 7 días seguidos.", icon: "flame", tier: "s", ok: (g) => rachaMax(g.visitas) >= 7 },
  { id: "racha30", n: "Imparable", d: "Usa Mirai 30 días seguidos.", icon: "flame-kindling", tier: "g", ok: (g) => rachaMax(g.visitas) >= 30 },
  { id: "inversor", n: "Mi plata trabaja", d: "Registra tu primera inversión.", icon: "trending-up", tier: "s", ok: (g) => g.book.investments.length >= 1 },
  { id: "consejo", n: "Pregunto antes de gastar", d: "Usa el consejero o el chat de Mirai.", icon: "message-circle-question", tier: "b", ok: (g) => g.consejos > 0 || g.chats > 0 },
]

export type Mision = { k: string; t: string; d: string; icon: string; xp: number; goal: number; prog: (g: GamiInput, a: string, b: string, today: DateInput) => number }
export const GMIS: Mision[] = [
  { k: "reg5", t: "Registra 5 gastos", d: "Anota lo que gastas esta semana, por pequeño que sea.", icon: "receipt", xp: 40, goal: 5, prog: (g, a, b) => g.book.expenses.filter((x) => x.fecha >= a && x.fecha <= b).length },
  { k: "dias3", t: "Registra 3 días distintos", d: "Crear el hábito vale más que hacerlo todo un solo día.", icon: "calendar-days", xp: 40, goal: 3, prog: (g, a, b) => new Set(g.book.expenses.filter((x) => x.fecha >= a && x.fecha <= b).map((x) => x.fecha)).size },
  { k: "visit4", t: "Entra 4 días a Mirai", d: "Un vistazo rápido a tu plata cada día.", icon: "eye", xp: 30, goal: 4, prog: (g, a, b) => new Set(g.visitas.filter((v) => v >= a && v <= b)).size },
  { k: "sinh", t: "3 días sin gastos hormiga", d: "Ni el tintico ni el antojo: tres días limpios esta semana.", icon: "bug-off", xp: 50, goal: 3, prog: (g, a, b, today) => {
    const t = toDay(today), ti = iso(t), C = ctxOf(g)
    let n = 0
    for (let d = parseDate(a); iso(d) <= b && d <= t; d = addDays(d, 1)) {
      const s = iso(d)
      if (s < ti || g.book.expenses.some((x) => x.fecha === s)) if (!g.book.expenses.some((x) => x.fecha === s && isHormiga(x, C.categories, C.umbral))) n++
    }
    return n
  } },
  { k: "aldia", t: "Cero pagos vencidos", d: "Termina la semana sin cuotas ni gastos fijos atrasados.", icon: "circle-check-big", xp: 50, goal: 1, prog: (g, _a, _b, today) => (agenda(g.book, today).filter((x) => x.st === "bad" && x.dir === "pagar").length ? 0 : 1) },
]

/** Las 3 misiones de esta semana (selección determinística por semana). */
export function misionesSemana(g: GamiInput, today: DateInput) {
  const a = wkStart(toDay(today)), b = addDays(a, 6), wk = iso(a)
  const pool = [...GMIS], pick: Mision[] = []
  let s = Math.floor(a.getTime() / 6048e5)
  while (pick.length < 3 && pool.length) { s = (s * 9301 + 49297) % 233280; pick.push(pool.splice(s % pool.length, 1)[0]) }
  return pick.map((m) => { const p = Math.min(m.prog(g, wk, iso(b), today), m.goal); return { ...m, p, ok: p >= m.goal, wk, fin: iso(b) } })
}

/** Puntos por fuente (gamiXP de la v4). */
export function gamiXP(g: GamiInput, today: DateInput) {
  const parts: { k: string; l: string; icon: string; v: number; n: number }[] = []
  const add = (k: string, l: string, icon: string, v: number, n: number) => { if (v > 0) parts.push({ k, l, icon, v: Math.round(v), n }) }
  const B = g.book
  const porDia: Record<string, number> = {}
  B.expenses.forEach((x) => { porDia[x.fecha] = (porDia[x.fecha] || 0) + 1 })
  add("gastos", "Gastos registrados", "receipt", Object.values(porDia).reduce((a, n) => a + Math.min(n, 10), 0) * 5, B.expenses.length)
  add("ingresos", "Ingresos registrados", "arrow-down-to-line", B.incomes.length * 20, B.incomes.length)
  const P = puntuales(B, today)
  add("cuotas", "Cuotas pagadas (a tiempo valen más)", "calendar-check", P.a * 25 + (P.t - P.a) * 10, P.t)
  const fp = B.fixedExpenses.reduce((a, f) => a + (f.payments || []).length, 0)
  add("fijos", "Gastos fijos pagados", "house", fp * 10, fp)
  add("metas", "Avance en metas", "piggy-bank", B.goals.reduce((a, m) => a + (+m.objetivo > 0 ? Math.min(+m.ahorrado / +m.objetivo, 1) * 60 + (+m.ahorrado >= +m.objetivo ? 100 : 0) : 0), 0), B.goals.length)
  const ro = retoOk(g, today)
  add("retos", "Retos de ahorro", "trophy", ro * 100 + (g.retos.length - ro) * 15, g.retos.length)
  const nv = new Set(g.visitas).size
  add("visitas", "Días que entraste", "calendar-days", nv * 3, nv)
  const nb = Object.keys(g.unl).length
  add("insignias", "Insignias ganadas", "medal", nb * 50, nb)
  const nm = Object.values(g.mis).reduce((a, l) => a + l.reduce((s, k) => s + (GMIS.find((m) => m.k === k)?.xp || 0), 0), 0)
  add("misiones", "Misiones semanales", "swords", nm, Object.values(g.mis).flat().length)
  return { total: parts.reduce((a, p) => a + p.v, 0), parts }
}

export function nivel(xp: number) {
  let i = 0
  while (i < GLV.length - 1 && xp >= GLV[i + 1][0]) i++
  const cur = GLV[i], nx = GLV[i + 1]
  return { i, n: i + 1, name: cur[1], icon: cur[2], min: cur[0], next: nx ? nx[0] : null, nextName: nx ? nx[1] : null, prog: nx ? (xp - cur[0]) / (nx[0] - cur[0]) : 1 }
}

/** Insignias nuevas y misiones cumplidas que aún no están guardadas (gamiCheck sin efectos). */
export function gamiPending(g: GamiInput, today: DateInput) {
  const badges = GBADGES.filter((b) => !g.unl[b.id] && (() => { try { return b.ok(g, today) } catch { return false } })())
  const missions = misionesSemana(g, today).filter((m) => m.ok && !(g.mis[m.wk] ?? []).includes(m.k))
  return { badges, missions }
}
