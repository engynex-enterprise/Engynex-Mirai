import { Module } from "@nestjs/common"

// Módulo `files` (docs/arquitectura/v6-separacion-front-back.md §2.6): URL firmadas de subida y descarga.
// Dueño: F2-D. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/files.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class FilesModule {}
