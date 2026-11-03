// /v1/* → la API en el mismo origen (v7, V7-B): con AUTH_PROVIDER=mirai la sesión es una cookie httpOnly del dominio de
// la web, así que el navegador llama a /v1 aquí mismo. En producción el balanceador lo manda directo a la API.
// Con AUTH_PROVIDER=supabase no existe (404): el navegador sigue llamando a la API con su Bearer como siempre.
import { forwardToApi } from "@/lib/auth/forward"
import { serverAuthProvider } from "@/lib/auth/provider"

async function handle(req: Request) {
  if (serverAuthProvider() !== "mirai") return new Response("No encontrado", { status: 404 })
  return forwardToApi(req, new URL(req.url).pathname)
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
