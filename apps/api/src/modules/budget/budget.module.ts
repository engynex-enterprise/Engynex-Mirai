import { Module } from "@nestjs/common"
import { BookTablesModule } from "../book-tables/book-tables.module"
import { BudgetController } from "./budget.controller"
import { BudgetService } from "./budget.service"

// Módulo `budget` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
// Topes por categoría (uno o varios). La vista 50/30/20 la calcula el cliente / insights (D3).
@Module({
  imports: [BookTablesModule],
  controllers: [BudgetController],
  providers: [BudgetService],
  exports: [BudgetService],
})
export class BudgetModule {}
