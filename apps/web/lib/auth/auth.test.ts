// Interruptor AUTH_PROVIDER y proxy del auth propio (v7, V7-B). Con `supabase` (por defecto) nada cambia.
import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"
import { AUTH_FLAG_COOKIE, serverAuthProvider } from "./provider"
import { isPublicPath, updateMiraiSession } from "./proxy"

const req = (path: string, cookie?: string) => new NextRequest(`https://mirai.engynex.com${path}`, { headers: cookie ? { cookie } : {} })

describe("AUTH_PROVIDER", () => {
  it("supabase por defecto; mirai solo con el valor exacto", () => {
    expect(serverAuthProvider({})).toBe("supabase")
    expect(serverAuthProvider({ AUTH_PROVIDER: "otro" })).toBe("supabase")
    expect(serverAuthProvider({ AUTH_PROVIDER: " mirai " })).toBe("mirai")
  })
})

describe("proxy con AUTH_PROVIDER=mirai", () => {
  it("sin cookie de sesión manda a /login con next; deja la cookie del interruptor", () => {
    const r = updateMiraiSession(req("/gastos?mes=2026-11"))
    expect(r.status).toBe(307)
    expect(r.headers.get("location")).toBe("https://mirai.engynex.com/login?next=%2Fgastos%3Fmes%3D2026-11")
    expect(r.cookies.get(AUTH_FLAG_COOKIE)?.value).toBe("mirai")
  })
  it("con la cookie (__Secure-) deja pasar y desde /login va a /inicio", () => {
    expect(updateMiraiSession(req("/gastos", "__Secure-mirai.session_token=t.f")).headers.get("location")).toBeNull()
    expect(updateMiraiSession(req("/login", "mirai.session_token=t.f")).headers.get("location")).toBe("https://mirai.engynex.com/inicio")
  })
  it("sesión vencida (/login?sesion=vencida, lo manda getAppContext): borra la cookie y NO rebota a /inicio", () => {
    const r = updateMiraiSession(req("/login?sesion=vencida", "mirai.session_token=t.f; mirai.session_data=x"))
    expect(r.headers.get("location")).toBeNull()
    expect(r.cookies.get("mirai.session_token")?.value).toBe("")
    expect(r.cookies.get("mirai.session_data")?.value).toBe("")
    expect(r.cookies.get(AUTH_FLAG_COOKIE)?.value).toBe("mirai")
  })
  it("el reto de dos factores, la clave nueva, /api/auth y /v1 no piden sesión", () => {
    for (const p of ["/verificacion", "/actualizar-clave", "/api/auth/sign-in/email", "/v1/me", "/auth/callback", "/registro"]) expect(updateMiraiSession(req(p)).headers.get("location"), p).toBeNull()
    expect(isPublicPath("/verificacion")).toBe(false) // con Supabase sí pide sesión (aal1), como siempre
  })
})
