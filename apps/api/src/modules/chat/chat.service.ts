// Casos de uso del chat (§2.1, F2-F-3/F2-F-4). El libro y el rol los revisó BookGuard; los permisos finos por tipo de
// propuesta (lib/chat/permisos.ts) los aplica el motor. Aquí: quién llama, el adjunto (Storage o cuerpo) y la traducción
// de `{ ok: false, msg }` a DomainError con el mismo texto. Después de confirmar, avisa qué tablas cambiaron
// (EventsService: gateway en vivo y outbox de automatizaciones).
import { Injectable } from "@nestjs/common"
import { attachProblem, type ThreadPatch } from "@mirai/ai/server/chat-actions"
import type { ChatTurnInput } from "@mirai/ai/server/chat-turn"
import { registraAlgo } from "@mirai/ai/chat/permisos"
import { TIPO_INFO } from "@mirai/ai/chat/propuestas"
import type { ChatEvent } from "@mirai/contracts/chat-types"
import type { FileRef } from "@mirai/contracts/modules/chat"
import { isLiveTable } from "@mirai/contracts/live"
import { EventsService } from "../../core/events/events.service"
import { DomainError } from "../../core/errors/domain-error"
import { RateLimitStore } from "../../core/rate-limit/rate-limit.store"
import { limitMsg } from "../../core/rate-limit/window"
import { LIMITS } from "@mirai/contracts/limits"
import { AiContext } from "../ai/ai-context"
import { ai, aiError, unwrap } from "../ai/ai-errors"
import { AiFiles } from "../ai/ai-files"
import { ChatPort } from "./chat.port"

const NO_THREAD = "No encontramos la conversación."

@Injectable()
export class ChatService {
  constructor(
    private readonly port: ChatPort,
    private readonly who: AiContext,
    private readonly files: AiFiles,
    private readonly events: EventsService,
    private readonly limits: RateLimitStore,
  ) {}

  /** Un turno en streaming (nunca lanza: los errores salen como evento). */
  turn(body: ChatTurnInput, emit: (e: ChatEvent) => void, signal: AbortSignal) {
    return this.port.turn(this.who.get(), this.who.scope, body, emit, signal)
  }

  async hints() {
    return ai(async () => this.port.hints(await this.who.withNames(), this.who.scope))
  }

  async threads(q: { archivados?: "0" | "1"; limit?: number }) {
    const items = await ai(() => this.port.threads(this.who.get(), this.who.scope, { archivados: q.archivados === undefined ? undefined : q.archivados === "1", limit: q.limit }))
    return { items }
  }

  async messages(threadId: string) {
    const items = await ai(() => this.port.messages(this.who.scope, threadId))
    if (!items) throw DomainError.notFound(NO_THREAD)
    return { items }
  }

  private async found(f: () => Promise<boolean>, id: string) {
    if (!(await ai(f))) throw DomainError.notFound(NO_THREAD)
    return { id }
  }
  patchThread(threadId: string, p: ThreadPatch) {
    return this.found(() => this.port.patchThread(this.who.scope, threadId, p), threadId)
  }
  deleteThread(threadId: string) {
    return this.found(() => this.port.deleteThread(this.who.scope, threadId), threadId)
  }
  restoreThread(threadId: string) {
    return this.found(() => this.port.restoreThread(this.who.scope, threadId), threadId)
  }

  async duplicate(threadId: string) {
    return unwrap(await ai(() => this.port.duplicate(this.who.get(), this.who.scope, threadId)))
  }

  async title(threadId: string) {
    return unwrap(await ai(() => this.port.title(this.who.get(), this.who.scope, threadId)))
  }

  info(threadId: string) {
    return ai(() => this.port.info(this.who.scope, threadId))
  }

  async confirm(messageId: string, propId: string) {
    const ctx = this.who.get()
    const data = unwrap(await ai(() => this.port.confirm(ctx, this.who.scope, messageId, propId)))
    const tablas = (TIPO_INFO[data.propuesta.tipo]?.tablas ?? []).filter(isLiveTable)
    if (tablas.length) this.events.changed(ctx.book.id, tablas, data.propuesta.registroId, "INSERT")
    return data
  }

  async cancel(messageId: string, propId: string) {
    const r = await ai(() => this.port.cancel(this.who.scope, messageId, propId))
    if (!r.ok || !r.propuesta) throw DomainError.conflict("Esta propuesta ya no está pendiente o no existe. Pídela de nuevo en el chat.")
    return { propuesta: r.propuesta }
  }

  /**
   * Adjunto: mismas validaciones y orden que la web (rol → archivo → límite `chatAdjunto` por persona) y luego el motor.
   * El límite va aquí y no en el decorador para no gastar intentos en archivos que ni se aceptan.
   */
  async attach(input: { file: FileRef; text?: string; threadId?: string | null }) {
    const ctx = this.who.get()
    if (!registraAlgo(ctx.household.access)) throw aiError(attachProblem(ctx, null)!)
    const f = await this.files.read(this.who.scope, ctx.book.id, input.file)
    const bad = attachProblem(ctx, f)
    if (bad) throw aiError(bad)
    const { max, windowS } = LIMITS.chatAdjunto
    const hit = await this.limits.hit(`chatAdjunto:${ctx.user.id}`, max, windowS)
    if (!hit.ok) throw DomainError.rateLimited(limitMsg(hit.resetMs, "Enviaste muchos archivos seguidos"), hit.resetMs / 1000)
    return unwrap(await ai(() => this.port.attach(ctx, this.who.scope, { file: f, text: input.text, threadId: input.threadId ?? null })))
  }
}
