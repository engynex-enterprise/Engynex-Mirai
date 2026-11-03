import { Module } from "@nestjs/common"
import { BookTablesModule } from "../book-tables/book-tables.module"
import { AssetsController } from "./assets.controller"
import { AssetsService } from "./assets.service"

// Módulo `assets` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
// Cuadrar cuentas y foto del patrimonio del mes; el CRUD de assets, liabilities e investments va por book-tables.
// Pendiente: precios de inversiones (CoinGecko y Alpha Vantage) por integrations (F2-E).
@Module({
  imports: [BookTablesModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
