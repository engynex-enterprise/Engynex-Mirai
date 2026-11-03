// Adaptador de GooglePort sobre @mirai/services (SystemScope, como supabaseAdmin() en la web).
import { Injectable } from "@nestjs/common"
import { todayBogota } from "@mirai/domain/dates"
import { getIntegration } from "@mirai/services/integrations/store"
import { calendarConnected, syncCalendarFor } from "@mirai/services/google/calendar"
import { exchangeCode, googleConfigured, saveTokens } from "@mirai/services/google/oauth"
import { rt } from "@mirai/services/runtime"
import { GooglePort } from "./google.port"

@Injectable()
export class ServicesGoogle extends GooglePort {
  configured() {
    return googleConfigured()
  }
  clientId() {
    return rt().env("GOOGLE_CLIENT_ID") ?? ""
  }
  async available(householdId: string, s: "gmail" | "calendar") {
    return !!(await getIntegration(householdId, s === "calendar" ? "google_calendar" : "google_gmail"))
  }
  async connect(userId: string, code: string, redirectUri: string) {
    const t = await exchangeCode(code, redirectUri)
    const info = (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${t.access_token}` } }).then((x) => x.json()).catch(() => ({}))) as { email?: string }
    await saveTokens(userId, t, info.email)
  }
  async disconnect(userId: string) {
    await rt().admin().from("google_connections").delete().eq("user_id", userId)
  }
  async syncCalendar(o: { userId: string; bookId: string; householdId: string }) {
    const { data: rule } = await rt().admin().from("notification_rules").select("ocultar_montos").eq("user_id", o.userId).eq("book_id", o.bookId).maybeSingle()
    return syncCalendarFor({ ...o, today: todayBogota(), ocultarMontos: !!rule?.ocultar_montos })
  }
  async calendarStatus(userId: string, bookId: string) {
    const [conectado, { count }] = await Promise.all([
      calendarConnected(userId),
      rt().admin().from("google_event_map").select("key", { count: "exact", head: true }).eq("user_id", userId).eq("book_id", bookId),
    ])
    return { conectado, eventos: count ?? 0 }
  }
}
