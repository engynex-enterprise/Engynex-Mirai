// Adaptador de ChatPort: el motor de @mirai/ai (el mismo de app/api/chat y features/chat/actions.ts de la web) con el
// cliente supabase-js de la persona. Confirmar delega la escritura en ChatWritesPort.
import { Injectable } from "@nestjs/common"
import {
  chatAttachWith, chatCancelWith, chatConfirmWith, chatDuplicateWith, chatHintsWith, chatThreadInfoWith, chatTitleWith, deleteThreadWith, listThreadsWith,
  patchThreadWith, restoreThreadWith, threadMessagesWith, type AttachInput, type ThreadPatch,
} from "@mirai/ai/server/chat-actions"
import { runChatTurn, type ChatTurnInput } from "@mirai/ai/server/chat-turn"
import type { AiCtx } from "@mirai/ai/server/ctx"
import type { ChatEvent } from "@mirai/contracts/chat-types"
import type { DbScope } from "../../../core/db/scope"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { ChatPort, ChatWritesPort } from "../chat.port"

@Injectable()
export class PackageChat extends ChatPort {
  constructor(
    private readonly sb: SupabaseJsFactory,
    private readonly writes: ChatWritesPort,
  ) {
    super()
  }

  turn(ctx: AiCtx, scope: DbScope, body: ChatTurnInput, emit: (e: ChatEvent) => void, signal: AbortSignal) {
    return runChatTurn({ ctx, sb: this.sb.for(scope), body, emit, signal })
  }
  hints(ctx: AiCtx, scope: DbScope) {
    return chatHintsWith(ctx, this.sb.for(scope))
  }
  threads(ctx: AiCtx, scope: DbScope, o: { archivados?: boolean; limit?: number }) {
    return listThreadsWith(ctx, this.sb.for(scope), o)
  }
  messages(scope: DbScope, threadId: string) {
    return threadMessagesWith(this.sb.for(scope), threadId)
  }
  patchThread(scope: DbScope, threadId: string, p: ThreadPatch) {
    return patchThreadWith(this.sb.for(scope), threadId, p)
  }
  deleteThread(scope: DbScope, threadId: string) {
    return deleteThreadWith(this.sb.for(scope), threadId)
  }
  restoreThread(scope: DbScope, threadId: string) {
    return restoreThreadWith(this.sb.for(scope), threadId)
  }
  duplicate(ctx: AiCtx, scope: DbScope, threadId: string) {
    return chatDuplicateWith(ctx, this.sb.for(scope), threadId)
  }
  title(ctx: AiCtx, scope: DbScope, threadId: string) {
    return chatTitleWith(ctx, this.sb.for(scope), threadId)
  }
  info(scope: DbScope, threadId: string) {
    return chatThreadInfoWith(this.sb.for(scope), threadId)
  }
  confirm(ctx: AiCtx, scope: DbScope, messageId: string, propId: string) {
    return chatConfirmWith(ctx, this.sb.for(scope), messageId, propId, (p) => this.writes.write(ctx, scope, p))
  }
  cancel(scope: DbScope, messageId: string, propId: string) {
    return chatCancelWith(this.sb.for(scope), messageId, propId)
  }
  attach(ctx: AiCtx, scope: DbScope, input: AttachInput) {
    return chatAttachWith(ctx, this.sb.for(scope), input)
  }
}
