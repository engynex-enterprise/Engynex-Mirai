// Mensajes de error para la persona sin detalles internos (tablas, columnas, SQL, rutas ni trazas). Puro.

type ErrLike = { message?: unknown; code?: unknown } | null | undefined

/** Códigos de Postgres/PostgREST más comunes → mensaje en palabras simples. */
const BY_CODE: Record<string, string> = {
  "42501": "No tienes permiso para hacer esto en este hogar.",
  "23505": "Ya existe un registro igual.",
  "23503": "Ese dato está relacionado con otro que ya no existe o que no es de este libro.",
  "23502": "Falta un dato obligatorio.",
  "23514": "Uno de los datos no es válido.",
  "22P02": "Uno de los datos no tiene el formato correcto.",
  "22001": "Uno de los textos es demasiado largo.",
  PGRST116: "No encontramos ese registro.",
  PGRST301: "Tu sesión venció. Vuelve a entrar.",
}

/** Señales de que el texto es técnico (no se le muestra a la persona). */
const TECH = /row-level security|violates|relation "|column "|constraint|syntax|duplicate key|permission denied|function .*does not exist|PGRST|JWT|stack|at \w+ \(|\bnode_modules\b|ECONN|ETIMEDOUT|fetch failed|supabase|postgres/i

/**
 * Mensaje seguro para la persona: conserva los mensajes ya escritos en español para ella (RAISE EXCEPTION de las
 * funciones SQL, validaciones) y reemplaza los técnicos por uno genérico.
 */
export function publicError(e: unknown, fallback = "No pudimos completar la acción. Intenta de nuevo."): string {
  const x = e as ErrLike
  const code = typeof x?.code === "string" ? x.code : ""
  if (code && BY_CODE[code]) return BY_CODE[code]
  const raw = typeof x?.message === "string" ? x.message : typeof e === "string" ? e : ""
  const msg = raw.replace(/^.*?ERROR:\s*/, "").trim()
  if (!msg || msg.length > 300 || TECH.test(msg)) return fallback
  return msg
}

/** Escapa texto para meterlo en HTML (correos). */
export const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
