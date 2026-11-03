import { NextResponse, type NextRequest } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { channelStatus, defaultRule, horaBogota, runRule, type Canal, type Rule } from "@/lib/notify/digest"
import { horarioActivo, tareasDiarias } from "@/lib/notify/schedule"
import { patrimonioSnapshots, planEmails } from "@/lib/notify/cron-tasks"
import { syncAllCalendars } from "@/lib/google-calendar"
import { refreshReferenceData } from "@/features/integrations/refresh"
import { planReminders } from "@/lib/payments/reminders"
import { runAutomationsCron } from "@/lib/automations/server"
import { bearerOk } from "@/lib/security/secrets"

export const maxDuration = 60

/**
 * Cron de avisos. Vercel lo llama una vez al día (`?daily=1`, vercel.json, 6 a. m. en Colombia) y pg_cron cada hora en el
 * minuto 5 (`select mirai_schedule_notify(url, secreto)`). Protegido con `Authorization: Bearer CRON_SECRET`.
 *
 * Idempotente: se puede llamar varias veces en la misma hora sin repetir nada.
 * - Campana: `notifications` con (user_id, dedupe).
 * - Resúmenes por correo, WhatsApp, Telegram y push: una clave por persona, libro, canal y día en `notification_log`
 *   (notify_claim). Cada persona lo recibe a la hora que eligió mientras el cron horario esté vivo (latido en
 *   `platform_settings.cron_horario_visto`); si no, en la pasada diaria.
 * - Tareas de una vez al día (referencias, Google Calendar, foto del patrimonio): upserts y mapas idempotentes.
 */
export async function GET(req: NextRequest) {
  // Comparación en tiempo constante (no revela cuántos caracteres del secreto acertó quien prueba).
  if (!bearerOk(req.headers.get("authorization"), process.env.CRON_SECRET))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const daily = req.nextUrl.searchParams.get("daily") === "1"
  const db = supabaseAdmin()
  const now = new Date()
  const h = horaBogota(now)
  const report: Record<string, unknown> = { hora: h, daily }

  // Latido del cron horario y modo de la pasada.
  const { data: ps } = await db.from("platform_settings").select("cron_horario,cron_horario_visto").eq("id", true).maybeSingle()
  if (!daily) await db.from("platform_settings").update({ cron_horario_visto: now.toISOString() }).eq("id", true)
  const horario = horarioActivo({ cronHorario: ps?.cron_horario, visto: daily ? ps?.cron_horario_visto : now.toISOString(), now })
  report.horario = horario
  const a = (hora: number) => tareasDiarias({ daily, horario, h, hora })

  // Datos de referencia: una vez al día.
  if (a(6)) report.refs = await refreshReferenceData().catch((e) => `ERROR ${(e as Error).message}`)
  // Vencimientos de Premium: una vez al día (9 a. m. con el cron horario).
  if (a(9)) report.planes = await planReminders().catch((e) => `ERROR ${(e as Error).message}`)

  const [{ data: books }, { data: members }, { data: rules }, { data: profiles }] = await Promise.all([
    db.from("books").select("id,household_id").is("deleted_at", null),
    db.from("household_members").select("household_id,user_id"),
    db.from("notification_rules").select("*"),
    db.from("profiles").select("id,email,nombre"),
  ])
  const ruleOf = new Map((rules ?? []).map((r) => [`${r.user_id}:${r.book_id}`, r as unknown as Rule]))
  const prof = new Map((profiles ?? []).map((p) => [p.id, p]))
  const readyOf = new Map<string, Promise<Record<Canal, boolean>>>()
  const runs: Record<string, string[]> = {}
  for (const b of books ?? []) {
    for (const m of (members ?? []).filter((x) => x.household_id === b.household_id)) {
      const p = prof.get(m.user_id)
      const rule = ruleOf.get(`${m.user_id}:${b.id}`) ?? defaultRule(m.user_id, b.id)
      if (!readyOf.has(b.household_id)) readyOf.set(b.household_id, channelStatus(b.household_id))
      const key = `${m.user_id.slice(0, 8)}:${b.id.slice(0, 8)}`
      try { runs[key] = await runRule({ householdId: b.household_id, rule, email: p?.email ?? "", nombre: p?.nombre ?? "", now, daily, horario, ready: await readyOf.get(b.household_id)! }) }
      catch (e) { runs[key] = [`ERROR ${(e as Error).message}`] }
    }
  }
  report.runs = runs
  // Correo de los avisos del plan (pago aprobado o rechazado, por vencer, vencido): en cada pasada, una vez por aviso.
  report.correosPlan = await planEmails(now).catch((e) => `ERROR ${(e as Error).message}`)
  // Google Calendar y foto del patrimonio (el día 1): una vez al día.
  if (a(6)) {
    report.calendar = await syncAllCalendars().catch((e) => `ERROR ${(e as Error).message}`)
    report.patrimonio = await patrimonioSnapshots(now).catch((e) => `ERROR ${(e as Error).message}`)
  }
  // Automatizaciones (programadas, por estado, cola pendiente y esperas cumplidas). Aislado: si falla no afecta lo demás.
  // Con el cron horario vivo, la pasada diaria respeta la hora de las programadas (no las adelanta a las 6 a. m.).
  report.automatizaciones = await runAutomationsCron({ daily: daily && !horario }).catch((e) => `ERROR ${(e as Error).message}`)
  return NextResponse.json({ ok: true, ...report })
}
