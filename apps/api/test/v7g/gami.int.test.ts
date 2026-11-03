// V7-G: escrituras de logros (gami-check.tsx y logroNotifs de la web) de punta a punta con la app real, el estado de
// logros falso (FakeGamiRepo) y RowStore en memoria: visita del día, evaluación en el servidor (insignias, misiones,
// nivel y campana sin duplicados), roles y logros apagados.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { GBADGES } from "@mirai/domain/gami"
import { GamiRepo } from "../../src/modules/gami/gami.repository"
import { B_AJENO, B_GRATIS, USERS } from "../setup/fixtures"
import { FakeGamiRepo } from "../setup/read-fakes"
import { createV7gApp, type V7gApp } from "./app"

let t: V7gApp
const gami = new FakeGamiRepo()
const HOY = "2026-11-02"
const base = structuredClone(gami.st)
const G = (p: string, q = `?hoy=${HOY}`) => `/v1/books/${B_GRATIS}/gami/${p}${q}`

beforeAll(async () => {
  t = await createV7gApp({ overrides: [[GamiRepo, gami]] })
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.fx.rows.reset()
  t.fx.book.reset()
  t.fx.book.seed("book_settings", [{ book_id: B_GRATIS, gami: true }])
  gami.st = structuredClone(base)
  // «Me presento» (perfil con nombre) queda pendiente: el resto de insignias ya están o no se cumplen con un libro vacío.
  gami.st.unl = {}
})

describe("POST /v1/books/:bookId/gami/visit", () => {
  it("registra la visita del día con la sesión de la persona y no la duplica", async () => {
    for (let i = 0; i < 2; i++) {
      const r = await t.call("POST", G("visit"), "viewer")
      expect(r.status).toBe(200)
      expect(r.body).toEqual({ ok: true, data: { dia: HOY } })
    }
    expect(t.fx.rows.all("gami_visits")).toEqual([expect.objectContaining({ book_id: B_GRATIS, user_id: USERS.viewer, dia: HOY })])
    expect(t.fx.rows.scopesOf("gami_visits")).toEqual(["user", "user"])
  })

  it("fuera del hogar: 404 sin decir que el libro existe; sin sesión: 401", async () => {
    expect((await t.call("POST", `/v1/books/${B_AJENO}/gami/visit`, "viewer")).body).toMatchObject({ code: "NOT_FOUND", msg: "No encontramos ese libro." })
    expect((await t.call("POST", G("visit"), null)).status).toBe(401)
  })
})

describe("POST /v1/books/:bookId/gami/check", () => {
  it("primera evaluación: guarda lo cumplido y el estado (editor) sin celebrar ni avisar", async () => {
    gami.st.init = null
    const r = await t.call("POST", G("check"), "editor")
    expect(r.status).toBe(200)
    expect(r.body.data).toEqual({ on: true, first: true, badges: [], missions: [], nivel: null })
    expect(t.fx.rows.all("gami_badges").map((b) => b.badge)).toContain("perfil")
    expect(t.fx.rows.all("gami_state")).toMatchObject([{ book_id: B_GRATIS, max_level: expect.any(Number), init_date: HOY }])
    expect(t.fx.rows.all("notifications")).toEqual([])
  })

  it("«Solo ver» guarda insignias y misiones, pero no el nivel máximo (como useCanEdit)", async () => {
    gami.st.init = null
    await t.call("POST", G("check"), "viewer")
    expect(t.fx.rows.all("gami_badges").length).toBeGreaterThan(0)
    expect(t.fx.rows.all("gami_state")).toEqual([])
  })

  it("insignia y nivel nuevos: los guarda, los devuelve para celebrar y avisa en la campana una sola vez", async () => {
    gami.st.maxLevel = 0
    const r = await t.call("POST", G("check"), "editor")
    const perfil = GBADGES.find((b) => b.id === "perfil")!
    expect(r.body.data).toMatchObject({ on: true, first: false, nivel: { n: 1 } })
    expect((r.body.data as { badges: { id: string }[] }).badges).toContainEqual({ id: "perfil", n: perfil.n, d: perfil.d, icon: perfil.icon, tier: perfil.tier })
    // Se repite (el estado falso no cambia): la campana no duplica.
    await t.call("POST", G("check"), "editor")
    const notifs = t.fx.rows.all<{ user_id: string; kind: string; dedupe: string; titulo: string; href: string }>("notifications")
    expect(notifs.filter((n) => n.dedupe === `${B_GRATIS}:logro:perfil`)).toHaveLength(1)
    expect(notifs.find((n) => n.dedupe === `${B_GRATIS}:nivel:1`)).toMatchObject({ user_id: USERS.editor, kind: "logro", titulo: "¡Subiste al nivel 1!", href: "/logros" })
    expect(new Set(t.fx.rows.scopesOf("notifications"))).toEqual(new Set(["system"]))
    expect(new Set(t.fx.rows.scopesOf("gami_badges"))).toEqual(new Set(["user"]))
    expect(t.fx.rows.all("gami_state")).toMatchObject([{ max_level: 1, init_date: base.init }])
  })

  it("nada nuevo: no escribe nada", async () => {
    gami.st.unl = Object.fromEntries(GBADGES.map((b) => [b.id, "2026-10-01"]))
    gami.st.maxLevel = 99
    gami.st.mis = { "2026-10-27": ["m1", "m2", "m3"] }
    const r = await t.call("POST", G("check"), "editor")
    expect(r.body.data).toMatchObject({ on: true, first: false, badges: [], nivel: null })
    expect(t.fx.rows.calls.filter((c) => c.m !== "select")).toEqual(t.fx.rows.calls.filter((c) => c.table === "gami_missions" && c.m === "upsert"))
  })

  it("logros apagados en el libro: no guarda ni avisa", async () => {
    gami.st.on = false
    gami.st.init = null
    const r = await t.call("POST", G("check"), "owner")
    expect(r.body.data).toEqual({ on: false, first: false, badges: [], missions: [], nivel: null })
    expect(t.fx.rows.calls).toEqual([])
  })
})

describe("POST /v1/books/:bookId/gami/logros (= logroNotifs)", () => {
  it("insignias y nivel a la campana con su dedupe, sin duplicar", async () => {
    const body = { badges: [{ id: "racha7", n: "Constante", d: "7 días seguidos" }], nivel: { n: 3, name: "Ahorrador" } }
    expect((await t.call("POST", G("logros", ""), "registra", body)).body).toEqual({ ok: true, data: { saved: 2 } })
    expect((await t.call("POST", G("logros", ""), "registra", body)).body).toEqual({ ok: true, data: { saved: 0 } })
    expect(t.fx.rows.all("notifications")).toEqual([
      expect.objectContaining({ user_id: USERS.registra, book_id: B_GRATIS, kind: "logro", titulo: "Insignia: Constante", cuerpo: "7 días seguidos", dedupe: `${B_GRATIS}:logro:racha7` }),
      expect.objectContaining({ titulo: "¡Subiste al nivel 3!", cuerpo: "Ahora eres Ahorrador. ¡Sigue así!", dedupe: `${B_GRATIS}:nivel:3` }),
    ])
  })

  it("valida la entrada con mensajes en español", async () => {
    const r = await t.call("POST", G("logros", ""), "owner", { badges: Array.from({ length: 21 }, (_, i) => ({ id: `b${i}`, n: "x", d: "y" })), nivel: null })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe("VALIDATION")
    expect(r.body.msg).toMatch(/[áéíóúñ]|Revisa/)
  })
})
