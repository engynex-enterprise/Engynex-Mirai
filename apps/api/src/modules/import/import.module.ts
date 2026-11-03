import { Module } from "@nestjs/common"

// Módulo `import` (docs/arquitectura/v6-separacion-front-back.md §2.6): importar v4, ejemplo, respaldos y exportar.
// Dueño: F2-D. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/import.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class ImportModule {}
