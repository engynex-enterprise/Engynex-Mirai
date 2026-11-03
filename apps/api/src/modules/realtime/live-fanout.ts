// Reparto de cambios a las salas (F2-G-2). Las fuentes (EventsService de la API y PgLiveListener del trigger) llaman a
// `fromChange`/`fromNotify`; el destino (`LiveSink`) es el servidor socket.io (MODE=realtime) o el emisor de Redis
// (MODE=api, para llegar al gateway que corre en otro servicio de Cloud Run).
import { Inject, Injectable } from "@nestjs/common"
import type { Logger } from "pino"
import type { LiveChange } from "@mirai/contracts/live"
import type { PgLiveNotify } from "@mirai/contracts/modules/realtime"
import { LOGGER } from "../../core/logging/logger"
import { routeChange, routeNotify, type Delivery, type Routed } from "./live-routes"

export interface LiveSink {
  deliver(d: Delivery): void
  /** Pide a todas las instancias revisar la membresía de las conexiones de ese hogar. */
  revalidateHousehold(householdId: string): void
  /** Todas las conexiones deben recargar lo del libro (se perdieron cambios). */
  resyncAll(reason: string): void
}

@Injectable()
export class LiveFanout {
  private sink?: LiveSink
  /** Contadores para el log de diagnóstico. */
  readonly stats = { delivered: 0, dropped: 0 }

  constructor(@Inject(LOGGER) private readonly log: Logger) {}

  attach(sink: LiveSink) {
    this.sink = sink
  }

  private apply(r: Routed) {
    if (!this.sink) {
      this.stats.dropped += r.deliveries.length
      return
    }
    for (const d of r.deliveries) {
      try {
        this.sink.deliver(d)
        this.stats.delivered++
      } catch (e) {
        this.stats.dropped++
        this.log.warn({ error: e, event: d.event }, "no se pudo repartir el cambio")
      }
    }
    if (r.revalidateHousehold) this.sink.revalidateHousehold(r.revalidateHousehold)
  }

  fromChange(c: LiveChange) {
    this.apply(routeChange(c))
  }

  fromNotify(n: PgLiveNotify) {
    this.apply(routeNotify(n))
  }

  resyncAll(reason: string) {
    this.sink?.resyncAll(reason)
  }
}
