// Adaptador para Cloud SQL (fase 4): las mismas consultas con Kysely dentro de tx().
import { Injectable } from "@nestjs/common"
import type { Ad } from "@mirai/contracts/modules/ads"
import type { DbScope } from "../../../core/db/scope"
import { PgKyselyFactory } from "../../../core/db/pg-kysely.factory"
import { AdsRepo, type AdsData } from "../ads.repository"

@Injectable()
export class PgKyselyAdsRepo extends AdsRepo {
  constructor(private readonly db: PgKyselyFactory) {
    super()
  }

  load(scope: DbScope, { userId, hoy }: { userId: string; hoy: string }): Promise<AdsData> {
    return this.db.tx(scope, async (trx) => {
      const [ads, campaigns, mine, settings] = await Promise.all([
        trx.selectFrom("ads").select(["id", "titulo", "texto", "imagen", "url", "cta", "anunciante", "ubicaciones", "activo", "desde", "hasta", "prioridad", "campaign_id", "formato", "media"]).execute(),
        trx.selectFrom("ad_campaigns").select(["id", "estado", "desde", "hasta", "planes", "dispositivos", "frecuencia_max", "prioridad"]).where("estado", "=", "activa").execute(),
        trx.selectFrom("ad_user_daily").select(["ad_id", "vistas"]).where("user_id", "=", userId).where("dia", "=", hoy).execute(),
        trx.selectFrom("platform_settings").select(["anuncios_adsense_pct", "anuncios_accion_cada", "anuncios_modal_horas", "anuncios_ticker"]).executeTakeFirst(),
      ])
      return { ads: ads as unknown as Ad[], campaigns, vistas: Object.fromEntries(mine.map((r) => [r.ad_id, r.vistas])), settings: settings ?? null }
    })
  }
}
