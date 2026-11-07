// Cuadrar el saldo de una cuenta (v6 F2-H-4, interruptor `assets`). Ver features/book/command.ts.
import { unwrapData } from "@/lib/api/unwrap"
import { command, type CmdResult, type RpcArgs } from "@/features/book/command"
import { activeBookId, apiOn } from "@/lib/api/session"
import { asResult } from "@/lib/api/book-rows"
import { createClient } from "@/utils/supabase/client"

/** asset_cuadrar → POST /assets/:id/reconcile. */
export const assetCuadrar = (a: RpcArgs<"asset_cuadrar">) =>
  command("assets", "asset_cuadrar", a, async (c, bookId) => unwrapData(await c.assets.reconcile({ params: { bookId, id: a.p_asset }, body: { saldo: a.p_saldo } })),
  Number.isFinite(a.p_saldo))

/** La cuenta deja de llevar el saldo sola (saldo_base, saldo_fecha y saldo_at = null) → DELETE /assets/:id/reconcile. */
export async function assetDescuadrar(id: string): Promise<CmdResult> {
  if (!apiOn("assets")) {
    const { data, error } = await createClient().from("assets").update({ saldo_base: null, saldo_fecha: null, saldo_at: null }).eq("id", id)
    return { data, error }
  }
  const { browserApi } = await import("@/lib/api/client")
  return asResult(async () => unwrapData(await browserApi().assets.unreconcile({ params: { bookId: activeBookId(), id } })))
}

/** Foto del patrimonio del mes (una por mes) → PUT /net-worth/:mes. Apagado: el upsert de siempre. */
export async function guardarPatrimonio(bookId: string, mes: string, activos: number, deudas: number): Promise<CmdResult> {
  if (!apiOn("assets")) {
    const { data, error } = await createClient().from("net_worth_snapshots").upsert({ book_id: bookId, mes, activos, deudas, patrimonio: activos - deudas }, { onConflict: "book_id,mes" })
    return { data, error }
  }
  const { browserApi } = await import("@/lib/api/client")
  return asResult(async () => unwrapData(await browserApi().assets.snapshot({ params: { bookId, mes }, body: { activos, deudas } })))
}
