import { Injectable } from "@nestjs/common"
import type { AppContext } from "@mirai/domain/app-context"
import { AppContextService } from "../../core/context/app-context.service"
import { RequestContextService } from "../../core/context/request-context.service"

/** GET /v1/me: el mismo AppContext que getAppContext (apps/web/lib/dal.ts), con el libro pedido en `?bookId=`. */
@Injectable()
export class MeService {
  constructor(
    private readonly contexts: AppContextService,
    private readonly ctx: RequestContextService,
  ) {}

  get(bookId?: string): Promise<AppContext> {
    return this.contexts.me(this.ctx.user, bookId)
  }
}
