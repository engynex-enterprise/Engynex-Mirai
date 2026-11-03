// Portal del contador (F2-I-4): solo lectura de la Declaración + notas + documentos visibles. Mismas reglas que
// contadorOpen / contadorNotes / contadorNote / contadorFileUrl de apps/web/features/contador/actions.ts.
import { Injectable } from "@nestjs/common"
import type { PortalOpen } from "@mirai/contracts/modules/tax"
import { DomainError } from "../../core/errors/domain-error"
import { Limiter } from "../households/limiter"
import { PORTAL_GONE, PORTAL_SCOPE, type PortalAccess } from "./accountant-token.guard"
import { AccountantRepo } from "./accountant.repository"

@Injectable()
export class AccountantService {
  constructor(
    private readonly repo: AccountantRepo,
    private readonly limiter: Limiter,
  ) {}

  /** Con el plan al día; si el hogar bajó a un plan sin «impuestos», las notas y los archivos dejan de abrir. */
  private live(a: PortalAccess) {
    if (!a.planOk) throw DomainError.notFound(PORTAL_GONE)
    return a
  }

  /** Abre el portal: suma una vista y devuelve la Declaración (con permiso "renta", gastos desde el año anterior). */
  async open(a: PortalAccess, now = new Date()): Promise<PortalOpen> {
    if (!a.planOk) return { bloqueado: "plan" }
    await this.repo.countView(PORTAL_SCOPE, { id: a.share.id, views: a.views })
    const data = await this.repo.renta(PORTAL_SCOPE, a.share.book_id, a.createdBy)
    if (a.share.perms !== "todo") data.book.expenses = data.book.expenses.filter((g) => g.fecha >= `${now.getFullYear() - 1}-01-01`)
    return { share: a.share, data }
  }

  notes(a: PortalAccess) {
    return this.repo.notes(PORTAL_SCOPE, this.live(a).share.id)
  }

  async addNote(a: PortalAccess, texto: string) {
    const s = this.live(a).share
    const t = String(texto ?? "").trim().slice(0, 2000)
    if (!t) return { saved: false }
    await this.limiter.hit("portalContador", `nota:${s.id}`, "Escribiste muchas notas seguidas")
    await this.repo.addNote(PORTAL_SCOPE, { book_id: s.book_id, share_id: s.id, texto: t })
    return { saved: true }
  }

  /** URL firmada de 5 minutos, solo de un documento de ese libro marcado como visible para el contador. */
  async fileUrl(a: PortalAccess, path: string): Promise<{ url: string | null }> {
    const s = this.live(a).share
    if (typeof path !== "string" || !path.startsWith(`${s.book_id}/`) || path.includes("..")) return { url: null }
    if (!(await this.repo.visibleAttachment(PORTAL_SCOPE, s.book_id, path))) return { url: null }
    return { url: await this.repo.signedUrl(PORTAL_SCOPE, path, 300) }
  }
}
