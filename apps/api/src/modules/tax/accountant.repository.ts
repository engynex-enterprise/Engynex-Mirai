// Puerto del portal del contador (F2-I-4). TODO con SystemScope: el contador no tiene sesión; el token (su hash)
// es la credencial y AccountantTokenGuard ya lo revisó. Mismas consultas que features/contador/actions.ts y
// features/renta/data.ts (loadRentaData con `contador: true`) de apps/web.
import type { PlanRow } from "@mirai/domain/app-context"
import type { RentaData } from "@mirai/domain/integral-extras"
import type { DbScope } from "../../core/db/scope"

export type ShareRow = { id: string; book_id: string; label: string; perms: string; expires_at: string | null; revoked_at: string | null; created_by: string | null; views: number }

export abstract class AccountantRepo {
  abstract shareByHash(scope: DbScope, tokenHash: string): Promise<ShareRow | null>
  abstract ownerName(scope: DbScope, userId: string): Promise<string | null>
  /** Plan del hogar dueño del libro (null si el libro no existe). */
  abstract bookPlan(scope: DbScope, bookId: string): Promise<{ plan: PlanRow } | null>
  abstract countView(scope: DbScope, share: Pick<ShareRow, "id" | "views">): Promise<void>
  /** Datos de la Declaración del libro, solo con los documentos marcados como visibles para el contador. */
  abstract renta(scope: DbScope, bookId: string, ownerId: string | null): Promise<RentaData>
  abstract notes(scope: DbScope, shareId: string): Promise<{ id: string; autor: string; texto: string; created_at: string }[]>
  abstract addNote(scope: DbScope, n: { book_id: string; share_id: string; texto: string }): Promise<void>
  abstract visibleAttachment(scope: DbScope, bookId: string, path: string): Promise<boolean>
  abstract signedUrl(scope: DbScope, path: string, seconds: number): Promise<string | null>
}
