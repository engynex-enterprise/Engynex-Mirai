import { describe, expect, it } from "vitest"
import { ACCESS_ROLES, assignableRoles, can, canEditRow, canManage, legacyRole, ROLE_MATRIX, toAccess, type AccessRole } from "./roles"
import { afterSend, checkDuplicate, destKeyOf, deliverySummary, haceCuanto, inviteEstado, inviteText, isTestEmail, normalizeDest, resendGate, sameName, waMeLink } from "./invites"

describe("normalizeDest", () => {
  it("correo en minúsculas y sin espacios", () => {
    expect(normalizeDest("  Ana.Perez@Gmail.COM ")).toMatchObject({ kind: "email", value: "ana.perez@gmail.com", key: "email:ana.perez@gmail.com" })
    expect(normalizeDest("ana @gmail.com")).toMatchObject({ value: "ana@gmail.com" })
  })
  it("celular de Colombia a 57 + 10 dígitos", () => {
    for (const v of ["315 123 4567", "+57 315 123 4567", "(315) 123-4567", "573151234567", "0057 3151234567"]) expect(normalizeDest(v)).toMatchObject({ kind: "tel", value: "573151234567", key: "tel:573151234567", label: "+57 315 123 4567" })
  })
  it("errores legibles", () => {
    expect(normalizeDest("")).toHaveProperty("error")
    expect(normalizeDest("ana@")).toHaveProperty("error")
    expect(normalizeDest("12345")).toHaveProperty("error")
    expect(normalizeDest("601 234 5678")).toHaveProperty("error") // fijo, no celular
  })
  it("la clave coincide con la columna dest_key de la base", () => {
    expect(destKeyOf({ email: " Ana@Gmail.com " })).toBe("email:ana@gmail.com")
    expect(destKeyOf({ email: null, phone: "573151234567" })).toBe("tel:573151234567")
    const d = normalizeDest("ANA@gmail.com")
    expect("key" in d && d.key).toBe(destKeyOf({ email: "ana@gmail.com" }))
  })
  it("dominios de prueba no reciben correos reales", () => {
    expect(isTestEmail("qa+invitado@mirai.test")).toBe(true)
    expect(isTestEmail("x@example.com")).toBe(true)
    expect(isTestEmail("ana@gmail.com")).toBe(false)
  })
})

describe("checkDuplicate", () => {
  const now = new Date("2026-11-02T15:00:00-05:00")
  const members = [{ nombre: "Ana", email: "ana@gmail.com", telefono: "315 123 4567" }]
  const pending = [{ id: "i1", email: "luis@gmail.com", created_at: "2026-10-31T10:00:00-05:00", expires_at: "2026-11-07T10:00:00-05:00", nombre: "Luis" }, { id: "i2", phone: "573001112233", created_at: "2026-10-20T10:00:00-05:00", expires_at: "2026-10-27T10:00:00-05:00" }]
  const dest = (s: string) => { const d = normalizeDest(s); if ("error" in d) throw new Error(d.error); return d }

  it("persona que ya es miembro (por correo o celular)", () => {
    expect(checkDuplicate(dest("ANA@gmail.com"), members, pending, now)).toEqual({ kind: "miembro", nombre: "Ana", msg: "Ana ya hace parte de tu hogar." })
    expect(checkDuplicate(dest("+57 315-123-4567"), members, pending, now)).toMatchObject({ kind: "miembro" })
  })
  it("invitación pendiente: ofrece reenviar", () => {
    expect(checkDuplicate(dest(" Luis@Gmail.com"), members, pending, now)).toMatchObject({ kind: "pendiente", id: "i1", vencida: false, msg: "Ya invitaste a Luis hace 2 días. ¿Quieres reenviarle la invitación?" })
  })
  it("invitación vencida: ofrece enviarla de nuevo", () => {
    expect(checkDuplicate(dest("300 111 2233"), members, pending, now)).toMatchObject({ kind: "pendiente", id: "i2", vencida: true })
  })
  it("destino nuevo", () => {
    expect(checkDuplicate(dest("sofia@gmail.com"), members, pending, now)).toEqual({ kind: "ok" })
  })
  it("nombres iguales sin tildes ni mayúsculas", () => {
    expect(sameName("Sofía  Pérez", "sofia perez")).toBe(true)
    expect(sameName("Sofía", "Sofi")).toBe(false)
    expect(sameName("", "")).toBe(false)
  })
})

describe("resendGate (1 cada 10 minutos, 5 al día)", () => {
  const now = new Date("2026-11-02T15:00:00-05:00")
  it("primer envío", () => expect(resendGate({}, now)).toEqual({ ok: true }))
  it("espera 10 minutos entre envíos", () => {
    const r = resendGate({ last_sent_at: new Date(now.getTime() - 4 * 60000).toISOString(), sends_day: "2026-11-02", sends_today: 1 }, now)
    expect(r).toMatchObject({ ok: false, waitMin: 6 })
    expect(resendGate({ last_sent_at: new Date(now.getTime() - 11 * 60000).toISOString(), sends_day: "2026-11-02", sends_today: 1 }, now)).toEqual({ ok: true })
  })
  it("máximo 5 al día y se reinicia al día siguiente (hora de Colombia)", () => {
    const s = { last_sent_at: "2026-11-02T08:00:00-05:00", sends_day: "2026-11-02", sends_today: 5 }
    expect(resendGate(s, now).ok).toBe(false)
    expect(resendGate(s, new Date("2026-11-03T00:30:00-05:00"))).toEqual({ ok: true })
    // 11 p. m. en Colombia ya es otro día en UTC, pero sigue contando como el mismo día
    expect(resendGate(s, new Date("2026-11-02T23:30:00-05:00")).ok).toBe(false)
  })
  it("afterSend suma en el mismo día y reinicia en otro", () => {
    expect(afterSend({ sends_day: "2026-11-02", sends_today: 2 }, now)).toMatchObject({ sends_day: "2026-11-02", sends_today: 3 })
    expect(afterSend({ sends_day: "2026-11-01", sends_today: 5 }, now)).toMatchObject({ sends_today: 1 })
  })
})

describe("roles y permisos", () => {
  it("matriz de permisos por rol", () => {
    const fila = (p: string) => ROLE_MATRIX.find((x) => x.perm === p)!.roles
    expect(fila("ver")).toEqual({ owner: true, admin: true, editor: true, registra: true, viewer: true })
    expect(fila("registrarPropio")).toEqual({ owner: true, admin: true, editor: true, registra: true, viewer: false })
    expect(fila("editarTodo")).toEqual({ owner: true, admin: true, editor: true, registra: false, viewer: false })
    expect(fila("invitar")).toEqual({ owner: true, admin: true, editor: false, registra: false, viewer: false })
    expect(fila("ajustes")).toEqual({ owner: true, admin: true, editor: false, registra: false, viewer: false })
    expect(fila("plan")).toEqual({ owner: true, admin: false, editor: false, registra: false, viewer: false })
    expect(fila("borrar")).toEqual({ owner: true, admin: false, editor: false, registra: false, viewer: false })
  })
  it("la versión publicada ve cada rol nuevo como su nivel equivalente", () => {
    expect(ACCESS_ROLES.map(legacyRole)).toEqual(["owner", "editor", "editor", "viewer", "viewer"])
  })
  it("filas viejas sin access_role usan role", () => {
    expect(toAccess(null, "editor")).toBe("editor")
    expect(toAccess("admin", "editor")).toBe("admin")
    expect(toAccess("raro", null)).toBe("viewer")
  })
  it("quién puede dar qué rol y a quién", () => {
    expect(assignableRoles("owner")).toEqual(["admin", "editor", "registra", "viewer"])
    expect(assignableRoles("admin")).toEqual(["admin", "editor", "registra", "viewer"])
    expect(assignableRoles("editor")).toEqual([])
    expect(canManage("admin", "owner")).toBe(false)
    expect(canManage("owner", "owner")).toBe(true) // hogares viejos con dos dueños
    expect(canManage("admin", "editor")).toBe(true)
    expect(canManage("editor", "viewer")).toBe(false)
    expect(canManage("owner", "admin", true)).toBe(false)
  })
  it("Registra sus gastos solo edita lo suyo", () => {
    const r = (x: AccessRole, by: string) => canEditRow(x, { created_by: by }, "yo")
    expect(r("registra", "yo")).toBe(true)
    expect(r("registra", "otro")).toBe(false)
    expect(r("editor", "otro")).toBe(true)
    expect(r("viewer", "yo")).toBe(false)
    expect(can("registra", "registrarPropio")).toBe(true)
  })
})

describe("textos y estado", () => {
  const now = new Date("2026-11-02T15:00:00-05:00")
  it("estado de la invitación", () => {
    expect(inviteEstado({ expires_at: "2026-11-05T00:00:00Z" }, now)).toBe("pendiente")
    expect(inviteEstado({ expires_at: "2026-11-01T00:00:00Z" }, now)).toBe("vencida")
    expect(inviteEstado({ expires_at: "2026-11-05T00:00:00Z", canceled_at: "x" }, now)).toBe("cancelada")
    expect(inviteEstado({ expires_at: "2026-11-01T00:00:00Z", accepted_at: "x" }, now)).toBe("aceptada")
  })
  it("hace cuánto", () => {
    expect(haceCuanto("2026-11-02T14:55:00-05:00", now)).toBe("hace 5 min")
    expect(haceCuanto("2026-11-01T09:00:00-05:00", now)).toBe("ayer")
    expect(haceCuanto("2026-10-31T09:00:00-05:00", now)).toBe("hace 2 días")
  })
  it("texto y enlace de WhatsApp", () => {
    const t = inviteText({ invita: "Alberto", hogar: "Casa Navarro", nombre: "Ana María", rol: "editor", url: "https://mirai.engynex.com/invitacion/abc", vence: "2026-11-09T15:00:00-05:00" })
    expect(t).toContain("Hola, Ana.")
    expect(t).toContain("Tu rol: Colabora.")
    expect(t).toContain("https://mirai.engynex.com/invitacion/abc")
    expect(waMeLink("Hola", "+57 315 123 4567")).toBe("https://wa.me/573151234567?text=Hola")
    expect(waMeLink("a b")).toBe("https://wa.me/?text=a%20b")
  })
  it("resumen del último envío", () => {
    expect(deliverySummary({ email: { ok: false, at: "", error: "dominio no verificado" } })).toEqual([{ tone: "bad", text: "No salió por correo: dominio no verificado" }])
    expect(deliverySummary({ whatsapp: { ok: true, at: "", via: "propio" } })[0].text).toBe("Abierta en tu WhatsApp")
  })
})
