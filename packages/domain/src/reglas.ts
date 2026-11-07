// Reglas de importación (Ajustes › Reglas): "si la descripción contiene la palabra, va a esta categoría".
// Puro y sin red: qué regla aplica (matchRule, en hormiga.ts), cuántos gastos toca cada una, cuáles quedan con otra
// categoría, qué palabra sugerir para un movimiento y qué reglas proponer a partir del historial.
import { matchRule, norm } from "./hormiga"
import type { ExpenseIn, KeywordRuleIn } from "./types"

type RuleLike = KeywordRuleIn & { id: string }
type ExpLike = Pick<ExpenseIn, "descripcion" | "category_id"> & { id?: string }

/**
 * Palabras de los extractos que no identifican al comercio (tipo de movimiento, ciudad, sociedad, dominio…).
 * Sin tildes y en minúscula, como sale de `norm`.
 */
const RUIDO = new Set([
  "compra", "compras", "pago", "pagos", "pse", "pos", "debito", "credito", "tarjeta", "tdc", "tc", "td", "transaccion",
  "transferencia", "transf", "trf", "web", "www", "com", "co", "net", "sa", "sas", "s", "a", "ltda", "inc", "llc", "bv",
  "de", "del", "la", "las", "el", "los", "en", "y", "con", "por", "para", "al", "cop", "col", "usd", "colombia", "bogota",
  "medellin", "cali", "barranquilla", "cartagena", "bucaramanga", "av", "avenida", "cl", "cll", "calle", "cra", "kr", "carrera",
  "no", "nro", "num", "suc", "sucursal", "internet", "app", "online", "recurrente", "cargo", "abono", "ref", "referencia",
  "trip", "help", "pending", "purchase", "payment", "store", "autorizacion", "aut", "aprobada", "datafono", "qr", "codigo",
])

/**
 * Palabra que identifica al comercio en una descripción de extracto, para proponer una regla:
 * "COMPRA POS EXITO CALLE 80 #123" → "exito"; "JUAN VALDEZ CAFE" → "juan valdez"; "NETFLIX.COM" → "netflix".
 * Toma la primera palabra útil; si es corta (≤ 4 letras) le suma la siguiente para no quedar demasiado amplia.
 * `null` si no queda nada útil.
 */
export function palabraSugerida(desc: string): string | null {
  const toks = norm(desc)
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !RUIDO.has(t) && !/\d{3,}/.test(t) && !/^\d+$/.test(t))
  if (!toks.length) return null
  const [a, b] = toks
  return a.length <= 4 && b && b.length > 2 ? `${a} ${b}` : a
}

export interface ReglaUso {
  /** Gastos en los que esta regla es la que aplica (la más específica). */
  total: number
  /** Ids de esos gastos que hoy tienen otra categoría (o ninguna): los que "Aplicar" cambiaría. */
  distintos: string[]
  /** Palabras de otras reglas más específicas que contienen a esta ("uber eats" para "uber"): ganan donde aparecen. */
  masEspecificas: string[]
  /** Otra regla con la misma palabra (sin importar mayúsculas ni tildes): sobra una. */
  repetida: boolean
}

/** Uso de cada regla sobre los gastos (id de la regla → uso). Un gasto cuenta solo para la regla que gana. */
export function usoReglas(rules: readonly RuleLike[], expenses: readonly ExpLike[]): Map<string, ReglaUso> {
  const out = new Map<string, ReglaUso>()
  const keys = rules.map((r) => norm(r.keyword))
  rules.forEach((r, i) => {
    const k = keys[i]
    out.set(r.id, {
      total: 0,
      distintos: [],
      masEspecificas: k ? rules.filter((_, j) => j !== i && keys[j] !== k && keys[j].includes(k)).map((x) => x.keyword) : [],
      repetida: !!k && keys.some((o, j) => j !== i && o === k),
    })
  })
  for (const g of expenses) {
    const r = matchRule(g.descripcion, rules)
    if (!r) continue
    const u = out.get(r.id)!
    u.total++
    if (g.id && g.category_id !== r.category_id) u.distintos.push(g.id)
  }
  return out
}

export interface ReglaSugerida {
  keyword: string
  category_id: string
  /** Gastos con esa palabra en la descripción. */
  veces: number
}

/**
 * Reglas que conviene crear a partir del historial: comercios que aparecen 2 veces o más, casi siempre (≥ 75 %) con la
 * misma categoría, y que ninguna regla cubre todavía. Las más frecuentes primero.
 */
export function sugerirReglas(expenses: readonly ExpLike[], rules: readonly Pick<KeywordRuleIn, "keyword">[], max = 8): ReglaSugerida[] {
  const grupos = new Map<string, Map<string, number>>()
  for (const g of expenses) {
    if (!g.category_id || matchRule(g.descripcion, rules)) continue
    const k = palabraSugerida(g.descripcion)
    if (!k || k.length < 3) continue
    const m = grupos.get(k) ?? new Map<string, number>()
    m.set(g.category_id, (m.get(g.category_id) ?? 0) + 1)
    grupos.set(k, m)
  }
  const out: ReglaSugerida[] = []
  for (const [keyword, m] of grupos) {
    const veces = [...m.values()].reduce((a, b) => a + b, 0)
    const [category_id, top] = [...m.entries()].sort((a, b) => b[1] - a[1])[0]
    if (veces >= 2 && top / veces >= 0.75) out.push({ keyword, category_id, veces })
  }
  return out.sort((a, b) => b.veces - a.veces || a.keyword.localeCompare(b.keyword, "es")).slice(0, max)
}

/**
 * Reglas para recordar las categorías que la persona corrigió a mano al importar: una por comercio (palabraSugerida),
 * sin repetir palabras que ya tienen regla ni las filas que una regla ya deja en esa misma categoría.
 */
export function reglasDeCorrecciones(
  filas: readonly Pick<ExpLike, "descripcion" | "category_id">[],
  rules: readonly Pick<KeywordRuleIn, "keyword" | "category_id">[],
): { keyword: string; category_id: string }[] {
  const ya = new Set(rules.map((r) => norm(r.keyword)))
  const out = new Map<string, string>()
  for (const f of filas) {
    if (!f.category_id || matchRule(f.descripcion, rules)?.category_id === f.category_id) continue
    const k = palabraSugerida(f.descripcion)
    if (k && k.length >= 3 && !ya.has(k)) out.set(k, f.category_id)
  }
  return [...out].map(([keyword, category_id]) => ({ keyword, category_id }))
}

/** Reglas de arranque (las de la v4) por nombre de categoría: se ofrecen solo si la categoría existe en el libro. */
export const REGLAS_COMUNES: readonly (readonly [keyword: string, categoria: string])[] = [
  ["netflix", "Suscripciones"], ["spotify", "Suscripciones"], ["rappi", "Domicilios"], ["exito", "Mercado"], ["carulla", "Mercado"],
  ["d1", "Mercado"], ["terpel", "Transporte"], ["uber", "Transporte"], ["juan valdez", "Café"], ["cuota de manejo", "Comisiones bancarias"],
]
