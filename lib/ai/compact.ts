// Contexto compacto para la IA: menos tokens con la misma información. Puro, con pruebas en compact.test.ts.
//
// - En lugar de JSON (comillas, llaves, claves repetidas) se manda "clave: valor" por línea y las listas como
//   "a=1; b=2 | a=3; b=4". En los datos financieros típicos esto reduce ~30-40 % los tokens.
// - Se quitan nulos y vacíos (los ceros se dejan: "fondo de emergencia: 0" es información); los montos desde $ 100.000
//   se redondean a miles (la IA no necesita los pesos sueltos).
// - Las listas largas se recortan a las N más importantes y el resto se suma en "otros".
// - El historial del chat se limita a una ventana de mensajes recientes + un resumen corto de lo anterior.

type Val = string | number | boolean | null | undefined | Val[] | { [k: string]: Val }

/**
 * Redondea montos: ≥ 100.000 a miles (en pesos, el error es < 0,5 %); lo menor queda exacto (plazos en días, cuotas,
 * años) y los decimales (tasas, %) quedan con 2 cifras.
 */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (Math.abs(n) >= 100_000) return Math.round(n / 1000) * 1000
  return Number.isInteger(n) ? n : Math.round(n * 100) / 100
}

const isEmpty = (v: Val): boolean =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && v.every(isEmpty)) || (typeof v === "object" && !Array.isArray(v) && Object.values(v).every(isEmpty))

/** Quita nulos y vacíos y redondea montos (salvo `exact`: solo quita decimales sobrantes), recursivo. */
export function prune(v: Val, exact = false): Val {
  if (typeof v === "number") return exact ? (Number.isInteger(v) ? v : Math.round(v * 100) / 100) : roundMoney(v)
  if (typeof v === "string") return v.trim()
  if (Array.isArray(v)) return v.map((x) => prune(x, exact)).filter((x) => !isEmpty(x))
  if (v && typeof v === "object") {
    const o: Record<string, Val> = {}
    for (const [k, x] of Object.entries(v)) { const p = prune(x, exact); if (!isEmpty(p)) o[k] = p }
    return o
  }
  return v
}

const flat = (v: Val): string => {
  if (Array.isArray(v)) return v.map(flat).join(" | ")
  if (v && typeof v === "object") return Object.entries(v).map(([k, x]) => `${k}=${Array.isArray(x) || (x && typeof x === "object") ? `(${flat(x)})` : x}`).join("; ")
  return String(v)
}

/**
 * Objeto → líneas "clave: valor" (sin nulos ni vacíos, montos redondeados). `exact` deja las cifras tal cual: úsalo
 * cuando la IA debe repetir montos que la persona también ve en pantalla (consejero, resumen del mes).
 */
export function toLines(o: Record<string, Val>, { exact = false } = {}): string {
  const p = prune(o, exact) as Record<string, Val>
  return Object.entries(p ?? {}).map(([k, v]) => `${k}: ${flat(v)}`).join("\n")
}

/** Las N entradas más grandes; el resto se suma en "otros". */
export function topN(rec: Record<string, number>, n: number): Record<string, number> {
  const sorted = Object.entries(rec).filter(([, v]) => +v).sort((a, b) => b[1] - a[1])
  const out = Object.fromEntries(sorted.slice(0, n))
  const rest = sorted.slice(n).reduce((s, [, v]) => s + v, 0)
  if (rest) out.otros = (out.otros ?? 0) + rest
  return out
}

/** Recorta un texto a `max` caracteres sin cortar palabras, con "…". */
export function clip(s: string, max: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.7)).trim()}…`
}

export type ChatMsg = { role: string; content: string }

/**
 * Ventana del chat: los últimos `keep` mensajes (recortados) y, si hay más, un resumen de una línea con los temas
 * que preguntó antes la persona. Las respuestas del asesor se recortan más porque la IA no necesita releerlas enteras.
 */
export function chatWindow(msgs: ChatMsg[], { keep = 6, userMax = 400, botMax = 280, summaryMax = 240 } = {}) {
  const recent = msgs.slice(-keep)
  const older = msgs.slice(0, -keep).filter((m) => m.role === "user")
  const resumen = older.length ? clip(older.map((m) => clip(m.content, 60)).join("; "), summaryMax) : null
  const text = recent.map((m) => (m.role === "user" ? `Persona: ${clip(m.content, userMax)}` : `Asesor: ${clip(m.content, botMax)}`)).join("\n")
  return { resumen, text }
}
