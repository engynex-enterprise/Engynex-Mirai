// V7-G (E15): lo que features/chat/hooks.ts hacía directo a Supabase: calificar una respuesta, buscar en las
// conversaciones y contar los hilos (logros). Con la sesión de la persona: la RLS «chat propio» / «mensajes propios»
// solo deja ver y cambiar lo de sus conversaciones; el servicio además revisa que el mensaje sea del libro de la ruta.
import { Injectable } from "@nestjs/common"
import { RequestContextService } from "../../core/context/request-context.service"
import { DomainError } from "../../core/errors/domain-error"
import { RowStore } from "../../core/store/row-store"

export const MSG_NOT_FOUND = "No encontramos ese mensaje."
export const ONLY_ASSISTANT = "Solo puedes calificar las respuestas de Mirai."

@Injectable()
export class ChatExtrasService {
  constructor(
    private readonly rows: RowStore,
    private readonly ctx: RequestContextService,
  ) {}

  async rate(messageId: string, feedback: 1 | -1 | null): Promise<{ id: string; feedback: number | null }> {
    const db = this.ctx.db
    const bookId = this.ctx.book.book.id
    const m = await this.rows.first<{ id: string; thread_id: string; role: string }>(db, "chat_messages", { columns: ["id", "thread_id", "role"], eq: { id: messageId, book_id: bookId, deleted_at: null } })
    const mine = m && (await this.rows.first(db, "chat_threads", { columns: ["id"], eq: { id: m.thread_id, book_id: bookId, user_id: this.ctx.user.id } }))
    if (!m || !mine) throw DomainError.notFound(MSG_NOT_FOUND)
    if (m.role !== "assistant") throw DomainError.validation(ONLY_ASSISTANT)
    const [row] = await this.rows.update<{ id: string; feedback: number | null }>(db, "chat_messages", { eq: { id: messageId, book_id: bookId } }, { feedback })
    if (!row) throw DomainError.notFound(MSG_NOT_FOUND)
    return { id: row.id, feedback: row.feedback }
  }

  async search(q: string): Promise<{ threadIds: string[] }> {
    const db = this.ctx.db
    const bookId = this.ctx.book.book.id
    // Tus conversaciones vivas del libro (la RLS ya lo limita; aquí se repite para no depender solo de ella).
    const mine = await this.rows.select<{ id: string }>(db, "chat_threads", { columns: ["id"], eq: { book_id: bookId, user_id: this.ctx.user.id, deleted_at: null }, limit: 2000 })
    if (!mine.length) return { threadIds: [] }
    const found = await this.rows.select<{ thread_id: string }>(db, "chat_messages", {
      columns: ["thread_id"], eq: { book_id: bookId, deleted_at: null }, in: { thread_id: mine.map((t) => t.id) }, ilike: { content: q }, limit: 80,
    })
    return { threadIds: [...new Set(found.map((r) => r.thread_id))] }
  }

  async count(): Promise<{ total: number }> {
    return { total: await this.rows.count(this.ctx.db, "chat_threads", { eq: { book_id: this.ctx.book.book.id, user_id: this.ctx.user.id } }) }
  }
}
