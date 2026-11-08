// Comandos del libro por la API (`/v1/books/:b/...`, con Idempotency-Key). Cada función de features/<módulo>/commands.ts
// recibe los mismos argumentos que la RPC equivalente (tipos `RpcArgs`) y devuelve la forma `{ data, error }` que leen
// los componentes, con `error.message` en español. Las invalidaciones de TanStack las sigue haciendo el componente.
import type { Database } from "@/lib/supabase/database.types"
import { activeBookId } from "@/lib/api/session"
import type { MiraiApi } from "@/lib/api/client"

type Fns = Database["public"]["Functions"]
export type RpcName = keyof Fns
export type RpcArgs<F extends RpcName> = Fns[F]["Args"]
/** Forma `{ data, error }` que leen los componentes. */
export type CmdResult = { data: unknown; error: { message: string } | null }

/** `api`: llamada al comando que devuelve el `data` con la forma de la RPC equivalente. */
export async function command(api: (c: MiraiApi, bookId: string) => Promise<unknown>): Promise<CmdResult> {
  try {
    const { browserApi } = await import("@/lib/api/client")
    return { data: await api(browserApi(), activeBookId()), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error && e.message ? e.message : "No se pudo completar la operación." } }
  }
}
