import "server-only"
// Origen de la API de Mirai visto desde el servidor de Next (v7). La web habla con la API para todo: el navegador por
// /v1 en el mismo origen (cookie de sesión httpOnly) y el servidor de Next directo a MIRAI_API_URL (en el compose,
// http://api:8080). Se lee en cada llamada (variable de tiempo de ejecución, no de compilación).

/** Origen de la API visto desde el servidor de Next. */
export type ApiConfig = { url: string }

/** Origen de la API sin la barra final ("" = no configurada). */
export function apiUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.MIRAI_API_URL || env.NEXT_PUBLIC_API_URL || "").trim()
  if (!raw) return ""
  try {
    const u = new URL(raw)
    return u.origin + u.pathname.replace(/\/+$/, "")
  } catch {
    return ""
  }
}

/** Configuración de la API para el servidor de Next. Sin MIRAI_API_URL no hay cómo atender: error claro. */
export function apiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const url = apiUrl(env)
  if (!url) throw new Error("Falta MIRAI_API_URL (la API de Mirai).")
  return { url }
}
