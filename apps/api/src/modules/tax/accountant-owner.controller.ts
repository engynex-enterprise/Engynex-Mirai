// /v1/books/:bookId/accountant/** (V7-G): lado del titular. BookGuard revisa que la persona sea del hogar del libro y
// aplica el rol y el plan de cada ruta; la RLS vuelve a revisar. Mismos permisos que la web (requireRole + requirePremium).
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { accountantOwnerContract as c } from "@mirai/contracts/modules/tax"
import { MinRole, Premium } from "../../core/context/decorators"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { RateLimit } from "../../core/rate-limit/rate-limit.guard"
import { ok } from "../book-tables/http"
import { AccountantOwnerService } from "./accountant-owner.service"

@Controller()
export class AccountantOwnerController {
  constructor(private readonly svc: AccountantOwnerService) {}

  @TsRestHandler(c.shares)
  @MinRole("viewer")
  shares() {
    return tsRestHandler(c.shares, async () => ({ status: 200, body: await this.svc.shares() }))
  }

  @TsRestHandler(c.createShare)
  @MinRole("admin")
  @Premium("impuestos")
  @RateLimit("contador", "user", "Creaste muchos accesos hoy")
  @Idempotent()
  createShare() {
    return tsRestHandler(c.createShare, async ({ body }) => ok(await this.svc.create(body)))
  }

  @TsRestHandler(c.rotateShare)
  @MinRole("admin")
  @Premium("impuestos")
  rotateShare() {
    return tsRestHandler(c.rotateShare, async ({ params }) => ok(await this.svc.rotate(params.shareId)))
  }

  /** Quitar el acceso no exige el plan: si el hogar bajó de plan, igual se puede cerrar. */
  @TsRestHandler(c.revokeShare)
  @MinRole("admin")
  revokeShare() {
    return tsRestHandler(c.revokeShare, async ({ params }) => ok(await this.svc.revoke(params.shareId)))
  }

  @TsRestHandler(c.notes)
  @MinRole("viewer")
  notes() {
    return tsRestHandler(c.notes, async () => ({ status: 200, body: await this.svc.notes() }))
  }

  @TsRestHandler(c.addNote)
  @MinRole("editor")
  @Premium("impuestos")
  @Idempotent()
  addNote() {
    return tsRestHandler(c.addNote, async ({ body }) => ok(await this.svc.addNote(body.shareId, body.texto)))
  }

  @TsRestHandler(c.files)
  @MinRole("viewer")
  files() {
    return tsRestHandler(c.files, async ({ query }) => ({ status: 200, body: await this.svc.files(query.todos === "1") }))
  }

  /** V7-H2: datos de la Declaración (cualquier integrante; sin exigir el plan: el Calendario fiscal la usa para estimar). */
  @TsRestHandler(c.renta)
  @MinRole("viewer")
  renta() {
    return tsRestHandler(c.renta, async () => ({ status: 200, body: await this.svc.renta() }))
  }

  @TsRestHandler(c.setFileVisible)
  @MinRole("admin")
  @Premium("impuestos")
  setFileVisible() {
    return tsRestHandler(c.setFileVisible, async ({ params, body }) => ok(await this.svc.setFileVisible(params.attachmentId, body.visible)))
  }
}
