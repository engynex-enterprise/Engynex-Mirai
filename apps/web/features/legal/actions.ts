"use server"
// Aceptación de los Términos y la Política (Ley 1581): /v1/me/consents en la API (tabla consents).
import { z } from "zod"
import { miraiApi, miraiApiMsg } from "@/lib/auth/server"

/** Última versión aceptada ("" si nunca o si la API no respondió: se vuelve a preguntar). */
export async function miraiLegalVersion(): Promise<string> {
  try {
    const r = await miraiApi("/v1/me/consents")
    if (!r.ok) return ""
    return String(((await r.json()) as { version?: string }).version ?? "")
  } catch {
    return ""
  }
}

export async function miraiAcceptLegal(version: string): Promise<{ ok: boolean; msg: string }> {
  const v = z.string().regex(/^\d{4}-\d{2}-\d{2}(\.\d+)?$/).safeParse(version)
  if (!v.success) return { ok: false, msg: "Versión inválida" }
  try {
    const r = await miraiApiMsg(await miraiApi("/v1/me/consents", { method: "POST", body: { version: v.data } }))
    return { ok: r.ok, msg: r.msg }
  } catch {
    return { ok: false, msg: "No se pudo guardar. Intenta de nuevo en un momento." }
  }
}
