// Mensajes de zod 4 en español para la API y los formularios (§2.7.1).
// zod 4 trae la traducción `es`; aquí se activa y se ajustan los textos más comunes al tono de Mirai (tuteo, simple).
// Importa `enableZodEs()` una sola vez al arrancar (main.ts de la API). apps/web aún escribe sus mensajes en cada esquema,
// así que no lo activa (no cambia nada de la versión publicada).
import { z } from "zod"

type Issue = Parameters<NonNullable<z.core.$ZodConfig["customError"]>>[0]

/** Ajustes de tono sobre la traducción oficial. Devuelve undefined para usar la de zod. */
export function miraiMessage(issue: Issue): string | undefined {
  switch (issue.code) {
    case "invalid_type":
      if (issue.input === undefined) return "Este campo es obligatorio"
      if (issue.expected === "number") return "Escribe un número"
      return undefined
    case "too_small":
      if (issue.origin === "string" && Number(issue.minimum) === 1) return "Este campo es obligatorio"
      return undefined
    default:
      return undefined
  }
}

let active = false

/** Activa la traducción `es` de zod más los ajustes de Mirai (idempotente). */
export function enableZodEs() {
  if (active) return
  z.config(z.locales.es())
  z.config({ customError: (issue) => miraiMessage(issue) })
  active = true
}

/** Convierte los errores de un `safeParse` en `{ campo: mensaje }` (para `details` de ApiError y formularios). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of error.issues) {
    const k = i.path.join(".") || "_"
    if (!(k in out)) out[k] = i.message
  }
  return out
}
