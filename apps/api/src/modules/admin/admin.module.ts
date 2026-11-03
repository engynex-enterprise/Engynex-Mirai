import { Module } from "@nestjs/common"

// Módulo `admin` (docs/arquitectura/v6-separacion-front-back.md §2.6): consola de la plataforma (nunca montos).
// Dueño: F2-I. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/admin.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class AdminModule {}
