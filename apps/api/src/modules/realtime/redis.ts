// Conexiones a Redis (Memorystore) para escalar a varias instancias: adaptador de socket.io (pub/sub), presencia y,
// en MODE=api, el emisor (redis-emitter). Solo se abren si hay REDIS_URL; sin ella todo queda en memoria.
import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common"
import { Redis } from "ioredis"
import type { Logger } from "pino"
import { LOGGER } from "../../core/logging/logger"
import { RealtimeConfig } from "./realtime.config"

@Injectable()
export class RedisClients implements OnApplicationShutdown {
  private pubClient?: Redis
  private subClient?: Redis

  constructor(
    private readonly cfg: RealtimeConfig,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  get enabled(): boolean {
    return !!this.cfg.redisUrl
  }

  private open(role: string): Redis {
    const r = new Redis(this.cfg.redisUrl!, { lazyConnect: false, maxRetriesPerRequest: 3, enableAutoPipelining: true, connectionName: `mirai-realtime-${role}` })
    // Nunca el URL en el log (puede llevar la clave).
    r.on("error", (e: Error) => this.log.warn({ redis: role, error: { name: e.name, message: e.message } }, "Redis con problemas"))
    return r
  }

  /** Publica (adaptador y emisor) y sirve para comandos (presencia). */
  get pub(): Redis {
    if (!this.enabled) throw new Error("REDIS_URL no está configurada")
    return (this.pubClient ??= this.open("pub"))
  }

  /** Suscripción del adaptador (una conexión en modo subscribe no acepta otros comandos). */
  get sub(): Redis {
    if (!this.enabled) throw new Error("REDIS_URL no está configurada")
    return (this.subClient ??= this.pub.duplicate({ connectionName: "mirai-realtime-sub" }))
  }

  async onApplicationShutdown() {
    // Al cerrar, el adaptador de socket.io manda punsubscribe/unsubscribe sin esperar y ioredis los junta en el
    // auto-pipeline (sale en el siguiente setImmediate). Sin esta espera, quit() cerraba antes y quedaba un
    // "Connection is closed." sin capturar (visto con Redis real en test/pg/realtime.int.test.ts, V7-I).
    await new Promise((r) => setImmediate(r))
    await Promise.allSettled([this.pubClient?.quit(), this.subClient?.quit()])
  }
}

