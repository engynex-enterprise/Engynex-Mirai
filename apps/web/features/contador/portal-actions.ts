"use server"
// Notas y documentos del portal público del contador: /v1/accountant/:token/{notes,files} de la API
// (AccountantTokenGuard: token, límite `portalContador`, acceso vigente y plan con «impuestos»). El portal no tiene
// sesión: estas Server Actions llaman a la API sin persona desde el servidor de Next.
import { publicServerApi } from "@/lib/api/server"

const GONE = "El acceso ya no está disponible"
const portal = () => publicServerApi().accountantPortal

export async function contadorNotes(token: string): Promise<{ id: string; autor: string; texto: string; created_at: string }[]> {
  const r = await portal().notes({ params: { token } })
  if (r.status === 200) return r.body
  throw new Error(GONE)
}

export async function contadorNote(token: string, texto: string): Promise<void> {
  if (!String(texto ?? "").trim()) return
  const r = await portal().addNote({ params: { token }, body: { texto: String(texto).slice(0, 2000) } })
  if (r.status === 200) return
  const msg = r.body && typeof r.body === "object" && "msg" in r.body && typeof r.body.msg === "string" ? r.body.msg : GONE
  throw new Error(r.status === 429 ? "Escribiste muchas notas seguidas. Espera un momento." : msg)
}

export async function contadorFileUrl(token: string, path: string): Promise<string | null> {
  if (typeof path !== "string" || !path) return null
  const r = await portal().fileUrl({ params: { token }, query: { path } })
  return r.status === 200 ? r.body.url : null
}
