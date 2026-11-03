// V7-G (E15): calificar una respuesta, buscar en las conversaciones y contar los hilos (features/chat/hooks.ts) con la
// app real y RowStore en memoria. Solo lo propio y del libro de la ruta; con la sesión de la persona (RLS).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { MSG_NOT_FOUND, ONLY_ASSISTANT } from "../../src/modules/chat/chat-extras.service"
import { B_AJENO, B_GRATIS, B_PREMIUM, USERS } from "../setup/fixtures"
import { createV7gApp, type V7gApp } from "./app"

let t: V7gApp
const id = (n: number) => `c${String(n).padStart(7, "0")}-0000-4000-8000-000000000000`
const T1 = id(1), T2 = id(2), T3 = id(3)
const M = { mia: id(11), user: id(12), ajena: id(13), borrada: id(14), otraLibro: id(15) }
const B = `/v1/books/${B_GRATIS}/chat`

beforeAll(async () => {
  t = await createV7gApp()
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.fx.rows.reset()
  t.fx.rows.seed("chat_threads", [
    { id: T1, book_id: B_GRATIS, user_id: USERS.editor, titulo: "Mercado", deleted_at: null },
    { id: T2, book_id: B_GRATIS, user_id: USERS.viewer, titulo: "Ajena", deleted_at: null },
    { id: T3, book_id: B_PREMIUM, user_id: USERS.owner, titulo: "Negocio", deleted_at: null },
  ])
  t.fx.rows.seed("chat_messages", [
    { id: M.mia, thread_id: T1, book_id: B_GRATIS, role: "assistant", content: "Gastaste 200.000 en mercado", feedback: null, deleted_at: null },
    { id: M.user, thread_id: T1, book_id: B_GRATIS, role: "user", content: "¿Cuánto en mercado?", feedback: null, deleted_at: null },
    { id: M.ajena, thread_id: T2, book_id: B_GRATIS, role: "assistant", content: "mercado de otra persona", feedback: null, deleted_at: null },
    { id: M.borrada, thread_id: T1, book_id: B_GRATIS, role: "assistant", content: "mercado viejo", feedback: null, deleted_at: "2026-10-01T00:00:00Z" },
    { id: M.otraLibro, thread_id: T3, book_id: B_PREMIUM, role: "assistant", content: "mercado del negocio", feedback: null, deleted_at: null },
  ])
})

describe("POST …/chat/messages/:messageId/rating", () => {
  it("califica, cambia y quita la calificación de una respuesta propia", async () => {
    expect((await t.call("POST", `${B}/messages/${M.mia}/rating`, "editor", { feedback: 1 })).body).toEqual({ ok: true, data: { id: M.mia, feedback: 1 } })
    expect((await t.call("POST", `${B}/messages/${M.mia}/rating`, "editor", { feedback: null })).body).toEqual({ ok: true, data: { id: M.mia, feedback: null } })
    expect(new Set(t.fx.rows.scopesOf("chat_messages"))).toEqual(new Set(["user"]))
  })

  it("mensaje de la persona: 400; de otra persona, borrado o de otro libro: 404; valor raro: 400", async () => {
    expect((await t.call("POST", `${B}/messages/${M.user}/rating`, "editor", { feedback: -1 })).body).toMatchObject({ code: "VALIDATION", msg: ONLY_ASSISTANT })
    for (const m of [M.ajena, M.borrada, M.otraLibro]) expect((await t.call("POST", `${B}/messages/${m}/rating`, "editor", { feedback: -1 })).body, m).toMatchObject({ code: "NOT_FOUND", msg: MSG_NOT_FOUND })
    expect((await t.call("POST", `${B}/messages/${M.mia}/rating`, "editor", { feedback: 2 })).status).toBe(400)
    expect((await t.call("POST", `/v1/books/${B_AJENO}/chat/messages/${M.mia}/rating`, "editor", { feedback: 1 })).body).toMatchObject({ msg: "No encontramos ese libro." })
    expect(t.fx.rows.all<{ feedback: number | null }>("chat_messages").every((m) => m.feedback === null)).toBe(true)
  })
})

describe("GET …/chat/search y …/chat/threads/count", () => {
  it("busca en tus conversaciones sin importar mayúsculas, sin borrados ni otros libros; ids sin repetir", async () => {
    const r = await t.call("GET", `${B}/search?q=MERCADO`, "editor")
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ threadIds: [T1] })
    expect((await t.call("GET", `${B}/search?q=mercado`, "admin")).body).toEqual({ threadIds: [] })
    expect(t.fx.rows.calls.find((c) => c.table === "chat_messages")?.scope).toMatchObject({ kind: "user", userId: USERS.editor })
  })

  it("búsqueda muy corta: 400 en español", async () => {
    const r = await t.call("GET", `${B}/search?q=ab`, "editor")
    expect(r.status).toBe(400)
    expect(JSON.stringify(r.body)).toContain("Escribe al menos 3 letras para buscar")
  })

  it("cuenta solo tus conversaciones del libro", async () => {
    expect((await t.call("GET", `${B}/threads/count`, "editor")).body).toEqual({ total: 1 })
    expect((await t.call("GET", `${B}/threads/count`, "admin")).body).toEqual({ total: 0 })
  })
})
