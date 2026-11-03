// MODE=api (servicio mirai-api): las escrituras de la API avisan por EventsService y este módulo las publica en Redis con
// @socket.io/redis-emitter, así el gateway (otro servicio de Cloud Run, MODE=realtime) las reparte a sus salas.
// Sin REDIS_URL (hoy) o con REALTIME_API_EMIT=0 no hace nada: Supabase Realtime sigue avisando al navegador.
import { Inject, Injectable, Module, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import { Emitter } from "@socket.io/redis-emitter"
import type { Logger } from "pino"
import { AppConfig } from "../../core/config/app-config"
import { EventsService } from "../../core/events/events.service"
import { LOGGER } from "../../core/logging/logger"
import { LiveFanout, type LiveSink } from "./live-fanout"
import { loadRealtimeConfig, RealtimeConfig } from "./realtime.config"
import { RedisClients } from "./redis"

/** Destino "emisor de Redis": mismo canal que usa el adaptador del gateway (`key: "mirai-rt"`). */
export function emitterSink(emitter: Pick<Emitter, "to" | "serverSideEmit" | "emit">): LiveSink {
  return {
    deliver: (d) => void emitter.to(d.rooms).emit(d.event, d.payload),
    revalidateHousehold: (h) => void emitter.serverSideEmit("revalidate", h),
    resyncAll: (reason) => void emitter.emit("resync", { reason }),
  }
}

@Injectable()
export class RealtimePublisher implements OnModuleInit, OnModuleDestroy {
  private off?: () => void

  constructor(
    private readonly cfg: RealtimeConfig,
    private readonly redis: RedisClients,
    private readonly fanout: LiveFanout,
    private readonly events: EventsService,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  get active() {
    return this.redis.enabled && this.cfg.apiEmit
  }

  onModuleInit() {
    if (!this.active) return
    this.fanout.attach(emitterSink(new Emitter(this.redis.pub, { key: "mirai-rt" })))
    this.off = this.events.subscribe((c) => this.fanout.fromChange(c))
    this.log.info("cambios de la API → gateway de tiempo real (Redis)")
  }

  onModuleDestroy() {
    this.off?.()
  }
}

export const realtimeConfigProvider = {
  provide: RealtimeConfig,
  inject: [AppConfig],
  useFactory: (app: AppConfig) => loadRealtimeConfig(process.env, app),
}

@Module({ providers: [realtimeConfigProvider, RedisClients, LiveFanout, RealtimePublisher] })
export class RealtimePublisherModule {}
