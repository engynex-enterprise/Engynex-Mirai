// Quién llama a @mirai/ai desde la API: el libro, el hogar, el rol fino y el plan que dejó BookGuard, y la persona del
// token (lo mismo que la web toma de getAppContext). El nombre solo hace falta para las sugerencias del chat.
import { Injectable } from "@nestjs/common"
import type { AiCtx } from "@mirai/ai/server/ctx"
import { AppContextService } from "../../core/context/app-context.service"
import { RequestContextService } from "../../core/context/request-context.service"
import type { UserScope } from "../../core/db/scope"

@Injectable()
export class AiContext {
  constructor(
    private readonly ctx: RequestContextService,
    private readonly contexts: AppContextService,
  ) {}

  get(): AiCtx {
    const b = this.ctx.book
    return { user: { id: this.ctx.user.id }, household: { id: b.household.id, access: b.access }, book: { id: b.book.id }, plan: b.plan }
  }

  /** Con nombre y apodo (caché de 30 s de AppContextService). Si falla, sin nombre: el saludo queda genérico. */
  async withNames(): Promise<AiCtx> {
    const c = this.get()
    const me = await this.contexts.me(this.ctx.user, c.book.id).catch(() => null)
    return me ? { ...c, user: { id: c.user.id, nombre: me.user.nombre, apodo: me.user.apodo } } : c
  }

  /** Alcance de la persona (RLS). */
  get scope(): UserScope {
    return this.ctx.db
  }

  get userId() {
    return this.ctx.user.id
  }
}
