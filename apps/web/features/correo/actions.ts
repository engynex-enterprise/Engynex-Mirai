"use server"

import "@/lib/services"
import { requireRole } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { supabaseServer } from "@/utils/supabase/server"
import { calSyncMsg, calendarConnected, syncCalendarFor } from "@/lib/google-calendar"
import { todayBogota } from "@/lib/domain"
import { scanMailWith, type MailScan } from "@mirai/ai/server/mail"
import { can } from "@/lib/plans"

export type { MailRow } from "@mirai/ai/server/mail"

/** Lee las notificaciones del banco en Gmail y extrae las compras (mailScan de la v4). Vive en @mirai/ai/server/mail. */
export async function scanMail(query?: string): Promise<MailScan> {
  const ctx = await requireRole("editor")
  return scanMailWith(ctx, await supabaseServer(), query)
}

export async function googleDisconnect() {
  const ctx = await requireRole("viewer")
  await supabaseAdmin().from("google_connections").delete().eq("user_id", ctx.user.id)
}

/**
 * Lleva los próximos pagos y cobros (45 días) a Google Calendar y los mantiene al día: crea los nuevos, actualiza los que
 * cambiaron de monto y quita los que ya pagaste o borraste (lib/google-calendar.ts). Ids estables: no duplica.
 * El cron diario hace lo mismo solo, para quien conectó Calendar.
 */
export async function syncCalendar(): Promise<{ ok: boolean; msg: string }> {
  const ctx = await requireRole("viewer")
  if (!can(ctx.plan, "banco")) return { ok: false, msg: "Llevar tus pagos a Google Calendar no está incluido en tu plan." }
  try {
    const { data: rule } = await supabaseAdmin().from("notification_rules").select("ocultar_montos").eq("user_id", ctx.user.id).eq("book_id", ctx.book.id).maybeSingle()
    const r = await syncCalendarFor({ userId: ctx.user.id, bookId: ctx.book.id, householdId: ctx.household.id, today: todayBogota(), ocultarMontos: !!rule?.ocultar_montos })
    return { ok: true, msg: calSyncMsg(r) }
  } catch (e) { return { ok: false, msg: (e as Error).message } }
}

/** Estado de Google Calendar para Ajustes › Alertas: si está conectado, si el plan lo incluye y cuántos eventos lleva Mirai. */
export async function calendarStatus(): Promise<{ conectado: boolean; plan: boolean; eventos: number }> {
  try {
    const ctx = await requireRole("viewer")
    const [conectado, { count }] = await Promise.all([
      calendarConnected(ctx.user.id),
      supabaseAdmin().from("google_event_map").select("key", { count: "exact", head: true }).eq("user_id", ctx.user.id).eq("book_id", ctx.book.id),
    ])
    return { conectado, plan: can(ctx.plan, "banco"), eventos: count ?? 0 }
  } catch { return { conectado: false, plan: false, eventos: 0 } }
}
