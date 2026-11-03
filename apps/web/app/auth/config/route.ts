// Configuración pública de las pantallas de auth (v7, V7-B): proveedor, registro abierto, Google y captcha.
// Con AUTH_PROVIDER=mirai la pregunta a la API (/v1/auth/config); con supabase responde lo de siempre.
import { connection } from "next/server"
import { apiUrl } from "@/lib/api/rollout"
import { serverAuthProvider } from "@/lib/auth/provider"

export async function GET() {
  await connection() // en cada petición: AUTH_PROVIDER es de tiempo de ejecución, no de compilación
  const headers = { "cache-control": "no-store" }
  if (serverAuthProvider() !== "mirai") return Response.json({ provider: "supabase", registroAbierto: true, google: true, captcha: false }, { headers })
  try {
    const r = await fetch(`${apiUrl()}/v1/auth/config`, { cache: "no-store", signal: AbortSignal.timeout(5000) })
    if (r.ok) return Response.json(await r.json(), { headers })
  } catch { /* la API no respondió: se muestra el registro abierto y la API decide al enviar */ }
  return Response.json({ provider: "mirai", registroAbierto: true, google: true, captcha: false }, { headers })
}
