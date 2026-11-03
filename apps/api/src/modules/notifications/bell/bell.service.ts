// Campana de avisos in-app (F2-C-5): los avisos son de la persona (no del libro), así que no pasan por BookGuard; se
// filtran siempre por su user_id y la RLS lo vuelve a exigir. No conoce Supabase.
import { Injectable } from "@nestjs/common"
import type { NotificationRow } from "@mirai/contracts/modules/notifications-bell"
import { RequestContextService } from "../../../core/context/request-context.service"
import { DomainError } from "../../../core/errors/domain-error"
import { BellRepo } from "./bell.repository"

export const NOTIF_NOT_FOUND = "No encontramos ese aviso."

@Injectable()
export class BellService {
  constructor(
    private readonly repo: BellRepo,
    private readonly ctx: RequestContextService,
  ) {}

  list(q: { bookId?: string; sinLeer?: "0" | "1"; limit?: number }): Promise<NotificationRow[]> {
    return this.repo.list(this.ctx.db, { userId: this.ctx.user.id, bookId: q.bookId, sinLeer: q.sinLeer === "1", limit: q.limit ?? 50 })
  }

  async read(id: string) {
    const r = await this.repo.markRead(this.ctx.db, { userId: this.ctx.user.id, id, at: new Date().toISOString() })
    if (!r) throw DomainError.notFound(NOTIF_NOT_FOUND)
    return r
  }

  async readAll() {
    return { marcadas: await this.repo.markAll(this.ctx.db, { userId: this.ctx.user.id, at: new Date().toISOString() }) }
  }
}
