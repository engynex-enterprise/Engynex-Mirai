// Cupo de créditos de IA y agregados de uso. Puro: lo usan el servidor, Ajustes › Uso de IA y la consola.

export type QuotaLevel = "ok" | "aviso" | "agotado" | "sin_limite"
export type Quota = { cupo: number | null; usados: number; quedan: number | null; pct: number; nivel: QuotaLevel }

/** Estado del cupo del mes: aviso al pasar `avisoPct` (80 % por defecto) y agotado al 100 %. */
export function quotaState(usados: number, cupo: number | null | undefined, avisoPct = 80): Quota {
  const u = Math.max(0, +usados || 0)
  if (cupo == null) return { cupo: null, usados: u, quedan: null, pct: 0, nivel: "sin_limite" }
  const pct = cupo > 0 ? (u / cupo) * 100 : 100 // cupo 0 = sin IA en ese plan
  return { cupo, usados: u, quedan: Math.max(0, cupo - u), pct: Math.min(100, Math.round(pct * 10) / 10), nivel: pct >= 100 ? "agotado" : pct >= avisoPct ? "aviso" : "ok" }
}

/** Primer instante del mes en Colombia (UTC−5, sin horario de verano) como ISO. */
export function monthStartBogota(now = new Date()) {
  const co = new Date(now.getTime() - 5 * 3600_000)
  return new Date(Date.UTC(co.getUTCFullYear(), co.getUTCMonth(), 1, 5)).toISOString()
}

/** Día de Colombia (YYYY-MM-DD) de un instante. */
export const dayBogota = (d: Date | string = new Date()) => new Date(new Date(d).getTime() - 5 * 3600_000).toISOString().slice(0, 10)

export type RollupRow = {
  dia: string; household_id: string | null; plan: string | null; feature: string; fuente: string; provider: string | null; model: string | null
  de_plataforma: boolean; ok: boolean; llamadas: number; input_tokens: number; output_tokens: number; cached_tokens: number
  tokens_evitados: number; costo_usd: number; costo_cop: number; creditos: number; duracion_ms: number
}

export type Totals = { llamadas: number; ia: number; cache: number; algoritmo: number; errores: number; tokensIn: number; tokensOut: number; tokensCache: number; tokensEvitados: number; usd: number; cop: number; creditos: number; msProm: number }

const empty = (): Totals => ({ llamadas: 0, ia: 0, cache: 0, algoritmo: 0, errores: 0, tokensIn: 0, tokensOut: 0, tokensCache: 0, tokensEvitados: 0, usd: 0, cop: 0, creditos: 0, msProm: 0 })

function add(t: Totals, r: RollupRow) {
  const n = +r.llamadas || 0
  t.llamadas += n
  if (r.fuente === "cache") t.cache += n
  else if (r.fuente === "algoritmo") t.algoritmo += n
  else t.ia += n
  if (!r.ok) t.errores += n
  t.tokensIn += +r.input_tokens || 0
  t.tokensOut += +r.output_tokens || 0
  t.tokensCache += +r.cached_tokens || 0
  t.tokensEvitados += +r.tokens_evitados || 0
  t.usd += +r.costo_usd || 0
  t.cop += +r.costo_cop || 0
  t.creditos += +r.creditos || 0
  if (r.fuente === "ia") t.msProm += +r.duracion_ms || 0 // suma; se promedia al final
  return t
}
const finish = (t: Totals) => ({ ...t, msProm: t.ia ? Math.round(t.msProm / t.ia) : 0, usd: Math.round(t.usd * 1e6) / 1e6, creditos: Math.round(t.creditos * 1000) / 1000 })

export function totals(rows: RollupRow[]): Totals {
  return finish(rows.reduce(add, empty()))
}

/** Agrupa por una clave (día, función, modelo, plan, hogar…) y ordena de mayor a menor costo. */
export function groupBy(rows: RollupRow[], key: (r: RollupRow) => string | null | undefined): (Totals & { k: string })[] {
  const m = new Map<string, Totals>()
  for (const r of rows) { const k = key(r) ?? "—"; m.set(k, add(m.get(k) ?? empty(), r)) }
  return [...m].map(([k, t]) => ({ k, ...finish(t) })).sort((a, b) => b.usd - a.usd || b.llamadas - a.llamadas)
}

/** Serie por día con todos los días del rango (los vacíos en cero), de `desde` a `hasta` inclusive. */
export function byDay(rows: RollupRow[], desde: string, hasta: string) {
  const g = new Map(groupBy(rows, (r) => String(r.dia).slice(0, 10)).map((x) => [x.k, x]))
  const out: (Totals & { k: string })[] = []
  for (let d = new Date(`${desde}T12:00:00Z`); d.toISOString().slice(0, 10) <= hasta; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.toISOString().slice(0, 10)
    out.push(g.get(k) ?? { k, ...finish(empty()) })
  }
  return out
}

/**
 * Ahorro estimado: tokens que no se gastaron gracias a la caché y a los algoritmos, valorados al costo promedio
 * por token de las llamadas reales del periodo (o a `fallbackUsdPerToken` si aún no hay llamadas).
 */
export function savings(t: Totals, fallbackUsdPerToken = 1e-6) {
  const tok = t.tokensIn + t.tokensOut
  const perTok = tok > 0 && t.usd > 0 ? t.usd / tok : fallbackUsdPerToken
  const evitadas = t.cache + t.algoritmo
  return { llamadas: evitadas, pct: t.llamadas ? Math.round((evitadas / t.llamadas) * 100) : 0, tokens: t.tokensEvitados, usd: Math.round(t.tokensEvitados * perTok * 1e6) / 1e6 }
}
