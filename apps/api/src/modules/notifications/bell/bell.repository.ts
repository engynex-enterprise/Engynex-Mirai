// Puerto de la campana (F2-C-5). Mismas consultas que apps/web/components/app/notifications-sheet.tsx. Siempre con el
// JWT de la persona y filtrando por su user_id (la RLS de notifications también lo exige).
import type { NotificationRow } from "@mirai/contracts/modules/notifications-bell"
import type { DbScope } from "../../../core/db/scope"

export type BellList = { userId: string; bookId?: string; sinLeer: boolean; limit: number }

export abstract class BellRepo {
  abstract list(scope: DbScope, q: BellList): Promise<NotificationRow[]>
  /** Marca un aviso de la persona; null si no existe o no es suyo. */
  abstract markRead(scope: DbScope, q: { userId: string; id: string; at: string }): Promise<{ id: string; read_at: string } | null>
  /** Marca todos los avisos sin leer de la persona; devuelve cuántos. */
  abstract markAll(scope: DbScope, q: { userId: string; at: string }): Promise<number>
}
