// /api/auth/* → Better Auth en la API (v7). Si el balanceador ya lo manda directo a la API, no llega aquí; si no (local
// o el compose del VPS), la web lo reenvía para que la cookie httpOnly siga siendo del mismo origen.
import { forwardToApi } from "@/lib/auth/forward"

async function handle(req: Request) {
  return forwardToApi(req, new URL(req.url).pathname)
}

export const GET = handle
export const POST = handle
