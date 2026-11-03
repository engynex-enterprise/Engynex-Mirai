// Adaptador de hoy (PostgREST con el JWT de la persona), como useNotifications / markOne / markAll de la web.
import { Injectable } from "@nestjs/common"
import type { NotificationRow } from "@mirai/contracts/modules/notifications-bell"
import type { DbScope } from "../../../../core/db/scope"
import { SupabaseJsFactory } from "../../../../core/db/supabase-js.factory"
import { DomainError } from "../../../../core/errors/domain-error"
import { BellRepo, type BellList } from "../bell.repository"

@Injectable()
export class SupabaseJsBellRepo extends BellRepo {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  async list(scope: DbScope, q: BellList): Promise<NotificationRow[]> {
    let b = this.sb.for(scope).from("notifications").select("*").eq("user_id", q.userId)
    // bookId ya viene validado como UUID por el contrato (no puede inyectar nada en el filtro `or`).
    if (q.bookId) b = b.or(`book_id.eq.${q.bookId},book_id.is.null`)
    if (q.sinLeer) b = b.is("read_at", null)
    const { data, error } = await b.order("created_at", { ascending: false }).limit(q.limit)
    if (error) throw DomainError.fromPg(error)
    return data ?? []
  }

  async markRead(scope: DbScope, q: { userId: string; id: string; at: string }) {
    const { data, error } = await this.sb.for(scope).from("notifications").update({ read_at: q.at }).eq("id", q.id).eq("user_id", q.userId).select("id,read_at")
    if (error) throw DomainError.fromPg(error)
    const r = data?.[0]
    return r ? { id: r.id, read_at: r.read_at ?? q.at } : null
  }

  async markAll(scope: DbScope, q: { userId: string; at: string }) {
    const { data, error } = await this.sb.for(scope).from("notifications").update({ read_at: q.at }).eq("user_id", q.userId).is("read_at", null).select("id")
    if (error) throw DomainError.fromPg(error)
    return data?.length ?? 0
  }
}
