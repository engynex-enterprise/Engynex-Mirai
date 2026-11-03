// Pasada de resúmenes del cron de avisos. La usan:
// - la web (apps/web/app/api/cron/notify): todos los hogares en serie, como siempre;
// - la API (F2-E-5): el tick toma el latido y encola una tarea por hogar (/v1/jobs/notify/household/:h), y cada tarea
//   corre esta misma pasada solo para su hogar. Mismo recorrido, mismas claves de no-duplicado y mismo reporte.
import { rt } from "../runtime"
import { channelStatus, defaultRule, runRule, type Canal, type Rule } from "./digest"
import { horarioActivo } from "./schedule"

export type Heartbeat = { horario: boolean; cronHorario: boolean | null; visto: string | null }

/**
 * Latido del cron horario (`platform_settings.cron_horario_visto`) y modo de la pasada. Una pasada horaria (no `daily`)
 * deja su latido; la diaria solo lo lee. En simulación (`dry`) no escribe nada.
 */
export async function cronHeartbeat(o: { now: Date; daily: boolean; dry?: boolean }): Promise<Heartbeat> {
  const db = rt().admin()
  const { data: ps } = await db.from("platform_settings").select("cron_horario,cron_horario_visto").eq("id", true).maybeSingle()
  if (!o.daily && !o.dry) await db.from("platform_settings").update({ cron_horario_visto: o.now.toISOString() }).eq("id", true)
  const horario = horarioActivo({ cronHorario: ps?.cron_horario, visto: o.daily ? ps?.cron_horario_visto : o.now.toISOString(), now: o.now })
  return { horario, cronHorario: ps?.cron_horario ?? null, visto: ps?.cron_horario_visto ?? null }
}

/** Hogares con al menos un libro vivo (a cada uno el tick de la API le encola su tarea). */
export async function householdsWithBooks(): Promise<string[]> {
  const { data } = await rt().admin().from("books").select("household_id").is("deleted_at", null)
  return [...new Set((data ?? []).map((b) => b.household_id))].sort()
}

export type DigestRunOpts = {
  now: Date
  /** Pasada diaria de Vercel (`?daily=1`). La API nunca la usa: su tick es siempre la pasada horaria. */
  daily: boolean
  /** ¿El cron horario está vivo? (cronHeartbeat). */
  horario: boolean
  /** Simulación: calcula y no envía ni escribe (runRule). */
  dry?: boolean
  /** Solo este hogar (tarea de Cloud Tasks). Sin él, todos. */
  householdId?: string
}

/**
 * Resúmenes de cada persona en cada libro de sus hogares (runRule). Devuelve el reporte por `<persona>:<libro>` (8
 * caracteres de cada id), igual que `report.runs` del cron de la web. Un error de una persona no detiene a las demás.
 */
export async function runDigests(o: DigestRunOpts): Promise<Record<string, string[]>> {
  const db = rt().admin()
  type BookRow = { id: string; household_id: string }
  type MemberRow = { household_id: string; user_id: string }
  type ProfileRow = { id: string; email: string | null; nombre: string | null }
  let books: BookRow[], members: MemberRow[], rules: unknown[], profiles: ProfileRow[]
  if (!o.householdId) {
    const [b, m, r, p] = await Promise.all([
      db.from("books").select("id,household_id").is("deleted_at", null),
      db.from("household_members").select("household_id,user_id"),
      db.from("notification_rules").select("*"),
      db.from("profiles").select("id,email,nombre"),
    ])
    books = b.data ?? []; members = m.data ?? []; rules = r.data ?? []; profiles = p.data ?? []
  } else {
    const [b, m] = await Promise.all([
      db.from("books").select("id,household_id").is("deleted_at", null).eq("household_id", o.householdId),
      db.from("household_members").select("household_id,user_id").eq("household_id", o.householdId),
    ])
    books = b.data ?? []; members = m.data ?? []
    const bookIds = books.map((x) => x.id), userIds = [...new Set(members.map((x) => x.user_id))]
    const [r, p] = await Promise.all([
      bookIds.length ? db.from("notification_rules").select("*").in("book_id", bookIds) : Promise.resolve({ data: [] as unknown[] }),
      userIds.length ? db.from("profiles").select("id,email,nombre").in("id", userIds) : Promise.resolve({ data: [] as ProfileRow[] }),
    ])
    rules = r.data ?? []; profiles = p.data ?? []
  }
  const ruleOf = new Map((rules as Rule[]).map((r) => [`${r.user_id}:${r.book_id}`, r]))
  const prof = new Map(profiles.map((p) => [p.id, p]))
  const readyOf = new Map<string, Promise<Record<Canal, boolean>>>()
  const runs: Record<string, string[]> = {}
  for (const b of books) {
    for (const m of members.filter((x) => x.household_id === b.household_id)) {
      const p = prof.get(m.user_id)
      const rule = ruleOf.get(`${m.user_id}:${b.id}`) ?? defaultRule(m.user_id, b.id)
      if (!readyOf.has(b.household_id)) readyOf.set(b.household_id, channelStatus(b.household_id))
      const key = `${m.user_id.slice(0, 8)}:${b.id.slice(0, 8)}`
      try { runs[key] = await runRule({ householdId: b.household_id, rule, email: p?.email ?? "", nombre: p?.nombre ?? "", now: o.now, daily: o.daily, horario: o.horario, ready: await readyOf.get(b.household_id)!, dry: o.dry }) }
      catch (e) { runs[key] = [`ERROR ${(e as Error).message}`] }
    }
  }
  return runs
}
