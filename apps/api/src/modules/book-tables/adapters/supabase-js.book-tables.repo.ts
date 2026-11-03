// Adaptador de hoy (PostgREST con el JWT de la persona). Mismas consultas que useList (apps/web/hooks/use-book-data.ts)
// y loadBookPart (apps/web/lib/book-data.ts).
import { Injectable } from "@nestjs/common"
import type { BookRow } from "@mirai/contracts/modules/book-tables"
import { BOOK_PARTS, SINGLE_ROW_PARTS, type BookPart, type PartRows } from "@mirai/domain/book-data"
import type { DbScope } from "../../../core/db/scope"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { DomainError } from "../../../core/errors/domain-error"
import { BookTablesRepo, type ListRows } from "../book-tables.repository"

@Injectable()
export class SupabaseJsBookTablesRepo extends BookTablesRepo {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  async list(scope: DbScope, q: ListRows): Promise<BookRow[]> {
    let b = this.sb.for(scope).from(q.table as never).select(q.select === "*" ? "*" : q.select.join(",")).eq("book_id" as never, q.bookId as never).is("deleted_at" as never, null)
    for (const [k, v] of q.eq) b = v === null ? b.is(k as never, null) : b.eq(k as never, v as never)
    if (q.order) b = b.order(q.order.column as never, { ascending: q.order.ascending })
    const { data, error } = await b
    if (error) throw DomainError.fromPg(error)
    return (data ?? []) as unknown as BookRow[]
  }

  async part(scope: DbScope, bookId: string, part: BookPart): Promise<PartRows> {
    let b = this.sb.for(scope).from(part as never).select(BOOK_PARTS[part].select).eq("book_id" as never, bookId as never)
    if (!SINGLE_ROW_PARTS.includes(part)) b = b.is("deleted_at" as never, null)
    const { data, error } = await b
    if (error) throw DomainError.fromPg(error)
    return (data ?? []) as PartRows
  }
}
