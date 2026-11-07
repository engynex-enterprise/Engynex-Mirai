import { NextResponse, type NextRequest } from "next/server"
import { horaBogota } from "@/lib/notify/digest"
import { cronHeartbeat, runDigests } from "@/lib/notify/cron"
import { tareasDiarias } from "@/lib/notify/schedule"
import { patrimonioSnapshots, planEmails } from "@/lib/notify/cron-tasks"
import { syncAllCalendars } from "@/lib/google-calendar"
import { refreshReferenceData } from "@/features/integrations/refresh"
import { planReminders } from "@/lib/payments/reminders"
import { runAutomationsCron } from "@/lib/automations/server"
import { bearerOk } from "@/lib/security/secrets"
import { serverAuthProvider } from "@/lib/auth/provider"

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
 * El latido y la pasada de resúmenes son los mismos de la API (packages/services/src/notify/cron.ts), que en la v6
 * reparte la pasada por hogar con Cloud Tasks (/v1/jobs/notify/tick).
 */
export async function GET(req: NextRequest) {
  // Desde 2026-11-07 producción vive en el VPS (cron propio del compose). Un despliegue viejo de Vercel no debe avisar
  // a nadie con la base anterior de Supabase.
  if (process.env.VERCEL) return new Response("Avisos desactivados en Vercel", { status: 410 })
  // Comparación en tiempo constante (no revela cuántos caracteres del secreto acertó quien prueba).
  if (!bearerOk(req.headers.get("authorization"), process.env.CRON_SECRET))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  // v7: sin Supabase los trabajos los corre la API (Cloud Scheduler → /v1/jobs/*). Este cron escribiría en la base vieja.
  if (serverAuthProvider() === "mirai") return NextResponse.json({ error: "Con AUTH_PROVIDER=mirai los avisos los corre la API (/v1/jobs/*)" }, { status: 410 })
  const daily = req.nextUrl.searchParams.get("daily") === "1"
  const now = new Date()
  const h = horaBogota(now)
  const report: Record<string, unknown> = { hora: h, daily }

  // Latido del cron horario y modo de la pasada.
  const { horario } = await cronHeartbeat({ now, daily })
  report.horario = horario
  const a = (hora: number) => tareasDiarias({ daily, horario, h, hora })

  // Datos de referencia: una vez al día.
  if (a(6)) report.refs = await refreshReferenceData().catch((e) => `ERROR ${(e as Error).message}`)
  // Vencimientos de Premium: una vez al día (9 a. m. con el cron horario).
  if (a(9)) report.planes = await planReminders().catch((e) => `ERROR ${(e as Error).message}`)

  report.runs = await runDigests({ now, daily, horario })
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
