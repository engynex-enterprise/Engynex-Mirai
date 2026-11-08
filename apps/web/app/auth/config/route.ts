// Configuración pública de las pantallas de auth (v7): registro abierto, Google y captcha (/v1/auth/config de la API).
import { connection } from "next/server"
import { apiUrl } from "@/lib/api/config"

export async function GET() {
  await connection() // en cada petición: la configuración vive en la API, no en la compilación
  const headers = { "cache-control": "no-store" }
  try {
    const r = await fetch(`${apiUrl()}/v1/auth/config`, { cache: "no-store", signal: AbortSignal.timeout(5000) })
    if (r.ok) return Response.json(await r.json(), { headers })
  } catch { /* la API no respondió: se muestra el registro abierto y la API decide al enviar */ }
  return Response.json({ provider: "mirai", registroAbierto: true, google: true, captcha: false }, { headers })
}
