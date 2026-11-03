import { Module } from "@nestjs/common"
import { BellModule } from "./bell/bell.module"
import { DeliveryModule } from "./delivery/delivery.module"

// Módulo `notifications` (docs/arquitectura/v6-separacion-front-back.md §2.6): campana, reglas, pruebas, Telegram y push.
// Dueño: F2-C (campana) y F2-E. Stub vacío de F2-B: su dueño agrega controllers, servicios, repositorios (puerto) y adaptadores
// en esta carpeta, y su contrato en packages/contracts/src/modules/notifications.ts. Ejemplo completo: modules/catalogs.
// BellModule = campana (F2-C, carpeta bell/); DeliveryModule = envíos, reglas, Telegram y push (F2-E, carpeta delivery/).
@Module({ imports: [BellModule, DeliveryModule] })
export class NotificationsModule {}
