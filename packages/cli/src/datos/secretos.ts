// Nada de lo que la consola muestra puede llevar un secreto: ni de los archivos, ni de la salida de un
// comando, ni del JSON que sirve la cara web. Mismo criterio que scripts/revisar-secretos.mjs.

/** Nombres de variable cuyo valor jamás se muestra. */
const NOMBRE_SENSIBLE = /(SECRET|PASSWORD|TOKEN|KEY|CREDENTIAL|DSN|PRIVATE|SIGNATURE|WEBHOOK)/i

/** Formas de secreto reconocibles aunque no tengan nombre al lado. */
const FORMAS: RegExp[] = [
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
  /\bsk-[A-Za-z0-9_-]{16,}\b/g, // OpenAI y parecidos
  /\bsb[ps]_[A-Za-z0-9_-]{16,}\b/g, // Supabase
  /\bghp_[A-Za-z0-9]{20,}\b/g, // GitHub
  /\bAKIA[0-9A-Z]{12,}\b/g, // AWS
  /\bAIza[0-9A-Za-z_-]{20,}\b/g, // Google
  /\bpostgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@/gi, // contraseña dentro de una URL de base
  /\bredis:\/\/[^\s:@/]+:[^\s@/]+@/gi,
]

const TAPADO = "«oculto»"

/** ¿El nombre de esta variable guarda un secreto? */
export function esNombreSensible(nombre: string): boolean {
  return NOMBRE_SENSIBLE.test(nombre)
}

/**
 * Tapa los secretos de un texto. Se aplica a TODO lo que sale a pantalla o por JSON.
 * No intenta ser perfecto: en la duda, tapa.
 */
export function taparSecretos(texto: string): string {
  let out = texto
  // VARIABLE=valor con nombre sensible.
  out = out.replace(/\b([A-Z][A-Z0-9_]{2,})\s*[=:]\s*("[^"\n]*"|'[^'\n]*'|[^\s"']+)/g, (todo, nombre: string) =>
    esNombreSensible(nombre) ? `${nombre}=${TAPADO}` : todo,
  )
  for (const forma of FORMAS) out = out.replace(forma, (m) => (m.includes("://") ? m.replace(/:\/\/([^\s:@/]+):[^\s@/]+@/, "://$1:" + TAPADO + "@") : TAPADO))
  return out
}

/** Para las variables de entorno: solo decimos si está o no, nunca el valor. */
export function presencia(valor: string | undefined): "definida" | "falta" {
  return valor !== undefined && valor !== "" ? "definida" : "falta"
}
