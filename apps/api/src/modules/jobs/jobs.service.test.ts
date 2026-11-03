// Tick y trabajadores con dobles (sin base, sin Cloud Tasks, sin envíos).
import { beforeEach, describe, expect, it } from "vitest"
import pino from "pino"
import type { Heartbeat } from "@mirai/services/notify/cron"
import { InlineQueue } from "../../core/queue/inline.queue"
import { AutomationsRunner } from "../automations/automations.port"
import type { ServicesEnv } from "../integrations/services-env"
import { NotifyJobs, PlanRemindersPort } from "./jobs.port"
import { JobsService, stamp5m, stampDay, stampHour } from "./jobs.service"

const H1 = "00000000-0000-4000-8000-000000000100"
const H2 = "00000000-0000-4000-8000-000000000200"
/** 2026-11-02 a la hora `h` de Colombia (UTC−5), minuto 5 (como Cloud Scheduler). */
const at = (h: number, min = 5) => new Date(Date.UTC(2026, 10, 2, h + 5, min))

class FakeJobs extends NotifyJobs {
  ready = true
  beats: { now: Date; dry: boolean }[] = []
  calls: string[] = []
  horario = true
  async heartbeat(o: { now: Date; dry: boolean }): Promise<Heartbeat> {
    this.beats.push(o)
    return { horario: this.horario, cronHorario: true, visto: null }
  }
  async households() {
    return [H1, H2]
  }
  async household(id: string, o: { now: Date; horario: boolean; dry: boolean }) {
    this.calls.push(`household:${id}:${o.horario}:${o.dry}`)
    return { [`u1:${id.slice(0, 8)}`]: [o.dry ? "email: simulado" : "email: ok"] }
  }
  async planEmails(_now: Date, dry: boolean) {
    this.calls.push(`planEmails:${dry}`)
    return 2
  }
  async refs() {
    this.calls.push("refs")
    return ["trm: 4100 (2026-11-02) → 3 libros"]
  }
  async calendarUsers() {
    return ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"]
  }
  async calendarUser(u: string, dry: boolean) {
    return [`${u.slice(0, 8)}:b ${dry ? "simulado" : "+1 ~0 -0"}`]
  }
  async netWorth() {
    this.calls.push("netWorth")
    return 4
  }
}
class FakeAutomations extends AutomationsRunner {
  calls: string[] = []
  async processBook(b: string) {
    this.calls.push(`book:${b}`)
    return ["Ahorro: ok"]
  }
  async hourly() {
    this.calls.push("hourly")
    return { libros: 1, ejecuciones: 0, detalle: [] }
  }
  async pendingBooks() {
    return ["00000000-0000-4000-8000-000000000101"]
  }
}
class FakePlan extends PlanRemindersPort {
  async run() {
    return 1
  }
}

const env = (tickDailyTasks = true) => ({ values: { tickDailyTasks, automationsOutbox: true } }) as unknown as ServicesEnv
const ctx = { peek: () => ({ caller: "secret" }) }
let jobs: FakeJobs, autos: FakeAutomations, queue: InlineQueue, svc: JobsService
const make = (daily = true) => {
  jobs = new FakeJobs()
  autos = new FakeAutomations()
  queue = new InlineQueue()
  svc = new JobsService(ctx as never, jobs, new FakePlan(), autos, queue, env(daily), pino({ level: "silent" }))
}
beforeEach(() => make())

describe("nombres deterministas", () => {
  it("hora, día y ventana de 5 minutos en Colombia", () => {
    expect(stampHour(at(10))).toBe("2026110210")
    expect(stampHour(at(23, 30))).toBe("2026110223") // 04:30 UTC del día siguiente
    expect(stampDay(at(23, 30))).toBe("20261102")
    expect(stamp5m(at(10, 17))).toBe("202611021015")
  })
})

describe("POST /v1/jobs/notify/tick", () => {
  it("deja el latido y encola una tarea por hogar con nombre notify-<hogar>-<AAAAMMDDHH>", async () => {
    const r = await svc.notifyTick({ dry: false }, at(10))
    expect(jobs.beats).toEqual([{ now: at(10), dry: false }])
    expect(r).toMatchObject({ hora: 10, dry: false, horario: true, hogares: 2, encoladas: 4, repetidas: 0, tareas: ["plan-emails", "automations-hourly"], caller: "secret" })
    const hogares = queue.tasks.filter((t) => t.queue === "notify" && t.path.includes("/household/"))
    expect(hogares.map((t) => t.name)).toEqual([`notify-${H1}-2026110210`, `notify-${H2}-2026110210`])
    expect(hogares[0]).toMatchObject({ path: `/v1/jobs/notify/household/${H1}`, body: { at: at(10).toISOString(), horario: true, dry: false } })
  })

  it("otro tick en la misma hora no repite nada (Cloud Tasks rechaza el nombre)", async () => {
    await svc.notifyTick({ dry: false }, at(10))
    const r = await svc.notifyTick({ dry: false }, at(10, 40))
    expect(r).toMatchObject({ encoladas: 0, repetidas: 4 })
    expect(queue.tasks).toHaveLength(4)
  })

  it("a las 6: datos de referencia, Calendar y patrimonio en la cola slow; a las 9: vencimientos de Premium", async () => {
    const seis = await svc.notifyTick({ dry: false }, at(6))
    expect(seis.tareas).toEqual(["plan-emails", "automations-hourly", "refs", "calendar", "net-worth"])
    expect(queue.tasks.filter((t) => t.queue === "slow").map((t) => t.name)).toEqual(["refs-20261102", "gcal-sync-20261102", "net-worth-20261102"])
    const nueve = await svc.notifyTick({ dry: false }, at(9))
    expect(nueve.tareas).toContain("plan-reminders")
  })

  it("con TICK_DAILY_TASKS=0 (Scheduler ya las llama aparte) no encola las diarias", async () => {
    make(false)
    expect((await svc.notifyTick({ dry: false }, at(6))).tareas).toEqual(["plan-emails", "automations-hourly"])
  })

  it("en simulación no deja latido y encola con prefijo dry- y { dry: true }", async () => {
    const r = await svc.notifyTick({ dry: true }, at(10))
    expect(jobs.beats[0].dry).toBe(true)
    expect(r.dry).toBe(true)
    expect(queue.tasks.every((t) => t.name!.startsWith("dry-"))).toBe(true)
    expect(queue.tasks[0].body).toMatchObject({ dry: true })
  })

  it("sin base (local sin SUPABASE_SECRET_KEY) responde con una nota y no encola", async () => {
    jobs.ready = false
    const r = await svc.notifyTick({ dry: false }, at(10))
    expect(r).toMatchObject({ encoladas: 0, hogares: 0, nota: expect.stringMatching(/SUPABASE_SECRET_KEY/) })
    expect(queue.tasks).toHaveLength(0)
  })
})

describe("trabajadores", () => {
  it("hogar: usa la hora del tick (no la de la tarea) y devuelve el mismo `runs` del cron de la web", async () => {
    const r = await svc.notifyHousehold(H1, { at: at(9).toISOString(), horario: true })
    expect(r).toEqual({ householdId: H1, hora: 9, dry: false, runs: { [`u1:${H1.slice(0, 8)}`]: ["email: ok"] } })
    expect(jobs.calls).toEqual([`household:${H1}:true:false`])
  })

  it("Calendar: una tarea por persona en la cola slow", async () => {
    const r = await svc.calendarSync(false, at(6, 20))
    expect(r).toMatchObject({ job: "calendar.sync", encoladas: 2 })
    expect(queue.tasks.map((t) => t.path)).toEqual(["/v1/jobs/calendar/user/00000000-0000-4000-8000-000000000001", "/v1/jobs/calendar/user/00000000-0000-4000-8000-000000000002"])
  })

  it("drain: una tarea por libro con eventos pendientes; en simulación no encola", async () => {
    expect(await svc.automationsDrain(true, at(10, 12))).toMatchObject({ encoladas: 0, resultado: { libros: 1 } })
    expect(queue.tasks).toHaveLength(0)
    const r = await svc.automationsDrain(false, at(10, 12))
    expect(r.encoladas).toBe(1)
    expect(queue.tasks[0].name).toBe("auto-00000000-0000-4000-8000-000000000101-202611021010")
  })

  it("en simulación no escriben: referencias, patrimonio y automatizaciones solo reportan", async () => {
    expect((await svc.refs(true)).resultado).toBe("simulado")
    expect((await svc.automationsHourly(true)).resultado).toBe("simulado")
    expect((await svc.automationsBook("b", true)).resultado).toBe("simulado")
    expect((await svc.netWorth(true, at(6))).resultado).toEqual({ simulado: true, dia1: false })
    expect(jobs.calls).toEqual([])
    expect(autos.calls).toEqual([])
  })

  it("vencimientos del plan y sus correos en la misma pasada", async () => {
    expect((await svc.planReminders(false, at(9))).resultado).toEqual({ vencimientos: 1, correos: 2 })
  })
})
