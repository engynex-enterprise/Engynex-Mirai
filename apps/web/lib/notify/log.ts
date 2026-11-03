import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"

export type SendLog = {
  user_id?: string | null; household_id?: string | null; book_id?: string | null; channel: "email" | "whatsapp" | "telegram" | "push"; kind: string
  status: "enviado" | "fallido"; provider?: string | null; source?: string | null; destino?: string | null; ref?: string | null; error?: string | null
  /** Clave de no-duplicado (la reclamó claimSend). */
  dedupe?: string | null
}

/** Guarda un intento de envío en notification_log (consola › Registro de envíos). Nunca rompe el envío. */
export async function logSend(l: SendLog) {
  try { await supabaseAdmin().from("notification_log").insert({ ...l, error: l.error?.slice(0, 1000) ?? null }) } catch { /* el registro es informativo */ }
}

/** Máximo de intentos fallidos por clave (por día, porque la clave lleva el día): no se reintenta en cada pasada del cron. */
export const MAX_FALLOS = 3

/**
 * Reclama un envío antes de hacerlo (notification_log con estado "enviando", RPC notify_claim). Devuelve el id de la fila
 * o null si ya se envió, se está enviando o ya falló MAX_FALLOS veces con esa clave. Así el cron diario y el horario
 * nunca mandan dos veces lo mismo.
 */
export async function claimSend(o: { dedupe: string; userId?: string | null; householdId?: string | null; bookId?: string | null; channel: SendLog["channel"]; kind: string }): Promise<number | null> {
  const db = supabaseAdmin()
  const { count } = await db.from("notification_log").select("id", { count: "exact", head: true }).eq("dedupe", o.dedupe).eq("status", "fallido")
  if ((count ?? 0) >= MAX_FALLOS) return null
  const { data, error } = await db.rpc("notify_claim", { p_dedupe: o.dedupe, p_user: o.userId ?? null, p_household: o.householdId ?? null, p_book: o.bookId ?? null, p_channel: o.channel, p_kind: o.kind } as never)
  if (error) throw new Error(error.message)
  return (data as number | null) ?? null
}

/** Cierra un envío reclamado: enviado o fallido (si falló, la clave queda libre para otro intento). */
export async function finishSend(id: number, l: Omit<SendLog, "channel" | "kind"> & { status: "enviado" | "fallido" }) {
  try {
    const { status, provider, source, destino, ref, error } = l
    await supabaseAdmin().from("notification_log").update({ status, provider: provider ?? null, source: source ?? null, destino: destino ?? null, ref: ref ?? null, error: error?.slice(0, 1000) ?? null }).eq("id", id)
  } catch { /* el registro es informativo */ }
}
