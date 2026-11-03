import { Module } from "@nestjs/common"
import { RowStoreModule } from "../../core/store/row-store.module"
import { FeedbackController } from "./feedback.controller"
import { FeedbackService } from "./feedback.service"

// Módulo `feedback` (docs/arquitectura/v6-separacion-front-back.md §2.6): opiniones y casos de soporte de la persona.
// Dueño: F2-D → V7-G. Tabla `feedback` por RowStore (supabase-js hoy, Kysely en Postgres propio) con la sesión de la
// persona. La captura la sube la web con el módulo `files`; la consola de opiniones vive en `admin`.
@Module({
  imports: [RowStoreModule],
  controllers: [FeedbackController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
