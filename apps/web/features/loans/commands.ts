// Pagos de deudas y préstamos por la API: POST /loans/:id/payments arma las filas de loan_payments (cuotas del plan de
// loanEngine o un abono que no pasa del saldo) en una sola escritura. Devuelve `{ error }`.
import { unwrapData } from "@/lib/api/unwrap"
import { asResult } from "@/lib/api/book-rows"
import { activeBookId } from "@/lib/api/session"

export type LoanPay =
  | { cuotas: number; fecha: string; payment_method_id: string | null }
  | { abono: number; modo: "plazo" | "cuota"; fecha: string; payment_method_id: string | null }

export async function payLoanApi(loanId: string, body: LoanPay) {
  const { browserApi } = await import("@/lib/api/client")
  return asResult(async () => unwrapData(await browserApi().loans.pay({ params: { bookId: activeBookId(), id: loanId }, body })))
}

/** Perfil propio (Perfil › Recibe pagos y datos del acuerdo) por `GET /v1/me/profile`. */
export async function apiMyProfile() {
  const { browserApi, unwrap } = await import("@/lib/api/client")
  return unwrap(await browserApi().me.profile())
}
