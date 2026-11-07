"use server"
// Notas y documentos del portal público del contador (V7-H2, interruptor `accountant`; sin persona: solo cuenta "on").
// El portal no tiene AppContextProvider, así que el navegador no sabe de interruptores: estas Server Actions deciden en
// el servidor de Next. Encendido: /v1/accountant/:token/{notes,files} de la API (AccountantTokenGuard: token, límite
// `portalContador`, acceso vigente y plan con «impuestos»). Apagado: las acciones de siempre (./actions.ts, rama
// heredada). Misma firma y misma forma de respuesta que contadorNotes / contadorNote / contadorFileUrl.
import { globalApiOn } from "@/lib/api/rollout"
import { publicServerApi } from "@/lib/api/server"
import { serverAuthProvider } from "@/lib/auth/provider"
import * as actions from "./actions"

/** Configuración de la API si el portal va por ella (la lectura del interruptor en modo `db` usa la base de siempre). */
async function portalApi() {
  const cfg = await globalApiOn("accountant", async () => (await import("@/lib/supabase/admin")).supabaseAdmin()).catch(() => null)
  return cfg ? publicServerApi(cfg).accountantPortal : null
}

const GONE = "El acceso ya no está disponible"
/** Respaldo con la base de siempre si la API falla (≥500). Con AUTH_PROVIDER=mirai no hay Supabase: no hay respaldo. */
const legacyBackup = () => serverAuthProvider() !== "mirai"

export async function contadorNotes(token: string): Promise<{ id: string; autor: string; texto: string; created_at: string }[]> {
  const api = await portalApi()
  if (!api) return actions.contadorNotes(token)
  const r = await api.notes({ params: { token } })
  if (r.status === 200) return r.body
  // La API no pudo responder: es una lectura, así que se lee con lo de siempre.
  if (r.status >= 500 && legacyBackup()) return actions.contadorNotes(token)
  throw new Error(GONE)
}

export async function contadorNote(token: string, texto: string): Promise<void> {
  const api = await portalApi()
  if (!api) return actions.contadorNote(token, texto)
  if (!String(texto ?? "").trim()) return
  const r = await api.addNote({ params: { token }, body: { texto: String(texto).slice(0, 2000) } })
  if (r.status === 200) return
  const msg = r.body && typeof r.body === "object" && "msg" in r.body && typeof r.body.msg === "string" ? r.body.msg : GONE
  throw new Error(r.status === 429 ? "Escribiste muchas notas seguidas. Espera un momento." : msg)
}

export async function contadorFileUrl(token: string, path: string): Promise<string | null> {
  const api = await portalApi()
  if (!api) return actions.contadorFileUrl(token, path)
  if (typeof path !== "string" || !path) return null
  const r = await api.fileUrl({ params: { token }, query: { path } })
  if (r.status === 200) return r.body.url
  if (r.status >= 500 && legacyBackup()) return actions.contadorFileUrl(token, path)
  return null
}
