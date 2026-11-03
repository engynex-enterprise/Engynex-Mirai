import { Module } from "@nestjs/common"
import { BookTablesModule } from "../book-tables/book-tables.module"
import { AiExpenseClassifier } from "../ai/adapters/ai.expense-classifier"
import { ExpenseClassifier } from "./expense-classifier"
import { ExpensesController } from "./expenses.controller"
import { ExpensesService } from "./expenses.service"

// Módulo `expenses` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
// Registrar un gasto con las reglas del formulario, link-fixed, unlink-fixed y use-fund (contrato en
// packages/contracts/src/modules/expenses.ts). El CRUD simple va por book-tables. La importación de extractos vive en
// el módulo import. Exporta ExpensesService (chat y automatizaciones) y el puerto ExpenseClassifier (lo usa import).
// F2-F: ExpenseClassifier = AiExpenseClassifier (classifyWith de @mirai/ai, el motor de classifyExpenses de la web).
@Module({
  imports: [BookTablesModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, { provide: ExpenseClassifier, useClass: AiExpenseClassifier }],
  exports: [ExpensesService, ExpenseClassifier],
})
export class ExpensesModule {}
