"use server"

import { createHash, randomBytes } from "node:crypto"
import { z } from "zod"
import { requireRole } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { supabaseServer } from "@/utils/supabase/server"
import { getIntegration } from "@/features/integrations/store"
import { brandEmail, EMAIL_KINDS, sendEmail } from "@/lib/notify/email"
import { siteUrl } from "@/lib/site-url"
import { limitOf } from "@/lib/plans"

const Invite = z.object({ email: z.email("Escribe un correo válido"), role: z.enum(["editor", "viewer"]) })

/** Crea una invitación de 7 días. Envía el correo si hay proveedor; si no, devuelve el enlace para compartir. */
export async function inviteMember(input: { email: string; role: "editor" | "viewer" }): Promise<{ ok: boolean; msg: string; url?: string }> {
  const p = Invite.safeParse(input)
  if (!p.success) return { ok: false, msg: p.error.issues[0].message }
  const ctx = await requireRole("owner")
  const db = supabaseAdmin()
  const maxPersonas = limitOf(ctx.plan, "personas")
  if (maxPersonas !== undefined) {
    const [{ count: miembros }, { count: pendientes }] = await Promise.all([
      db.from("household_members").select("user_id", { count: "exact", head: true }).eq("household_id", ctx.household.id),
      db.from("household_invitations").select("id", { count: "exact", head: true }).eq("household_id", ctx.household.id).is("accepted_at", null).gt("expires_at", new Date().toISOString()),
    ])
    if ((miembros ?? 0) + (pendientes ?? 0) >= maxPersonas) return { ok: false, msg: `Tu plan permite ${maxPersonas} personas por hogar. Cambia de plan para invitar a toda tu familia.` }
  }
  const token = randomBytes(24).toString("base64url")
  const { error } = await db.from("household_invitations").insert({
    household_id: ctx.household.id, email: p.data.email.toLowerCase(), role: p.data.role, token_hash: createHash("sha256").update(token).digest("hex"), invited_by: ctx.user.id,
  })
  if (error) return { ok: false, msg: error.message }
  const url = `${siteUrl()}/invitacion/${token}`
  for (const k of EMAIL_KINDS) {
    const v = await getIntegration(ctx.household.id, k)
    if (!v?.enabled) continue
    try {
      await sendEmail(v, {
        to: p.data.email, subject: `${ctx.user.nombre} te invitó a su hogar en Mirai`,
        html: brandEmail(`Te invitaron a “${ctx.household.nombre}”`, `<p>${ctx.user.nombre} quiere que lleven juntos las finanzas del hogar en Mirai, como <b>${p.data.role === "editor" ? "editor (puede registrar y cambiar)" : "lector (solo puede ver)"}</b>.</p><p style="margin-top:20px"><a href="${url}" style="background:#1F2B4B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Aceptar invitación</a></p><p style="color:#616161;font-size:13px">El enlace vence en 7 días.</p>`),
      })
      return { ok: true, msg: `Invitación enviada a ${p.data.email}.`, url }
    } catch { /* sigue con el enlace */ }
  }
  return { ok: true, msg: "Invitación creada. Copia el enlace y compártelo (no hay un servicio de correo activo).", url }
}

export async function revokeInvitation(id: string) {
  const ctx = await requireRole("owner")
  await supabaseAdmin().from("household_invitations").delete().eq("id", id).eq("household_id", ctx.household.id)
}

export async function setMemberRole(userId: string, role: "owner" | "editor" | "viewer") {
  const ctx = await requireRole("owner")
  const db = supabaseAdmin()
  if (userId === ctx.user.id && role !== "owner") {
    const { count } = await db.from("household_members").select("*", { count: "exact", head: true }).eq("household_id", ctx.household.id).eq("role", "owner")
    if ((count ?? 0) < 2) throw new Error("El hogar necesita al menos un dueño. Nombra otro dueño antes de cambiar tu rol.")
  }
  const { error } = await db.from("household_members").update({ role }).eq("household_id", ctx.household.id).eq("user_id", userId)
  if (error) throw new Error(error.message)
}

export async function removeMember(userId: string) {
  const ctx = await requireRole("viewer")
  const db = supabaseAdmin()
  if (userId !== ctx.user.id && ctx.household.role !== "owner") throw new Error("Solo el dueño puede quitar personas.")
  const { data: owners } = await db.from("household_members").select("user_id").eq("household_id", ctx.household.id).eq("role", "owner")
  if (owners?.length === 1 && owners[0].user_id === userId) throw new Error("No puedes quitar al único dueño del hogar.")
  await db.from("household_members").delete().eq("household_id", ctx.household.id).eq("user_id", userId)
}

export async function renameHousehold(nombre: string) {
  const ctx = await requireRole("owner")
  const n = nombre.trim().slice(0, 60)
  if (!n) throw new Error("Escribe un nombre")
  await supabaseAdmin().from("households").update({ nombre: n }).eq("id", ctx.household.id)
}

/** Acepta una invitación con la sesión del usuario actual (RPC accept_invitation). */
export async function acceptInvitation(token: string): Promise<{ ok: boolean; msg: string }> {
  const sb = await supabaseServer()
  const { data, error } = await sb.rpc("accept_invitation", { p_token: token })
  if (error) return { ok: false, msg: error.message.includes("venció") ? "La invitación no existe o ya venció. Pide una nueva." : error.message }
  return { ok: !!data, msg: "¡Listo! Ya haces parte del hogar." }
}
