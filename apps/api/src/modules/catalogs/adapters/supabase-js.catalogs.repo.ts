// Adaptador de hoy (PostgREST con el JWT de la persona). Misma consulta que useCategories() de apps/web
// (features/catalogs/hooks.ts → useList("categories", { order: { column: "sort" } })).
import { Injectable } from "@nestjs/common"
import type { CategoryRow } from "@mirai/contracts/modules/catalogs"
import type { DbScope } from "../../../core/db/scope"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { DomainError } from "../../../core/errors/domain-error"
import { CatalogsRepo, type ListCategories } from "../catalogs.repository"

@Injectable()
export class SupabaseJsCatalogsRepo extends CatalogsRepo {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  async listCategories(scope: DbScope, { bookId, grupo }: ListCategories): Promise<CategoryRow[]> {
    let q = this.sb.for(scope).from("categories").select("*").eq("book_id", bookId).is("deleted_at", null)
    if (grupo) q = q.eq("grupo", grupo)
    const { data, error } = await q.order("sort", { ascending: true })
    if (error) throw DomainError.fromPg(error)
    return data ?? []
  }
}
