import { NextResponse, type NextRequest } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { defaultRule, horaBogota, runRule, type Rule } from "@/lib/notify/digest"
import { refreshReferenceData } from "@/features/integrations/refresh"
import { planReminders } from "@/lib/payments/reminders"
import { runAutomationsCron } from "@/lib/automations/server"

export const maxDuration = 60

/**
 * Cron de avisos. Vercel lo llama una vez al día (`?daily=1`, vercel.json) y pg_cron cada hora
 * (`select mirai_schedule_notify(url, secreto)`). Protegido con `Authorization: Bearer CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const daily = req.nextUrl.searchParams.get("daily") === "1"
  const db = supabaseAdmin()
  const report: Record<string, unknown> = {}
  // Datos de referencia: una vez al día (pasada diaria o la de las 6 a. m. del cron horario).
  if (daily || horaBogota() === 6) report.refs = await refreshReferenceData()
  // Vencimientos de Premium: una vez al día (la pasada diaria de Vercel o las 9 a. m. del cron horario).
  if (daily || horaBogota() === 9) report.planes = await planReminders().catch((e) => `ERROR ${(e as Error).message}`)

  const [{ data: books }, { data: members }, { data: rules }, { data: profiles }] = await Promise.all([
    db.from("books").select("id,household_id").is("deleted_at", null),
    db.from("household_members").select("household_id,user_id"),
    db.from("notification_rules").select("*"),
    db.from("profiles").select("id,email,nombre"),
  ])
  const ruleOf = new Map((rules ?? []).map((r) => [`${r.user_id}:${r.book_id}`, r as unknown as Rule]))
  const prof = new Map((profiles ?? []).map((p) => [p.id, p]))
  const runs: Record<string, string[]> = {}
  for (const b of books ?? []) {
    for (const m of (members ?? []).filter((x) => x.household_id === b.household_id)) {
      const p = prof.get(m.user_id)
      const rule = ruleOf.get(`${m.user_id}:${b.id}`) ?? defaultRule(m.user_id, b.id)
      try { runs[`${m.user_id.slice(0, 8)}:${b.id.slice(0, 8)}`] = await runRule({ householdId: b.household_id, rule, email: p?.email ?? "", nombre: p?.nombre ?? "", daily }) }
      catch (e) { runs[`${m.user_id.slice(0, 8)}:${b.id.slice(0, 8)}`] = [`ERROR ${(e as Error).message}`] }
    }
  }
  report.runs = runs
  // Automatizaciones (programadas, por estado, cola pendiente y esperas cumplidas). Aislado: si falla no afecta lo demás.
  report.automatizaciones = await runAutomationsCron({ daily }).catch((e) => `ERROR ${(e as Error).message}`)
  return NextResponse.json({ ok: true, ...report })
}
