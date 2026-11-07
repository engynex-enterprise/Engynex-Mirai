// /v1/books/:bookId/google/**, /v1/books/:bookId/calendar/** y /v1/google/** (F2-E-3). Mismas reglas que la web:
// conectar y sincronizar piden el plan con "banco"; el estado de Calendar responde a cualquiera del libro.
import { Controller, Get, Query, Res } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { googleContract as c } from "@mirai/contracts/modules/google"
import { Public } from "../../core/auth/decorators"
import { MinRole, Premium } from "../../core/context/decorators"
import { SkipDefaultLimit } from "../../core/rate-limit/rate-limit.guard"
import { GoogleService } from "./google.service"

/** Lo mínimo de la respuesta de Fastify que usa el callback (sin depender del paquete `fastify`). */
type Reply = { header(k: string, v: string): Reply; redirect(url: string, code?: number): unknown }

@Controller()
export class GoogleController {
  constructor(private readonly svc: GoogleService) {}

  @TsRestHandler(c.connectUrl)
  @MinRole("viewer")
  @Premium("banco")
  connectUrl() {
    return tsRestHandler(c.connectUrl, async ({ query }) => ({ status: 200, body: await this.svc.connectUrl(query.s, query.back) }))
  }

  /** Redirección de Google (sin sesión: la persona sale del `state` firmado). Siempre responde 302 a la web. */
  @Get("/v1/google/callback")
  @Public()
  @SkipDefaultLimit()
  async callback(@Query() q: Record<string, string | undefined>, @Res() reply: Reply) {
    const to = await this.svc.callback({ code: q.code, state: q.state, error: q.error })
    return reply.header("cache-control", "no-store").redirect(to, 302)
  }

  @TsRestHandler(c.connection)
  connection() {
    return tsRestHandler(c.connection, async () => ({ status: 200, body: await this.svc.connection() }))
  }

  @TsRestHandler(c.disconnect)
  disconnect() {
    return tsRestHandler(c.disconnect, async () => ({ status: 200, body: { ok: true as const, data: await this.svc.disconnect() } }))
  }

  @TsRestHandler(c.calendarSync)
  @MinRole("viewer")
  @Premium("banco")
  calendarSync() {
    return tsRestHandler(c.calendarSync, async () => ({ status: 200, body: { ok: true as const, data: await this.svc.calendarSync() } }))
  }

  @TsRestHandler(c.calendarStatus)
  @MinRole("viewer")
  calendarStatus() {
    return tsRestHandler(c.calendarStatus, async () => ({ status: 200, body: await this.svc.calendarStatus() }))
  }
}
