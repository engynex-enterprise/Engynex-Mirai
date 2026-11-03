import { Module } from "@nestjs/common"

// Módulo `billing` (docs/arquitectura/v6-separacion-front-back.md §2.6): planes, suscripción, cupones, checkout y webhooks.
// Dueño: F2-I (lectura pública: F2-C). Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/billing.ts. Ejemplo completo: modules/catalogs.
@Module({})
export class BillingModule {}
