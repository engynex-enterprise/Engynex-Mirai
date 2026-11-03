"use server"
// Acciones de la cuenta con AUTH_PROVIDER=mirai (v7, V7-B): van a la API con la sesión de la cookie (Bearer de sesión).
import { z } from "zod"
import { PASSWORD_MAX, PASSWORD_MIN } from "@mirai/contracts/modules/auth"
import { miraiApi, miraiApiMsg } from "@/lib/auth/server"

const Pw = z.string().min(PASSWORD_MIN, "La contraseña es muy corta: usa al menos 10 caracteres").max(PASSWORD_MAX)

/** Crea la contraseña de quien entró solo con Google (POST /v1/auth/password). */
export async function miraiSetPassword(newPassword: string): Promise<{ ok: boolean; msg: string }> {
  const p = Pw.safeParse(newPassword)
  if (!p.success) return { ok: false, msg: p.error.issues[0]?.message ?? "Revisa la contraseña" }
  try {
    const r = await miraiApiMsg(await miraiApi("/v1/auth/password", { method: "POST", body: { newPassword: p.data } }))
    return { ok: r.ok, msg: r.msg }
  } catch {
    return { ok: false, msg: "No pudimos guardar la contraseña. Intenta de nuevo en un momento." }
  }
}
