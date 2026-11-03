import { Module } from "@nestjs/common"

// Módulo `incomes` (docs/arquitectura/v6-separacion-front-back.md §2.6): ingresos, extras y planIngreso.
// Dueño: F2-D. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/incomes.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class IncomesModule {}
