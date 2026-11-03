import { Module } from "@nestjs/common"
import { BookTablesModule } from "../book-tables/book-tables.module"
import { CardsController } from "./cards.controller"
import { CardsService } from "./cards.service"

// Módulo `cards` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
// Compras (add_card_purchase) y pagos (pay_credit_card); el CRUD de credit_cards va por book-tables.
// Exporta CardsService (importar extractos de la tarjeta, correo y chat).
@Module({
  imports: [BookTablesModule],
  controllers: [CardsController],
  providers: [CardsService],
  exports: [CardsService],
})
export class CardsModule {}
