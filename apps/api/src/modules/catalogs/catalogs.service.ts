// Casos de uso de catalogs (§2.1). No conoce Supabase: usa el puerto CatalogsRepo con el alcance de la persona.
// El libro ya lo revisó BookGuard (miembro del hogar + @MinRole del controller).
import { Injectable } from "@nestjs/common"
import type { CategoryRow } from "@mirai/contracts/modules/catalogs"
import { RequestContextService } from "../../core/context/request-context.service"
import { CatalogsRepo } from "./catalogs.repository"

@Injectable()
export class CatalogsService {
  constructor(
    private readonly repo: CatalogsRepo,
    private readonly ctx: RequestContextService,
  ) {}

  listCategories(q: { grupo?: string }): Promise<CategoryRow[]> {
    return this.repo.listCategories(this.ctx.db, { bookId: this.ctx.book.book.id, grupo: q.grupo })
  }
}
