// Adaptador de ExpenseClassifier (puerto de F2-D en modules/expenses): la misma clasificación de la web (reglas primero
// y la IA para los dudosos: classifyWith de @mirai/ai, el motor de classifyExpenses y del chat) con el JWT de la persona.
// null si no hay libro en la petición, la IA está apagada o el plan no la incluye: quien llama se queda con las reglas.
import { Injectable } from "@nestjs/common"
import { classifyWith } from "@mirai/ai/server/classify"
import { RequestContextService } from "../../../core/context/request-context.service"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { ExpenseClassifier, type ClassifyContext, type ClassifyItem, type ClassifyResult } from "../../expenses/expense-classifier"

@Injectable()
export class AiExpenseClassifier extends ExpenseClassifier {
  constructor(
    private readonly sb: SupabaseJsFactory,
    private readonly ctx: RequestContextService,
  ) {
    super()
  }

  async classify(items: ClassifyItem[], c: ClassifyContext): Promise<ClassifyResult[] | null> {
    const req = this.ctx.peek()
    const b = req?.bookAccess
    if (!req?.user || !b || b.book.id !== c.bookId) return null
    const r = await classifyWith(this.sb.for(this.ctx.db), { householdId: b.household.id, bookId: b.book.id, userId: req.user.id }, items).catch(() => null)
    return r ? r.out.map(({ i, category_id, hormiga, razon }) => ({ i, category_id, hormiga, razon })) : null
  }
}
