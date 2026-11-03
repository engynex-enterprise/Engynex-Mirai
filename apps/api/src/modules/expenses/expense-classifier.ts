// Puerto de la IA para clasificar gastos (categoría y si es gasto hormiga). Equivale a classifyExpenses /
// classifyBatch de apps/web/features/ai/actions.ts. Lo conecta F2-F (módulo ai): mientras tanto la API usa
// NoExpenseClassifier y se queda con las reglas locales (regla → historial → palabras), igual que la web sin IA.
// F2-F: cambia el proveedor de ExpenseClassifier en expenses.module.ts por su adaptador (o `useExisting` desde AiModule).
import { Injectable } from "@nestjs/common"

export type ClassifyItem = { i: number; descripcion: string; valor: number; veces_mes: number }
export type ClassifyResult = { i: number; category_id: string | null; hormiga: boolean | null; razon: string }
export type ClassifyContext = { bookId: string; categories: { id: string; nombre: string; grupo?: string | null }[] }

export abstract class ExpenseClassifier {
  /** null si la IA no está disponible (sin proveedor, sin cupo o falló): quien llama usa las reglas locales. */
  abstract classify(items: ClassifyItem[], ctx: ClassifyContext): Promise<ClassifyResult[] | null>
}

@Injectable()
export class NoExpenseClassifier extends ExpenseClassifier {
  async classify(): Promise<ClassifyResult[] | null> {
    return null
  }
}
