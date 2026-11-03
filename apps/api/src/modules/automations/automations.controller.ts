// Controller de automatizaciones (V7-G, E10): valida con el contrato, declara el rol y llama UN método del servicio.
// Roles = RLS de `automations` (leer: cualquier miembro; crear, editar y borrar: «Edita»). Probar y procesar la cola:
// cualquier miembro (como testAutomation / runPendingAutomations de la web), con el límite `automatizaciones`.
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { automationsContract as c } from "@mirai/contracts/modules/automations"
import { MinRole } from "../../core/context/decorators"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { RateLimit } from "../../core/rate-limit/rate-limit.guard"
import { ok } from "../book-tables/http"
import { AutomationsService } from "./automations.service"

@Controller()
export class AutomationsController {
  constructor(private readonly svc: AutomationsService) {}

  @TsRestHandler(c.list)
  @MinRole("viewer")
  list() {
    return tsRestHandler(c.list, async () => ({ status: 200, body: await this.svc.list() }))
  }

  @TsRestHandler(c.get)
  @MinRole("viewer")
  get() {
    return tsRestHandler(c.get, async ({ params }) => ({ status: 200, body: await this.svc.get(params.id) }))
  }

  @TsRestHandler(c.put)
  @MinRole("editor")
  @Idempotent()
  put() {
    return tsRestHandler(c.put, async ({ params, body }) => ok(await this.svc.put(params.id, body)))
  }

  @TsRestHandler(c.remove)
  @MinRole("editor")
  @Idempotent()
  remove() {
    return tsRestHandler(c.remove, async ({ params }) => ok(await this.svc.remove(params.id)))
  }

  @TsRestHandler(c.restore)
  @MinRole("editor")
  @Idempotent()
  restore() {
    return tsRestHandler(c.restore, async ({ params }) => ok(await this.svc.restore(params.id)))
  }

  @TsRestHandler(c.test)
  @MinRole("viewer")
  @RateLimit("automatizaciones", "user", "Probaste muchas veces seguidas")
  test() {
    return tsRestHandler(c.test, async ({ params, body }) => ok(await this.svc.test(params.id, body)))
  }

  @TsRestHandler(c.defaults)
  @MinRole("viewer")
  @Idempotent()
  defaults() {
    return tsRestHandler(c.defaults, async () => ok(await this.svc.defaults()))
  }

  @TsRestHandler(c.drain)
  @MinRole("viewer")
  @Idempotent()
  @RateLimit("automatizaciones", "user", "Pediste revisar las automatizaciones muchas veces seguidas")
  drain() {
    return tsRestHandler(c.drain, async () => ok(await this.svc.drain()))
  }

  @TsRestHandler(c.runs)
  @MinRole("viewer")
  runs() {
    return tsRestHandler(c.runs, async ({ query }) => ({ status: 200, body: await this.svc.runs(query) }))
  }
}
