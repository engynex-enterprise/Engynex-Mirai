// El turno del chat (lo que respondía app/api/chat/route.ts) y las acciones del chat con dobles: base en memoria, libro de
// prueba y modelo simulado. Mismo protocolo de eventos NDJSON que consume features/chat/store.ts.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import type { IntegrationValue } from "@mirai/services/integrations/store"
import { toPlanInfo } from "@mirai/domain/plans"
import type { AccessRole } from "@mirai/domain/household/roles"
import type { ChatEvent, ChatMeta, Propuesta } from "../chat/types"
import { libroPrueba } from "../chat/libro-prueba"
import { baseRpcs, fakeDb, fakeRuntime, type FakeDb } from "../testing/fake-db"
import type { AiCtx } from "./ctx"

const providers: { list: IntegrationValue[] } = { list: [] }
const models: Record<string, MockLanguageModelV4> = {}
vi.mock("@mirai/services/integrations/store", () => ({
  enabledOf: async (_h: string, kinds: string[]) => providers.list.filter((v) => kinds.includes(v.kind)),
  getIntegration: async () => null,
  getOwnIntegration: async () => null,
}))
vi.mock("../model", async (orig) => ({ ...(await orig<typeof import("../model")>()), modelFrom: (v: IntegrationValue) => models[v.kind] }))

const { runChatTurn, ChatTurnBody } = await import("./chat-turn")
const { chatAttachWith, attachProblem, chatConfirmWith, chatCancelWith, chatTitleWith, chatThreadInfoWith, chatDuplicateWith, listThreadsWith, threadMessagesWith, patchThreadWith, deleteThreadWith, restoreThreadWith } = await import("./chat-actions")
const { resetAiSettingsMemo } = await import("../usage")

const B = "00000000-0000-4000-8000-0000000000b1"
const H = "00000000-0000-4000-8000-0000000000a1"
const U = "00000000-0000-4000-8000-000000000001"
const PREMIUM = { id: "premium", nombre: "Premium", funciones: ["ia", "banco", "impuestos", "familia"], anuncios: false, limites: {}, precio_mes: 14900, ia_creditos: 1000 }
const GRATIS = { id: "gratis", nombre: "Gratis", funciones: [], anuncios: true, limites: {}, precio_mes: 0, ia_creditos: 100 }
const usage = { inputTokens: { total: 900, noCache: 900, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 40, text: 40, reasoning: 0 } }

let db: FakeDb
const ctxOf = (access: AccessRole = "owner", plan = PREMIUM): AiCtx => ({ user: { id: U, nombre: "Ana" }, household: { id: H, access }, book: { id: B }, plan: toPlanInfo(plan) })

async function turn(text: string, o: { ctx?: AiCtx; threadId?: string; signal?: AbortSignal; regenerate?: string; editId?: string } = {}) {
  const events: ChatEvent[] = []
  const body = ChatTurnBody.parse({ text, threadId: o.threadId, regenerate: o.regenerate, editId: o.editId })
  await runChatTurn({ ctx: o.ctx ?? ctxOf(), sb: db.client, body, emit: (e) => events.push(e), signal: o.signal ?? new AbortController().signal })
  const done = events.find((e) => e.t === "done") as Extract<ChatEvent, { t: "done" }> | undefined
  return { events, kinds: events.map((e) => e.t), done, meta: (done?.msg.meta ?? {}) as ChatMeta, text: events.filter((e) => e.t === "delta").map((e) => (e as { text: string }).text).join("") }
}

beforeEach(() => {
  db = fakeDb({ plans: [PREMIUM, GRATIS], book_settings: [{ book_id: B, ia: { autocat: false, hormiga: false }, estricto: false, usura: 26 }] }, baseRpcs())
  fakeRuntime(db, libroPrueba)
  resetAiSettingsMemo()
  providers.list = [{ kind: "ai_gemini", enabled: true, config: { model: "gemini-2.5-flash" }, secrets: { apiKey: "clave-falsa" }, source: "plataforma" }]
  models.ai_gemini = new MockLanguageModelV4({
    doStream: async () => ({ stream: simulateReadableStream({ chunks: [{ type: "text-start", id: "1" }, { type: "text-delta", id: "1", delta: "Hola, " }, { type: "text-delta", id: "1", delta: "con gusto te ayudo." }, { type: "text-end", id: "1" }, { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage }] }) }),
  })
})

describe("runChatTurn (app/api/chat)", () => {
  it("pregunta de datos: responde con los números, sin IA, y crea la conversación", async () => {
    const r = await turn("¿Cuánto gasté este mes?")
    expect(r.kinds[0]).toBe("thread")
    expect(r.kinds[1]).toBe("user")
    expect(r.kinds.at(-1)).toBe("done")
    expect(r.meta.fuente).toBe("algoritmo")
    expect(r.text).toMatch(/\$/)
    expect(r.done!.msg.content).toBe(r.text)
    expect(r.meta.sugerencias?.length).toBeGreaterThan(0)
    expect(db.rows("chat_threads")).toHaveLength(1)
    expect(db.rows("chat_messages").map((m) => m.role)).toEqual(["user", "assistant"])
    expect(db.rows("ai_usage")[0]).toMatchObject({ fuente: "algoritmo", feature: "chat", household_id: H })
    expect(models.ai_gemini.doStreamCalls).toHaveLength(0)
  })

  it("registrar un gasto: tarjeta para confirmar (sin escribir todavía)", async () => {
    const r = await turn("gasté 15 mil en almuerzo")
    const card = r.events.find((e) => e.t === "card") as Extract<ChatEvent, { t: "card" }>
    expect(card.propuesta).toMatchObject({ tipo: "gasto", estado: "pendiente", datos: { valor: 15000 } })
    expect(r.meta.propuestas).toHaveLength(1)
    expect(db.rows("expenses")).toHaveLength(0)
  })

  it("«Solo mira» no registra: mensaje amable", async () => {
    const r = await turn("gasté 15 mil en almuerzo", { ctx: ctxOf("viewer") })
    expect(r.text).toMatch(/Solo mira/)
    expect(r.events.some((e) => e.t === "card")).toBe(false)
  })

  it("plan Gratis y pregunta abierta: aviso de Premium (sin llamar a la IA)", async () => {
    const r = await turn("¿Qué opinas de los CDT para mis ahorros?", { ctx: ctxOf("owner", GRATIS) })
    expect(r.meta).toMatchObject({ fuente: "upsell", aviso: "plan" })
    expect(r.text).toMatch(/Mirai Premium/)
    expect(models.ai_gemini.doStreamCalls).toHaveLength(0)
  })

  it("Premium y pregunta abierta: IA en streaming con los DATOS del libro y registro en ai_usage", async () => {
    const r = await turn("¿Qué opinas de los CDT para mis ahorros?")
    expect(r.text).toBe("Hola, con gusto te ayudo.")
    expect(r.meta).toMatchObject({ fuente: "ia", provider: "Google Gemini" })
    expect(r.meta.creditos).toBeGreaterThan(0)
    const call = models.ai_gemini.doStreamCalls[0]
    expect(JSON.stringify(call.prompt)).toContain("DATOS:")
    expect(db.rows("ai_usage").find((x) => x.fuente === "ia")).toMatchObject({ feature: "chat", input_tokens: 900, output_tokens: 40, ok: true })
  })

  it("la persona detiene la respuesta: se guarda con `detenido` y sin sugerencias", async () => {
    const ac = new AbortController()
    ac.abort()
    const r = await turn("¿Qué opinas de los CDT para mis ahorros?", { signal: ac.signal })
    expect(r.meta.detenido).toBe(true)
    expect(r.meta.sugerencias).toBeUndefined()
  })

  it("texto vacío: evento de error", async () => {
    const r = await turn("   ")
    expect(r.events).toEqual([{ t: "error", msg: "Escribe tu pregunta" }])
  })

  it("decisión sin valor: pregunta lo que falta y lo recuerda para el siguiente mensaje", async () => {
    const a = await turn("¿Me conviene comprar un carro?", { ctx: ctxOf("owner", GRATIS) })
    expect(a.meta).toMatchObject({ fuente: "consejero", pendiente: { txt: "¿Me conviene comprar un carro?" } })
    const b = await turn("de 40 millones a 60 cuotas", { ctx: ctxOf("owner", GRATIS), threadId: a.events[0].t === "thread" ? a.events[0].id : undefined })
    expect(b.events.some((e) => e.t === "card" && !!e.decision)).toBe(true)
    expect(db.rows("advisor_consultations")).toHaveLength(1)
  })

  it("regenerar: borra la respuesta anterior y vuelve a responder la última pregunta", async () => {
    const a = await turn("¿Cuánto gasté este mes?")
    const tid = (a.events[0] as { id: string }).id
    const b = await turn("", { threadId: tid, regenerate: a.done!.msg.id })
    expect(b.kinds).not.toContain("user")
    const vivos = db.rows("chat_messages").filter((m) => m.deleted_at == null)
    expect(vivos.map((m) => m.role)).toEqual(["user", "assistant"])
  })
})

describe("respuestas vacías y adjuntos con IA", () => {
  const streamOf = (chunks: unknown[]) => ({ stream: simulateReadableStream({ chunks: chunks as never[] }) })
  const fin = (unified: "stop" | "tool-calls" = "stop") => ({ type: "finish", finishReason: { unified, raw: unified }, usage })
  const call = (id: string, toolName: string, input: unknown) => ({ type: "tool-call", toolCallId: id, toolName, input: JSON.stringify(input) })

  it("si la IA no escribe nada (se quedó pensando), avisa en vez de dejar la respuesta en blanco", async () => {
    models.ai_gemini = new MockLanguageModelV4({ doStream: async () => streamOf([fin()]) })
    const r = await turn("¿Qué opinas de mis finanzas?")
    expect(r.meta.fuente).toBe("error")
    expect(r.done!.msg.content).toMatch(/Regenerar/)
  })

  it("una foto con 4 movimientos y una instrucción → una tarjeta por movimiento, cada una en su módulo (nada se escribe)", async () => {
    // La captura del 9 de noviembre: grado de Andrea (imprevisto), carne de Aquiles (fiado) y dos préstamos que se pagan
    // el 15 de noviembre.
    let n = 0
    models.ai_gemini = new MockLanguageModelV4({
      doStream: async () => (n++ === 0
        ? streamOf([
          call("1", "proponer_gasto", { valor: 250000, descripcion: "Pago grado Andrea", categoria: "Imprevistos" }),
          call("2", "proponer_prestamo", { direccion: "le_debo", persona: "Aquiles", valor: 269000, clase: "fiado", concepto: "Carne" }),
          call("3", "proponer_prestamo", { direccion: "le_debo", persona: "Camilo", valor: 100000, fecha_pago: "2099-11-15" }),
          call("4", "proponer_prestamo", { direccion: "le_debo", persona: "Harold", valor: 160000, fecha_pago: "2099-11-15" }),
          fin("tool-calls"),
        ])
        : streamOf([{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "Preparé 4 registros." }, { type: "text-end", id: "t" }, fin()])),
    })
    const img = { name: "captura.png", type: "image/png", size: 3, data: "AAAA" }
    const r = await chatAttachWith(ctxOf(), db.client, { files: [img], text: "el grado es un imprevisto, la carne la pedí fiada y los préstamos los pago el 15" })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const props = r.answer.meta.propuestas!
    // Las herramientas corren a la vez: el orden de las tarjetas es el de quien termina primero.
    expect(props.map((p) => p.tipo).sort()).toEqual(["gasto", "prestamo", "prestamo", "prestamo"])
    const de = (persona: string) => props.find((p) => p.datos.persona === persona)!.datos
    expect(props.find((p) => p.tipo === "gasto")!.datos).toMatchObject({ valor: 250000, descripcion: "Pago grado Andrea" })
    expect(de("Aquiles")).toMatchObject({ loan_tipo: "fiado", valor: 269000 })
    expect(de("Camilo")).toMatchObject({ frec: "unico", plazo: 1, vence: "2099-11-15", cuota: 100000 })
    expect(de("Harold")).toMatchObject({ frec: "unico", vence: "2099-11-15", cuota: 160000 })
    expect(r.answer.content).toBe("Preparé 4 registros.")
    expect(r.user.adjuntos).toEqual([{ nombre: "captura.png", tipo: "image/png", tam: 3 }])
    // La foto y el pedido llegan a la IA (la foto como archivo, no como texto).
    const sent = JSON.stringify(models.ai_gemini.doStreamCalls[0].prompt)
    expect(sent).toContain("image/png")
    expect(sent).toContain("PEDIDO DE LA PERSONA: el grado es un imprevisto")
    expect(db.rows("loans")).toHaveLength(0)
    expect(db.rows("ai_usage").at(-1)).toMatchObject({ feature: "documento" })
    // Confirmar el de Camilo guarda la deuda con su fecha de pago única.
    const camilo = props.find((p) => p.datos.persona === "Camilo")!
    expect(await chatConfirmWith(ctxOf(), db.client, r.answer.id, camilo.id)).toMatchObject({ ok: true })
    expect(db.rows("loans")[0]).toMatchObject({ kind: "pagar", monto: 100000, frec: "unico", plazo: 1, vence: "2099-11-15" })
  })

  it("plan Gratis: no llama a la IA y ofrece Premium", async () => {
    const r = await chatAttachWith(ctxOf("owner", GRATIS), db.client, { files: [{ name: "f.pdf", type: "application/pdf", size: 3, data: "AAAA" }] })
    expect(r.ok && r.answer.meta.aviso).toBe("plan")
    expect(models.ai_gemini.doStreamCalls).toHaveLength(0)
  })

  it("validación: tipos, cantidad y peso", () => {
    const f = (type: string, size = 10) => ({ name: "x", type, size, data: "" })
    expect(attachProblem({ household: { id: H, access: "owner" } }, [f("text/csv"), f("application/pdf"), f("image/jpeg")])).toBeNull()
    expect(attachProblem({ household: { id: H, access: "owner" } }, [f("application/zip")])).toMatch(/Word, Excel o CSV/)
    expect(attachProblem({ household: { id: H, access: "owner" } }, Array.from({ length: 6 }, () => f("text/plain")))).toMatch(/hasta 5/)
    expect(attachProblem({ household: { id: H, access: "owner" } }, [f("image/png", 4e6), f("image/png", 3e6)])).toMatch(/pasan de 6 MB/)
    expect(attachProblem({ household: { id: H, access: "viewer" } }, [f("image/png")])).toMatch(/solo lectura/)
  })
})

describe("acciones del chat (features/chat/actions.ts)", () => {
  async function propuesta(text = "gasté 15 mil en almuerzo", ctx = ctxOf()) {
    const r = await turn(text, { ctx })
    const p = (r.meta.propuestas ?? [])[0] as Propuesta
    return { messageId: r.done!.msg.id, p, threadId: (r.events[0] as { id: string }).id }
  }

  it("confirmar escribe en el libro una sola vez y marca la propuesta como hecha", async () => {
    const { messageId, p } = await propuesta()
    // El libro de prueba usa ids cortos ("c-res"); en la base son UUID y la confirmación los valida con zod.
    const CAT = "00000000-0000-4000-8000-0000000000c1"
    db.rows("categories").push({ id: CAT, book_id: B, nombre: "Restaurantes", deleted_at: null })
    const msg = db.rows("chat_messages").find((m) => m.id === messageId)!
    const meta = msg.meta as ChatMeta
    meta.propuestas![0].datos.category_id = CAT
    const a = await chatConfirmWith(ctxOf(), db.client, messageId, p.id)
    expect(a).toMatchObject({ ok: true, msg: "Gasto registrado", href: "/gastos", tablas: ["expenses"] })
    expect(db.rows("expenses")).toHaveLength(1)
    expect(db.rows("expenses")[0]).toMatchObject({ book_id: B, valor: 15000, origen: "manual", category_id: CAT })
    expect((msg.meta as ChatMeta).propuestas![0].estado).toBe("hecho")
    const b = await chatConfirmWith(ctxOf(), db.client, messageId, p.id)
    expect(b.ok).toBe(true)
    expect(db.rows("expenses")).toHaveLength(1)
  })

  it("confirmar con la escritura del puerto (API: ChatWritesPort)", async () => {
    const { messageId, p } = await propuesta()
    const write = vi.fn(async () => ({ ok: true as const, id: "x-1", datos: {} }))
    const r = await chatConfirmWith(ctxOf(), db.client, messageId, p.id, write)
    expect(write).toHaveBeenCalledOnce()
    expect(r.ok && r.propuesta.registroId).toBe("x-1")
  })

  it("no se confía en la propuesta guardada: un rol sin permiso no confirma y un id ajeno no existe", async () => {
    const { messageId, p } = await propuesta("le presté 200 mil a Laura a 2 meses")
    expect(p.tipo).toBe("prestamo")
    const r = await chatConfirmWith(ctxOf("registra"), db.client, messageId, p.id)
    expect(r).toMatchObject({ ok: false, msg: expect.stringMatching(/Registra sus gastos/) })
    expect(await chatConfirmWith(ctxOf(), db.client, messageId, "no-es-uuid")).toMatchObject({ ok: false, msg: expect.stringMatching(/No encontramos/) })
  })

  it("cancelar no escribe y después ya no se puede confirmar", async () => {
    const { messageId, p } = await propuesta()
    expect((await chatCancelWith(db.client, messageId, p.id)).ok).toBe(true)
    expect((await chatCancelWith(db.client, messageId, p.id)).ok).toBe(false)
    expect(await chatConfirmWith(ctxOf(), db.client, messageId, p.id)).toEqual({ ok: false, msg: "Esta propuesta ya se canceló." })
    expect(db.rows("expenses")).toHaveLength(0)
  })

  it("hilos: título sin IA para «Solo mira», detalles, duplicar, renombrar, borrar y deshacer", async () => {
    const { threadId } = await propuesta()
    const t = await chatTitleWith(ctxOf("viewer"), db.client, threadId)
    expect(t).toMatchObject({ ok: true, fuente: "algoritmo" })
    expect(await chatThreadInfoWith(db.client, threadId)).toMatchObject({ mensajes: 2, preguntas: 1, algoritmo: 1 })
    const d = await chatDuplicateWith(ctxOf(), db.client, threadId)
    expect(d.ok && d.titulo).toMatch(/\(copia\)$/)
    expect(await listThreadsWith(ctxOf(), db.client)).toHaveLength(2)
    expect(await patchThreadWith(db.client, threadId, { titulo: "Almuerzos", fijado: true })).toBe(true)
    expect(db.rows("chat_threads").find((x) => x.id === threadId)).toMatchObject({ titulo: "Almuerzos", titulo_auto: false, fijado: true })
    expect(await deleteThreadWith(db.client, threadId)).toBe(true)
    expect(await threadMessagesWith(db.client, threadId)).toBeNull()
    expect(await restoreThreadWith(db.client, threadId)).toBe(true)
    expect(await threadMessagesWith(db.client, threadId)).toHaveLength(2)
  })
})
