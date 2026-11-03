// El protocolo NDJSON del chat: el tipo ChatEvent (@mirai/contracts/chat-types, el que emite el motor) y el esquema zod
// del contrato `chat` (el que documenta la API) describen lo mismo.
import { describe, expect, expectTypeOf, it } from "vitest"
import type { z } from "zod"
import { ChatBody, ChatEvent as ChatEventZ } from "@mirai/contracts/modules/chat"
import type { ChatEvent } from "./types"
import { ChatTurnBody } from "../server/chat-turn"

describe("contrato del chat", () => {
  it("cada ChatEvent del motor cabe en el esquema del contrato (y el latido es el único extra)", () => {
    expectTypeOf<ChatEvent>().toExtend<z.infer<typeof ChatEventZ>>()
    expectTypeOf<Exclude<z.infer<typeof ChatEventZ>["t"], ChatEvent["t"]>>().toEqualTypeOf<"ping">()
    const msg = { id: "m", role: "assistant" as const, content: "Hola", meta: {}, feedback: null, adjuntos: [], created_at: "2026-11-02T00:00:00Z" }
    for (const e of [{ t: "thread", id: "x", titulo: "Hola", nuevo: true }, { t: "delta", text: "Ho" }, { t: "done", msg }, { t: "error", msg: "No pudimos responder." }, { t: "ping" }]) expect(ChatEventZ.safeParse(e).success).toBe(true)
    expect(ChatEventZ.safeParse({ t: "otro" }).success).toBe(false)
  })

  it("el cuerpo de /api/chat y de la API es el mismo esquema", () => {
    expect(ChatTurnBody).toBe(ChatBody)
    expect(ChatBody.parse({ text: "hola" })).toEqual({ text: "hola", tono: "simple" })
    expect(ChatBody.safeParse({ text: "x".repeat(4001) }).success).toBe(false)
  })
})
