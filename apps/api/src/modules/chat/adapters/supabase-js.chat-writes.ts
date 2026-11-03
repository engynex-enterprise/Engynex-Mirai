// Adaptador de hoy de ChatWritesPort: server/confirm.ts de @mirai/ai (el mismo que features/chat/confirm.ts de la web)
// con el JWT de la persona y `x-mirai-enlaces: 1` (las cascadas gasto ↔ tarjeta ↔ fijo de la base), así la RLS vuelve a
// exigir el rol. Los servicios de escritura de F2-D lo reemplazarán con otro adaptador del mismo puerto.
import { Injectable } from "@nestjs/common"
import { escribir } from "@mirai/ai/server/confirm"
import type { AiCtx } from "@mirai/ai/server/ctx"
import type { Propuesta } from "@mirai/contracts/chat-types"
import type { DbScope } from "../../../core/db/scope"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { ChatWritesPort } from "../chat.port"

@Injectable()
export class SupabaseJsChatWrites extends ChatWritesPort {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  write(ctx: AiCtx, scope: DbScope, p: Propuesta) {
    return escribir(ctx, this.sb.for(scope), p)
  }
}
