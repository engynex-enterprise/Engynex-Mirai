import { Module } from "@nestjs/common"

// Módulo `budget` (docs/arquitectura/v6-separacion-front-back.md §2.6): presupuesto 50/30/20 y topes.
// Dueño: F2-D. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/budget.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class BudgetModule {}
