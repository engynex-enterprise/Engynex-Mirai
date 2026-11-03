// Rutas de prueba para ejercitar las guardas y el interceptor de punta a punta (no existen en la app real).
import { Body, Controller, Get, Module, Param, Post } from "@nestjs/common"
import { Can, MinRole, PlatformAdmin, Premium } from "../../src/core/context/decorators"
import { RequestContextService } from "../../src/core/context/request-context.service"
import { DomainError } from "../../src/core/errors/domain-error"
import { Idempotent } from "../../src/core/idempotency/idempotency.interceptor"
import { RateLimit } from "../../src/core/rate-limit/rate-limit.guard"

export const probeState = { runs: 0 }

@Controller("v1/test")
class ProbeController {
  constructor(private readonly ctx: RequestContextService) {}

  @Get("books/:bookId/editor")
  @MinRole("editor")
  editor(@Param("bookId") bookId: string) {
    return { ok: true, bookId, access: this.ctx.book.access, household: this.ctx.book.household.id }
  }

  @Get("books/:bookId/ajustes")
  @Can("ajustes")
  ajustes() {
    return { ok: true }
  }

  @Get("books/:bookId/ia")
  @Premium("ia")
  ia() {
    return { ok: true, plan: this.ctx.book.plan.id }
  }

  @Post("books/:bookId/invitar")
  @MinRole("admin")
  @RateLimit("invitarMin", "user", "Hiciste muchas invitaciones seguidas")
  invitar() {
    return { ok: true }
  }

  @Post("books/:bookId/pagar")
  @MinRole("editor")
  @Idempotent()
  pagar(@Body() body: { valor: number }) {
    probeState.runs++
    if (body?.valor === 13) throw DomainError.validation("Ese pago no se puede hacer.")
    return { ok: true, data: { run: probeState.runs, valor: body?.valor } }
  }

  @Post("books/:bookId/checkout")
  @Idempotent({ required: true })
  checkout() {
    return { ok: true }
  }

  @Get("boom")
  boom() {
    throw new Error("boom: detalle interno secreto")
  }

  @Get("sin-libro")
  @MinRole("editor")
  sinLibro() {
    return { ok: true }
  }

  @Get("admin")
  @PlatformAdmin()
  admin() {
    return { ok: true }
  }
}

@Module({ controllers: [ProbeController] })
export class ProbeModule {}
