import { Module } from "@nestjs/common"

// Módulo `ai` (docs/arquitectura/v6-separacion-front-back.md §2.6): endpoints de IA (facturas, recibos, clasificar…).
// Dueño: F2-F. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/ai.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class AiModule {}
