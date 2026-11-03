import "server-only"
// Sesión de Better Auth en el servidor de Next (v7, V7-B). La cookie httpOnly llega con la petición; para hablar con la
// API desde el servidor (Server Actions, RSC) se reenvía como `Authorization: Bearer <token de sesión>` (plugin bearer).
// La web no guarda ningún secreto.
import { cookies } from "next/headers"
import { apiUrl } from "@/lib/api/rollout"
import { MIRAI_SESSION_COOKIES } from "./provider"

/** Token firmado de la cookie de sesión (o null). */
export async function miraiSessionToken(): Promise<string | null> {
  const jar = await cookies()
  for (const name of MIRAI_SESSION_COOKIES) {
    const v = jar.get(name)?.value
    if (v) return v
  }
  return null
}

/** Llama a la API con la sesión de la persona. Lanza si la API no está configurada (MIRAI_API_URL). */
export async function miraiApi(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  const base = apiUrl()
  if (!base) throw new Error("La API de Mirai no está configurada (MIRAI_API_URL)")
  const token = await miraiSessionToken()
  return fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.body !== undefined ? { "content-type": "application/json" } : {}), "x-mirai-client": "web-ssr" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  })
}

/** Respuesta de la API → { ok, msg } (los errores de la API ya traen `msg` en español). */
export async function miraiApiMsg(res: Response): Promise<{ ok: boolean; msg: string; code?: string; data?: unknown }> {
  const body = (await res.json().catch(() => null)) as { ok?: boolean; msg?: string; code?: string; data?: { msg?: string } } | null
  if (res.ok) return { ok: true, msg: body?.data?.msg ?? body?.msg ?? "Listo", data: body?.data ?? body }
  return { ok: false, msg: body?.msg ?? "Algo salió mal. Intenta de nuevo en un momento.", code: body?.code }
}
