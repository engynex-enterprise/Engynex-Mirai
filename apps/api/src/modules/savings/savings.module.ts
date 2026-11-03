import { Module } from "@nestjs/common"
import { BookTablesModule } from "../book-tables/book-tables.module"
import { SavingsController } from "./savings.controller"
import { SavingsService } from "./savings.service"

// Módulo `savings` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
// Abonos a metas y fondo de emergencia; el CRUD de metas, retos, deseos, mesadas y compartidos va por book-tables.
// Exporta SavingsService (chat y automatizaciones).
@Module({
  imports: [BookTablesModule],
  controllers: [SavingsController],
  providers: [SavingsService],
  exports: [SavingsService],
})
export class SavingsModule {}
