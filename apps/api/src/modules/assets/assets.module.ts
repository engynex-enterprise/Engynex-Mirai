import { Module } from "@nestjs/common"

// Módulo `assets` (docs/arquitectura/v6-separacion-front-back.md §2.6): inversiones, patrimonio y foto del mes.
// Dueño: F2-D. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/assets.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class AssetsModule {}
