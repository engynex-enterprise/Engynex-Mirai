// Invitaciones al hogar: normalización del destino, duplicados, límite de reenvíos, estado y textos. Isomórfico.

import { formatCoPhone, normalizeCoPhone } from "@/lib/notify/whatsapp"
import { ROLE_INFO, type AccessRole } from "./roles"

export type Dest = { kind: "email"; value: string; key: string; label: string } | { kind: "tel"; value: string; key: string; label: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Correo (minúsculas y sin espacios) o celular de Colombia (57 + 10 dígitos, con normalizeCoPhone).
 * `key` es la misma que calcula la base (household_invitations.dest_key) para no repetir invitaciones.
 */
export function normalizeDest(input: string | null | undefined): Dest | { error: string } {
  const raw = String(input ?? "").trim()
  if (!raw) return { error: "Escribe el correo o el celular de la persona." }
  if (raw.includes("@")) {
    const v = raw.replace(/\s+/g, "").toLowerCase()
    if (!EMAIL.test(v)) return { error: "Ese correo no parece válido. Revísalo (por ejemplo ana@gmail.com)." }
    return { kind: "email", value: v, key: `email:${v}`, label: v }
  }
  const tel = normalizeCoPhone(raw)
  if (!tel) return { error: "Ese celular no parece válido: escribe un celular de Colombia de 10 dígitos (por ejemplo 315 123 4567) o un correo." }
  return { kind: "tel", value: tel, key: `tel:${tel}`, label: formatCoPhone(tel) }
}

/** Clave de destino de una fila de invitación (igual a la columna generada dest_key). */
export const destKeyOf = (i: { email?: string | null; phone?: string | null }) =>
  i.phone?.trim() ? `tel:${i.phone.replace(/\D/g, "")}` : `email:${String(i.email ?? "").trim().toLowerCase()}`

/** Dominios reservados para pruebas: Mirai no envía correos reales a ellos (RFC 2606 y 6761). */
export const isTestEmail = (email: string) => /@([\w-]+\.)*(test|example|invalid|localhost)$|@example\.(com|net|org)$/i.test(email.trim())

// ── Duplicados ────────────────────────────────────────────────────────────────────────────────────────────────

export type MemberLite = { nombre: string; email?: string | null; telefono?: string | null }
export type PendingLite = { id: string; email?: string | null; phone?: string | null; created_at: string; expires_at: string; nombre?: string | null }

export type DupResult =
  | { kind: "ok" }
  | { kind: "miembro"; nombre: string; msg: string }
  | { kind: "pendiente"; id: string; vencida: boolean; msg: string }

/** ¿Ya es miembro o ya tiene una invitación pendiente? (correo en minúsculas, celular normalizado). */
export function checkDuplicate(dest: Dest, members: MemberLite[], pending: PendingLite[], now = new Date()): DupResult {
  const m = members.find((x) => (dest.kind === "email" ? String(x.email ?? "").trim().toLowerCase() === dest.value : normalizeCoPhone(x.telefono) === dest.value))
  if (m) { const n = m.nombre?.trim() || dest.label; return { kind: "miembro", nombre: n, msg: `${n} ya hace parte de tu hogar.` } }
  const p = pending.find((x) => destKeyOf(x) === dest.key)
  if (p) {
    const vencida = new Date(p.expires_at) <= now
    const quien = p.nombre?.trim() || dest.label
    return { kind: "pendiente", id: p.id, vencida, msg: vencida ? `Ya invitaste a ${quien} y la invitación venció. ¿Quieres enviarla de nuevo?` : `Ya invitaste a ${quien} ${haceCuanto(p.created_at, now)}. ¿Quieres reenviarle la invitación?` }
  }
  return { kind: "ok" }
}

/** Nombre "igual" en el hogar (sin tildes, mayúsculas ni espacios de más) para pedir confirmación. */
export const sameName = (a: string, b: string) => {
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase()
  return !!n(a) && n(a) === n(b)
}

// ── Límite de reenvíos ────────────────────────────────────────────────────────────────────────────────────────

export const RESEND = { minMinutes: 10, perDay: 5 }

/** Día en Colombia (AAAA-MM-DD) para contar los envíos del día. */
export const bogotaDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(d)

export type SendState = { last_sent_at?: string | null; sends_day?: string | null; sends_today?: number | null }

/** ¿Se puede enviar otra vez? Máximo 1 cada 10 minutos y 5 al día por invitación (evita spam). */
export function resendGate(s: SendState, now = new Date()): { ok: true } | { ok: false; msg: string; waitMin?: number } {
  const today = bogotaDay(now)
  const count = s.sends_day === today ? Number(s.sends_today ?? 0) : 0
  if (count >= RESEND.perDay) return { ok: false, msg: `Ya enviaste esta invitación ${RESEND.perDay} veces hoy. Inténtalo mañana o comparte el enlace desde tu WhatsApp.` }
  if (s.last_sent_at) {
    const mins = (now.getTime() - new Date(s.last_sent_at).getTime()) / 60000
    if (mins < RESEND.minMinutes) {
      const wait = Math.max(1, Math.ceil(RESEND.minMinutes - mins))
      return { ok: false, waitMin: wait, msg: `Acabas de enviarla. Espera ${wait} minuto${wait === 1 ? "" : "s"} para reenviarla (así no le llegan mensajes repetidos).` }
    }
  }
  return { ok: true }
}

/** Contadores después de un envío. */
export function afterSend(s: SendState, now = new Date()) {
  const today = bogotaDay(now)
  return { last_sent_at: now.toISOString(), sends_day: today, sends_today: (s.sends_day === today ? Number(s.sends_today ?? 0) : 0) + 1 }
}

// ── Estado y textos ───────────────────────────────────────────────────────────────────────────────────────────

/** "hoy", "ayer", "hace 2 días", "hace 3 semanas". */
export function haceCuanto(iso: string, now = new Date()) {
  const mins = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return "hace un momento"
  if (mins < 60) return `hace ${Math.floor(mins)} min`
  const days = Math.floor((new Date(bogotaDay(now)).getTime() - new Date(bogotaDay(new Date(iso))).getTime()) / 86400000)
  if (days <= 0) { const h = Math.floor(mins / 60); return `hace ${h} hora${h === 1 ? "" : "s"}` }
  if (days === 1) return "ayer"
  if (days < 14) return `hace ${days} días`
  const w = Math.floor(days / 7)
  return w < 9 ? `hace ${w} semanas` : `hace ${Math.floor(days / 30)} meses`
}

export const fmtVence = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long" })

/** Texto de la invitación (WhatsApp desde el celular de quien invita, compartir y la plantilla de respaldo). */
export function inviteText(o: { invita: string; hogar: string; nombre?: string | null; rol: AccessRole; url: string; vence: string }) {
  const hola = o.nombre?.trim() ? `Hola, ${o.nombre.trim().split(" ")[0]}.` : "Hola."
  return `${hola} ${o.invita} te invitó a su hogar "${o.hogar}" en Mirai, para llevar juntos las cuentas de la casa.\n\nTu rol: ${ROLE_INFO[o.rol].label}. ${ROLE_INFO[o.rol].desc}\n\nAcepta aquí: ${o.url}\n(El enlace vence el ${fmtVence(o.vence)}.)`
}

/** Enlace wa.me con el texto listo: con número abre ese chat; sin número deja elegir el contacto. */
export const waMeLink = (text: string, phone?: string | null) => `https://wa.me/${phone ? String(phone).replace(/\D/g, "") : ""}?text=${encodeURIComponent(text)}`

export type InviteEstado = "pendiente" | "vencida" | "aceptada" | "cancelada"
export const inviteEstado = (i: { accepted_at?: string | null; canceled_at?: string | null; expires_at: string }, now = new Date()): InviteEstado =>
  i.accepted_at ? "aceptada" : i.canceled_at ? "cancelada" : new Date(i.expires_at) <= now ? "vencida" : "pendiente"

/** Resultado del último envío por canal (household_invitations.last_result). */
export type ChannelResult = { ok: boolean; at: string; provider?: string | null; error?: string | null; via?: "api" | "propio" | "prueba" }
export type LastResult = { email?: ChannelResult; whatsapp?: ChannelResult; cancelada?: string }

/** Resumen legible del último envío para la fila ("Por correo", "No salió por WhatsApp: …"). */
export function deliverySummary(r: LastResult | null | undefined): { tone: "ok" | "bad" | "gray"; text: string }[] {
  const out: { tone: "ok" | "bad" | "gray"; text: string }[] = []
  if (r?.email) out.push(r.email.ok ? { tone: r.email.via === "prueba" ? "gray" : "ok", text: r.email.via === "prueba" ? "Correo de prueba (no se envió)" : "Enviada por correo" } : { tone: "bad", text: `No salió por correo: ${r.email.error ?? "error desconocido"}` })
  if (r?.whatsapp) out.push(r.whatsapp.ok ? { tone: "ok", text: r.whatsapp.via === "propio" ? "Abierta en tu WhatsApp" : "Enviada por WhatsApp" } : { tone: r.whatsapp.via === "api" ? "bad" : "gray", text: r.whatsapp.via === "api" ? `No salió por WhatsApp: ${r.whatsapp.error ?? "error desconocido"}` : r.whatsapp.error ?? "Envíala desde tu WhatsApp" })
  return out
}
