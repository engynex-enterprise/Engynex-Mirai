import "server-only"
// Reenvío del mismo origen hacia la API (v7, V7-B). En producción el balanceador manda /api/auth/* y /v1/* a la API y
// nunca llegan aquí; en local (o sin balanceador) la web los reenvía para que la cookie httpOnly siga siendo del mismo
// origen. Solo con AUTH_PROVIDER=mirai. Sin seguir redirecciones y con todas las Set-Cookie.
import { apiUrl } from "@/lib/api/rollout"

const PASS = ["accept", "accept-language", "content-type", "cookie", "origin", "referer", "user-agent", "x-captcha-response", "idempotency-key", "x-mirai-client", "traceparent", "authorization"]

export async function forwardToApi(req: Request, path: string): Promise<Response> {
  const base = apiUrl()
  if (!base) return Response.json({ ok: false, code: "UPSTREAM", msg: "La API de Mirai no está configurada." }, { status: 502 })
  const src = new URL(req.url)
  const headers = new Headers()
  for (const k of PASS) {
    const v = req.headers.get(k)
    if (v) headers.set(k, v)
  }
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip")
  if (ip) headers.set("x-forwarded-for", ip)
  headers.set("x-forwarded-host", src.host)
  headers.set("x-forwarded-proto", src.protocol.replace(":", ""))
  const method = req.method.toUpperCase()
  const res = await fetch(`${base}${path}${src.search}`, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer(),
    redirect: "manual",
    cache: "no-store",
  })
  const out = new Headers()
  res.headers.forEach((v, k) => {
    if (!["set-cookie", "content-encoding", "content-length", "transfer-encoding", "connection"].includes(k)) out.set(k, v)
  })
  for (const c of res.headers.getSetCookie()) out.append("set-cookie", c)
  return new Response(res.status === 204 || res.status === 304 ? null : await res.arrayBuffer(), { status: res.status, headers: out })
}
