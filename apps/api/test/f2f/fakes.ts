// Dobles de F2-F: los puertos de IA, consola, chat y archivos. Registran las llamadas y responden lo que la prueba pide.
// Nunca llaman a un proveedor de IA ni a la base.
import type { AiCtx } from "@mirai/ai/server/ctx"
import type { ChatEvent, Propuesta } from "@mirai/contracts/chat-types"
import type { FileRef } from "@mirai/contracts/modules/chat"
import type { DbScope } from "../../src/core/db/scope"
import { DomainError } from "../../src/core/errors/domain-error"
import { AiFiles, pathOfBook, type ReadFile } from "../../src/modules/ai/ai-files"
import { AiAdminPort, AiPort, type ImageThunk } from "../../src/modules/ai/ai.port"
import { ChatPort, ChatWritesPort } from "../../src/modules/chat/chat.port"

type Call = { m: string; ctx?: AiCtx; args: unknown[] }

const msg = (id: string, role: "user" | "assistant", content: string) => ({ id, role, content, meta: {}, feedback: null, adjuntos: [], created_at: "2026-11-02T15:00:00Z" })

/** Respuestas por método: un valor o una función de los argumentos. */
export class FakeAi extends AiPort {
  calls: Call[] = []
  next: Record<string, unknown> = {}
  private r<T>(m: string, ctx: AiCtx | undefined, args: unknown[], def: T): Promise<T> {
    this.calls.push({ m, ctx, args })
    const v = this.next[m]
    return Promise.resolve((typeof v === "function" ? (v as (...a: unknown[]) => T)(...args) : (v as T)) ?? def)
  }
  async invoice(ctx: AiCtx, _s: DbScope, file: ImageThunk) {
    const img = await file()
    return this.r("invoice", ctx, [img], { ok: true as const, comercio: "Éxito", valor: 45900, fecha: "2026-11-01", category_id: null })
  }
  async receipt(ctx: AiCtx, file: ImageThunk) {
    return this.r("receipt", ctx, [await file()], { ok: true as const, valor: 120000, fecha: "2026-11-01", referencia: "M123" })
  }
  async loanDoc(ctx: AiCtx, file: ImageThunk, kind: "cobrar" | "pagar") {
    return this.r("loanDoc", ctx, [await file(), kind], { ok: false as const, msg: "La lectura de fotos está desactivada en Ajustes › Inteligencia artificial." })
  }
  classify(ctx: AiCtx, _s: DbScope, items: unknown[]) {
    return this.r("classify", ctx, [items], null)
  }
  hormiga(ctx: AiCtx, _s: DbScope, mes: string) {
    return this.r("hormiga", ctx, [mes], { ok: true, msg: "Listo: la IA encontró 2 gastos hormiga." })
  }
  category(ctx: AiCtx, _s: DbScope, i: unknown) {
    return this.r("category", ctx, [i], { ok: false })
  }
  entity(ctx: AiCtx, q: string) {
    return this.r("entity", ctx, [q], { ok: true, s: { nombre: "Bancolombia", razon: "Bancolombia S.A.", nit: "890903938", tipo: "Banco", confianza: "alta", nota: "" } })
  }
  cobro(ctx: AiCtx, m: string, tono: string) {
    return this.r("cobro", ctx, [m, tono], { ok: true, text: "Hola, ¿me ayudas con la cuota?" })
  }
  prima(ctx: AiCtx, data: unknown) {
    return this.r("prima", ctx, [data], { ok: false, msg: "La inteligencia artificial no está incluida en tu plan. Conoce los planes en /planes." })
  }
  parse(ctx: AiCtx, _s: DbScope, text: string) {
    return this.r("parse", ctx, [text], { ok: false })
  }
  advisor(ctx: AiCtx, _s: DbScope, text: string) {
    return this.r("advisor", ctx, [text], { ok: false as const, d: { tipo: "compra" } as never, preguntas: ["¿Cuánto cuesta?"] })
  }
  usage(ctx: AiCtx) {
    return this.r("usage", ctx, [], { plan: "Premium", incluyeIa: true } as never)
  }
  monthSummary(ctx: AiCtx, _s: DbScope, mes: string) {
    return this.r("monthSummary", ctx, [mes], { titular: "Gastaste $ 1.000.000 en noviembre 2026", resumen: "", gastaste_mas: [], mejoro: [], alertas: [], recomendacion: "", fecha: "2026-11-02", local: true })
  }
  mailScan(ctx: AiCtx, _s: DbScope, q?: string) {
    return this.r("mailScan", ctx, [q], { ok: true, rows: [], ia: false })
  }
  integrationTest(ctx: AiCtx, kind: string) {
    return this.r("integrationTest", ctx, [kind], { ok: false, msg: "Primero guarda la clave de API." })
  }
  integrationModels(ctx: AiCtx, kind: string, apiKey?: string) {
    return this.r("integrationModels", ctx, [kind, apiKey], { ok: true, models: [{ value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", group: "Recomendado" }], rec: "gemini-2.5-flash" })
  }
}

export class FakeAiAdmin extends AiAdminPort {
  calls: Call[] = []
  async usage(dias: number) {
    this.calls.push({ m: "usage", args: [dias] })
    return { dias, totales: { llamadas: 0 } } as never
  }
  async saveSettings(actor: string, p: unknown) {
    this.calls.push({ m: "saveSettings", args: [actor, p] })
  }
  async setPlanCupo(actor: string, planId: string, cupo: number | null) {
    this.calls.push({ m: "setPlanCupo", args: [actor, planId, cupo] })
  }
  async setModelPrice(actor: string, model: string, price: unknown) {
    this.calls.push({ m: "setModelPrice", args: [actor, model, price] })
  }
  async clearCache(actor: string) {
    this.calls.push({ m: "clearCache", args: [actor] })
    return 7
  }
}

/** Archivos: `<bookId>/factura.jpg` existe (JPEG de 3 bytes); el cuerpo en base64 pasa tal cual. */
export class FakeFiles extends AiFiles {
  async read(_s: DbScope, bookId: string, ref: FileRef): Promise<ReadFile> {
    if ("data" in ref) return { name: ref.name, type: ref.type, size: Buffer.byteLength(ref.data, "base64"), data: ref.data }
    if (!pathOfBook(bookId, ref.fileId) || !ref.fileId.endsWith("factura.jpg")) throw DomainError.notFound("No encontramos ese archivo en este libro.")
    return { name: "factura.jpg", type: "image/jpeg", size: 3, data: "AAAA" }
  }
}

export const PROP: Propuesta = { id: "00000000-0000-4000-8000-00000000f001", tipo: "gasto", estado: "pendiente", datos: { valor: 15000, descripcion: "Almuerzo" } }

export class FakeChat extends ChatPort {
  calls: Call[] = []
  /** Eventos que emite el turno (y si espera a que se aborte). */
  script: ChatEvent[] = [{ t: "thread", id: "t-1", titulo: "Almuerzo", nuevo: true }, { t: "user", msg: msg("m-1", "user", "gasté 15 mil") }, { t: "tool", label: "Preparando el registro" }, { t: "card", propuesta: PROP }, { t: "delta", text: "Revisa y confirma." }, { t: "done", msg: msg("m-2", "assistant", "Revisa y confirma.") }]
  aborted = false
  /** Espera a que la persona corte la conexión antes de terminar (prueba de cancelación). */
  hold = false
  constructor(private readonly writes: ChatWritesPort) {
    super()
  }
  async turn(ctx: AiCtx, _s: DbScope, body: unknown, emit: (e: ChatEvent) => void, signal: AbortSignal) {
    this.calls.push({ m: "turn", ctx, args: [body] })
    for (const e of this.script) emit(e)
    if (this.hold && !signal.aborted) await new Promise((ok) => signal.addEventListener("abort", ok, { once: true }))
    this.aborted = signal.aborted
  }
  async hints(ctx: AiCtx) {
    this.calls.push({ m: "hints", ctx, args: [] })
    return { nombre: String(ctx.user.apodo ?? ctx.user.nombre ?? ""), canEdit: true, flags: { tarjetas: 0, deudas: 0, metas: 0, suscripciones: 0, ingresos: 0, gastos: 0 }, ia: { allowed: false, premium: false, off: false, quota: null } }
  }
  async threads(ctx: AiCtx, _s: DbScope, o: unknown) {
    this.calls.push({ m: "threads", ctx, args: [o] })
    return []
  }
  async messages(_s: DbScope, id: string) {
    return id.endsWith("1") ? [msg("m-1", "user", "hola")] : null
  }
  async patchThread(_s: DbScope, id: string, p: unknown) {
    this.calls.push({ m: "patchThread", args: [id, p] })
    return true
  }
  async deleteThread() {
    return false
  }
  async restoreThread() {
    return true
  }
  async duplicate() {
    return { ok: false as const, msg: "No encontramos la conversación." }
  }
  async title() {
    return { ok: true as const, titulo: "Almuerzos", fuente: "algoritmo" as const }
  }
  async info() {
    return { mensajes: 2, preguntas: 1, creditos: 0, algoritmo: 1 }
  }
  async confirm(ctx: AiCtx, scope: DbScope, messageId: string, propId: string) {
    this.calls.push({ m: "confirm", ctx, args: [messageId, propId] })
    if (propId !== PROP.id) return { ok: false as const, msg: "No encontramos esta propuesta. Pídela de nuevo en el chat." }
    const r = await this.writes.write(ctx, scope, PROP)
    if (!r.ok) return r
    return { ok: true as const, msg: "Gasto registrado", href: "/gastos", tablas: ["expenses"], propuesta: { ...PROP, estado: "hecho" as const, registroId: r.id } }
  }
  async cancel() {
    return { ok: false }
  }
  async attach(ctx: AiCtx, _s: DbScope, input: unknown) {
    this.calls.push({ m: "attach", ctx, args: [input] })
    return { ok: true as const, threadId: "t-9", titulo: "Leer factura", nuevo: true, user: msg("m-8", "user", "Te comparto una factura."), answer: msg("m-9", "assistant", "Leí la factura") }
  }
  async transcribe(ctx: AiCtx, file: unknown) {
    this.calls.push({ m: "transcribe", ctx, args: [file] })
    return { ok: true as const, text: "registra un gasto de 45 mil en mercado" }
  }
}

export class FakeWrites extends ChatWritesPort {
  written: Propuesta[] = []
  async write(_ctx: AiCtx, _s: DbScope, p: Propuesta) {
    this.written.push(p)
    return { ok: true as const, id: "e-1", datos: p.datos }
  }
}
