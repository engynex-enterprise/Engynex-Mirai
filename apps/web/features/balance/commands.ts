// Cuadrar el saldo de una cuenta y foto del patrimonio por la API. Ver features/book/command.ts.
import { unwrapData } from "@/lib/api/unwrap"
import { command, type CmdResult, type RpcArgs } from "@/features/book/command"
import { activeBookId } from "@/lib/api/session"
import { asResult } from "@/lib/api/book-rows"

/** asset_cuadrar → POST /assets/:id/reconcile. */
export const assetCuadrar = (a: RpcArgs<"asset_cuadrar">) =>
  command(async (c, bookId) => unwrapData(await c.assets.reconcile({ params: { bookId, id: a.p_asset }, body: { saldo: a.p_saldo } })))

/** La cuenta deja de llevar el saldo sola (saldo_base, saldo_fecha y saldo_at = null) → DELETE /assets/:id/reconcile. */
export async function assetDescuadrar(id: string): Promise<CmdResult> {
  const { browserApi } = await import("@/lib/api/client")
  return asResult(async () => unwrapData(await browserApi().assets.unreconcile({ params: { bookId: activeBookId(), id } })))
}

/** Foto del patrimonio del mes (una por mes) → PUT /net-worth/:mes. */
export async function guardarPatrimonio(bookId: string, mes: string, activos: number, deudas: number): Promise<CmdResult> {
  const { browserApi } = await import("@/lib/api/client")
  return asResult(async () => unwrapData(await browserApi().assets.snapshot({ params: { bookId, mes }, body: { activos, deudas } })))
}
