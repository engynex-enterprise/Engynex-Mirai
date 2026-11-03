import { Module } from "@nestjs/common"
import { IntegrationsModule } from "../integrations/integrations.module"
import { GoogleController } from "./google.controller"
import { GooglePort } from "./google.port"
import { GoogleService } from "./google.service"
import { ServicesGoogle } from "./services.google"

// Módulo `google` (§2.6). Dueño: F2-E. OAuth con `state` firmado, desconectar y Google Calendar. Leer el correo del
// banco (mail/scan) usa la IA: lo agrega F2-F con su AiService.
@Module({
  imports: [IntegrationsModule],
  controllers: [GoogleController],
  providers: [GoogleService, { provide: GooglePort, useClass: ServicesGoogle }],
  exports: [GooglePort],
})
export class GoogleModule {}
