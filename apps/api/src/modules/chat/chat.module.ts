import { Module } from "@nestjs/common"
import { AiModule } from "../ai/ai.module"
import { PackageChat } from "./adapters/package.chat"
import { SupabaseJsChatWrites } from "./adapters/supabase-js.chat-writes"
import { ChatController } from "./chat.controller"
import { ChatPort, ChatWritesPort } from "./chat.port"
import { ChatService } from "./chat.service"

// Módulo `chat` (§2.6). Dueño: F2-F. Chat en streaming NDJSON, hilos, propuestas (confirmar/cancelar), adjuntos,
// título, duplicar y sugerencias, con el motor de @mirai/ai (el mismo de la web). Usa AiModule (quién llama, archivos y
// el runtime de la IA). La escritura al confirmar va por ChatWritesPort (hoy server/confirm.ts; luego F2-D).
@Module({
  imports: [AiModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    { provide: ChatPort, useClass: PackageChat },
    { provide: ChatWritesPort, useClass: SupabaseJsChatWrites },
  ],
})
export class ChatModule {}
