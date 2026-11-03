import { Module } from "@nestjs/common"

// Módulo `tax` (docs/arquitectura/v6-separacion-front-back.md §2.6): renta, calendario fiscal y contador.
// Dueño: F2-D (portal del contador: F2-I). Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/tax.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class TaxModule {}
