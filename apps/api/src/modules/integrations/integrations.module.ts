import { Module } from "@nestjs/common"

// Módulo `integrations` (docs/arquitectura/v6-separacion-front-back.md §2.6): integraciones del hogar (con máscara), prueba y modelos.
// Dueño: F2-E. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/integrations.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class IntegrationsModule {}
