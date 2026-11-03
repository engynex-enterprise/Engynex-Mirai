import { Module } from "@nestjs/common"

// Módulo `fixed` (docs/arquitectura/v6-separacion-front-back.md §2.6): gastos fijos y suscripciones: pay, unpay, charge.
// Dueño: F2-D. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/fixed.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class FixedModule {}
