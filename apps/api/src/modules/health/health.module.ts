import { Module } from "@nestjs/common"
import { DocsController } from "./docs.controller"
import { HealthController } from "./health.controller"

// Módulo `health & meta` (§2.6). Dueño: F2-B. /docs responde 404 en producción o con DOCS=0.
@Module({ controllers: [HealthController, DocsController] })
export class HealthModule {}
