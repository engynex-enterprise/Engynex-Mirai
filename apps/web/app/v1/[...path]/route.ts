// /v1/* → la API en el mismo origen (v7): la sesión es una cookie httpOnly del dominio de la web, así que el navegador
// llama a /v1 aquí mismo. Si el balanceador ya manda /v1 directo a la API, no llega aquí.
import { forwardToApi } from "@/lib/auth/forward"

async function handle(req: Request) {
  return forwardToApi(req, new URL(req.url).pathname)
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
