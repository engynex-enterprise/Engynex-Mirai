// Pagos de deudas y préstamos por la API (V7-H1, interruptor `loans`). Apagado, la vista inserta las filas de
// loan_payments como siempre; encendido, POST /loans/:id/payments arma las mismas filas en la API (cuotas del plan de
// loanEngine o un abono que no pasa del saldo) en una sola escritura. Devuelve `{ error }` como supabase-js.
import { unwrapData } from "@/lib/api/unwrap"
import { asResult } from "@/lib/api/book-rows"
import { activeBookId, apiOn } from "@/lib/api/session"

export const loansViaApi = () => apiOn("loans")

export type LoanPay =
  | { cuotas: number; fecha: string; payment_method_id: string | null }
  | { abono: number; modo: "plazo" | "cuota"; fecha: string; payment_method_id: string | null }

export async function payLoanApi(loanId: string, body: LoanPay) {
  const { browserApi } = await import("@/lib/api/client")
  return asResult(async () => unwrapData(await browserApi().loans.pay({ params: { bookId: activeBookId(), id: loanId }, body })))
}

/** Perfil propio (Perfil › Recibe pagos y datos del acuerdo) por `GET /v1/me/profile` (interruptor `me`). */
export const profileViaApi = () => apiOn("me")

export async function apiMyProfile() {
  const { browserApi, unwrap } = await import("@/lib/api/client")
  return unwrap(await browserApi().me.profile())
}
