import { Module } from "@nestjs/common"

// Módulo `ads` (docs/arquitectura/v6-separacion-front-back.md §2.6): anuncios elegibles y eventos.
// Dueño: F2-C. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/ads.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class AdsModule {}
