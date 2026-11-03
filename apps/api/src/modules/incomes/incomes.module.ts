import { Module } from "@nestjs/common"
import { BookTablesModule } from "../book-tables/book-tables.module"
import { IncomesController } from "./incomes.controller"
import { IncomesService } from "./incomes.service"

// Módulo `incomes` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
// Plan del ingreso (sin guardar) y guardar con reparto por quincena; el CRUD de incomes y extra_incomes va por
// book-tables. Contrato: packages/contracts/src/modules/incomes.ts.
@Module({
  imports: [BookTablesModule],
  controllers: [IncomesController],
  providers: [IncomesService],
  exports: [IncomesService],
})
export class IncomesModule {}
