// Controller de gastos (§2.1): valida con el contrato y llama UN método del servicio. Los comandos aceptan
// Idempotency-Key (repetir la petición devuelve la misma respuesta sin volver a escribir).
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { expensesContract as c } from "@mirai/contracts/modules/expenses"
import { MinRole } from "../../core/context/decorators"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { ok } from "../book-tables/http"
import { ExpensesService } from "./expenses.service"

@Controller()
export class ExpensesController {
  constructor(private readonly svc: ExpensesService) {}

  @TsRestHandler(c.save)
  @MinRole("registra")
  @Idempotent()
  save() {
    return tsRestHandler(c.save, async ({ body }) => ok(await this.svc.save(body)))
  }

  @TsRestHandler(c.linkFixed)
  @MinRole("editor")
  @Idempotent()
  linkFixed() {
    return tsRestHandler(c.linkFixed, async ({ params, body }) => ok(await this.svc.linkFixed(params.id, body)))
  }

  @TsRestHandler(c.unlinkFixed)
  @MinRole("editor")
  @Idempotent()
  unlinkFixed() {
    return tsRestHandler(c.unlinkFixed, async ({ params }) => ok(await this.svc.unlinkFixed(params.id)))
  }

  @TsRestHandler(c.useFund)
  @MinRole("editor")
  @Idempotent()
  useFund() {
    return tsRestHandler(c.useFund, async ({ params, body }) => ok(await this.svc.useFund(params.id, body.valor)))
  }
}
