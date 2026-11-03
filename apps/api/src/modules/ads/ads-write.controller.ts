// V7-G: eventos de anuncios (cualquier persona con sesión), AdSense público (sin sesión) y consola › Anuncios
// (@PlatformAdmin). Sin lógica: un método del servicio por ruta.
import { Controller, Get, Header } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { adsContract as c } from "@mirai/contracts/modules/ads"
import { Public } from "../../core/auth/decorators"
import { PlatformAdmin } from "../../core/context/decorators"
import { ok } from "../book-tables/http"
import { AdsWriteService } from "./ads-write.service"

@Controller()
export class AdsEventsController {
  constructor(private readonly svc: AdsWriteService) {}

  @TsRestHandler(c.track)
  track() {
    return tsRestHandler(c.track, async ({ body }) => ok(await this.svc.track(body)))
  }

  @Public()
  @TsRestHandler(c.adsense)
  adsense() {
    return tsRestHandler(c.adsense, async () => ({ status: 200, body: await this.svc.adsense() }))
  }

  /** ads.txt en texto plano (lo sirve la web en /ads.txt). */
  @Public()
  @Get(c.adsTxt.path)
  @Header("content-type", "text/plain; charset=utf-8")
  @Header("cache-control", "public, max-age=3600")
  async adsTxt() {
    return (await this.svc.adsense()).adsTxt || "# Sin anuncios configurados\n"
  }
}

@Controller()
@PlatformAdmin()
export class AdsAdminController {
  constructor(private readonly svc: AdsWriteService) {}

  @TsRestHandler(c.manager)
  manager() {
    return tsRestHandler(c.manager, async ({ query }) => ({ status: 200, body: await this.svc.manager(query.desde, query.hasta) }))
  }

  @TsRestHandler(c.createCampaign)
  createCampaign() {
    return tsRestHandler(c.createCampaign, async ({ body }) => ok(await this.svc.createCampaign(body)))
  }

  @TsRestHandler(c.updateCampaign)
  updateCampaign() {
    return tsRestHandler(c.updateCampaign, async ({ params, body }) => ok(await this.svc.updateCampaign(params.id, body)))
  }

  @TsRestHandler(c.deleteCampaign)
  deleteCampaign() {
    return tsRestHandler(c.deleteCampaign, async ({ params }) => ok(await this.svc.deleteCampaign(params.id)))
  }

  @TsRestHandler(c.createAd)
  createAd() {
    return tsRestHandler(c.createAd, async ({ body }) => ok(await this.svc.createAd(body)))
  }

  @TsRestHandler(c.updateAd)
  updateAd() {
    return tsRestHandler(c.updateAd, async ({ params, body }) => ok(await this.svc.updateAd(params.id, body)))
  }

  @TsRestHandler(c.duplicateAd)
  duplicateAd() {
    return tsRestHandler(c.duplicateAd, async ({ params }) => ok(await this.svc.duplicateAd(params.id)))
  }

  @TsRestHandler(c.deleteAd)
  deleteAd() {
    return tsRestHandler(c.deleteAd, async ({ params }) => ok(await this.svc.deleteAd(params.id)))
  }

  @TsRestHandler(c.saveSettings)
  saveSettings() {
    return tsRestHandler(c.saveSettings, async ({ body }) => ok(await this.svc.saveSettings(body)))
  }
}
