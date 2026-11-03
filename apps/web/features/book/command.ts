// Comandos del libro por la API (v6 F2-H-4). Cada función de features/<módulo>/commands.ts recibe los MISMOS
// argumentos que la RPC que llamaba el navegador y devuelve la misma forma `{ data, error }` de `sb.rpc(...)`:
//   · interruptor apagado (o un caso que el comando de la API no cubre igual) → `createClient().rpc(nombre, args)`,
//     exactamente lo de siempre;
//   · encendido → el comando de F2-D (`/v1/books/:b/...`) con Idempotency-Key, y `error.message` en español.
// Las invalidaciones de TanStack las sigue haciendo el componente (los comandos también disparan Realtime).
import { createClient } from "@/utils/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import type { ApiModule } from "@/lib/api/modules"
import { activeBookId, apiOn } from "@/lib/api/session"
import type { MiraiApi } from "@/lib/api/client"

type Fns = Database["public"]["Functions"]
export type RpcName = keyof Fns
export type RpcArgs<F extends RpcName> = Fns[F]["Args"]
/** Forma de `sb.rpc(...)` que leen los componentes. */
export type CmdResult = { data: unknown; error: { message: string } | null }

/** Periodo que acepta la API (fijoPeriods: AAAA-MM, AAAA-MM-Q1/Q2, AAAA o U). Otros (p. ej. `prev-…`) van por la RPC. */
export const API_PERIODO = /^(\d{4}(-(0[1-9]|1[0-2])(-Q[12])?)?|U)$/

/**
 * `module`: interruptor; `parity`: ¿el comando da lo mismo para estos argumentos? (si no, RPC); `api`: llamada al
 * comando que devuelve el `data` con la forma que devolvía la RPC.
 */
export async function command<F extends RpcName>(
  module: ApiModule,
  fn: F,
  args: RpcArgs<F>,
  api: (c: MiraiApi, bookId: string) => Promise<unknown>,
  parity: boolean = true,
): Promise<CmdResult> {
  if (!parity || !apiOn(module)) {
    const { data, error } = await createClient().rpc(fn, args as never)
    return { data, error }
  }
  try {
    const { browserApi } = await import("@/lib/api/client")
    return { data: await api(browserApi(), activeBookId()), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error && e.message ? e.message : "No se pudo completar la operación." } }
  }
}
