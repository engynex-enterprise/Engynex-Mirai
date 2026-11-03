// EventsService (§2.6, §2.8): los módulos de escritura avisan qué cambió. En la fase 2 todavía no hay gateway de
// WebSocket (F2-G) ni se encolan automatizaciones (F2-E-4): reparte a suscriptores en proceso y deja traza en el log.
// Supabase Realtime sigue avisando al navegador mientras la base esté en Supabase.
import { Inject, Injectable } from "@nestjs/common"
import type { Logger } from "pino"
import type { LiveChange } from "@mirai/contracts/live"
import { LOGGER } from "../logging/logger"

export type ChangeListener = (c: LiveChange) => void | Promise<void>

@Injectable()
export class EventsService {
  private readonly listeners = new Set<ChangeListener>()

  constructor(@Inject(LOGGER) private readonly log: Logger) {}

  /** El gateway (F2-G) y el *outbox* de automatizaciones (F2-E) se suscriben aquí. Devuelve cómo desuscribirse. */
  subscribe(l: ChangeListener): () => void {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  /** Cambió `tables` del libro (después de confirmar la escritura). Nunca lanza. */
  changed(bookId: string, tables: LiveChange["table"][], id?: string, op: LiveChange["op"] = "UPDATE") {
    for (const table of tables) {
      const c: LiveChange = { table, bookId, id, op }
      this.log.debug({ change: c }, "cambio")
      for (const l of this.listeners) {
        try {
          void Promise.resolve(l(c)).catch((e) => this.log.warn({ error: e }, "suscriptor de cambios falló"))
        } catch (e) {
          this.log.warn({ error: e }, "suscriptor de cambios falló")
        }
      }
    }
  }
}
