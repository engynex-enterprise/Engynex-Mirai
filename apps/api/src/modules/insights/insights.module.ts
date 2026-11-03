import { Module } from "@nestjs/common"

// Módulo `insights` (docs/arquitectura/v6-separacion-front-back.md §2.6): vistas calculadas y reportes (solo lectura).
// Dueño: F2-C. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/insights.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class InsightsModule {}
