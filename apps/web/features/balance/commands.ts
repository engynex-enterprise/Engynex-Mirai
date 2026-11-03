// Cuadrar el saldo de una cuenta (v6 F2-H-4, interruptor `assets`). Ver features/book/command.ts.
import { unwrapData } from "@/lib/api/unwrap"
import { command, type RpcArgs } from "@/features/book/command"

/** asset_cuadrar → POST /assets/:id/reconcile. */
export const assetCuadrar = (a: RpcArgs<"asset_cuadrar">) =>
  command("assets", "asset_cuadrar", a, async (c, bookId) => unwrapData(await c.assets.reconcile({ params: { bookId, id: a.p_asset }, body: { saldo: a.p_saldo } })),
  Number.isFinite(a.p_saldo))
