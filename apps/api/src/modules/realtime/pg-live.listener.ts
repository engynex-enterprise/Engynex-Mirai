// Fuente de cambios de la base (F2-G-2): `LISTEN mirai_live` sobre UNA conexión directa de sesión (no un pooler en modo
// transacción). Lo que escriben la API, los triggers de enlace, las RPC, el cron y las automatizaciones llega igual.
// - Solo una instancia escucha: candado consultivo `pg_try_advisory_lock(hashtext('mirai_live'))`; las demás quedan
//   en espera y lo reintentan. Lo que esa instancia recibe llega a todas por el adaptador de Redis.
// - Al tomar la escucha avisa `resync`: pg_notify no guarda nada, así que lo ocurrido sin escucha se recarga.
// - Latido `select 1` para detectar una conexión muerta en silencio; reconexión con espera creciente (hasta 30 s).
// Apagado por defecto (REALTIME_PG_LISTEN=0): necesita el trigger de la migración 20261103004100_live_notify.sql.
import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown, Optional } from "@nestjs/common"
import type { Logger } from "pino"
import { LIVE_NOTIFY_CHANNEL, PgLiveNotify } from "@mirai/contracts/modules/realtime"
import { LOGGER } from "../../core/logging/logger"
import { LiveFanout } from "./live-fanout"
import { RealtimeConfig } from "./realtime.config"

/** Lo que usa de `pg.Client` (las pruebas pasan un doble). */
export type PgListenClient = {
  connect(): Promise<unknown>
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
  on(event: "notification", fn: (m: { channel: string; payload?: string }) => void): unknown
  on(event: "error" | "end", fn: (e?: Error) => void): unknown
  end(): Promise<unknown>
}
export type PgListenClientFactory = () => PgListenClient | Promise<PgListenClient>
/** Solo pruebas: fábrica de clientes falsos. */
export const PG_LISTEN_CLIENT = Symbol("mirai.pg-listen-client")

export type ListenerTiming = { standbyMs: number; retryMs: number; maxRetryMs: number; pingMs: number }
export const PG_LISTEN_TIMING = Symbol("mirai.pg-listen-timing")
const DEFAULT_TIMING: ListenerTiming = { standbyMs: 15_000, retryMs: 1_000, maxRetryMs: 30_000, pingMs: 30_000 }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms).unref?.())

@Injectable()
export class PgLiveListener implements OnApplicationBootstrap, OnApplicationShutdown {
  private stopped = false
  private client?: PgListenClient
  private loopDone?: Promise<void>
  /** Estado para diagnóstico y pruebas. */
  readonly state = { leader: false, received: 0, invalid: 0, sessions: 0 }

  constructor(
    private readonly cfg: RealtimeConfig,
    private readonly fanout: LiveFanout,
    @Inject(LOGGER) private readonly log: Logger,
    @Optional() @Inject(PG_LISTEN_CLIENT) private readonly factoryOverride?: PgListenClientFactory,
    @Optional() @Inject(PG_LISTEN_TIMING) private readonly timingOverride?: Partial<ListenerTiming>,
  ) {}

  private get timing(): ListenerTiming {
    return { ...DEFAULT_TIMING, ...this.timingOverride }
  }

  onApplicationBootstrap() {
    if (!this.cfg.pgListen) return
    this.loopDone = this.loop()
  }

  async onApplicationShutdown() {
    this.stopped = true
    await this.client?.end().catch(() => {})
    await this.loopDone
  }

  private async newClient(): Promise<PgListenClient> {
    if (this.factoryOverride) return this.factoryOverride()
    const { Client } = await import("pg")
    return new Client({ connectionString: this.cfg.pgUrl, keepAlive: true, application_name: "mirai-realtime" }) as unknown as PgListenClient
  }

  /** Un aviso del trigger → salas. Exportado para las pruebas. */
  handle(m: { channel: string; payload?: string }) {
    if (m.channel !== LIVE_NOTIFY_CHANNEL) return
    this.state.received++
    let data: unknown
    try {
      data = JSON.parse(m.payload ?? "")
    } catch {
      data = undefined
    }
    const p = PgLiveNotify.safeParse(data)
    if (!p.success) {
      this.state.invalid++
      this.log.debug({ issues: p.error.issues.length }, "aviso de mirai_live inválido")
      return
    }
    this.fanout.fromNotify(p.data)
  }

  private async loop() {
    let wait = this.timing.retryMs
    while (!this.stopped) {
      let ping: ReturnType<typeof setInterval> | undefined
      try {
        const c = (this.client = await this.newClient())
        const closed = new Promise<void>((res) => {
          c.on("error", (e) => {
            this.log.warn({ error: e }, "la escucha de mirai_live se cayó")
            res()
          })
          c.on("end", () => res())
        })
        await c.connect()
        const { rows } = await c.query("select pg_try_advisory_lock(hashtext($1)) as ok", [LIVE_NOTIFY_CHANNEL])
        if (!rows[0]?.ok) {
          // Otra instancia ya escucha: esperar y volver a intentar (si muere, su candado se libera con la sesión).
          await c.end().catch(() => {})
          this.client = undefined
          await sleep(this.timing.standbyMs)
          continue
        }
        c.on("notification", (m) => this.handle(m))
        await c.query(`listen ${LIVE_NOTIFY_CHANNEL}`)
        this.state.leader = true
        this.state.sessions++
        wait = this.timing.retryMs
        this.log.info({ channel: LIVE_NOTIFY_CHANNEL }, "escuchando cambios de la base")
        this.fanout.resyncAll("escucha-reconectada")
        ping = setInterval(() => {
          c.query("select 1").catch(() => void c.end().catch(() => {}))
        }, this.timing.pingMs)
        ping.unref?.()
        await closed
      } catch (e) {
        this.log.warn({ error: e }, "no se pudo escuchar mirai_live")
      } finally {
        if (ping) clearInterval(ping)
        this.state.leader = false
        await this.client?.end().catch(() => {})
        this.client = undefined
      }
      if (this.stopped) break
      await sleep(wait)
      wait = Math.min(wait * 2, this.timing.maxRetryMs)
    }
  }
}
