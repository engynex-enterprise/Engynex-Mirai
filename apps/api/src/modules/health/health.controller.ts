// Módulo `health & meta` (§2.6, §2.7.9). Dueño: F2-B. /healthz (vida), /readyz (lista para tráfico) y /v1/version.
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { healthContract } from "@mirai/contracts/modules/health"
import { Public } from "../../core/auth/decorators"
import { AppConfig } from "../../core/config/app-config"
import { ReadinessService } from "../../core/health/readiness.service"
import { SkipDefaultLimit } from "../../core/rate-limit/rate-limit.guard"

const STARTED = new Date().toISOString()

@Controller()
@Public()
@SkipDefaultLimit()
export class HealthController {
  constructor(
    private readonly readiness: ReadinessService,
    private readonly config: AppConfig,
  ) {}

  @TsRestHandler(healthContract.healthz)
  healthz() {
    return tsRestHandler(healthContract.healthz, async () => ({ status: 200, body: { ok: true as const } }))
  }

  @TsRestHandler(healthContract.readyz)
  readyz() {
    return tsRestHandler(healthContract.readyz, async () => {
      const r = await this.readiness.check()
      return r.ok ? { status: 200 as const, body: r } : { status: 503 as const, body: r }
    })
  }

  @TsRestHandler(healthContract.version)
  version() {
    return tsRestHandler(healthContract.version, async () => ({
      status: 200,
      body: { name: "mirai-api" as const, version: this.config.version, commit: this.config.commit, env: this.config.env, mode: this.config.mode as "api" | "realtime" /* MODE=worker no monta Nest */, startedAt: STARTED },
    }))
  }
}
