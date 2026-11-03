import { Module } from "@nestjs/common"

// Módulo `households` (docs/arquitectura/v6-separacion-front-back.md §2.6): hogares, personas, roles, invitaciones, familia y pasar el hogar.
// Dueño: F2-I. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/households.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class HouseholdsModule {}
