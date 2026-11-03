import { Module } from "@nestjs/common"
import { BookTablesModule } from "../book-tables/book-tables.module"
import { FixedController } from "./fixed.controller"
import { FixedService } from "./fixed.service"

// Módulo `fixed & subscriptions` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
// pay / unpay de gastos fijos y charge de suscripciones (RPC de la base); el CRUD va por book-tables.
// Exporta FixedService (automatizaciones: "pagar fijo"; chat: propuestas confirmadas).
@Module({
  imports: [BookTablesModule],
  controllers: [FixedController],
  providers: [FixedService],
  exports: [FixedService],
})
export class FixedModule {}
