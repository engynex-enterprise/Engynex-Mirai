import { Module } from "@nestjs/common"
import { IntegrationsModule } from "../integrations/integrations.module"
import { PackageAi, PackageAiAdmin } from "./adapters/package.ai"
import { byObjectStore } from "../../core/files/by-driver"
import { ObjectStoreAiFiles } from "./adapters/object-store.ai-files"
import { SupabaseJsAiFiles } from "./adapters/supabase-js.ai-files"
import { AiAdminController, AiAdminService } from "./ai-admin.controller"
import { AiContext } from "./ai-context"
import { AiFiles } from "./ai-files"
import { AiRuntime } from "./ai-runtime"
import { AiController } from "./ai.controller"
import { AiAdminPort, AiPort } from "./ai.port"
import { AiService } from "./ai.service"

// Módulo `ai` (§2.6). Dueño: F2-F. IA de los formularios (facturas, comprobantes, documentos de préstamos, categoría y
// hormiga, asistentes, cobro, prima, frase libre), consejero, resumen del mes, correo del banco, probar y listar modelos
// de la IA del hogar, uso de IA del hogar y consola › Uso de IA. El código es @mirai/ai (el mismo de la web).
// Importa IntegrationsModule (F2-E) porque @mirai/ai usa el runtime de @mirai/services que este configura (y AiRuntime
// le agrega el aiText de las automatizaciones). Exporta AiContext y AiFiles para el chat.
@Module({
  imports: [IntegrationsModule],
  controllers: [AiController, AiAdminController],
  providers: [
    AiService,
    AiAdminService,
    AiContext,
    AiRuntime,
    { provide: AiPort, useClass: PackageAi },
    { provide: AiAdminPort, useClass: PackageAiAdmin },
    byObjectStore(AiFiles, SupabaseJsAiFiles, ObjectStoreAiFiles),
  ],
  exports: [AiContext, AiFiles],
})
export class AiModule {}
