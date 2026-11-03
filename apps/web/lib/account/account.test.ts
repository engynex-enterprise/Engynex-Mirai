import { describe, expect, it } from "vitest"
import { canRemove, checkNewEmail, deviceName, emailChangeState, eventText, isRecentAuth, moveSteps, signInMethods, waysToEnter, type AccountState } from "./account"
import { canReceive, nameMatches, receivers, transferStatus, transferSummary } from "@/lib/household/transfer"

const base: AccountState = { email: "ana@gmail.com", new_email: null, email_change_sent_at: null, email_change_confirm_status: 0, has_password: false, created_at: null, last_sign_in_at: null, identities: [] }
const g = (id: string, email: string) => ({ id, provider: "google", email, last_sign_in_at: "2026-11-01T10:00:00Z", created_at: "2026-10-01T10:00:00Z" })

describe("formas de entrar", () => {
  it("no deja quitar la única cuenta de Google", () => {
    const s = { ...base, identities: [g("g1", "ana@gmail.com")] }
    expect(waysToEnter(s)).toBe(1)
    expect(canRemove(s, { kind: "google", identityId: "g1" }).ok).toBe(false)
    expect(signInMethods(s).find((m) => m.kind === "google")?.removable).toBe(false)
  })
  it("no deja quitar la contraseña si es lo único", () => {
    const s = { ...base, has_password: true, identities: [{ id: "e", provider: "email", email: "ana@gmail.com", last_sign_in_at: null, created_at: null }] }
    const m = signInMethods(s).find((x) => x.kind === "password")!
    expect(m.removable).toBe(false)
    expect(m.reason).toMatch(/única forma/)
  })
  it("con contraseña y Google se puede quitar cualquiera de los dos", () => {
    const s = { ...base, has_password: true, identities: [g("g1", "ana@gmail.com")] }
    expect(canRemove(s, { kind: "google", identityId: "g1" }).ok).toBe(true)
    expect(canRemove(s, { kind: "password" }).ok).toBe(true)
  })
  it("con dos cuentas de Google se puede quitar la vieja", () => {
    const s = { ...base, identities: [g("g1", "vieja@gmail.com"), g("g2", "nueva@gmail.com")] }
    expect(canRemove(s, { kind: "google", identityId: "g1" }).ok).toBe(true)
    expect(canRemove(s, { kind: "google", identityId: "otra" }).ok).toBe(false)
  })
  it("el enlace mágico nunca se quita (depende del correo)", () => {
    expect(canRemove({ ...base, has_password: true, identities: [g("g1", "a@gmail.com")] }, { kind: "magic" }).ok).toBe(false)
    expect(signInMethods(base).map((m) => m.kind)).toEqual(["magic"])
  })
})

describe("cambio de correo", () => {
  it("valida el correo nuevo", () => {
    expect(checkNewEmail("ana@gmail.com", "  ANA@gmail.com ").ok).toBe(false)
    expect(checkNewEmail("ana@gmail.com", "nada").ok).toBe(false)
    expect(checkNewEmail("ana@gmail.com", " Ana.Nueva@Outlook.com ")).toEqual({ ok: true, email: "ana.nueva@outlook.com" })
  })
  it("estado pendiente con cambio seguro", () => {
    expect(emailChangeState(base).estado).toBe("ninguno")
    expect(emailChangeState({ ...base, new_email: "n@x.co", email_change_sent_at: "2026-11-02T00:00:00Z" })).toMatchObject({ estado: "pendiente", to: "n@x.co", falta: "ambos" })
    expect(emailChangeState({ ...base, new_email: "n@x.co", email_change_confirm_status: 1 })).toMatchObject({ falta: "uno" })
  })
})

describe("pasarse a otra cuenta", () => {
  it("guía los tres pasos según el estado", () => {
    const s = { ...base, identities: [g("g1", "vieja@gmail.com")] }
    const p = moveSteps(s, "nueva@outlook.com", "vieja@gmail.com")
    expect(p.map((x) => x.done)).toEqual([false, false, false])
    expect(p[2].blocked).toBeTruthy()
    const listo = moveSteps({ ...s, email: "nueva@outlook.com", has_password: true, identities: [] }, "nueva@outlook.com", "vieja@gmail.com")
    expect(listo.every((x) => x.done)).toBe(true)
    expect(moveSteps({ ...s, new_email: "nueva@outlook.com" }, "nueva@outlook.com")[0].desc).toMatch(/Falta confirmar/)
  })
  it("la cuenta de Google nueva cuenta como forma de entrar", () => {
    const s = { ...base, identities: [g("g1", "vieja@gmail.com"), g("g2", "nueva@gmail.com")] }
    expect(moveSteps(s, "nueva@gmail.com", "vieja@gmail.com")[1].done).toBe(true)
  })
})

describe("reautenticación y textos", () => {
  it("entró hace poco", () => {
    const now = Date.parse("2026-11-02T12:00:00Z")
    expect(isRecentAuth([{ method: "password", timestamp: now / 1000 - 600 }], now)).toBe(true)
    expect(isRecentAuth([{ method: "password", timestamp: now / 1000 - 7200 }], now)).toBe(false)
    expect(isRecentAuth(undefined, now)).toBe(false)
  })
  it("eventos y dispositivos en palabras simples", () => {
    expect(eventText({ id: 1, kind: "contrasena", detail: { accion: "creada" }, created_at: "" }).text).toBe("Creaste una contraseña")
    expect(eventText({ id: 1, kind: "metodo_quitado", detail: { provider: "google", email: "a@gmail.com" }, created_at: "" }).text).toBe("Quitaste Google (a@gmail.com)")
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17.0 Mobile Safari/604.1")).toBe("Safari en iPhone")
    expect(deviceName("Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/130.0 Safari/537.36")).toBe("Chrome en Windows")
  })
})

describe("pasar el hogar", () => {
  const people = [
    { userId: "yo", access: "owner" as const, me: true, estado: "miembro" },
    { userId: "esposa", access: "admin" as const, estado: "miembro" },
    { userId: null, access: null, estado: "sin_cuenta" },
    { userId: null, access: null, estado: "invitado" },
    { userId: "hijo", access: "registra" as const, estado: "miembro" },
  ]
  it("solo el dueño y solo a personas con cuenta del hogar", () => {
    expect(receivers("owner", people).map((p) => p.userId)).toEqual(["esposa", "hijo"])
    expect(receivers("admin", people)).toEqual([])
    expect(canReceive("owner", people[0]).ok).toBe(false)
    expect(canReceive("owner", people[2])).toMatchObject({ ok: false, msg: /Invítala primero/ })
    expect(canReceive("owner", { userId: "x", access: "owner", estado: "miembro" }).ok).toBe(false)
  })
  it("estados de la transferencia (vence a los 7 días)", () => {
    const now = new Date("2026-11-10T00:00:00Z")
    expect(transferStatus({ status: "pendiente", expires_at: "2026-11-12T00:00:00Z" }, now)).toBe("pendiente")
    expect(transferStatus({ status: "pendiente", expires_at: "2026-11-09T00:00:00Z" }, now)).toBe("vencida")
    expect(transferStatus({ status: "aceptada", expires_at: "2026-11-09T00:00:00Z" }, now)).toBe("aceptada")
    expect(transferStatus({ status: "raro", expires_at: "2026-11-12T00:00:00Z" }, now)).toBe("cancelada")
  })
  it("confirmación con el nombre del hogar y resumen", () => {
    expect(nameMatches("  familia pérez ", "Familia Pérez")).toBe(true)
    expect(nameMatches("Familia", "Familia Pérez")).toBe(false)
    expect(nameMatches("", "")).toBe(false)
    const r = transferSummary({ hogar: "Casa", para: "Laura", fromRole: "admin", planAction: "cancelar", tienePago: true })
    expect(r[1]).toMatch(/Administra/)
    expect(r.join(" ")).toMatch(/Cancelaremos la renovación/)
  })
})
