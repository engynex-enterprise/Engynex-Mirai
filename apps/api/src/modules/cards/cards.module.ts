import { Module } from "@nestjs/common"

// Módulo `cards` (docs/arquitectura/v6-separacion-front-back.md §2.6): tarjetas: compras y pagos.
// Dueño: F2-D. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/cards.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class CardsModule {}
