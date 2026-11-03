// Arnés de las pruebas del auth propio: MiraiAuthService real (Better Auth + mirai-gate) sobre Postgres en Docker, con
// correos en memoria y un "navegador" con cookies que llama al handler HTTP (/api/auth/*) igual que la web.
import { SignJWT } from "jose"
import pino from "pino"
import { loadAuthEnv, type AuthEnv } from "../../src/modules/auth/auth.env"
import { MemoryAuthMailer } from "../../src/modules/auth/auth-mailer"
import { MiraiAuthService } from "../../src/modules/auth/mirai-auth.service"
import { freshDb, type TestDb } from "./pg"

export const BASE = "http://localhost:3000"
export const SECRET = "secreto-de-better-auth-para-pruebas-1234567890"

export type Harness = { t: TestDb; svc: MiraiAuthService; mail: MemoryAuthMailer; browser: () => Browser; close: () => Promise<void> }

export async function harness(name: string, env: Record<string, string> = {}): Promise<Harness> {
  const t = await freshDb(name)
  const values = loadAuthEnv({
    AUTH_PROVIDER: "mirai",
    BETTER_AUTH_SECRET: SECRET,
    DATABASE_URL: t.url,
    BETTER_AUTH_URL: BASE,
    GOOGLE_CLIENT_ID: "cliente-google.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "secreto-google",
    ...env,
  })
  const mail = new MemoryAuthMailer()
  const svc = new MiraiAuthService({ values } as AuthEnv, mail, pino({ level: "silent" }))
  svc.useDb(t.db)
  return { t, svc, mail, browser: () => new Browser(svc), close: () => t.drop() }
}

/** Navegador mínimo: guarda cookies, manda Origin (Better Auth revisa el origen) y no sigue redirecciones. */
export class Browser {
  readonly jar = new Map<string, string>()
  ip = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
  constructor(private readonly svc: MiraiAuthService) {}

  get cookie() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ")
  }

  private store(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";")
      const i = pair.indexOf("=")
      const k = pair.slice(0, i).trim()
      const v = pair.slice(i + 1).trim()
      const expired = attrs.some((a) => /max-age=0\b/i.test(a.trim())) || v === ""
      if (expired) this.jar.delete(k)
      else this.jar.set(k, v)
    }
  }

  async req(method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}) {
    const url = path.startsWith("http") ? path : `${BASE}/api/auth${path}`
    const h = new Headers({ origin: BASE, "x-forwarded-for": this.ip, ...headers })
    if (this.jar.size) h.set("cookie", this.cookie)
    if (body !== undefined) h.set("content-type", "application/json")
    const res = await this.svc.instance.handler(new Request(url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" }))
    this.store(res)
    const text = await res.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = text
    }
    return { status: res.status, json: json as Record<string, unknown> & { code?: string }, location: res.headers.get("location"), headers: res.headers }
  }
  post(path: string, body: unknown = {}, headers?: Record<string, string>) {
    return this.req("POST", path, body, headers)
  }
  get(path: string, headers?: Record<string, string>) {
    return this.req("GET", path, undefined, headers)
  }
  /** Sesión actual (null si no hay). */
  async session() {
    const r = await this.get("/get-session?disableCookieCache=true")
    return (r.json as { user?: { id: string; email: string }; session?: { id: string; token: string; aal?: string; amr?: string } } | null) ?? null
  }
  hasSession() {
    return [...this.jar.keys()].some((k) => k.endsWith("mirai.session_token"))
  }
}

/** id_token de Google simulado (Better Auth lo decodifica en el callback; la firma la valida Google en el canje real). */
export async function googleIdToken(o: { sub: string; email: string; name?: string; picture?: string }) {
  return new SignJWT({ email: o.email, email_verified: true, name: o.name ?? "Persona Google", picture: o.picture ?? "https://lh3.googleusercontent.com/a/foto" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("https://accounts.google.com")
    .setAudience("cliente-google.apps.googleusercontent.com")
    .setSubject(o.sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode("google-simulado"))
}
