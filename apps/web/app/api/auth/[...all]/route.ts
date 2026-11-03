// /api/auth/* → Better Auth en la API (v7, V7-B). En producción lo enruta el balanceador del mismo origen y no llega
// aquí; en local o sin balanceador la web lo reenvía. Con AUTH_PROVIDER=supabase no existe (404).
import { forwardToApi } from "@/lib/auth/forward"
import { serverAuthProvider } from "@/lib/auth/provider"

async function handle(req: Request) {
  if (serverAuthProvider() !== "mirai") return new Response("No encontrado", { status: 404 })
  return forwardToApi(req, new URL(req.url).pathname)
}

export const GET = handle
export const POST = handle
