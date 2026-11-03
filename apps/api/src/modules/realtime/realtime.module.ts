// Módulo `realtime` (docs/arquitectura/v6-separacion-front-back.md §2.6 y §2.8). Dueño: F2-G.
// Solo con MODE=realtime (servicio aparte de Cloud Run, D8): gateway socket.io, presencia, reparto de cambios y la
// escucha de la base (pg_notify). En MODE=api corre RealtimePublisherModule (publica por Redis lo que escribe la API).
import { Module, type Provider } from "@nestjs/common"
import { LiveFanout } from "./live-fanout"
import { PgLiveListener } from "./pg-live.listener"
import { MemoryPresenceStore, PresenceStore, RedisPresenceStore } from "./presence.store"
import { realtimeConfigProvider } from "./realtime-publisher.module"
import { RealtimeGateway } from "./realtime.gateway"
import { RedisClients } from "./redis"

const presenceProvider: Provider = {
  provide: PresenceStore,
  inject: [RedisClients],
  useFactory: (redis: RedisClients) => (redis.enabled ? new RedisPresenceStore(redis.pub) : new MemoryPresenceStore()),
}

@Module({
  providers: [realtimeConfigProvider, RedisClients, presenceProvider, LiveFanout, PgLiveListener, RealtimeGateway],
  exports: [LiveFanout, PresenceStore],
})
export class RealtimeModule {}
