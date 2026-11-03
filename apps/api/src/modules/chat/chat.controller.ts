// /v1/books/:bookId/chat/** (§2.6, §2.7.11, F2-F-3/F2-F-4). Cualquier rol del hogar conversa (como /api/chat); los
// permisos finos por tipo de registro los aplica el motor. El streaming va sin ts-rest (Fastify + PassThrough): mismo
// NDJSON que app/api/chat/route.ts, con latido cada 15 s y cancelación al cerrar la conexión.
import { PassThrough } from "node:stream"
import type { ServerResponse } from "node:http"
import { Body, Controller, HttpCode, Post, Res } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import type { ChatEvent } from "@mirai/contracts/chat-types"
import { CHAT_PING_MS, ChatBody, chatContract as c, NDJSON } from "@mirai/contracts/modules/chat"
import { MinRole } from "../../core/context/decorators"
import { issuesToDetails } from "../../core/errors/all-exceptions.filter"
import { DomainError } from "../../core/errors/domain-error"
import { RateLimit } from "../../core/rate-limit/rate-limit.guard"
import { ChatService } from "./chat.service"

const ok = <T>(data: T) => ({ status: 200 as const, body: { ok: true as const, data } })
const json = <T>(body: T) => ({ status: 200 as const, body })

/** Lo que se usa de la respuesta de Fastify (sin depender de sus tipos). */
type Reply = { raw: ServerResponse; header(k: string, v: string): Reply; send(payload: unknown): unknown }

@Controller()
export class ChatController {
  constructor(private readonly svc: ChatService) {}

  /**
   * POST /v1/books/:bookId/chat/messages → `application/x-ndjson`: un ChatEvent por línea. Las guardas (sesión, libro y
   * límite `chat`) responden JSON antes de empezar; ya en el stream, los errores salen como `{ t: "error" }`.
   */
  @Post(c.send.path)
  @HttpCode(200)
  @MinRole("viewer")
  @RateLimit("chat", "user", "Enviaste muchos mensajes seguidos")
  async send(@Body() raw: unknown, @Res() reply: Reply) {
    const parsed = ChatBody.safeParse(raw ?? {})
    if (!parsed.success) throw DomainError.validation("Revisa los datos del formulario.", issuesToDetails(parsed.error.issues))
    const out = new PassThrough()
    const ac = new AbortController()
    let open = true
    const write = (e: ChatEvent | { t: "ping" }) => {
      if (open && !out.writableEnded) out.write(`${JSON.stringify(e)}\n`)
    }
    // La persona detuvo la respuesta o se cayó la conexión: se corta la IA y se guarda lo que alcanzó a llegar.
    reply.raw.on("close", () => {
      open = false
      if (!reply.raw.writableFinished) ac.abort()
    })
    reply.header("content-type", NDJSON).header("cache-control", "no-store, no-transform").header("x-accel-buffering", "no")
    void reply.send(out)
    const ping = setInterval(() => write({ t: "ping" }), CHAT_PING_MS)
    try {
      await this.svc.turn(parsed.data, write, ac.signal)
    } finally {
      clearInterval(ping)
      out.end()
    }
  }

  @TsRestHandler(c.hints)
  @MinRole("viewer")
  hints() {
    return tsRestHandler(c.hints, async () => json(await this.svc.hints()))
  }

  @TsRestHandler(c.threads)
  @MinRole("viewer")
  threads() {
    return tsRestHandler(c.threads, async ({ query }) => json(await this.svc.threads(query)))
  }

  @TsRestHandler(c.messages)
  @MinRole("viewer")
  messages() {
    return tsRestHandler(c.messages, async ({ params }) => json(await this.svc.messages(params.threadId)))
  }

  @TsRestHandler(c.patchThread)
  @MinRole("viewer")
  patchThread() {
    return tsRestHandler(c.patchThread, async ({ params, body }) => ok(await this.svc.patchThread(params.threadId, body)))
  }

  @TsRestHandler(c.deleteThread)
  @MinRole("viewer")
  deleteThread() {
    return tsRestHandler(c.deleteThread, async ({ params }) => ok(await this.svc.deleteThread(params.threadId)))
  }

  @TsRestHandler(c.restoreThread)
  @MinRole("viewer")
  restoreThread() {
    return tsRestHandler(c.restoreThread, async ({ params }) => ok(await this.svc.restoreThread(params.threadId)))
  }

  @TsRestHandler(c.duplicate)
  @MinRole("viewer")
  duplicate() {
    return tsRestHandler(c.duplicate, async ({ params }) => ok(await this.svc.duplicate(params.threadId)))
  }

  @TsRestHandler(c.title)
  @MinRole("viewer")
  title() {
    return tsRestHandler(c.title, async ({ params }) => ok(await this.svc.title(params.threadId)))
  }

  @TsRestHandler(c.info)
  @MinRole("viewer")
  info() {
    return tsRestHandler(c.info, async ({ params }) => json(await this.svc.info(params.threadId)))
  }

  @TsRestHandler(c.confirm)
  @MinRole("viewer")
  confirm() {
    return tsRestHandler(c.confirm, async ({ params }) => ok(await this.svc.confirm(params.messageId, params.propId)))
  }

  @TsRestHandler(c.cancel)
  @MinRole("viewer")
  cancel() {
    return tsRestHandler(c.cancel, async ({ params }) => ok(await this.svc.cancel(params.messageId, params.propId)))
  }

  @TsRestHandler(c.attach)
  @MinRole("viewer")
  attach() {
    return tsRestHandler(c.attach, async ({ body }) => ok(await this.svc.attach(body)))
  }
}
