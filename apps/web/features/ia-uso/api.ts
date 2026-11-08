// Uso de IA del hogar por la API: GET /v1/books/:b/ai/usage (Ajustes › Uso de IA).
import type { MyAiUsage } from "@mirai/ai/server/usage-report"
import { activeBookId } from "@/lib/api/session"

export type { MyAiUsage } from "@mirai/ai/server/usage-report"

/** Cupo del mes, costo, ahorro, serie por día, por función y últimas solicitudes. */
export async function myAiUsage(): Promise<MyAiUsage> {
  const { browserApi, unwrap } = await import("@/lib/api/client")
  return unwrap(await browserApi().ai.usage({ params: { bookId: activeBookId() } })) as unknown as MyAiUsage
}
