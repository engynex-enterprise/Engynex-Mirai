import { Module } from "@nestjs/common"

// Módulo `account` (docs/arquitectura/v6-separacion-front-back.md §2.6): cuenta: correo, métodos de entrada, sesiones, exportar y borrar.
// Dueño: F2-I. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/account.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class AccountModule {}
