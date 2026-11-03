import { Module } from "@nestjs/common"
import { BookTablesModule } from "../book-tables/book-tables.module"
import { CatalogsModule } from "../catalogs/catalogs.module"
import { LoansController } from "./loans.controller"
import { LoansService } from "./loans.service"

// Módulo `loans` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
// Crear por tipo (quién presta sin duplicar registros) y pagos (cuotas o abonos); el CRUD va por book-tables.
// El recordatorio de cobro por WhatsApp lo da F2-E (notifications/delivery). Exporta LoansService (chat).
@Module({
  imports: [BookTablesModule, CatalogsModule],
  controllers: [LoansController],
  providers: [LoansService],
  exports: [LoansService],
})
export class LoansModule {}
