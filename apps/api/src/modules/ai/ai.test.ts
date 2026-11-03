// Unitarias de F2-F en la API: traducción de los mensajes de la IA a códigos, lectura de archivos de Storage y el aiText
// de las automatizaciones en el runtime de @mirai/services.
import { describe, expect, it } from "vitest"
import { AiUnavailable, AI_OFF_MSG, AI_PLAN_MSG } from "@mirai/ai/run"
import { configureServices, rt } from "@mirai/services/runtime"
import { USER_SCOPE } from "../../../test/setup/db-doubles"
import type { SupabaseJsFactory } from "../../core/db/supabase-js.factory"
import { DomainError } from "../../core/errors/domain-error"
import { AiExpenseClassifier } from "./adapters/ai.expense-classifier"
import { SupabaseJsAiFiles } from "./adapters/supabase-js.ai-files"
import { ai, aiError, unwrap } from "./ai-errors"
import { mimeOf, pathOfBook } from "./ai-files"
import { AiRuntime, automationAiText } from "./ai-runtime"

const B = "00000000-0000-4000-8000-0000000000b1"

describe("aiError: mismo texto, código según la causa", () => {
  it.each([
    [AI_PLAN_MSG, "PLAN_REQUIRED", 402],
    ["Leer facturas, recibos y extractos con una foto es parte de **Mirai Premium**.", "PLAN_REQUIRED", 402],
    ["Usaste todos los créditos de IA de este mes (1.000).", "RATE_LIMITED", 429],
    ["Llegaste al límite de 60 consultas de IA por hora en tu hogar.", "RATE_LIMITED", 429],
    [AI_OFF_MSG, "VALIDATION", 400],
    ["Conecta tu cuenta de Google (Gmail) primero.", "VALIDATION", 400],
    ["Tu rol en este hogar (**Registra sus gastos**) te deja anotar tus gastos", "ROLE_DENIED", 403],
    ["No encontramos esta propuesta. Pídela de nuevo en el chat.", "NOT_FOUND", 404],
    ["Esta propuesta ya se canceló.", "CONFLICT", 409],
    ["No pude leer la imagen. Intenta con una foto más clara o escribe los datos.", "UPSTREAM", 502],
  ])("%s → %s", (msg, code, status) => {
    const e = aiError(msg)
    expect(e).toMatchObject({ code, status })
    expect(e.msg).not.toContain("**")
  })

  it("unwrap y ai(): datos sin `ok`; AiUnavailable traducido; DomainError tal cual", async () => {
    expect(unwrap({ ok: true as const, valor: 1 })).toEqual({ valor: 1 })
    expect(() => unwrap({ ok: false as const, msg: AI_PLAN_MSG })).toThrow(DomainError)
    await expect(ai(async () => { throw new AiUnavailable(AI_PLAN_MSG) })).rejects.toMatchObject({ code: "PLAN_REQUIRED", msg: AI_PLAN_MSG })
    await expect(ai(async () => { throw DomainError.notFound("x") })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(ai(async () => { throw new Error("relation does not exist") })).rejects.toMatchObject({ code: "INTERNAL" })
  })
})

describe("archivos para la IA", () => {
  const storage = (blob: Blob | null) => {
    const calls: unknown[][] = []
    const client = { storage: { from: (b: string) => ({ download: async (p: string) => (calls.push([b, p]), blob ? { data: blob, error: null } : { data: null, error: { message: "Object not found" } }) }) } }
    return { sb: { for: () => client } as unknown as SupabaseJsFactory, calls }
  }

  it("fileId: solo la carpeta del libro, del bucket attachments, con el tipo por extensión si falta", async () => {
    const s = storage(new Blob([Buffer.from("hola")], { type: "" }))
    const f = new SupabaseJsAiFiles(s.sb)
    const r = await f.read(USER_SCOPE, B, { fileId: `${B}/2026/factura.JPG` })
    expect(r).toEqual({ name: "factura.JPG", type: "image/jpeg", size: 4, data: Buffer.from("hola").toString("base64") })
    expect(s.calls).toEqual([["attachments", `${B}/2026/factura.JPG`]])
    await expect(f.read(USER_SCOPE, B, { fileId: `otro-libro/${B}/x.jpg` })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(f.read(USER_SCOPE, B, { fileId: `${B}/../otro/x.jpg` })).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(s.calls).toHaveLength(1)
    await expect(new SupabaseJsAiFiles(storage(null).sb).read(USER_SCOPE, B, { fileId: `${B}/no.jpg` })).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("base64 en el cuerpo (con o sin prefijo data:)", async () => {
    const f = new SupabaseJsAiFiles(storage(null).sb)
    expect(await f.read(USER_SCOPE, B, { name: "a.png", type: "image/png", data: "data:image/png;base64,AAAA" })).toEqual({ name: "a.png", type: "image/png", size: 3, data: "AAAA" })
    expect(pathOfBook(B, `${B}//x`)).toBe(false)
    expect(mimeOf("x.pdf", "application/octet-stream")).toBe("application/pdf")
  })
})

describe("nodo de IA de las automatizaciones", () => {
  it("AiRuntime agrega aiText al runtime que dejó ServicesRuntime (F2-E) sin cambiar lo demás", () => {
    const admin = () => ({}) as never
    configureServices({ admin, encrypt: (s) => s, decrypt: (s) => s, env: () => undefined, siteUrl: () => "s", publicSiteUrl: () => "p", loadBook: async () => ({}) as never })
    expect(rt().aiText).toBeUndefined()
    new AiRuntime().onModuleInit()
    expect(rt().aiText).toBe(automationAiText)
    expect(rt().admin).toBe(admin)
  })
})

describe("ExpenseClassifier de F2-D con la IA", () => {
  it("sin petición, sin libro o con otro libro: null (quien llama usa las reglas)", async () => {
    const ctx = (v: unknown) => ({ peek: () => v, db: USER_SCOPE }) as never
    const sb = { for: () => ({}) } as unknown as SupabaseJsFactory
    const items = [{ i: 0, descripcion: "Éxito", valor: 1000, veces_mes: 1 }]
    expect(await new AiExpenseClassifier(sb, ctx(undefined)).classify(items, { bookId: B, categories: [] })).toBeNull()
    const req = { user: { id: "u-1" }, bookAccess: { book: { id: "otro" }, household: { id: "h" } } }
    expect(await new AiExpenseClassifier(sb, ctx(req)).classify(items, { bookId: B, categories: [] })).toBeNull()
  })
})
