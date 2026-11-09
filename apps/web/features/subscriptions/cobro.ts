import { conv, type Trm } from "@/lib/domain"
import type { Row } from "@/lib/supabase/tables"
import type { CobroSub } from "./charge-sub-dialog"

type GastoSub = Row<"expenses"> & { subscription_id?: string | null; sub_proximo?: string | null }

/** Lo que vale el cobro vigente de una suscripción (en pesos y solo tu parte) y lo que ya le abonaste. */
export function cobroDe(s: Row<"subscriptions">, expenses: GastoSub[], trm: Trm): CobroSub {
  const esperado = Math.round(conv(Number(s.valor), s.currency, trm) / Math.max(1, s.comparte))
  const abonado = expenses
    .filter((g) => g.subscription_id === s.id && g.sub_proximo === s.proximo)
    .reduce((a, g) => a + Number(g.valor), 0)
  return { sub: s, esperado, abonado }
}
