// Datos de referencia (GET /v1/refs/*): con sesión (como hoy) y caché HTTP, porque cambian poco y son públicos.
import { Controller, Header } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { REFS_CACHE, refsContract as c } from "@mirai/contracts/modules/refs"
import { RefsService } from "./refs.service"

@Controller()
export class RefsController {
  constructor(private readonly svc: RefsService) {}

  @TsRestHandler(c.uvt)
  @Header("cache-control", REFS_CACHE)
  uvt() {
    return tsRestHandler(c.uvt, async () => ({ status: 200, body: await this.svc.uvt() }))
  }

  @TsRestHandler(c.smmlv)
  @Header("cache-control", REFS_CACHE)
  smmlv() {
    return tsRestHandler(c.smmlv, async () => ({ status: 200, body: await this.svc.smmlv() }))
  }

  @TsRestHandler(c.trm)
  @Header("cache-control", REFS_CACHE)
  trm() {
    return tsRestHandler(c.trm, async ({ query }) => ({ status: 200, body: await this.svc.trm(query.limit) }))
  }

  @TsRestHandler(c.usura)
  @Header("cache-control", REFS_CACHE)
  usura() {
    return tsRestHandler(c.usura, async ({ query }) => ({ status: 200, body: await this.svc.usura(query.limit) }))
  }

  @TsRestHandler(c.festivos)
  @Header("cache-control", REFS_CACHE)
  festivos() {
    return tsRestHandler(c.festivos, async ({ query }) => ({ status: 200, body: await this.svc.festivos(query) }))
  }

  @TsRestHandler(c.rentaCalendar)
  @Header("cache-control", REFS_CACHE)
  rentaCalendar() {
    return tsRestHandler(c.rentaCalendar, async ({ query }) => ({ status: 200, body: await this.svc.rentaCalendar(query) }))
  }

  @TsRestHandler(c.rentaRegimenes)
  @Header("cache-control", REFS_CACHE)
  rentaRegimenes() {
    return tsRestHandler(c.rentaRegimenes, async () => ({ status: 200, body: await this.svc.rentaRegimenes() }))
  }
}
