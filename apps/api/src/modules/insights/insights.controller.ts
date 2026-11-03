// Controller de las vistas (§2.1): valida con el contrato, rol mínimo "Solo mira" (leer el libro) y un método del servicio.
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { insightsContract as c } from "@mirai/contracts/modules/insights"
import { MinRole } from "../../core/context/decorators"
import { InsightsService } from "./insights.service"

@Controller()
@MinRole("viewer")
export class InsightsController {
  constructor(private readonly svc: InsightsService) {}

  @TsRestHandler(c.flujoIntegral)
  flujoIntegral() {
    return tsRestHandler(c.flujoIntegral, async ({ query }) => ({ status: 200, body: await this.svc.flujoIntegral(query) }))
  }

  @TsRestHandler(c.estadoIntegral)
  estadoIntegral() {
    return tsRestHandler(c.estadoIntegral, async ({ query }) => ({ status: 200, body: await this.svc.estadoIntegral(query.hoy) }))
  }

  @TsRestHandler(c.inicio)
  inicio() {
    return tsRestHandler(c.inicio, async ({ query }) => ({ status: 200, body: await this.svc.inicio(query.hoy) }))
  }

  @TsRestHandler(c.balance)
  balance() {
    return tsRestHandler(c.balance, async ({ query }) => ({ status: 200, body: await this.svc.balance(query) }))
  }

  @TsRestHandler(c.dashboard)
  dashboard() {
    return tsRestHandler(c.dashboard, async ({ query }) => ({ status: 200, body: await this.svc.dashboard(query) }))
  }

  @TsRestHandler(c.proyeccion)
  proyeccion() {
    return tsRestHandler(c.proyeccion, async ({ query }) => ({ status: 200, body: await this.svc.proyeccion(query) }))
  }

  @TsRestHandler(c.indicadores)
  indicadores() {
    return tsRestHandler(c.indicadores, async ({ query }) => ({ status: 200, body: await this.svc.indicadores(query.hoy) }))
  }

  @TsRestHandler(c.agenda)
  agenda() {
    return tsRestHandler(c.agenda, async ({ query }) => ({ status: 200, body: await this.svc.agenda(query.hoy) }))
  }

  @TsRestHandler(c.hallazgos)
  hallazgos() {
    return tsRestHandler(c.hallazgos, async ({ query }) => ({ status: 200, body: await this.svc.hallazgos(query.hoy) }))
  }

  @TsRestHandler(c.report)
  report() {
    return tsRestHandler(c.report, async ({ params, query }) => ({ status: 200, body: await this.svc.report(params.mes, query.hoy) }))
  }
}
