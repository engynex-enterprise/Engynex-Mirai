// Puertos del chat (§2.1). ChatPort: el motor de @mirai/ai (turno en streaming, hilos, propuestas, adjuntos) con el
// cliente del alcance (RLS "chat propio"). ChatWritesPort: escribir en el libro lo que la persona confirmó; hoy lo hace
// server/confirm.ts de @mirai/ai con el JWT de la persona (las mismas RPC de la web: pay_fixed_expense, pay_subscription,
// add_card_purchase, pay_credit_card, goal_contribute). Cuando F2-D tenga sus servicios de escritura (expenses, fixed,
// cards, loans, savings), un adaptador nuevo de este puerto los usa sin tocar el chat.
import type { AttachInput, AttachResult, ConfirmResult, ThreadInfo, ThreadPatch, TitleResult } from "@mirai/ai/server/chat-actions"
import type { ChatTurnInput } from "@mirai/ai/server/chat-turn"
import type { Escrito } from "@mirai/ai/server/confirm"
import type { AiCtx } from "@mirai/ai/server/ctx"
import type { ChatEvent, ChatHints, ChatMsg, ChatThread, Propuesta } from "@mirai/contracts/chat-types"
import type { DbScope } from "../../core/db/scope"

export abstract class ChatPort {
  /** Un turno completo. Nunca lanza: los errores salen como `{ t: "error" }`. */
  abstract turn(ctx: AiCtx, scope: DbScope, body: ChatTurnInput, emit: (e: ChatEvent) => void, signal: AbortSignal): Promise<void>
  abstract hints(ctx: AiCtx, scope: DbScope): Promise<ChatHints>
  abstract threads(ctx: AiCtx, scope: DbScope, o: { archivados?: boolean; limit?: number }): Promise<ChatThread[]>
  abstract messages(scope: DbScope, threadId: string): Promise<ChatMsg[] | null>
  abstract patchThread(scope: DbScope, threadId: string, p: ThreadPatch): Promise<boolean>
  abstract deleteThread(scope: DbScope, threadId: string): Promise<boolean>
  abstract restoreThread(scope: DbScope, threadId: string): Promise<boolean>
  abstract duplicate(ctx: AiCtx, scope: DbScope, threadId: string): Promise<{ ok: true; id: string; titulo: string } | { ok: false; msg: string }>
  abstract title(ctx: AiCtx, scope: DbScope, threadId: string): Promise<TitleResult>
  abstract info(scope: DbScope, threadId: string): Promise<ThreadInfo>
  abstract confirm(ctx: AiCtx, scope: DbScope, messageId: string, propId: string): Promise<ConfirmResult>
  abstract cancel(scope: DbScope, messageId: string, propId: string): Promise<{ ok: boolean; propuesta?: Propuesta }>
  abstract attach(ctx: AiCtx, scope: DbScope, input: AttachInput): Promise<AttachResult>
}

export abstract class ChatWritesPort {
  /** Escribe la propuesta confirmada (valida y recalcula con el libro de hoy). El permiso por tipo ya se revisó. */
  abstract write(ctx: AiCtx, scope: DbScope, p: Propuesta): Promise<Escrito>
}
