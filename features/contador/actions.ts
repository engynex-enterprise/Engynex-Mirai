"use server"

import { createHash, randomBytes } from "node:crypto"
import { z } from "zod"
import { requireRole } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getIntegration } from "@/features/integrations/store"
import { brandEmail, EMAIL_KINDS, sendEmail } from "@/lib/notify/email"
import { logSend } from "@/lib/notify/log"
import { maskDest } from "@/lib/notify/rules"
import { loadRentaData, type RentaData } from "@/features/renta/data"
import { siteUrl } from "@/lib/site-url"
import { can } from "@/lib/plans"

const hash = (t: string) => createHash("sha256").update(t).digest("hex")
const New = z.object({ label: z.string().trim().min(1, "Escribe el nombre de tu contador").max(80), email: z.union([z.email("Correo inválido"), z.literal("")]), perms: z.enum(["renta", "todo"]), exp: z.enum(["30", "90", "dic", "nunca"]) })

function expiry(e: string) {
  if (e === "nunca") return null
  if (e === "dic") return new Date(`${new Date().getFullYear()}-12-31T23:59:00-05:00`).toISOString()
  return new Date(Date.now() + +e * 864e5).toISOString()
}

async function mail(householdId: string, to: string, owner: string, url: string) {
  for (const k of EMAIL_KINDS) {
    const v = await getIntegration(householdId, k)
    if (!v?.enabled) continue
    const log = { household_id: householdId, channel: "email", kind: "contador", provider: k, source: v.source ?? null, destino: maskDest("email", to) } as const
    try {
    const ref = await sendEmail(v, { to, subject: `${owner} te dio acceso a su información en Mirai`, html: brandEmail("Tienes acceso de solo lectura", `<p>${owner} te compartió su información para la declaración de renta en Mirai.</p><p style="margin-top:20px"><a href="${url}" style="background:#1F2B4B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Abrir la información</a></p><p style="color:#616161;font-size:13px">El enlace es personal. No lo reenvíes.</p>`) })
    await logSend({ ...log, status: "enviado", ref })
    } catch (e) { await logSend({ ...log, status: "fallido", error: (e as Error).message }); throw e }
    return true
  }
  return false
}

/** Crea un acceso. El enlace (con el token) se muestra una sola vez; en la BD solo queda su hash. */
export async function createShare(input: z.infer<typeof New>): Promise<{ ok: boolean; msg: string; url?: string }> {
  const p = New.safeParse(input)
  if (!p.success) return { ok: false, msg: p.error.issues[0].message }
  const ctx = await requireRole("admin")
  if (!can(ctx.plan, "impuestos")) return { ok: false, msg: "El acceso para tu contador no está incluido en tu plan." }
  const token = randomBytes(24).toString("base64url")
  const { error } = await supabaseAdmin().from("accountant_shares").insert({ book_id: ctx.book.id, label: p.data.label, email: p.data.email, perms: p.data.perms, token_hash: hash(token), expires_at: expiry(p.data.exp), created_by: ctx.user.id })
  if (error) return { ok: false, msg: error.message }
  const url = `${siteUrl()}/contador/${token}`
  let sent = false
  if (p.data.email) { try { sent = await mail(ctx.household.id, p.data.email, ctx.user.nombre, url) } catch { sent = false } }
  return { ok: true, url, msg: sent ? `Le enviamos el enlace a ${p.data.email}.` : `Copia el enlace y envíaselo a ${p.data.label} por un medio seguro.` }
}

/** Genera un enlace nuevo (el anterior deja de funcionar). */
export async function rotateShare(id: string) {
  const ctx = await requireRole("admin")
  const token = randomBytes(24).toString("base64url")
  const { error } = await supabaseAdmin().from("accountant_shares").update({ token_hash: hash(token), revoked_at: null }).eq("id", id).eq("book_id", ctx.book.id)
  if (error) throw new Error(error.message)
  return `${siteUrl()}/contador/${token}`
}

export async function revokeShare(id: string) {
  const ctx = await requireRole("admin")
  await supabaseAdmin().from("accountant_shares").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("book_id", ctx.book.id)
}

export async function ownerNote(shareId: string, texto: string) {
  const ctx = await requireRole("editor")
  const t = texto.trim().slice(0, 2000)
  if (!t) return
  const { error } = await supabaseAdmin().from("accountant_notes").insert({ book_id: ctx.book.id, share_id: shareId, autor: "titular", texto: t, created_by: ctx.user.id })
  if (error) throw new Error(error.message)
}

// ── Portal público del contador (sin sesión: el token es la credencial) ──

export type Share = { id: string; book_id: string; label: string; perms: string; expires_at: string | null; owner: string }

/** Valida el token: existe, no está revocado ni vencido. */
export async function shareByToken(token: string): Promise<Share | null> {
  if (!/^[\w-]{20,64}$/.test(token)) return null
  const db = supabaseAdmin()
  const { data } = await db.from("accountant_shares").select("id,book_id,label,perms,expires_at,revoked_at,created_by").eq("token_hash", hash(token)).maybeSingle()
  if (!data || data.revoked_at || (data.expires_at && new Date(data.expires_at) < new Date())) return null
  const { data: prof } = data.created_by ? await db.from("profiles").select("nombre").eq("id", data.created_by).maybeSingle() : { data: null }
  return { id: data.id, book_id: data.book_id, label: data.label, perms: data.perms, expires_at: data.expires_at, owner: prof?.nombre || "Tu cliente" }
}

export async function contadorOpen(token: string): Promise<{ share: Share; data: RentaData } | null> {
  const share = await shareByToken(token)
  if (!share) return null
  const db = supabaseAdmin()
  const { data: cur } = await db.from("accountant_shares").select("views,created_by").eq("id", share.id).single()
  await db.from("accountant_shares").update({ views: (cur?.views ?? 0) + 1, last_access: new Date().toISOString() }).eq("id", share.id)
  const data = await loadRentaData(db, share.book_id, cur?.created_by)
  if (share.perms !== "todo") data.book.expenses = data.book.expenses.filter((g) => g.fecha >= `${new Date().getFullYear() - 1}-01-01`)
  return { share, data }
}

export async function contadorNotes(token: string) {
  const share = await shareByToken(token)
  if (!share) throw new Error("El acceso ya no está disponible")
  const { data } = await supabaseAdmin().from("accountant_notes").select("id,autor,texto,created_at").eq("share_id", share.id).is("deleted_at", null).order("created_at")
  return data ?? []
}

export async function contadorNote(token: string, texto: string) {
  const share = await shareByToken(token)
  if (!share) throw new Error("El acceso ya no está disponible")
  const t = texto.trim().slice(0, 2000)
  if (!t) return
  await supabaseAdmin().from("accountant_notes").insert({ book_id: share.book_id, share_id: share.id, autor: "contador", texto: t })
}

export async function contadorFileUrl(token: string, path: string) {
  const share = await shareByToken(token)
  if (!share || !path.startsWith(`${share.book_id}/`)) return null
  const db = supabaseAdmin()
  const { data: att } = await db.from("attachments").select("id,visible_contador").eq("path", path).eq("book_id", share.book_id).is("deleted_at", null).maybeSingle()
  if (!att?.visible_contador) return null
  return (await db.storage.from("attachments").createSignedUrl(path, 300)).data?.signedUrl ?? null
}
