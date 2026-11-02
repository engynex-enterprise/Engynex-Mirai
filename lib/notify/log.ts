import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"

export type SendLog = {
  user_id?: string | null; household_id?: string | null; channel: "email" | "whatsapp" | "telegram" | "push"; kind: string
  status: "enviado" | "fallido"; provider?: string | null; source?: string | null; destino?: string | null; ref?: string | null; error?: string | null
}

/** Guarda un intento de envío en notification_log (consola › Registro de envíos). Nunca rompe el envío. */
export async function logSend(l: SendLog) {
  try { await supabaseAdmin().from("notification_log").insert({ ...l, error: l.error?.slice(0, 1000) ?? null }) } catch { /* el registro es informativo */ }
}
