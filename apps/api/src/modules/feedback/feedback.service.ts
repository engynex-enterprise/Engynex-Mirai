// Opiniones y casos de soporte de la persona (V7-G), como feedback-dialog.tsx / opiniones-view.tsx / extras.tsx de la
// web: todo con la sesión de la persona (UserScope): la RLS «enviar opinion» vuelve a exigir que sea suya, en estado
// «nuevo» y de un hogar al que pertenece; «borrar opinion» solo deja borrar las que siguen en «nuevo».
import { Injectable } from "@nestjs/common"
import type { FeedbackRow, NewFeedback } from "@mirai/contracts/modules/feedback"
import { AppContextService } from "../../core/context/app-context.service"
import { RequestContextService } from "../../core/context/request-context.service"
import { DomainError } from "../../core/errors/domain-error"
import { RowStore } from "../../core/store/row-store"

type Input = { tipo: NewFeedback["tipo"]; rating?: number | null; mensaje: string; captura?: string | null; householdId?: string | null; pagina?: string | null; contexto?: Record<string, unknown> }

export const NOT_YOUR_HOUSEHOLD = "No encontramos ese hogar."
export const BAD_CAPTURE = "La captura no es tuya. Vuelve a adjuntarla."
export const FEEDBACK_NOT_FOUND = "No encontramos esa opinión."
export const ALREADY_REVIEWED = "Ya revisamos esta opinión y no se puede borrar."

@Injectable()
export class FeedbackService {
  constructor(
    private readonly rows: RowStore,
    private readonly ctx: RequestContextService,
    private readonly contexts: AppContextService,
  ) {}

  async send(f: Input): Promise<{ id: string }> {
    const user = this.ctx.user
    if (f.captura && !f.captura.startsWith(`${user.id}/`)) throw DomainError.validation(BAD_CAPTURE, { field: "captura" })
    if (f.householdId) {
      const raw = await this.contexts.raw(user)
      if (!raw.households.some((h) => h.id === f.householdId)) throw DomainError.notFound(NOT_YOUR_HOUSEHOLD)
    }
    const [row] = await this.rows.insert<{ id: string }>(this.ctx.db, "feedback", [
      {
        user_id: user.id,
        tipo: f.tipo,
        rating: f.tipo === "calificacion" ? (f.rating ?? null) : null,
        mensaje: f.mensaje.trim(),
        captura: f.captura ?? null,
        household_id: f.householdId ?? null,
        pagina: f.pagina ?? null,
        contexto: f.contexto ?? {},
      },
    ])
    return { id: row.id }
  }

  rating(r: { rating: number; mensaje: string; householdId?: string | null; pagina?: string | null; contexto?: Record<string, unknown> }) {
    return this.send({ ...r, tipo: "calificacion" })
  }

  mine(): Promise<FeedbackRow[]> {
    return this.rows.select<FeedbackRow>(this.ctx.db, "feedback", { eq: { user_id: this.ctx.user.id }, order: [{ column: "created_at", ascending: false }], limit: 500 })
  }

  async remove(id: string): Promise<{ id: string }> {
    const db = this.ctx.db
    const row = await this.rows.first<{ id: string; estado: string }>(db, "feedback", { columns: ["id", "estado"], eq: { id, user_id: this.ctx.user.id } })
    if (!row) throw DomainError.notFound(FEEDBACK_NOT_FOUND)
    if (row.estado !== "nuevo") throw DomainError.conflict(ALREADY_REVIEWED)
    const n = await this.rows.delete(db, "feedback", { eq: { id, user_id: this.ctx.user.id, estado: "nuevo" } })
    if (!n) throw DomainError.conflict(ALREADY_REVIEWED)
    return { id }
  }
}
