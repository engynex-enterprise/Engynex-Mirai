import { describe, expect, it } from "vitest"
import { signState, STATE_TTL_S, verifyState } from "./oauth-state"

const KEY = "llave-de-prueba-del-state-de-google-0123456789"
const U = "00000000-0000-4000-8000-000000000001"

describe("state firmado de OAuth (sin cookie)", () => {
  it("lo que se firma se verifica con la misma llave", () => {
    const s = signState(KEY, { u: U, s: "calendar", b: "/ajustes?tab=alertas" })
    expect(verifyState(KEY, s)).toMatchObject({ u: U, s: "calendar", b: "/ajustes?tab=alertas" })
  })
  it("otra llave, un cambio en el contenido o en la firma: inválido", () => {
    const s = signState(KEY, { u: U, s: "gmail", b: "/correo" })
    expect(verifyState(`${KEY}x`, s)).toBeNull()
    const [body, sig] = s.split(".")
    const otro = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), u: "otra-persona" })).toString("base64url")
    expect(verifyState(KEY, `${otro}.${sig}`)).toBeNull()
    expect(verifyState(KEY, `${body}.${sig.slice(0, -2)}xx`)).toBeNull()
    expect(verifyState(KEY, `${body}.${sig}.extra`)).toBeNull()
    expect(verifyState(KEY, undefined)).toBeNull()
  })
  it("vence a los 10 minutos", () => {
    const t0 = Date.UTC(2026, 10, 2, 15)
    const s = signState(KEY, { u: U, s: "gmail", b: "/correo" }, t0)
    expect(verifyState(KEY, s, t0 + (STATE_TTL_S - 1) * 1000)).not.toBeNull()
    expect(verifyState(KEY, s, t0 + (STATE_TTL_S + 1) * 1000)).toBeNull()
  })
  it("cada state es distinto (nonce)", () => {
    expect(signState(KEY, { u: U, s: "gmail", b: "/correo" })).not.toBe(signState(KEY, { u: U, s: "gmail", b: "/correo" }))
  })
})
