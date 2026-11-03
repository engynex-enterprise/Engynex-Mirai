import { parseMoney, todayISO } from "@/lib/format"

export type ParsedEntry = { tipo: "gasto" | "ingreso"; valor: number; descripcion: string; fecha: string }

/**
 * Lectura local de frases como "gasté 15 mil en almuerzo ayer" o "me pagaron 300 mil por un trabajo".
 * Si esto no entiende la frase, la IA lo intenta (parseNL); esto cubre los casos comunes sin conexión.
 */
export function parseEntry(text: string, today = todayISO()): ParsedEntry | null {
  const t = text.trim()
  const m = t.match(/\$?\s*(\d[\d.,]*)\s*(mil(?:es)?|millones|mill[oó]n|k|m)?\b/i)
  if (!m) return null
  const valor = parseMoney(`${m[1]}${m[2] ? " " + m[2] : ""}`)
  if (!valor) return null
  const ingreso = /(^|\s)(me pagaron|me pag[oó]|recib[ií]|me consignaron|me transfirieron|gan[eé]|cobr[eé]|ingres[oó])(?=\s|$)/i.test(t)
  const base = new Date(today + "T12:00:00")
  const fecha = /\bantier|anteayer\b/i.test(t) ? new Date(base.getTime() - 2 * 864e5) : /\bayer\b/i.test(t) ? new Date(base.getTime() - 864e5) : base
  const STOP = new Set(["gaste", "pague", "compre", "me", "pagaron", "pago", "recibi", "consignaron", "transfirieron", "gane", "cobre", "hoy", "ayer", "antier", "anteayer", "en", "de", "del", "por", "un", "una", "el", "la", "los", "las", "pesos", "mil", "millones", "millon"])
  const fold = (w: string) => w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  const descripcion = t.replace(m[0], " ").split(/\s+/).filter((w) => w && !STOP.has(fold(w.replace(/[.,;:!?]/g, "")))).join(" ").trim()
  return { tipo: ingreso ? "ingreso" : "gasto", valor, descripcion: descripcion ? descripcion[0].toUpperCase() + descripcion.slice(1) : ingreso ? "Ingreso extra" : "Gasto", fecha: fecha.toISOString().slice(0, 10) }
}
