import { Module } from "@nestjs/common"
import { RowStoreModule } from "../../core/store/row-store.module"
import { AiModule } from "../ai/ai.module"
import { PackageChat } from "./adapters/package.chat"
import { SupabaseJsChatWrites } from "./adapters/supabase-js.chat-writes"
import { ChatController } from "./chat.controller"
import { ChatExtrasController } from "./chat-extras.controller"
import { ChatExtrasService } from "./chat-extras.service"
import { ChatPort, ChatWritesPort } from "./chat.port"
import { ChatService } from "./chat.service"

// Módulo `chat` (§2.6). Dueño: F2-F. Chat en streaming NDJSON, hilos, propuestas (confirmar/cancelar), adjuntos,
// título, duplicar y sugerencias, con el motor de @mirai/ai (el mismo de la web). Usa AiModule (quién llama, archivos y
// el runtime de la IA). La escritura al confirmar va por ChatWritesPort (hoy server/confirm.ts; luego F2-D).
// V7-G: calificar, buscar y contar hilos (ChatExtrasController) sobre RowStore con la sesión de la persona.
@Module({
  imports: [AiModule, RowStoreModule],
  controllers: [ChatController, ChatExtrasController],
  providers: [
    ChatService,
    ChatExtrasService,
    { provide: ChatPort, useClass: PackageChat },
    { provide: ChatWritesPort, useClass: SupabaseJsChatWrites },
  ],
})
export class ChatModule {}
