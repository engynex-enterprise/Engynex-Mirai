import { Module } from "@nestjs/common"

// Módulo `expenses` (docs/arquitectura/v6-separacion-front-back.md §2.6): gastos: link-fixed, unlink-fixed, use-fund, import.
// Dueño: F2-D. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/expenses.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class ExpensesModule {}
