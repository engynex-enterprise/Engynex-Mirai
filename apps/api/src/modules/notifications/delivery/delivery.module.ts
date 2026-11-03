import { Module } from "@nestjs/common"
import { IntegrationsModule } from "../../integrations/integrations.module"
import { DeliveryController } from "./delivery.controller"
import { DeliveryPort } from "./delivery.port"
import { DeliveryService } from "./delivery.service"
import { ServicesDelivery } from "./services.delivery"

// Parte de F2-E del módulo `notifications` (§2.6): reglas, pruebas, resumen ahora, Telegram, push y cobro por WhatsApp.
// Exporta DeliveryPort para quien necesite enviar (F2-D: recordatorio de préstamos; F2-I: correos del hogar).
@Module({
  imports: [IntegrationsModule],
  controllers: [DeliveryController],
  providers: [DeliveryService, { provide: DeliveryPort, useClass: ServicesDelivery }],
  exports: [DeliveryPort],
})
export class DeliveryModule {}
