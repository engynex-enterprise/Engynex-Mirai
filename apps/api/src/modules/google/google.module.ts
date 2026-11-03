import { Module } from "@nestjs/common"

// Módulo `google` (docs/arquitectura/v6-separacion-front-back.md §2.6): Gmail y Google Calendar.
// Dueño: F2-E. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/google.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class GoogleModule {}
